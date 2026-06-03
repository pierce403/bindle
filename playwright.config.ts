import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";

const baseURL = "http://127.0.0.1:5178";
const localChromePath = ["/usr/bin/google-chrome", "/snap/bin/chromium"].find(
  (path) => existsSync(path)
);

export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: process.env.CI ? "github" : "list",
  webServer: {
    command: "npm run dev -- --port 5178",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000
  },
  use: {
    baseURL,
    launchOptions: localChromePath
      ? {
          executablePath: localChromePath
        }
      : undefined,
    trace: "on-first-retry"
  },
  projects: [
    {
      name: "chromium-mobile-pwa",
      use: {
        ...devices["Pixel 5"]
      }
    }
  ]
});
