import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getPayAsset } from "../src/intents/assets";
import { kohakuPrivateActionsPendingMessage } from "../src/intents/payFlow";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import {
  ensureKohakuRailgunArtifactPolicyReady,
  grossUpUnshieldAmount,
  prepareRailgunPayForRecipient,
  validateKohakuRailgunArtifactPolicy
} from "../src/railgun/pay";
import { resolveRailgunBroadcasterFeeTokenAddress } from "../src/railgun/wakuBroadcaster";
import { emptyWalletState } from "../src/wallet/walletState";

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

test("Private Pay is disabled before quote or broadcaster work", async () => {
  const asset = getPayAsset("USDC");

  expect(asset).not.toBeNull();

  await expect(
    prepareRailgunPayForRecipient({
      amount: "5",
      asset: asset!,
      policy: defaultConnectionPolicy,
      recipient: "0x000000000000000000000000000000000000dEaD",
      walletState: {
        ...emptyWalletState,
        railgunAddress: "0zk1kohaku",
        railgunKeyStore: "encrypted-local",
        railgunDerivationProvider: "kohaku-railgun"
      },
      onProgress: () => undefined,
      onStatus: () => undefined
    })
  ).rejects.toThrow(kohakuPrivateActionsPendingMessage);
});

test("Private Pay source does not import removed SDK or quote/broadcaster path", () => {
  const source = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  const prepareIndex = source.indexOf("export const prepareRailgunPayForRecipient");
  const prepareSource = source.slice(prepareIndex);

  expect(prepareIndex).toBeGreaterThan(-1);
  expect(prepareSource).toContain("kohakuPrivateActionsPendingMessage");
  expect(prepareSource).not.toContain("@railgun-community/wallet");
  expect(prepareSource).not.toContain("prepareUniswapV4EthToUsdcExactOutputRoute");
  expect(prepareSource).not.toContain("getRailgunWakuBroadcasterQuote");
});
