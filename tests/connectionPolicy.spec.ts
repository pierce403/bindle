import { expect, test } from "@playwright/test";
import {
  defaultConnectionPolicy,
  summarizeOutbound
} from "../src/privacy/connectionPolicy";

const hostedUrlPattern = /^https?:\/\//i;

test("default connection policy has no hosted endpoints", () => {
  expect(defaultConnectionPolicy.ethereumRpcUrl).toBe("");
  expect(defaultConnectionPolicy.poiAggregatorUrls).toEqual([]);
  expect(defaultConnectionPolicy.broadcasterUrl).toBe("");
  expect(defaultConnectionPolicy.providerResolverUrl).toBe("");
  expect(defaultConnectionPolicy.priceQuoteUrl).toBe("");
  expect(defaultConnectionPolicy.bundlerUrl).toBe("");
  expect(defaultConnectionPolicy.paymasterUrl).toBe("");
  expect(defaultConnectionPolicy.passkeyAttestationUrl).toBe("");
  expect(defaultConnectionPolicy.recoveryServiceUrl).toBe("");
  expect(defaultConnectionPolicy.wakuEnabled).toBe(false);

  expect(JSON.stringify(defaultConnectionPolicy)).not.toMatch(hostedUrlPattern);
});

test("outbound summary includes ERC-4337 and passkey service classes", () => {
  const controls = summarizeOutbound(defaultConnectionPolicy);

  expect(controls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "erc4337-bundler",
        mode: "off",
        value: "not connected"
      }),
      expect.objectContaining({
        id: "erc4337-paymaster",
        mode: "off",
        value: "not connected"
      }),
      expect.objectContaining({
        id: "passkey-attestation",
        mode: "off",
        value: "none"
      }),
      expect.objectContaining({
        id: "wallet-recovery",
        mode: "off",
        value: "none"
      })
    ])
  );
});
