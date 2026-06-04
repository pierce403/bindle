import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { nodePolyfills } from "vite-plugin-node-polyfills";

export default defineConfig({
  base: "/",
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
