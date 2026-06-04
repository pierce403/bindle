import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { execSync } from "node:child_process";

const readGitCommit = (): string => {
  if (process.env.BINDLE_BUILD_COMMIT) {
    return process.env.BINDLE_BUILD_COMMIT;
  }

  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
};

const buildCommit = readGitCommit();
const buildTime =
  process.env.BINDLE_BUILD_TIME ?? new Date().toISOString();

export default defineConfig({
  base: "/",
  define: {
    __BINDLE_BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BINDLE_BUILD_TIME__: JSON.stringify(buildTime)
  },
  resolve: {
    alias: {
      vm: new URL("./src/shims/vm.ts", import.meta.url).pathname
    }
  },
  plugins: [
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
