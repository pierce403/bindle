export type WalletStatus =
  | "none"
  | "passkey-ready"
  | "smart-wallet-planned"
  | "railgun-ready"
  | "error";

export type CustodyModel =
  | "passkey-4337"
  | "mnemonic-railgun"
  | "external-wallet"
  | null;

export type WalletState = {
  status: WalletStatus;
  smartWalletAddress: string | null;
  railgunAddress: string | null;
  passkeyPresent: boolean;
  mnemonicPresent: boolean;
  createdAt: string | null;
  lastError: string | null;
  custodyModel: CustodyModel;
  passkeyCredentialId: string | null;
};

const storageKey = "bindle.wallet.metadata.v1";

export const emptyWalletState: WalletState = {
  status: "none",
  smartWalletAddress: null,
  railgunAddress: null,
  passkeyPresent: false,
  mnemonicPresent: false,
  createdAt: null,
  lastError: null,
  custodyModel: null,
  passkeyCredentialId: null
};

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

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const booleanValue = (value: unknown): boolean => value === true;

const normalizeWalletState = (value: unknown): WalletState => {
  if (!value || typeof value !== "object") {
    return emptyWalletState;
  }

  const parsed = value as Record<string, unknown>;
  const status = isWalletStatus(parsed.status)
    ? parsed.status
    : emptyWalletState.status;
  const custodyModel = isCustodyModel(parsed.custodyModel)
    ? parsed.custodyModel
    : emptyWalletState.custodyModel;

  return {
    status,
    custodyModel,
    smartWalletAddress: stringOrNull(parsed.smartWalletAddress),
    railgunAddress: stringOrNull(parsed.railgunAddress),
    passkeyPresent: booleanValue(parsed.passkeyPresent),
    mnemonicPresent: booleanValue(parsed.mnemonicPresent),
    createdAt: stringOrNull(parsed.createdAt),
    lastError: stringOrNull(parsed.lastError),
    passkeyCredentialId: stringOrNull(parsed.passkeyCredentialId)
  };
};

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

export const loadWalletState = (): WalletState => {
  if (!canUseStorage()) {
    return emptyWalletState;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return emptyWalletState;
  }

  try {
    return normalizeWalletState(JSON.parse(stored));
  } catch {
    return {
      ...emptyWalletState,
      status: "error",
      lastError: "Stored wallet metadata could not be read"
    };
  }
};

export const saveWalletState = (state: WalletState): WalletState => {
  const normalized = normalizeWalletState(state);

  if (canUseStorage()) {
    // Storage boundary: Bindle stores only non-secret wallet metadata here.
    // Do not store private keys, mnemonics, RAILGUN spending/viewing material,
    // WebAuthn private material, or provider secrets in this localStorage record.
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  }

  return normalized;
};

export const resetWalletState = (): WalletState => {
  if (canUseStorage()) {
    window.localStorage.removeItem(storageKey);
  }

  return emptyWalletState;
};

export const markPasskeyEnrolled = (
  currentState: WalletState,
  credentialId: string
): WalletState =>
  saveWalletState({
    ...currentState,
    status: "passkey-ready",
    passkeyPresent: true,
    custodyModel: "passkey-4337",
    createdAt: currentState.createdAt ?? new Date().toISOString(),
    lastError: null,
    passkeyCredentialId: credentialId,
    smartWalletAddress: null
  });

export const markWalletError = (
  currentState: WalletState,
  lastError: string
): WalletState =>
  saveWalletState({
    ...currentState,
    status: "error",
    lastError
  });
