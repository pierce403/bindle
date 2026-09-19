import type { ChainConfig, Eip1193Provider } from "@kohaku-eth/railgun";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

type UtxoSyncerInstance = import("@kohaku-eth/railgun").UtxoSyncer;
type UtxoSyncerClass = typeof import("@kohaku-eth/railgun").UtxoSyncer;

type KohakuUtxoSyncerModule = {
  UtxoSyncer: Pick<UtxoSyncerClass, "rpc" | "subsquid" | "chained">;
};

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

  let endpoint: URL;
  try {
    endpoint = new URL(configuredSyncUrl);
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password) {
      throw new Error("Unsupported indexer URL");
    }
  } catch {
    rpcSyncer.free();
    throw new Error("RAILGUN sync indexer must be an explicit HTTP(S) URL without embedded credentials.");
  }

  onStatus?.("Checking RAILGUN Subsquid sync indexer health...");
  const isHealthy = await checkSyncIndexerHealthy(configuredSyncUrl);

  if (!isHealthy) {
    onStatus?.("RAILGUN Subsquid indexer is unresponsive. Falling back to RPC-only note sync (batch size: 500)");
    return rpcSyncer;
  }

  onStatus?.("Using visible RAILGUN Subsquid sync indexer with RPC fallback (batch size: 500)");
  return kohaku.UtxoSyncer.chained([
    // alpha.30 accepts a plain ChainConfig; override the compiled default with
    // the exact visible policy endpoint, including user-selected mirrors.
    kohaku.UtxoSyncer.subsquid({ ...chain, subsquidEndpoint: configuredSyncUrl }),
    rpcSyncer
  ]);
};
