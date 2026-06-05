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

export type RailgunKeyStore = "encrypted-local" | null;
export type RailgunDerivationProvider =
  | "kohaku-railgun-alpha"
  | "railgun-wallet-sdk"
  | "unknown";

export type PasskeyAuthenticatorAttachment = AuthenticatorAttachment | null;
export type PasskeyUserVerification = UserVerificationRequirement | null;

export type WalletState = {
  status: WalletStatus;
  smartWalletAddress: string | null;
  railgunAddress: string | null;
  railgunKeyStore: RailgunKeyStore;
  railgunDerivationProvider: RailgunDerivationProvider | null;
  passkeyPresent: boolean;
  mnemonicPresent: boolean;
  createdAt: string | null;
  railgunWalletCreatedAt: string | null;
  railgunWalletImportedAt: string | null;
  lastError: string | null;
  custodyModel: CustodyModel;
  passkeyCredentialId: string | null;
  passkeyPublicKey: `0x${string}` | null;
  passkeyRpId: string | null;
  passkeyAuthenticatorAttachment?: PasskeyAuthenticatorAttachment;
  passkeyUserVerification?: PasskeyUserVerification;
};

const storageKey = "bindle.wallet.metadata.v1";

export const emptyWalletState: WalletState = {
  status: "none",
  smartWalletAddress: null,
  railgunAddress: null,
  railgunKeyStore: null,
  railgunDerivationProvider: null,
  passkeyPresent: false,
  mnemonicPresent: false,
  createdAt: null,
  railgunWalletCreatedAt: null,
  railgunWalletImportedAt: null,
  lastError: null,
  custodyModel: null,
  passkeyCredentialId: null,
  passkeyPublicKey: null,
  passkeyRpId: null,
  passkeyAuthenticatorAttachment: null,
  passkeyUserVerification: null
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

const isRailgunKeyStore = (value: unknown): value is RailgunKeyStore =>
  value === "encrypted-local" || value === null;

const isRailgunDerivationProvider = (
  value: unknown
): value is RailgunDerivationProvider =>
  value === "kohaku-railgun-alpha" ||
  value === "railgun-wallet-sdk" ||
  value === "unknown";

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
    railgunKeyStore: isRailgunKeyStore(parsed.railgunKeyStore)
      ? parsed.railgunKeyStore
      : emptyWalletState.railgunKeyStore,
    railgunDerivationProvider: isRailgunDerivationProvider(
      parsed.railgunDerivationProvider
    )
      ? parsed.railgunDerivationProvider
      : parsed.railgunAddress
        ? "unknown"
        : emptyWalletState.railgunDerivationProvider,
    passkeyPresent: booleanValue(parsed.passkeyPresent),
    mnemonicPresent: booleanValue(parsed.mnemonicPresent),
    createdAt: stringOrNull(parsed.createdAt),
    railgunWalletCreatedAt: stringOrNull(parsed.railgunWalletCreatedAt),
    railgunWalletImportedAt: stringOrNull(parsed.railgunWalletImportedAt),
    lastError: stringOrNull(parsed.lastError),
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
    // The railgunKeyStore value is only a marker that encrypted local key
    // material exists in IndexedDB; it is not key material itself.
    // railgunDerivationProvider is public compatibility metadata so Private
    // Pay can refuse older local derivation paths before touching quote or
    // broadcaster endpoints.
    // WebAuthn credential IDs, RP IDs, and public P-256 keys are public account
    // metadata used to reconstruct the smart-account owner; they are not
    // signing secrets.
    // Authenticator attachment and user-verification values are policy hints
    // for how to ask the browser for that same credential later.
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

export const clearRailgunWalletState = (currentState: WalletState): WalletState => {
  const status = currentState.smartWalletAddress
    ? "smart-wallet-planned"
    : currentState.passkeyPresent
      ? "passkey-ready"
      : "none";

  return saveWalletState({
    ...currentState,
    status,
    railgunAddress: null,
    railgunKeyStore: null,
    railgunDerivationProvider: null,
    mnemonicPresent: false,
    railgunWalletCreatedAt: null,
    railgunWalletImportedAt: null,
    lastError: null,
    custodyModel:
      currentState.passkeyPresent || currentState.smartWalletAddress
        ? "passkey-4337"
        : null
  });
};

export const markPasskeyEnrolled = (
  currentState: WalletState,
  credential: {
    id: string;
    publicKey: `0x${string}` | null;
    rpId: string | null;
    authenticatorAttachment?: PasskeyAuthenticatorAttachment;
    userVerification?: PasskeyUserVerification;
  }
): WalletState =>
  saveWalletState({
    ...currentState,
    status: currentState.railgunAddress ? "railgun-ready" : "passkey-ready",
    passkeyPresent: true,
    custodyModel: "passkey-4337",
    createdAt: currentState.createdAt ?? new Date().toISOString(),
    lastError: null,
    passkeyCredentialId: credential.id,
    passkeyPublicKey: credential.publicKey,
    passkeyRpId: credential.rpId,
    passkeyAuthenticatorAttachment:
      credential.authenticatorAttachment ?? currentState.passkeyAuthenticatorAttachment,
    passkeyUserVerification:
      credential.userVerification ?? currentState.passkeyUserVerification,
    smartWalletAddress: credential.publicKey
      ? currentState.smartWalletAddress
      : null
  });

export const markSmartWalletReady = (
  currentState: WalletState,
  smartWalletAddress: string
): WalletState =>
  saveWalletState({
    ...currentState,
    status: currentState.railgunAddress ? "railgun-ready" : "smart-wallet-planned",
    smartWalletAddress,
    passkeyPresent: true,
    custodyModel: "passkey-4337",
    lastError: null
  });

export const markRailgunWalletReady = (
  currentState: WalletState,
  railgunAddress: string,
  source: "created" | "imported",
  derivationProvider: Exclude<RailgunDerivationProvider, "unknown"> =
    "kohaku-railgun-alpha"
): WalletState => {
  const now = new Date().toISOString();

  return saveWalletState({
    ...currentState,
    status: "railgun-ready",
    railgunAddress,
    railgunKeyStore: "encrypted-local",
    railgunDerivationProvider: derivationProvider,
    mnemonicPresent: true,
    custodyModel: currentState.custodyModel ?? "mnemonic-railgun",
    createdAt: currentState.createdAt ?? now,
    railgunWalletCreatedAt:
      source === "created" ? now : currentState.railgunWalletCreatedAt,
    railgunWalletImportedAt:
      source === "imported" ? now : currentState.railgunWalletImportedAt,
    lastError: null
  });
};

export const markWalletError = (
  currentState: WalletState,
  lastError: string
): WalletState =>
  saveWalletState({
    ...currentState,
    status: "error",
    lastError
  });
