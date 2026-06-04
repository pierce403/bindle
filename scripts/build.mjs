import { execSync, spawnSync } from "node:child_process";

const readGitCommit = () => {
  if (process.env.BINDLE_BUILD_COMMIT) {
    return process.env.BINDLE_BUILD_COMMIT;
  }

  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
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

