import { expect, test } from "@playwright/test";
import { createRailgunFallbackProviderConfig } from "../src/railgun/client";

test("RAILGUN Wallet SDK fallback provider config keeps one visible RPC valid", () => {
  const config = createRailgunFallbackProviderConfig({
    chainId: 1,
    ethereumRpcUrl: "https://ethereum-rpc.publicnode.com"
  });

  expect(config).toEqual({
    chainId: 1,
    providers: [
      {
        provider: "https://ethereum-rpc.publicnode.com",
        priority: 3,
        weight: 2,
        stallTimeout: 2500,
        maxLogsPerBatch: 5
      }
    ]
  });

  expect(
    config.providers.reduce((total, provider) => total + provider.weight, 0)
  ).toBeGreaterThanOrEqual(2);
});
