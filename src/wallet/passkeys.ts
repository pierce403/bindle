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
    const credential = await createWebAuthnCredential({
      name: "Bindle",
      rp: {
        id: rpId,
        name: "Bindle"
      },
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "required"
      },
      attestation: "none",
      timeout: 60_000
    });

    return {
      id: credential.id,
      publicKey: credential.publicKey,
      rpId
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
