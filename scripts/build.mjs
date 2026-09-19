import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertFreshReleaseId } from "./release-identity.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stableUpdateControllerHash = "d82fa0672e56b8ca4fe72b4b8158bc3da1f102efb0b8a6c89aaf5b90a261a586";

const updateControllerPath = resolve(repoRoot, "public/service-worker.js");
const updateControllerHash = createHash("sha256").update(readFileSync(updateControllerPath)).digest("hex");
if (updateControllerHash !== stableUpdateControllerHash) {
  throw new Error(
    "public/service-worker.js is the frozen update trust anchor. " +
    "Use a separately approved, content-addressed controller migration instead of replacing it."
  );
}

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

const isGitDirty = () => {
  try {
    const result = spawnSync("git", ["--no-optional-locks", "status", "--porcelain"], {
      cwd: repoRoot,
      encoding: "utf8"
    });
    return result.status === 0 && result.stdout?.trim().length > 0;
  } catch {
    return false;
  }
};

const readGitCommitTime = (commit) => {
  if (process.env.BINDLE_BUILD_TIME) {
    return process.env.BINDLE_BUILD_TIME;
  }

  if (isGitDirty()) {
    return new Date().toISOString();
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

const buildCommit = process.env.BINDLE_BUILD_COMMIT ?? (readGitCommit() + (isGitDirty() ? "-dirty" : ""));

const env = {
  ...process.env,
  BINDLE_BUILD_COMMIT: buildCommit,
  BINDLE_BUILD_TIME: readGitCommitTime(buildCommit)
};

const version = JSON.parse(readFileSync(resolve(repoRoot, "package.json"), "utf8")).version;
const time = env.BINDLE_BUILD_TIME;
const id = createHash("sha256").update(JSON.stringify([version, buildCommit, time])).digest("hex").slice(0, 24);
const build = { version, commit: buildCommit, time, id };
const publishedReleasePath = resolve(repoRoot, "docs/release.json");

if (existsSync(publishedReleasePath)) {
  const publishedRelease = JSON.parse(readFileSync(publishedReleasePath, "utf8"));
  assertFreshReleaseId(publishedRelease?.build, build);
}

const verifyResult = spawnSync("pnpm", ["run", "artifacts:verify"], {
  env,
  stdio: "inherit"
});

if (verifyResult.error) {
  throw verifyResult.error;
}
if (verifyResult.status !== 0) {
  process.exit(verifyResult.status ?? 1);
}

const result = spawnSync("pnpm", ["run", "build:app"], {
  env,
  stdio: "inherit"
});

if (result.error) {
  throw result.error;
}

if (result.status === 0) {
  const swPath = resolve(repoRoot, "docs/service-worker.js");
  if (!existsSync(swPath)) {
    throw new Error("The stable service-worker.js update controller is missing from the build.");
  }
  const files = readdirSync(resolve(repoRoot, "docs"), { recursive: true })
    .filter((file) => !file.startsWith("railgun-artifacts/") &&
      file !== "service-worker.js" && file !== "build.json" && file !== "release.json")
    .filter((file) => statSync(resolve(repoRoot, "docs", file)).isFile());
  const precache = files.map((file) => ({
    url: `/${file}`,
    hash: createHash("sha256").update(readFileSync(resolve(repoRoot, "docs", file))).digest("hex")
  }));
  writeFileSync(resolve(repoRoot, "docs/build.json"), JSON.stringify(build, null, 2) + "\n");
  writeFileSync(resolve(repoRoot, "docs/release.json"), JSON.stringify({
    schema: 1,
    build,
    files: precache
  }, null, 2) + "\n");
  console.log(`Prepared PWA release ${version} (${id}), ${precache.length} verified shell assets.`);
}

process.exit(result.status ?? 1);
