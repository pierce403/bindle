export type PasskeyCapability = {
  checked: boolean;
  webAuthnSupported: boolean;
  platformAuthenticatorAvailable: boolean;
  userVerificationAvailable: boolean;
  available: boolean;
  message: string;
};

const unavailableCapability: PasskeyCapability = {
  checked: false,
  webAuthnSupported: false,
  platformAuthenticatorAvailable: false,
  userVerificationAvailable: false,
  available: false,
  message: "Checking passkey support"
};

const base64UrlEncode = (bytes: ArrayBuffer): string => {
  const binary = String.fromCharCode(...new Uint8Array(bytes));

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const randomBuffer = (length: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(length);
  const value = new Uint8Array(buffer);
  crypto.getRandomValues(value);
  return buffer;
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

export const createBindlePasskeyCredential = async (): Promise<string> => {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBuffer(32),
      rp: {
        name: "Bindle"
      },
      user: {
        id: randomBuffer(16),
        name: "bindle",
        displayName: "Bindle"
      },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "preferred",
        requireResidentKey: false,
        userVerification: "required"
      },
      attestation: "none",
      timeout: 60_000
    }
  });

  if (!(credential instanceof PublicKeyCredential)) {
    throw new Error("Passkey enrollment did not return a public-key credential");
  }

  return credential.id || base64UrlEncode(credential.rawId);
};
