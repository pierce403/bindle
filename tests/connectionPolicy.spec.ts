import { expect, test } from "@playwright/test";
import {
  applyEndpointPreset,
  defaultConnectionPolicy,
  endpointPresets,
  summarizeOutbound
} from "../src/privacy/connectionPolicy";
import { buildEndpointDisclosure } from "../src/privacy/preflightDisclosure";

const expectedOutboundIds = [
  "ethereum-rpc",
  "helios-consensus-rpc",
  "helios-checkpoint",
  "railgun-sync",
  "railgun-poi",
  "railgun-broadcaster",
  "provider-resolution",
  "price-quotes",
  "waku",
  "erc4337-bundler",
  "erc4337-paymaster",
  "passkey-attestation",
  "wallet-recovery"
];

test("default user mode has a visible sane preset selected", () => {
  expect(defaultConnectionPolicy.endpointPreset).toBe("bindle-default");
  expect(defaultConnectionPolicy.providerMode).toBe("direct-rpc");
  expect(defaultConnectionPolicy.ethereumRpcUrl).toMatch(/^https:\/\//);
  expect(defaultConnectionPolicy.bundlerUrl).toMatch(/^https:\/\//);
  expect(defaultConnectionPolicy.railgunSyncUrl).toMatch(/^https:\/\//);
  expect(defaultConnectionPolicy.paymasterUrl).toBe("");
  expect(defaultConnectionPolicy.autoStartToolkit).toBe(true);
});

test("privacy max preset clears hosted endpoints", () => {
  const policy = applyEndpointPreset(defaultConnectionPolicy, "privacy-max");

  expect(policy.ethereumRpcUrl).toBe("");
  expect(policy.heliosConsensusRpcUrl).toBe("");
  expect(policy.heliosCheckpoint).toBe("");
  expect(policy.railgunSyncUrl).toBe("");
  expect(policy.poiAggregatorUrls).toEqual([]);
  expect(policy.broadcasterUrl).toBe("");
  expect(policy.providerResolverUrl).toBe("");
  expect(policy.priceQuoteUrl).toBe("");
  expect(policy.bundlerUrl).toBe("");
  expect(policy.paymasterUrl).toBe("");
  expect(policy.autoStartToolkit).toBe(false);
  expect(policy.wakuEnabled).toBe(false);
});

test("switching to custom preserves user-entered endpoint values", () => {
  const custom = applyEndpointPreset(
    {
      ...defaultConnectionPolicy,
      ethereumRpcUrl: "http://127.0.0.1:8545",
      bundlerUrl: "http://127.0.0.1:4337"
    },
    "custom"
  );

  expect(custom.endpointPreset).toBe("custom");
  expect(custom.ethereumRpcUrl).toBe("http://127.0.0.1:8545");
  expect(custom.bundlerUrl).toBe("http://127.0.0.1:4337");
  expect(custom.autoStartToolkit).toBe(true);
});

test("outbound summary exposes every endpoint class", () => {
  const controls = summarizeOutbound(defaultConnectionPolicy);

  expect(controls.map((control) => control.id).sort()).toEqual(
    expectedOutboundIds.slice().sort()
  );
  expect(controls).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "ethereum-rpc",
        source: "default",
        value: endpointPresets["bindle-default"].policy.ethereumRpcUrl
      }),
      expect.objectContaining({
        id: "erc4337-bundler",
        source: "default",
        value: endpointPresets["bindle-default"].policy.bundlerUrl
      }),
      expect.objectContaining({
        id: "railgun-sync",
        source: "default",
        value: endpointPresets["bindle-default"].policy.railgunSyncUrl
      }),
      expect.objectContaining({
        id: "erc4337-paymaster",
        source: "off",
        value: "not connected"
      })
    ])
  );
});

test("public smart payment preflight includes required endpoints and sources", () => {
  const disclosure = buildEndpointDisclosure(
    defaultConnectionPolicy,
    "public-smart-payment"
  );

  expect(disclosure).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "ethereum-rpc",
        configured: true,
        required: true,
        source: "default"
      }),
      expect.objectContaining({
        id: "erc4337-bundler",
        configured: true,
        required: true,
        source: "default"
      }),
      expect.objectContaining({
        id: "erc4337-paymaster",
        configured: false,
        required: false,
        source: "off"
      })
    ])
  );
});

test("start toolkit preflight includes direct and Helios endpoint classes", () => {
  const disclosure = buildEndpointDisclosure(defaultConnectionPolicy, "start-toolkit");

  expect(disclosure).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "ethereum-rpc", required: true }),
      expect.objectContaining({ id: "helios-consensus-rpc", required: false }),
      expect.objectContaining({ id: "helios-checkpoint", required: false }),
      expect.objectContaining({ id: "railgun-sync", required: false }),
      expect.objectContaining({ id: "railgun-poi", required: false }),
      expect.objectContaining({ id: "waku", required: false })
    ])
  );
});

test("public balance sync preflight discloses the selected RPC", () => {
  const disclosure = buildEndpointDisclosure(
    defaultConnectionPolicy,
    "public-balance-sync"
  );

  expect(disclosure).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "ethereum-rpc",
        configured: true,
        required: true,
        source: "default",
        value: endpointPresets["bindle-default"].policy.ethereumRpcUrl
      }),
      expect.objectContaining({
        id: "helios-consensus-rpc",
        required: false
      }),
      expect.objectContaining({
        id: "helios-checkpoint",
        required: false
      })
    ])
  );
});

test("shielded balance sync preflight discloses the selected RPC", () => {
  const disclosure = buildEndpointDisclosure(
    defaultConnectionPolicy,
    "shielded-balance-sync"
  );

  expect(disclosure).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "ethereum-rpc",
        configured: true,
        required: true,
        source: "default",
        value: endpointPresets["bindle-default"].policy.ethereumRpcUrl
      }),
      expect.objectContaining({
        id: "railgun-poi",
        required: false
      }),
      expect.objectContaining({
        id: "railgun-sync",
        configured: true,
        required: false,
        source: "default",
        value: endpointPresets["bindle-default"].policy.railgunSyncUrl
      })
    ])
  );
});

test("unshield review preflight requires a visible broadcaster", () => {
  const disclosure = buildEndpointDisclosure(
    defaultConnectionPolicy,
    "unshield-review"
  );

  expect(disclosure).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        id: "ethereum-rpc",
        configured: true,
        required: true
      }),
      expect.objectContaining({
        id: "railgun-broadcaster",
        configured: false,
        required: true,
        source: "off"
      }),
      expect.objectContaining({
        id: "railgun-poi",
        required: false
      }),
      expect.objectContaining({
        id: "railgun-sync",
        configured: true,
        required: false,
        source: "default"
      })
    ])
  );
});
