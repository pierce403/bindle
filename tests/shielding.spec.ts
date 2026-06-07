import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import {
  assessShieldReadiness,
  assessUnshieldReadiness,
  estimatePublicShieldGasReserveWei,
  minimumPublicShieldGasReserveWei,
  spendablePublicShieldAmountWei,
  summarizeMissingRequirements
} from "../src/railgun/shielding";

test("funded public wallet is not shield-ready without recoverable 0zk state", () => {
  const report = assessShieldReadiness({
    smartWalletAddress: "0x000000000000000000000000000000000000dEaD",
    railgunAddress: null,
    hasRecoverableRailgunKeyMaterial: false,
    publicBalanceWei: 1_000_000_000_000_000_000n,
    ethereumRpcUrl: defaultConnectionPolicy.ethereumRpcUrl,
    bundlerUrl: defaultConnectionPolicy.bundlerUrl,
    providerMode: defaultConnectionPolicy.providerMode
  });

  expect(report.ready).toBe(false);
  expect(report.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "public-balance",
        ready: true
      }),
      expect.objectContaining({
        id: "railgun-address",
        ready: false
      }),
      expect.objectContaining({
        id: "railgun-key-material",
        ready: false
      })
    ])
  );
  expect(summarizeMissingRequirements(report)).toContain("real 0zk address");
});

test("unshield path remains blocked until keys, balance sync, and broadcaster exist", () => {
  const report = assessUnshieldReadiness({
    railgunAddress: null,
    hasRecoverableRailgunKeyMaterial: false,
    shieldedBalanceWei: null,
    toolkitReady: false,
    ethereumRpcUrl: defaultConnectionPolicy.ethereumRpcUrl,
    broadcasterUrl: defaultConnectionPolicy.broadcasterUrl,
    providerMode: defaultConnectionPolicy.providerMode
  });

  expect(report.ready).toBe(false);
  expect(report.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "railgun-address",
        ready: false
      }),
      expect.objectContaining({
        id: "railgun-key-material",
        ready: false
      }),
      expect.objectContaining({
        id: "shielded-balance",
        ready: false
      }),
      expect.objectContaining({
        id: "railgun-broadcaster",
        ready: true
      })
    ])
  );
});

test("shield sweep reserves visible ERC-4337 fees when no paymaster sponsors gas", () => {
  expect(estimatePublicShieldGasReserveWei(1n)).toBe(
    minimumPublicShieldGasReserveWei
  );
  expect(
    spendablePublicShieldAmountWei({
      publicBalanceWei: 20_000_000_000_000_000n,
      gasReserveWei: minimumPublicShieldGasReserveWei
    })
  ).toBe(19_000_000_000_000_000n);
  expect(() =>
    spendablePublicShieldAmountWei({
      publicBalanceWei: minimumPublicShieldGasReserveWei,
      gasReserveWei: minimumPublicShieldGasReserveWei
    })
  ).toThrow(/too small to shield/i);
});
