import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("Private Pay compatibility and private-change gates run before quote and broadcaster discovery", () => {
  const source = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  const prepareIndex = source.indexOf("export const prepareRailgunUsdcPayForRecipient");
  const prepareSource = source.slice(prepareIndex);
  const compatibilityIndex = prepareSource.indexOf(
    "ensureRailgunWalletSdkWalletForLocalWallet"
  );
  const changeGateIndex = prepareSource.indexOf("assertPrivatePayChangeDisposition");
  const quoteIndex = prepareSource.indexOf("Quoting Uniswap v4 ETH to USDC route");
  const broadcasterIndex = prepareSource.indexOf("Finding RAILGUN broadcaster");

  expect(prepareIndex).toBeGreaterThan(-1);
  expect(compatibilityIndex).toBeGreaterThan(-1);
  expect(changeGateIndex).toBeGreaterThan(-1);
  expect(quoteIndex).toBeGreaterThan(-1);
  expect(broadcasterIndex).toBeGreaterThan(-1);
  expect(compatibilityIndex).toBeLessThan(quoteIndex);
  expect(changeGateIndex).toBeLessThan(quoteIndex);
  expect(quoteIndex).toBeLessThan(broadcasterIndex);
});
