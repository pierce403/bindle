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
  | "kohaku-railgun"
  | "legacy-noncanonical"
  | "unknown";

export type PasskeyAuthenticatorAttachment = AuthenticatorAttachment | null;
export type PasskeyUserVerification = UserVerificationRequirement | null;

export type StoredPasskeyCredential = {
  id: string;
  publicKey: `0x${string}`;
  rpId: string | null;
  authenticatorAttachment: PasskeyAuthenticatorAttachment;
  userVerification: PasskeyUserVerification;
  createdAt: string | null;
  lastUsedAt: string | null;
};

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
  passkeyCredentials: StoredPasskeyCredential[];
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
  passkeyUserVerification: null,
  passkeyCredentials: []
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

const railgunDerivationProviderValue = (
  value: unknown,
  hasRailgunAddress: boolean
): RailgunDerivationProvider | null => {
  if (value === "kohaku-railgun" || value === "kohaku-railgun-alpha") {
    return "kohaku-railgun";
  }

  if (
    value === "railgun-wallet-sdk" ||
    value === "railgun-wallet-sdk-legacy" ||
    value === "legacy-noncanonical"
  ) {
    return "legacy-noncanonical";
  }

  if (value === "unknown") {
    return "unknown";
  }

  return hasRailgunAddress ? "unknown" : emptyWalletState.railgunDerivationProvider;
};

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

const credentialKey = ({
  id,
  publicKey,
  rpId
}: {
  id: string;
  publicKey: `0x${string}`;
  rpId: string | null;
}): string => `${id}:${publicKey.toLowerCase()}:${rpId ?? ""}`;

const storedPasskeyCredentialOrNull = (
  value: unknown
): StoredPasskeyCredential | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const id = stringOrNull(parsed.id);
  const publicKey = hexOrNull(parsed.publicKey);

  if (!id || !publicKey) {
    return null;
  }

  return {
    id,
    publicKey,
    rpId: stringOrNull(parsed.rpId),
    authenticatorAttachment: authenticatorAttachmentOrNull(
      parsed.authenticatorAttachment
    ),
    userVerification: userVerificationOrNull(parsed.userVerification),
    createdAt: stringOrNull(parsed.createdAt),
    lastUsedAt: stringOrNull(parsed.lastUsedAt)
  };
};

const normalizeStoredPasskeyCredentials = (
  parsed: Record<string, unknown>
): StoredPasskeyCredential[] => {
  const credentials = Array.isArray(parsed.passkeyCredentials)
    ? parsed.passkeyCredentials
        .map(storedPasskeyCredentialOrNull)
        .filter(
          (credential): credential is StoredPasskeyCredential =>
            credential !== null
        )
    : [];
  const activeCredential =
    typeof parsed.passkeyCredentialId === "string" &&
    typeof parsed.passkeyPublicKey === "string"
      ? storedPasskeyCredentialOrNull({
          id: parsed.passkeyCredentialId,
          publicKey: parsed.passkeyPublicKey,
          rpId: parsed.passkeyRpId,
          authenticatorAttachment: parsed.passkeyAuthenticatorAttachment,
          userVerification: parsed.passkeyUserVerification,
          createdAt: parsed.createdAt,
          lastUsedAt: null
        })
      : null;
  const merged = activeCredential
    ? [activeCredential, ...credentials]
    : credentials;
  const seen = new Set<string>();

  return merged.filter((credential) => {
    const key = credentialKey(credential);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
};

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
    railgunDerivationProvider: railgunDerivationProviderValue(
      parsed.railgunDerivationProvider,
      Boolean(parsed.railgunAddress)
    ),
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
    ),
    passkeyCredentials: normalizeStoredPasskeyCredentials(parsed)
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
    // railgunDerivationProvider is public compatibility metadata so Bindle can
    // keep one canonical Kohaku 0zk and quarantine older noncanonical records.
    // WebAuthn credential IDs, RP IDs, and public P-256 keys are public account
    // metadata used to reconstruct the smart-account owner; they are not
    // signing secrets.
    // Authenticator attachment and user-verification values are policy hints
    // for how to ask the browser for that same credential later.
    // passkeyCredentials is a list of public owner records. It lets Bindle try
    // the right local passkey when a deployed smart account has several owner
    // slots; it still does not contain WebAuthn private key material.
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
): WalletState => {
  const now = new Date().toISOString();
  const nextCredential: StoredPasskeyCredential | null = credential.publicKey
    ? {
        id: credential.id,
        publicKey: credential.publicKey,
        rpId: credential.rpId,
        authenticatorAttachment:
          credential.authenticatorAttachment ??
          currentState.passkeyAuthenticatorAttachment ??
          null,
        userVerification:
          credential.userVerification ??
          currentState.passkeyUserVerification ??
          null,
        createdAt: currentState.createdAt ?? now,
        lastUsedAt: now
      }
    : null;
  const credentialList = nextCredential
    ? [
        nextCredential,
        ...currentState.passkeyCredentials.filter(
          (storedCredential) =>
            credentialKey(storedCredential) !== credentialKey(nextCredential)
        )
      ]
    : currentState.passkeyCredentials;

  return saveWalletState({
    ...currentState,
    status: currentState.railgunAddress ? "railgun-ready" : "passkey-ready",
    passkeyPresent: true,
    custodyModel: "passkey-4337",
    createdAt: currentState.createdAt ?? now,
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
      : null,
    passkeyCredentials: credentialList
  });
};

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
    "kohaku-railgun"
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
