import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { isBalanceForWallet, shieldedBalanceCacheContextForWallet, shieldedBalanceSyncContextKey } from "../src/railgun/shieldedBalanceContext";
import type { ShieldedEthBalance } from "../src/railgun/shieldedBalance";

const wallet = { railgunAddress: "0zk-test-only", railgunDerivationProvider: "kohaku-railgun" as const,
  railgunDerivationVersion: "railgun-babyjubjub-v1" as const };
const balance: ShieldedEthBalance = {
  railgunAddress: wallet.railgunAddress, derivationProvider: "kohaku-railgun",
  derivationVersion: wallet.railgunDerivationVersion, chainId: 1n,
  wei: 1n, formattedEth: "test only", usd: null, blockNumber: 2n,
  syncedAt: "2026-09-19T00:00:00.000Z", rawBalanceCount: 1, matchedWrappedBaseTokenBalances: 1, price: null
};

test("live balance matching rejects another account, derivation format, provider, chain and unsupported metadata", () => {
  expect(isBalanceForWallet(balance, wallet)).toBe(true);
  expect(isBalanceForWallet(balance, { ...wallet, railgunAddress: "0zk-other" })).toBe(false);
  expect(isBalanceForWallet(balance, { ...wallet, railgunDerivationVersion: "bindle-ethers-bip32-v1" })).toBe(false);
  expect(isBalanceForWallet(balance, { ...wallet, railgunDerivationProvider: "legacy-noncanonical" })).toBe(false);
  expect(isBalanceForWallet({ ...balance, chainId: 2n }, wallet)).toBe(false);
  expect(isBalanceForWallet(balance, { ...wallet, railgunDerivationVersion: null })).toBe(false);
  expect(shieldedBalanceCacheContextForWallet({ ...wallet, railgunDerivationVersion: null })).toBeNull();
});

test("sync context changes on account, format and endpoint changes", () => {
  const context = shieldedBalanceSyncContextKey(wallet, defaultConnectionPolicy);
  expect(shieldedBalanceSyncContextKey({ ...wallet, railgunAddress: "0zk-other" }, defaultConnectionPolicy)).not.toBe(context);
  expect(shieldedBalanceSyncContextKey({ ...wallet, railgunDerivationVersion: "bindle-ethers-bip32-v1" }, defaultConnectionPolicy)).not.toBe(context);
  expect(shieldedBalanceSyncContextKey(wallet, { ...defaultConnectionPolicy, ethereumRpcUrl: "http://localhost:9999" })).not.toBe(context);
});
