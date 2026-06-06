import { expect, test } from "@playwright/test";
import {
  clearCachedShieldedEthBalance,
  loadCachedShieldedEthBalance,
  saveCachedShieldedEthBalance
} from "../src/railgun/shieldedBalanceCache";
import type { ShieldedEthBalance } from "../src/railgun/shieldedBalance";

const installLocalStorage = () => {
  const store = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
        removeItem: (key: string) => store.delete(key)
      }
    }
  });
};

test("shielded balance cache is keyed by address, derivation provider, and chain", () => {
  installLocalStorage();
  clearCachedShieldedEthBalance();

  const balance: ShieldedEthBalance = {
    railgunAddress: "0zk1cached",
    derivationProvider: "kohaku-railgun",
    chainId: 1n,
    wei: 1_000_000_000_000_000_000n,
    formattedEth: "1 ETH",
    usd: "$3,500.00",
    blockNumber: 23n,
    syncedAt: "2026-06-06T00:00:00.000Z",
    rawBalanceCount: 1,
    matchedWrappedBaseTokenBalances: 1,
    price: null
  };

  saveCachedShieldedEthBalance(balance);

  expect(
    loadCachedShieldedEthBalance({
      railgunAddress: "0zk1cached",
      derivationProvider: "kohaku-railgun",
      chainId: 1n
    })?.formattedEth
  ).toBe("1 ETH");
  expect(
    loadCachedShieldedEthBalance({
      railgunAddress: "0zk1cached",
      derivationProvider: "legacy-noncanonical",
      chainId: 1n
    })
  ).toBeNull();
  expect(
    loadCachedShieldedEthBalance({
      railgunAddress: "0zk1cached",
      derivationProvider: "kohaku-railgun",
      chainId: 2n
    })
  ).toBeNull();
});
