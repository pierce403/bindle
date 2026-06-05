import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import {
  ensureKohakuRailgunArtifactPolicyReady,
  grossUpUnshieldAmount,
  validateKohakuRailgunArtifactPolicy
} from "../src/railgun/pay";
import { resolveRailgunBroadcasterFeeTokenAddress } from "../src/railgun/wakuBroadcaster";

test("Pay grosses up RAILGUN unshield amount so public WETH covers the swap input", () => {
  expect(
    grossUpUnshieldAmount({
      desiredPublicAmount: 1_000_000n,
      unshieldFeeBps: 25
    })
  ).toBe(1_002_507n);
});

test("Pay does not gross up when the chain reports no unshield fee", () => {
  expect(
    grossUpUnshieldAmount({
      desiredPublicAmount: 1_000_000n,
      unshieldFeeBps: 0
    })
  ).toBe(1_000_000n);
});

test("Pay blocks custom RAILGUN artifact origins until Kohaku exposes a loader", () => {
  expect(() =>
    validateKohakuRailgunArtifactPolicy({
      ...defaultConnectionPolicy,
      railgunArtifactUrl: "https://example.com/railgun-artifacts/"
    })
  ).toThrow(/Custom artifact origins are blocked/i);
});

test("Pay accepts the Bindle-hosted RAILGUN artifact path in non-browser checks", async () => {
  await expect(
    ensureKohakuRailgunArtifactPolicyReady(defaultConnectionPolicy)
  ).resolves.toBeUndefined();
});

test("Pay resolves the default RAILGUN broadcaster fee token to mainnet WETH", () => {
  expect(resolveRailgunBroadcasterFeeTokenAddress(defaultConnectionPolicy)).toBe(
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"
  );
});
