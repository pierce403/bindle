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
};

const unavailableCapability: PasskeyCapability = {
  checked: false,
  webAuthnSupported: false,
  platformAuthenticatorAvailable: false,
  userVerificationAvailable: false,
  available: false,
  message: "Checking passkey support"
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
    const credential = await createWebAuthnCredential({
      name: "Bindle",
      rp: {
        id: window.location.hostname,
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
      publicKey: credential.publicKey
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
