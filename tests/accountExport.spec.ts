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
  railgunDerivationProvider: "kohaku-railgun",
  passkeyPresent: true,
  mnemonicPresent: true,
  createdAt: "2026-06-03T00:00:00.000Z",
  railgunWalletCreatedAt: "2026-06-03T00:00:00.000Z",
  railgunWalletImportedAt: null,
  lastError: null,
  custodyModel: "passkey-4337",
  passkeyCredentialId: "credential-id",
  passkeyPublicKey: "0x04",
  passkeyRpId: "bindle.me",
  passkeyAuthenticatorAttachment: "cross-platform",
  passkeyUserVerification: "preferred"
};

test("creates an account export with explicit recovery warnings", () => {
  const accountExport = createBindleAccountExport({
    wallet,
    railgunWallet: {
      railgunAddress: wallet.railgunAddress ?? "",
      derivationProvider: "kohaku-railgun",
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
  expect(parsed.wallet.passkeyRpId).toBe("bindle.me");
  expect(parsed.wallet.passkeyAuthenticatorAttachment).toBe("cross-platform");
  expect(parsed.wallet.passkeyUserVerification).toBe("preferred");
  expect(parsed.railgunWallet?.recoveryPhrase).toContain("abandon");
  expect(parsed.railgunWallet?.derivationProvider).toBe("kohaku-railgun");
  expect(parsed.reclaimPlan.publicSmartAccount.status).toBe(
    "requires-synced-passkey"
  );
  expect(parsed.reclaimPlan.publicSmartAccount.address).toBe(
    wallet.smartWalletAddress
  );
  expect(parsed.reclaimPlan.shieldedRailgunAccount.status).toBe(
    "recovery-phrase-included"
  );
  expect(parsed.warnings.join(" ")).toContain("same WebAuthn/passkey credential");
  expect(parsed.warnings.join(" ")).toContain("Enrolling a new passkey");
  expect(parsed.warnings.join(" ")).toContain("recovery phrase");
});

test("normalizes legacy noncanonical exports without treating them as Kohaku", () => {
  const accountExport = createBindleAccountExport({
    wallet: {
      ...wallet,
      railgunDerivationProvider: "legacy-noncanonical"
    },
    railgunWallet: {
      railgunAddress: wallet.railgunAddress ?? "",
      derivationProvider: "railgun-wallet-sdk-legacy",
      recoveryPhrase:
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about",
      keyIndex: 0,
      chainId: "1",
      exportedFrom: "browser-local"
    }
  });
  const parsed = parseBindleAccountExport(JSON.stringify(accountExport));

  expect(parsed.wallet.railgunDerivationProvider).toBe(
    "legacy-noncanonical"
  );
  expect(parsed.railgunWallet?.derivationProvider).toBe(
    "legacy-noncanonical"
  );
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
