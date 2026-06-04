import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { execSync } from "node:child_process";

const virtualBuildInfoModuleId = "virtual:bindle-build-info";
const resolvedVirtualBuildInfoModuleId = `\0${virtualBuildInfoModuleId}`;

const readGitCommit = (): string => {
  if (process.env.BINDLE_BUILD_COMMIT) {
    return process.env.BINDLE_BUILD_COMMIT;
  }

  try {
    return execSync("git rev-parse HEAD", {
      cwd: new URL(".", import.meta.url),
      encoding: "utf8"
    }).trim();
  } catch {
    return "unknown";
  }
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
