import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "cash.bindle.wallet",
  appName: "Bindle",
  webDir: "docs",
  server: {
    hostname: "localhost",
    androidScheme: "https",
    cleartext: false
  },
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    resolveServiceWorkerRequests: true
  }
};

export default config;
