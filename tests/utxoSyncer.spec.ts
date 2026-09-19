import { expect, test } from "@playwright/test";
import type { ChainConfig, Eip1193Provider, UtxoSyncer } from "@kohaku-eth/railgun";
import { createVisibleRailgunUtxoSyncer } from "../src/railgun/utxoSyncer";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";

for (const mode of ["custom", "empty", "unavailable", "invalid"] as const) {
  test(`UTXO sync respects ${mode} indexer policy without a hidden fallback`, async () => {
    const originalFetch = globalThis.fetch;
    const requests: string[] = [];
    const indexers: string[] = [];
    let freed = 0;
    const rpc = { free: () => { freed++; } } as UtxoSyncer;
    const indexer = {} as UtxoSyncer;
    const combined = {} as UtxoSyncer;
    const chain = { subsquidEndpoint: "https://hidden.example/graphql" } as ChainConfig;
    globalThis.fetch = async (input) => {
      requests.push(String(input));
      return new Response("", { status: mode === "unavailable" ? 503 : 200 });
    };
    const url = mode === "empty" ? "" : mode === "invalid" ? "file:///secret" : "https://configured.example/graphql";
    const promise = createVisibleRailgunUtxoSyncer({
      chain, policy: { ...defaultConnectionPolicy, railgunSyncUrl: url },
      provider: {} as Eip1193Provider,
      kohaku: { UtxoSyncer: {
        rpc: (_chain, _provider, batchSize) => { expect(batchSize).toBe(500n); return rpc; },
        subsquid: (config) => { indexers.push(config.subsquidEndpoint); return indexer; },
        chained: (syncers) => { expect(syncers).toEqual([indexer, rpc]); return combined; }
      } }
    });
    try {
      if (mode === "invalid") {
        await expect(promise).rejects.toThrow(/explicit HTTP/);
        expect(freed).toBe(1);
      } else {
        expect(await promise).toBe(mode === "custom" ? combined : rpc);
      }
      expect(requests).toEqual(["empty", "invalid"].includes(mode) ? [] : [url]);
      expect(indexers).toEqual(mode === "custom" ? [url] : []);
      expect(chain.subsquidEndpoint).toBe("https://hidden.example/graphql");
    } finally { globalThis.fetch = originalFetch; }
  });
}
