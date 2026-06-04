import type { ExportedRailgunWallet } from "../railgun/railgunWallet";
import {
  emptyWalletState,
  type CustodyModel,
  type PasskeyAuthenticatorAttachment,
  type PasskeyUserVerification,
  type RailgunKeyStore,
  type WalletState,
  type WalletStatus
} from "./walletState";

export type BindleAccountExport = {
  schema: "me.bindle.account-export";
  version: 1;
  exportedAt: string;
  wallet: WalletState;
  railgunWallet: ExportedRailgunWallet | null;
  reclaimPlan: AccountReclaimPlan;
  warnings: string[];
};

export type AccountReclaimPlan = {
  publicSmartAccount: {
    address: string | null;
    passkeyCredentialId: string | null;
    passkeyPublicKey: `0x${string}` | null;
    passkeyRpId: string | null;
    status: "requires-synced-passkey" | "not-configured";
    note: string;
  };
  shieldedRailgunAccount: {
    address: string | null;
    status:
      | "recovery-phrase-included"
      | "metadata-only"
      | "not-configured";
    note: string;
  };
};

const schema = "me.bindle.account-export";

const exportWarnings = [
  "If railgunWallet is present, this file contains the RAILGUN recovery phrase and can recover shielded funds.",
  "The public smart-account address can be controlled on a new device only if the same WebAuthn/passkey credential and RP ID are available there.",
  "Enrolling a new passkey creates a new owner path; it does not recover the old public smart account unless an on-chain recovery or owner-rotation flow was set up before losing the old passkey.",
  "Keep this file private and import it only into a trusted Bindle PWA session."
];

const isWalletStatus = (value: unknown): value is WalletStatus =>
  value === "none" ||
  value === "passkey-ready" ||
  value === "smart-wallet-planned" ||
  value === "railgun-ready" ||
  value === "error";

const isCustodyModel = (value: unknown): value is CustodyModel =>
  value === "passkey-4337" ||
  value === "mnemonic-railgun" ||
  value === "external-wallet" ||
  value === null;

const isRailgunKeyStore = (value: unknown): value is RailgunKeyStore =>
  value === "encrypted-local" || value === null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const hexOrNull = (value: unknown): `0x${string}` | null =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)
    ? (value as `0x${string}`)
    : null;

const booleanValue = (value: unknown): boolean => value === true;

const authenticatorAttachmentOrNull = (
  value: unknown
): PasskeyAuthenticatorAttachment =>
  value === "platform" || value === "cross-platform" ? value : null;

const userVerificationOrNull = (value: unknown): PasskeyUserVerification =>
  value === "required" || value === "preferred" || value === "discouraged"
    ? value
    : null;

const normalizeWallet = (value: unknown): WalletState => {
  if (!value || typeof value !== "object") {
    return emptyWalletState;
  }

  const parsed = value as Record<string, unknown>;

  return {
    status: isWalletStatus(parsed.status) ? parsed.status : emptyWalletState.status,
    smartWalletAddress: stringOrNull(parsed.smartWalletAddress),
    railgunAddress: stringOrNull(parsed.railgunAddress),
    railgunKeyStore: isRailgunKeyStore(parsed.railgunKeyStore)
      ? parsed.railgunKeyStore
      : emptyWalletState.railgunKeyStore,
    passkeyPresent: booleanValue(parsed.passkeyPresent),
    mnemonicPresent: booleanValue(parsed.mnemonicPresent),
    createdAt: stringOrNull(parsed.createdAt),
    railgunWalletCreatedAt: stringOrNull(parsed.railgunWalletCreatedAt),
    railgunWalletImportedAt: stringOrNull(parsed.railgunWalletImportedAt),
    lastError: stringOrNull(parsed.lastError),
    custodyModel: isCustodyModel(parsed.custodyModel)
      ? parsed.custodyModel
      : emptyWalletState.custodyModel,
    passkeyCredentialId: stringOrNull(parsed.passkeyCredentialId),
    passkeyPublicKey: hexOrNull(parsed.passkeyPublicKey),
    passkeyRpId: stringOrNull(parsed.passkeyRpId),
    passkeyAuthenticatorAttachment: authenticatorAttachmentOrNull(
      parsed.passkeyAuthenticatorAttachment
    ),
    passkeyUserVerification: userVerificationOrNull(
      parsed.passkeyUserVerification
    )
  };
};

const normalizeRailgunWallet = (
  value: unknown
): ExportedRailgunWallet | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (!value || typeof value !== "object") {
    throw new Error("Account export RAILGUN wallet section is invalid.");
  }

  const parsed = value as Record<string, unknown>;

  if (
    typeof parsed.railgunAddress !== "string" ||
    typeof parsed.recoveryPhrase !== "string" ||
    typeof parsed.keyIndex !== "number" ||
    typeof parsed.chainId !== "string" ||
    parsed.exportedFrom !== "browser-local"
  ) {
    throw new Error("Account export RAILGUN wallet section is invalid.");
  }

  return {
    railgunAddress: parsed.railgunAddress,
    recoveryPhrase: parsed.recoveryPhrase,
    keyIndex: parsed.keyIndex,
    chainId: parsed.chainId,
    exportedFrom: "browser-local"
  };
};

const buildReclaimPlan = ({
  railgunWallet,
  wallet
}: {
  railgunWallet: ExportedRailgunWallet | null;
  wallet: WalletState;
}): AccountReclaimPlan => ({
  publicSmartAccount: wallet.smartWalletAddress
    ? {
        address: wallet.smartWalletAddress,
        passkeyCredentialId: wallet.passkeyCredentialId,
        passkeyPublicKey: wallet.passkeyPublicKey,
        passkeyRpId: wallet.passkeyRpId,
        status: "requires-synced-passkey",
        note:
          "The export stores public smart-account metadata, but not the WebAuthn private key. The same platform passkey and RP ID must be available on the new device to spend from this public smart account."
      }
    : {
        address: null,
        passkeyCredentialId: null,
        passkeyPublicKey: null,
        passkeyRpId: null,
        status: "not-configured",
        note: "No public smart-account funding address was configured."
      },
  shieldedRailgunAccount: railgunWallet
    ? {
        address: railgunWallet.railgunAddress,
        status: "recovery-phrase-included",
        note:
          "The RAILGUN recovery phrase is included and can reclaim the shielded 0zk account when imported into a trusted Bindle PWA session."
      }
    : wallet.railgunAddress
      ? {
          address: wallet.railgunAddress,
          status: "metadata-only",
          note:
            "The export contains the shielded address metadata, but no RAILGUN recovery phrase was available to include."
        }
      : {
          address: null,
          status: "not-configured",
          note: "No shielded RAILGUN account was configured."
        }
});

export const createBindleAccountExport = ({
  railgunWallet,
  wallet
}: {
  railgunWallet: ExportedRailgunWallet | null;
  wallet: WalletState;
}): BindleAccountExport => ({
  schema,
  version: 1,
  exportedAt: new Date().toISOString(),
  wallet: normalizeWallet(wallet),
  railgunWallet,
  reclaimPlan: buildReclaimPlan({
    railgunWallet,
    wallet: normalizeWallet(wallet)
  }),
  warnings: exportWarnings
});

export const parseBindleAccountExport = (text: string): BindleAccountExport => {
  const parsed = JSON.parse(text) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Account export is not a JSON object.");
  }

  const record = parsed as Record<string, unknown>;

  if (record.schema !== schema || record.version !== 1) {
    throw new Error("Account export is not a supported Bindle export file.");
  }

  const wallet = normalizeWallet(record.wallet);
  const railgunWallet = normalizeRailgunWallet(record.railgunWallet);

  return {
    schema,
    version: 1,
    exportedAt:
      typeof record.exportedAt === "string"
        ? record.exportedAt
        : new Date().toISOString(),
    wallet,
    railgunWallet,
    reclaimPlan: buildReclaimPlan({ railgunWallet, wallet }),
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((item): item is string => typeof item === "string")
      : exportWarnings
  };
};

export const accountExportFilename = (wallet: WalletState): string => {
  const date = new Date().toISOString().slice(0, 10);
  const suffix =
    wallet.smartWalletAddress?.slice(2, 8) ??
    wallet.railgunAddress?.slice(3, 9) ??
    "local";

  return `bindle-account-${suffix}-${date}.json`;
};
