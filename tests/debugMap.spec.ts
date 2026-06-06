import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { endpointPresets } from "../src/privacy/connectionPolicy";
import {
  formatDebugMapSnapshot,
  scanPublicEndpointMap,
  scanWakuBroadcasterMap,
  type DebugMapSnapshot
} from "../src/debug/relayMap";
import { enableStandalonePwa } from "./support/pwa";

test("Relays tab shows map controls without scanning automatically", async ({
  page
}) => {
  await enableStandalonePwa(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Relays" }).click();

  await expect(page.getByRole("heading", { name: "Relays" })).toBeVisible();
  await expect(page.getByText("Waku RAILGUN relays")).toBeVisible();
  await expect(
    page.getByText("Checks configured RPC, ERC-4337 bundler")
  ).toBeVisible();
  await expect(page.getByText("Map status: idle")).toBeVisible();
  await expect(page.getByText("Public edge map")).toBeVisible();
  await expect(page.getByLabel("Relay filters")).not.toBeVisible();
});

test("Relays map stays idle until a scan button is clicked", async ({ page }) => {
  await enableStandalonePwa(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Relays" }).click();

  await expect(page.getByText("Map status: idle")).toBeVisible();
  await expect(
    page.getByText("Idle. Use Scan Waku relays to start broadcaster discovery.")
  ).toBeVisible();
});

test("Privacy Max preset keeps Waku discovery off unless user scans", () => {
  const privacyMax = endpointPresets["privacy-max"].policy;

  expect(privacyMax.wakuEnabled).toBe(false);
  expect(privacyMax.railgunBroadcasterEnabled).toBe(false);
  expect(privacyMax.railgunBroadcasterDirectPeers).toEqual([]);
});

test("Waku map reports unavailable without fake broadcasters when policy cannot start Waku", async () => {
  const snapshot = await scanWakuBroadcasterMap({
    ...defaultConnectionPolicy,
    railgunBroadcasterDirectPeers: []
  });

  expect(snapshot.transport).toBe("unavailable");
  expect(snapshot.discoveredBroadcasters).toEqual([]);
  expect(snapshot.feeTokens).toEqual([]);
  expect(snapshot.error).toMatch(/direct peer/i);
});

test("public endpoint map probes public edges without treating bundlers as relays", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string }> = [];

  globalThis.fetch = (async (url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { method?: string };
    requests.push({ url: String(url), method: body.method ?? "graphql" });

    if (body.method === "eth_chainId") {
      return new Response(JSON.stringify({ result: "0x1" }));
    }

    if (body.method === "eth_blockNumber") {
      return new Response(JSON.stringify({ result: "0x10" }));
    }

    if (body.method === "eth_supportedEntryPoints") {
      return new Response(
        JSON.stringify({ result: ["0x0000000071727de22e5e9d8baf0edac6f37da032"] })
      );
    }

    if (body.method === "pimlico_getUserOperationGasPrice") {
      return new Response(JSON.stringify({ result: { standard: {} } }));
    }

    return new Response(JSON.stringify({ data: { __typename: "Query" } }));
  }) as typeof fetch;

  try {
    const snapshot = await scanPublicEndpointMap(defaultConnectionPolicy);

    expect(snapshot.ethereumRpc.chainId).toBe(1);
    expect(snapshot.ethereumRpc.blockNumber).toBe("16");
    expect(snapshot.bundler.supportedEntryPoints).toHaveLength(1);
    expect(snapshot.paymaster.configured).toBe(false);
    expect(snapshot.railgunSyncIndexer.configured).toBe(true);
    expect(requests.map((request) => request.method)).toEqual(
      expect.arrayContaining([
        "eth_chainId",
        "eth_blockNumber",
        "eth_supportedEntryPoints",
        "pimlico_getUserOperationGasPrice"
      ])
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Waku map code does not call smart wallet or Pimlico submit paths", () => {
  const source = readFileSync(resolve("src/debug/relayMap.ts"), "utf8");
  const wakuStart = source.indexOf("scanWakuBroadcasterMap");
  const publicStart = source.indexOf("scanPublicEndpointMap");
  const wakuSource = source.slice(wakuStart, publicStart);

  expect(wakuSource).not.toContain("sendSmartWalletCalls");
  expect(wakuSource).not.toContain("smartAccountAdapter");
  expect(wakuSource).not.toContain("pimlico_getUserOperationGasPrice");
  expect(wakuSource).not.toContain("@railgun-community/wallet");
});

test("copyable debug map includes status and errors without key-material labels", () => {
  const snapshot: DebugMapSnapshot = {
    createdAt: "2026-06-06T00:00:00.000Z",
    endpointPreset: "privacy-max",
    providerMode: "direct-rpc",
    wakuBroadcaster: {
      createdAt: "2026-06-06T00:00:00.000Z",
      chainId: 1,
      network: "ethereum-mainnet",
      status: "error",
      elapsedMs: 1,
      transport: "unavailable",
      pubsubTopic: null,
      wakuPeerCount: null,
      requiredProtocols: {
        filter: "error",
        lightPush: "error",
        store: "error"
      },
      rawFeeMessagesObserved: 0,
      rawFeeAdsParsed: 0,
      kohakuManagerSelections: 0,
      feeTokens: [],
      discoveredBroadcasters: [],
      notes: ["debug copy test"],
      error: "mnemonic private key spending key viewing key unavailable"
    },
    publicEndpoints: null
  };
  const text = formatDebugMapSnapshot(snapshot);

  expect(text).toContain('"status": "error"');
  expect(text).toContain("unavailable");
  expect(text).not.toMatch(/mnemonic|private key|spending key|viewing key/i);
});
