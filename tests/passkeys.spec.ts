import { expect, test } from "@playwright/test";
import {
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
