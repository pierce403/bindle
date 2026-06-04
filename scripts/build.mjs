import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
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

const env = {
  ...process.env,
  BINDLE_BUILD_COMMIT: readGitCommit(),
  BINDLE_BUILD_TIME:
    process.env.BINDLE_BUILD_TIME ?? new Date().toISOString()
};

const result = spawnSync("pnpm", ["run", "build:app"], {
  env,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
