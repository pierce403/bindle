import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const virtualBuildInfoModuleId = "virtual:bindle-build-info";
const resolvedVirtualBuildInfoModuleId = `\0${virtualBuildInfoModuleId}`;
const repoRoot = fileURLToPath(new URL(".", import.meta.url));

const readGitDir = (): string | null => {
  const gitPath = resolve(repoRoot, ".git");

  try {
    if (statSync(gitPath).isDirectory()) {
      return gitPath;
    }

    const gitFile = readFileSync(gitPath, "utf8").trim();
    if (gitFile.startsWith("gitdir:")) {
      const gitDir = gitFile.slice("gitdir:".length).trim();
      return resolve(repoRoot, gitDir);
    }
  } catch {
    return null;
  }

  return null;
};

const readGitRef = (gitDir: string, ref: string): string | null => {
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

const readGitCommit = (): string => {
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

const buildCommit = readGitCommit();
const buildTime =
  process.env.BINDLE_BUILD_TIME ?? new Date().toISOString();

const buildInfoPlugin = (): Plugin => ({
  name: "bindle-build-info",
  resolveId(id) {
    if (id === virtualBuildInfoModuleId) {
      return resolvedVirtualBuildInfoModuleId;
    }
  },
  load(id) {
    if (id === resolvedVirtualBuildInfoModuleId) {
      return [
        `export const rawBuildCommit = ${JSON.stringify(buildCommit)};`,
        `export const rawBuildTime = ${JSON.stringify(buildTime)};`
      ].join("\n");
    }
  }
});

export default defineConfig({
  base: "/",
  resolve: {
    alias: {
      vm: new URL("./src/shims/vm.ts", import.meta.url).pathname
    }
  },
  plugins: [
    buildInfoPlugin(),
    react(),
    nodePolyfills({
      include: ["crypto", "stream", "url", "http", "https", "zlib"],
      globals: {
        Buffer: true,
        global: true,
        process: true
      }
    })
  ],
  build: {
    outDir: "docs",
    emptyOutDir: true,
    sourcemap: false,
    target: "es2022"
  }
});
