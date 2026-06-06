import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  evaluateRailgunWalletSdkCompatibility,
  RailgunSdkAddressMismatchError
} from "../src/railgun/railgunWalletSdk";

test("Kohaku-canonical local wallet is not made SDK-compatible", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1local",
    kohakuRailgunAddress: "0zk1local",
    walletSdkAddress: "0zk1local",
    derivationProvider: "kohaku-railgun",
    keyIndex: 0,
    chainId: 1n
  });

  expect(compatibility.compatible).toBe(false);
  expect(compatibility.reason).toBe("kohaku-canonical");
});

test("legacy Wallet-SDK-derived wallet is quarantined", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1sdk",
    kohakuRailgunAddress: "0zk1kohaku",
    walletSdkAddress: "0zk1sdk",
    derivationProvider: "railgun-wallet-sdk-legacy",
    keyIndex: 0,
    chainId: 1n
  });

  expect(compatibility.compatible).toBe(false);
  expect(compatibility.reason).toBe("legacy-sdk-derived");
});

test("Wallet SDK address mismatch error includes both 0zk addresses", () => {
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: "0zk1saved",
    kohakuRailgunAddress: "0zk1kohaku",
    walletSdkAddress: "0zk1sdk",
    derivationProvider: "kohaku-railgun",
    keyIndex: 0,
    chainId: 1n
  });
  const error = new RailgunSdkAddressMismatchError(compatibility);

  expect(error.message).toContain("0zk1saved");
  expect(error.message).toContain("0zk1sdk");
  expect(error.message).toContain("Kohaku-canonical");
});

test("normal app and Pay UI do not import the Wallet SDK quarantine module", () => {
  const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
  const panelSource = readFileSync(
    resolve("src/components/WalletActionPanel.tsx"),
    "utf8"
  );

  expect(appSource).not.toContain("railgunWalletSdk");
  expect(appSource).not.toContain("createEncryptedRailgunWalletWithSdk");
  expect(appSource).not.toContain("markStoredRailgunWalletSdkCompatible");
  expect(panelSource).not.toContain("RailgunWalletSdkCompatibility");
  expect(panelSource).not.toContain("Create fresh SDK-compatible 0zk");
});
