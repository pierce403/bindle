import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const readGitDir = () => {
  const gitPath = resolve(repoRoot, ".git");

  try {
    if (statSync(gitPath).isDirectory()) {
      return gitPath;
    }

    const gitFile = readFileSync(gitPath, "utf8").trim();
    if (gitFile.startsWith("gitdir:")) {
      return resolve(repoRoot, gitFile.slice("gitdir:".length).trim());
    }
  } catch {
    return null;
  }

  return null;
};

const readGitRef = (gitDir, ref) => {
  const looseRefPath = resolve(gitDir, ref);

  if (existsSync(looseRefPath)) {
    return readFileSync(looseRefPath, "utf8").trim();
  }

  try {
    const packedRefs = readFileSync(resolve(gitDir, "packed-refs"), "utf8");
    const packedLine = packedRefs
      .split("\n")
      .find((line) => line.trim().endsWith(` ${ref}`));
    return packedLine?.split(" ")[0]?.trim() ?? null;
  } catch {
    return null;
  }
};

const readGitCommit = () => {
  if (process.env.BINDLE_BUILD_COMMIT) {
    return process.env.BINDLE_BUILD_COMMIT;
  }

  try {
    const gitDir = readGitDir();
    if (!gitDir) {
      return "unknown";
    }

    const head = readFileSync(resolve(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/i.test(head)) {
      return head;
    }

    if (head.startsWith("ref:")) {
      return readGitRef(gitDir, head.slice("ref:".length).trim()) ?? "unknown";
    }
  } catch {
    return "unknown";
  }

  return "unknown";
};

const readGitCommitTime = (commit) => {
  if (process.env.BINDLE_BUILD_TIME) {
    return process.env.BINDLE_BUILD_TIME;
  }

  if (!/^[0-9a-f]{7,40}$/i.test(commit)) {
    return new Date().toISOString();
  }

  const result = spawnSync("git", ["show", "-s", "--format=%cI", commit], {
    cwd: repoRoot,
    encoding: "utf8"
  });

  const commitTime = result.stdout?.trim();
  if (result.status === 0 && commitTime) {
    return commitTime;
  }

  return new Date().toISOString();
};

const buildCommit = readGitCommit();

const env = {
  ...process.env,
  BINDLE_BUILD_COMMIT: buildCommit,
  BINDLE_BUILD_TIME: readGitCommitTime(buildCommit)
};

const result = spawnSync("pnpm", ["run", "build:app"], {
  env,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  const swPath = resolve(repoRoot, "docs/service-worker.js");
  if (existsSync(swPath)) {
    console.log(`Busting PWA service worker cache using commit: ${buildCommit}`);
    let swContent = readFileSync(swPath, "utf8");
    swContent = swContent.replace(
      'const CACHE_NAME = "bindle-shell-v12";',
      `const CACHE_NAME = "bindle-shell-${buildCommit}";`
    );
    writeFileSync(swPath, swContent, "utf8");
  }
}

process.exit(result.status ?? 1);
