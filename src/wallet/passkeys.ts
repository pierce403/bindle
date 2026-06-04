import { createWebAuthnCredential } from "viem/account-abstraction";

export type PasskeyCapability = {
  checked: boolean;
  webAuthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  userVerificationAvailable: boolean;
  available: boolean;
  message: string;
};

export type BindlePasskeyCredential = {
  id: string;
  publicKey: `0x${string}`;
  rpId: string;
  authenticatorAttachment: AuthenticatorAttachment;
  userVerification: UserVerificationRequirement;
};

export type PasskeyAuthenticatorKind = "platform" | "security-key";

export type BindleOwnerEnrollmentCode = {
  schema: "cash.bindle.passkey-owner-enrollment";
  version: 1;
  createdAt: string;
  targetOrigin: string;
  targetRpId: string;
  smartWalletAddress: string | null;
  credential: BindlePasskeyCredential;
};

type PasskeyLookupContext = {
  passkeyRpId: string | null;
};

const unavailableCapability: PasskeyCapability = {
  checked: false,
  webAuthnSupported: false,
  platformAuthenticatorAvailable: false,
  userVerificationAvailable: false,
  available: false,
  message: "Checking passkey support"
};

export const bindleCanonicalPasskeyRpId = "bindle.me";

export const getDefaultPasskeyRpId = (): string => {
  if (typeof window === "undefined") {
    return bindleCanonicalPasskeyRpId;
  }

  const hostname = window.location.hostname;

  if (hostname === "bindle.cash") {
    return bindleCanonicalPasskeyRpId;
  }

  return hostname;
};

export const getCurrentPasskeyHostname = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  return window.location.hostname || null;
};

const currentOrigin = (): string => {
  if (typeof window === "undefined") {
    return "https://bindle.cash";
  }

  return window.location.origin;
};

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "="
  );
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const hexOrNull = (value: unknown): `0x${string}` | null =>
  typeof value === "string" && /^0x[0-9a-fA-F]+$/.test(value)
    ? (value as `0x${string}`)
    : null;

const authenticatorAttachmentOrNull = (
  value: unknown
): AuthenticatorAttachment | null =>
  value === "platform" || value === "cross-platform" ? value : null;

const userVerificationOrNull = (
  value: unknown
): UserVerificationRequirement | null =>
  value === "required" || value === "preferred" || value === "discouraged"
    ? value
    : null;

const passkeyPolicyForKind = (
  authenticatorKind: PasskeyAuthenticatorKind
): {
  authenticatorAttachment: AuthenticatorAttachment;
  userVerification: UserVerificationRequirement;
} =>
  authenticatorKind === "security-key"
    ? {
        authenticatorAttachment: "cross-platform",
        userVerification: "preferred"
      }
    : {
        authenticatorAttachment: "platform",
        userVerification: "required"
      };

const errorSearchText = (error: unknown): string => {
  if (error instanceof Error) {
    const cause =
      "cause" in error && error.cause !== undefined
        ? ` ${errorSearchText(error.cause)}`
        : "";
    return `${error.name} ${error.message}${cause}`.toLowerCase();
  }

  return String(error).toLowerCase();
};

export const isPasskeyLookupError = (error: unknown): boolean => {
  const text = errorSearchText(error);

  return (
    text.includes("no passkeys available") ||
    text.includes("no credentials available") ||
    text.includes("notallowederror") ||
    text.includes("securityerror")
  );
};

export const passkeyLookupFailureMessage = ({
  currentHostname = getCurrentPasskeyHostname(),
  passkeyRpId
}: {
  currentHostname?: string | null;
  passkeyRpId: string | null;
}): string => {
  const rpId = passkeyRpId ?? getDefaultPasskeyRpId();
  const originMismatch =
    currentHostname !== null && currentHostname.length > 0 && currentHostname !== rpId;

  if (originMismatch) {
    return [
      `Passkey signing failed: no usable passkey was found for RP ID ${rpId}.`,
      `This app is running on ${currentHostname}, so migrated passkeys require ${rpId}/.well-known/webauthn to authorize this origin.`,
      "Re-import the migrated account JSON if Settings shows a different RP ID. If Settings already shows the migrated RP ID, the well-known WebAuthn file must be served as application/json and the passkey must exist on this device."
    ].join(" ");
  }

  return [
    `Passkey signing failed: no usable passkey was found for RP ID ${rpId}.`,
    "Make sure the account export was imported on this device and the platform passkey still exists in this browser or password manager."
  ].join(" ");
};

export const explainPasskeyLookupError = (
  error: unknown,
  context: PasskeyLookupContext
): unknown => {
  if (!isPasskeyLookupError(error)) {
    return error;
  }

  return new Error(passkeyLookupFailureMessage(context), {
    cause: error
  });
};

export const detectPasskeyCapability = async (): Promise<PasskeyCapability> => {
  if (
    typeof window === "undefined" ||
    typeof PublicKeyCredential === "undefined" ||
    !navigator.credentials?.create
  ) {
    return {
      ...unavailableCapability,
      checked: true,
      message: "Passkeys are not available in this browser"
    };
  }

  const platformAuthenticatorAvailable =
    typeof PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable ===
    "function"
      ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      : false;

  return {
    checked: true,
    webAuthnSupported: true,
    platformAuthenticatorAvailable,
    userVerificationAvailable: platformAuthenticatorAvailable,
    available: platformAuthenticatorAvailable,
    message: platformAuthenticatorAvailable
      ? "Passkey platform authenticator available"
      : "No user-verifying platform authenticator detected"
  };
};

export const createBindlePasskeyCredential =
  async (): Promise<BindlePasskeyCredential> => {
    const rpId = getDefaultPasskeyRpId();
    const authenticatorAttachment = "platform";
    const userVerification = "required";
    const credential = await createWebAuthnCredential({
      name: "Bindle",
      rp: {
        id: rpId,
        name: "Bindle"
      },
      authenticatorSelection: {
        authenticatorAttachment,
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification
      },
      attestation: "none",
      timeout: 60_000
    });

    return {
      id: credential.id,
      publicKey: credential.publicKey,
      rpId,
      authenticatorAttachment,
      userVerification
    };
  };

export const encodeBindleOwnerEnrollmentCode = (
  enrollment: BindleOwnerEnrollmentCode
): string =>
  `bindle-owner-v1:${encodeBase64Url(JSON.stringify(enrollment))}`;

export const parseBindleOwnerEnrollmentCode = (
  text: string
): BindleOwnerEnrollmentCode => {
  const trimmed = text.trim();
  const jsonText = trimmed.startsWith("bindle-owner-v1:")
    ? decodeBase64Url(trimmed.slice("bindle-owner-v1:".length))
    : trimmed;
  const parsed = JSON.parse(jsonText) as unknown;

  if (!isRecord(parsed)) {
    throw new Error("Owner enrollment code must decode to a JSON object.");
  }

  if (
    parsed.schema !== "cash.bindle.passkey-owner-enrollment" ||
    parsed.version !== 1
  ) {
    throw new Error("Unsupported Bindle owner enrollment code.");
  }

  if (!isRecord(parsed.credential)) {
    throw new Error("Owner enrollment code is missing credential metadata.");
  }

  const credentialId = stringOrNull(parsed.credential.id);
  const publicKey = hexOrNull(parsed.credential.publicKey);
  const rpId =
    stringOrNull(parsed.credential.rpId) ??
    stringOrNull(parsed.targetRpId) ??
    null;
  const authenticatorAttachment = authenticatorAttachmentOrNull(
    parsed.credential.authenticatorAttachment
  );
  const userVerification = userVerificationOrNull(
    parsed.credential.userVerification
  );

  if (
    !credentialId ||
    !publicKey ||
    !rpId ||
    !authenticatorAttachment ||
    !userVerification
  ) {
    throw new Error("Owner enrollment code has invalid passkey metadata.");
  }

  return {
    schema: "cash.bindle.passkey-owner-enrollment",
    version: 1,
    createdAt:
      typeof parsed.createdAt === "string"
        ? parsed.createdAt
        : new Date().toISOString(),
    targetOrigin:
      typeof parsed.targetOrigin === "string" ? parsed.targetOrigin : "",
    targetRpId: stringOrNull(parsed.targetRpId) ?? rpId,
    smartWalletAddress: stringOrNull(parsed.smartWalletAddress),
    credential: {
      id: credentialId,
      publicKey,
      rpId,
      authenticatorAttachment,
      userVerification
    }
  };
};

export const createBindleOwnerEnrollmentCode = async ({
  authenticatorKind,
  smartWalletAddress
}: {
  authenticatorKind: PasskeyAuthenticatorKind;
  smartWalletAddress: string | null;
}): Promise<{
  code: string;
  enrollment: BindleOwnerEnrollmentCode;
}> => {
  const rpId = getCurrentPasskeyHostname();

  if (!rpId) {
    throw new Error("Owner enrollment requires a browser hostname.");
  }

  const { authenticatorAttachment, userVerification } =
    passkeyPolicyForKind(authenticatorKind);
  const credential = await createWebAuthnCredential({
    name:
      authenticatorKind === "security-key"
        ? "Bindle YubiKey owner"
        : "Bindle owner",
    rp: {
      id: rpId,
      name: "Bindle"
    },
    authenticatorSelection: {
      authenticatorAttachment,
      residentKey: "preferred",
      requireResidentKey: false,
      userVerification
    },
    attestation: "none",
    timeout: 60_000
  });
  const enrollment: BindleOwnerEnrollmentCode = {
    schema: "cash.bindle.passkey-owner-enrollment",
    version: 1,
    createdAt: new Date().toISOString(),
    targetOrigin: currentOrigin(),
    targetRpId: rpId,
    smartWalletAddress,
    credential: {
      id: credential.id,
      publicKey: credential.publicKey,
      rpId,
      authenticatorAttachment,
      userVerification
    }
  };

  return {
    code: encodeBindleOwnerEnrollmentCode(enrollment),
    enrollment
  };
};

export const createPasskeyRequestFn = (
  authenticatorAttachment: AuthenticatorAttachment | null | undefined,
  userVerification: UserVerificationRequirement | null | undefined
) => {
  const transports =
    authenticatorAttachment === "cross-platform"
      ? (["usb", "nfc", "ble"] satisfies AuthenticatorTransport[])
      : authenticatorAttachment === "platform"
        ? (["internal"] satisfies AuthenticatorTransport[])
        : null;

  if (
    (!userVerification || userVerification === "required") &&
    transports === null
  ) {
    return undefined;
  }

  return async (options?: unknown): Promise<Credential | null> => {
    const credentialOptions = options as CredentialRequestOptions | undefined;

    if (credentialOptions?.publicKey) {
      if (userVerification) {
        credentialOptions.publicKey.userVerification = userVerification;
      }

      if (transports && credentialOptions.publicKey.allowCredentials) {
        credentialOptions.publicKey.allowCredentials =
          credentialOptions.publicKey.allowCredentials.map((credential) => ({
            ...credential,
            transports
          }));
      }
    }

    return navigator.credentials.get(credentialOptions);
  };
};

export const hasFundingCredential = (credential: {
  passkeyCredentialId: string | null;
  passkeyPublicKey: `0x${string}` | null;
}): credential is {
  passkeyCredentialId: string;
  passkeyPublicKey: `0x${string}`;
} =>
  credential.passkeyCredentialId !== null &&
  credential.passkeyPublicKey !== null;
