import { expect, test } from "@playwright/test";
import {
  accountExportFilename,
  createBindleAccountExport,
  parseBindleAccountExport
} from "../src/wallet/accountExport";
import type { WalletState } from "../src/wallet/walletState";

const wallet: WalletState = {
  status: "railgun-ready",
  smartWalletAddress: "0x000000000000000000000000000000000000dEaD",
  railgunAddress: "0zk1testaccountaddress123456789",
  railgunKeyStore: "encrypted-local",
  passkeyPresent: true,
  mnemonicPresent: true,
  createdAt: "2026-06-03T00:00:00.000Z",
  railgunWalletCreatedAt: "2026-06-03T00:00:00.000Z",
  railgunWalletImportedAt: null,
  lastError: null,
  custodyModel: "passkey-4337",
  passkeyCredentialId: "credential-id",
  passkeyPublicKey: "0x04"
};

test("creates an account export with explicit recovery warnings", () => {
  const accountExport = createBindleAccountExport({
    wallet,
    railgunWallet: {
      railgunAddress: wallet.railgunAddress ?? "",
      recoveryPhrase:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      keyIndex: 0,
      chainId: "1",
      exportedFrom: "browser-local"
    }
  });
  const parsed = parseBindleAccountExport(JSON.stringify(accountExport));

  expect(parsed.schema).toBe("me.bindle.account-export");
  expect(parsed.wallet.smartWalletAddress).toBe(wallet.smartWalletAddress);
  expect(parsed.railgunWallet?.recoveryPhrase).toContain("abandon");
  expect(parsed.warnings.join(" ")).toContain("passkey private material");
  expect(parsed.warnings.join(" ")).toContain("recovery phrase");
});

test("rejects unsupported account export JSON", () => {
  expect(() =>
    parseBindleAccountExport(JSON.stringify({ schema: "other", version: 1 }))
  ).toThrow("supported Bindle export file");
});

test("uses account identifiers in export filenames", () => {
  expect(accountExportFilename(wallet)).toMatch(
    /^bindle-account-000000-\d{4}-\d{2}-\d{2}\.json$/
  );
});
