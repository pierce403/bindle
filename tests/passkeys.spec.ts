import { expect, test } from "@playwright/test";
import {
  createPasskeyRequestFn,
  explainPasskeyLookupError,
  isPasskeyLookupError,
  passkeyLookupFailureMessage
} from "../src/wallet/passkeys";

test("identifies missing passkey lookup errors from WebAuthn providers", () => {
  expect(isPasskeyLookupError(new Error("No passkeys available"))).toBe(true);
  expect(isPasskeyLookupError(new DOMException("NotAllowedError"))).toBe(true);
  expect(isPasskeyLookupError(new Error("RPC request failed"))).toBe(false);
});

test("explains migrated bindle.me passkey lookup from bindle.cash", () => {
  const message = passkeyLookupFailureMessage({
    currentHostname: "bindle.cash",
    passkeyRpId: "bindle.me"
  });

  expect(message).toContain("RP ID bindle.me");
  expect(message).toContain("running on bindle.cash");
  expect(message).toContain(".well-known/webauthn");
  expect(message).toContain("application/json");
});

test("wraps passkey lookup errors and leaves unrelated errors untouched", () => {
  const passkeyError = new Error("no credentials available");
  const wrapped = explainPasskeyLookupError(passkeyError, {
    passkeyRpId: "bindle.me"
  });
  const unrelated = new Error("bundler rejected user operation");

  expect(wrapped).toBeInstanceOf(Error);
  expect((wrapped as Error).message).toContain("Passkey signing failed");
  expect(explainPasskeyLookupError(unrelated, { passkeyRpId: "bindle.me" })).toBe(
    unrelated
  );
});

test("requests roaming authenticator transports for YubiKey signing preference", async () => {
  const originalNavigator = globalThis.navigator;
  let requestedOptions: CredentialRequestOptions | undefined;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        get: async (options?: CredentialRequestOptions) => {
          requestedOptions = options;
          return null;
        }
      }
    }
  });

  try {
    const requestCredential = createPasskeyRequestFn(
      "cross-platform",
      "preferred"
    );
    expect(requestCredential).toBeDefined();

    await requestCredential?.({
      publicKey: {
        challenge: new Uint8Array([1]).buffer,
        allowCredentials: [
          {
            id: new Uint8Array([2]).buffer,
            type: "public-key"
          }
        ],
        userVerification: "required"
      }
    });

    expect(requestedOptions?.publicKey?.userVerification).toBe("preferred");
    expect(
      requestedOptions?.publicKey?.allowCredentials?.[0]?.transports
    ).toEqual(["usb", "nfc", "ble"]);
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("does not force internal transports for phone or computer passkeys", async () => {
  const originalNavigator = globalThis.navigator;
  let requestedOptions: CredentialRequestOptions | undefined;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        get: async (options?: CredentialRequestOptions) => {
          requestedOptions = options;
          return null;
        }
      }
    }
  });

  try {
    const requestCredential = createPasskeyRequestFn("platform", "required");
    expect(requestCredential).toBeDefined();

    await requestCredential?.({
      publicKey: {
        challenge: new Uint8Array([1]).buffer,
        allowCredentials: [
          {
            id: new Uint8Array([2]).buffer,
            type: "public-key"
          }
        ],
        userVerification: "preferred"
      }
    });

    expect(requestedOptions?.publicKey?.userVerification).toBe("required");
    expect(
      requestedOptions?.publicKey?.allowCredentials?.[0]?.transports
    ).toBeUndefined();
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("retries passkey lookup without transport hints when no credential is found", async () => {
  const originalNavigator = globalThis.navigator;
  const requestedOptions: CredentialRequestOptions[] = [];

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        get: async (options?: CredentialRequestOptions) => {
          if (options) {
            requestedOptions.push(options);
          }

          if (requestedOptions.length === 1) {
            throw new Error("No passkeys available");
          }

          return null;
        }
      }
    }
  });

  try {
    const requestCredential = createPasskeyRequestFn(
      "cross-platform",
      "preferred"
    );

    await requestCredential?.({
      publicKey: {
        challenge: new Uint8Array([1]).buffer,
        allowCredentials: [
          {
            id: new Uint8Array([2]).buffer,
            type: "public-key"
          }
        ],
        userVerification: "required"
      }
    });

    expect(requestedOptions).toHaveLength(2);
    expect(
      requestedOptions[0]?.publicKey?.allowCredentials?.[0]?.transports
    ).toEqual(["usb", "nfc", "ble"]);
    expect(
      requestedOptions[1]?.publicKey?.allowCredentials?.[0]?.transports
    ).toBeUndefined();
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("retries passkey lookup with discoverable credentials after stale credential id misses", async () => {
  const originalNavigator = globalThis.navigator;
  const requestedOptions: CredentialRequestOptions[] = [];

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        get: async (options?: CredentialRequestOptions) => {
          if (options) {
            requestedOptions.push(options);
          }

          if (requestedOptions.length < 3) {
            throw new Error("No passkeys available");
          }

          return null;
        }
      }
    }
  });

  try {
    const requestCredential = createPasskeyRequestFn("platform", "required");

    await requestCredential?.({
      publicKey: {
        challenge: new Uint8Array([1]).buffer,
        allowCredentials: [
          {
            id: new Uint8Array([2]).buffer,
            type: "public-key"
          }
        ],
        userVerification: "preferred"
      }
    });

    expect(requestedOptions).toHaveLength(3);
    expect(requestedOptions[0]?.publicKey?.allowCredentials).toHaveLength(1);
    expect(requestedOptions[1]?.publicKey?.allowCredentials).toHaveLength(1);
    expect(requestedOptions[2]?.publicKey?.allowCredentials).toBeUndefined();
    expect(requestedOptions[2]?.publicKey?.userVerification).toBe("required");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});

test("rejects discoverable passkey fallback when it selects a different credential", async () => {
  const originalNavigator = globalThis.navigator;

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      credentials: {
        get: async (options?: CredentialRequestOptions) => {
          if (options?.publicKey?.allowCredentials) {
            throw new Error("No passkeys available");
          }

          return {
            id: "different-credential",
            type: "public-key"
          } as Credential;
        }
      }
    }
  });

  try {
    const requestCredential = createPasskeyRequestFn("platform", "required");

    await expect(
      requestCredential?.({
        publicKey: {
          challenge: new Uint8Array([1]).buffer,
          allowCredentials: [
            {
              id: new Uint8Array([2]).buffer,
              type: "public-key"
            }
          ],
          userVerification: "preferred"
        }
      })
    ).rejects.toThrow("No passkeys available for the saved credential id");
  } finally {
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: originalNavigator
    });
  }
});
