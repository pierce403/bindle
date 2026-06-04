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
