import type { ChainConfig, Eip1193Provider } from "@kohaku-eth/railgun";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

type UtxoSyncerInstance = import("@kohaku-eth/railgun").UtxoSyncer;
type UtxoSyncerClass = typeof import("@kohaku-eth/railgun").UtxoSyncer;

type KohakuUtxoSyncerModule = {
  UtxoSyncer: UtxoSyncerClass;
};

const normalizeEndpoint = (value: string): string =>
  value.trim().replace(/\/+$/, "");

export const createVisibleRailgunUtxoSyncer = ({
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
}): UtxoSyncerInstance => {
  const rpcSyncer = kohaku.UtxoSyncer.rpc(chain, provider, 10n);
  const configuredSyncUrl = policy.railgunSyncUrl.trim();

  if (!configuredSyncUrl) {
    onStatus?.("Using RPC-only RAILGUN note sync");
    return rpcSyncer;
  }

  const chainSyncUrl = chain.subsquidEndpoint;

  if (normalizeEndpoint(configuredSyncUrl) !== normalizeEndpoint(chainSyncUrl)) {
    rpcSyncer.free();
    throw new Error(
      `Custom RAILGUN sync indexer is configured, but this Kohaku adapter can only route the chain default Subsquid endpoint in this build. Set RAILGUN sync indexer to ${chainSyncUrl} or clear it to use RPC-only sync.`
    );
  }

  onStatus?.("Using visible RAILGUN Subsquid sync indexer with RPC fallback");
  return kohaku.UtxoSyncer.chained([
    kohaku.UtxoSyncer.subsquid(chain),
    rpcSyncer
  ]);
};
