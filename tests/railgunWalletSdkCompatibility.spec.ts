import { expect, test } from "@playwright/test";
import {
  evaluateRailgunWalletSdkCompatibility,
  RailgunSdkAddressMismatchError
} from "../src/railgun/railgunWalletSdk";

test("Kohaku-derived local wallet is not Private Pay compatible even if addresses match", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1local",
    kohakuRailgunAddress: "0zk1local",
    walletSdkAddress: "0zk1local",
    derivationProvider: "kohaku-railgun-alpha",
    keyIndex: 0,
    chainId: 1n
  });

  expect(compatibility.compatible).toBe(false);
  expect(compatibility.reason).toBe("not-sdk-derived");
});

test("Wallet SDK-compatible wallet requires matching SDK address and metadata", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1sdk",
    kohakuRailgunAddress: "0zk1kohaku",
    walletSdkAddress: "0zk1sdk",
    derivationProvider: "railgun-wallet-sdk",
    keyIndex: 0,
    chainId: 1n
  });

  expect(compatibility.compatible).toBe(true);
  expect(compatibility.reason).toBe("compatible");
});

test("Wallet SDK address mismatch error includes both 0zk addresses", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1saved",
    kohakuRailgunAddress: "0zk1kohaku",
    walletSdkAddress: "0zk1sdk",
    derivationProvider: "kohaku-railgun-alpha",
    keyIndex: 0,
    chainId: 1n
  });
  const error = new RailgunSdkAddressMismatchError(compatibility);

  expect(error.message).toContain("0zk1saved");
  expect(error.message).toContain("0zk1sdk");
  expect(error.message).toContain("older/Kohaku-local derivation path");
});
