import type { ChainConfig, Eip1193Provider } from "@kohaku-eth/railgun";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

type UtxoSyncerInstance = import("@kohaku-eth/railgun").UtxoSyncer;
type UtxoSyncerClass = typeof import("@kohaku-eth/railgun").UtxoSyncer;

type KohakuUtxoSyncerModule = {
  UtxoSyncer: UtxoSyncerClass;
};

const normalizeEndpoint = (value: string): string =>
  value.trim().replace(/\/+$/, "");

const checkSyncIndexerHealthy = async (url: string): Promise<boolean> => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: controller.signal
    });
    clearTimeout(id);
    return response.ok;
  } catch (error) {
    clearTimeout(id);
    return false;
  }
};

export const createVisibleRailgunUtxoSyncer = async ({
  chain,
  kohaku,
  policy,
  provider,
  onStatus
}: {
  chain: ChainConfig;
  kohaku: KohakuUtxoSyncerModule;
  policy: ConnectionPolicy;
  provider: Eip1193Provider;
  onStatus?: (message: string) => void;
}): Promise<UtxoSyncerInstance> => {
  const rpcSyncer = kohaku.UtxoSyncer.rpc(chain, provider, 500n);
  const configuredSyncUrl = policy.railgunSyncUrl.trim();

  if (!configuredSyncUrl) {
    onStatus?.("Using RPC-only RAILGUN note sync (batch size: 500)");
    return rpcSyncer;
  }

  const chainSyncUrl = chain.subsquidEndpoint;

  if (normalizeEndpoint(configuredSyncUrl) !== normalizeEndpoint(chainSyncUrl)) {
    rpcSyncer.free();
    throw new Error(
      `Custom RAILGUN sync indexer is configured, but this Kohaku adapter can only route the chain default Subsquid endpoint in this build. Set RAILGUN sync indexer to ${chainSyncUrl} or clear it to use RPC-only sync.`
    );
  }

  onStatus?.("Checking RAILGUN Subsquid sync indexer health...");
  const isHealthy = await checkSyncIndexerHealthy(configuredSyncUrl);

  if (!isHealthy) {
    onStatus?.("RAILGUN Subsquid indexer is unresponsive. Falling back to RPC-only note sync (batch size: 500)");
    return rpcSyncer;
  }

  onStatus?.("Using visible RAILGUN Subsquid sync indexer with RPC fallback (batch size: 500)");
  return kohaku.UtxoSyncer.chained([
    kohaku.UtxoSyncer.subsquid(chain),
    rpcSyncer
  ]);
};
