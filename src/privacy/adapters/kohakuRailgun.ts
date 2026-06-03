import type { ConnectionPolicy } from "../connectionPolicy";
import type { PrivacyToolkitHandle } from "../toolkit";
import { createKohakuIndexedDbDatabase } from "../storage/kohakuDatabase";
import { createExplicitRpcProvider } from "./rpcProvider";

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuRailgunWasmModule = Pick<
  KohakuRailgunTypes,
  "RailgunBuilder" | "UtxoSyncer" | "chainConfig" | "initLogging"
> & {
  default: () => Promise<unknown>;
};

const loadKohakuRailgunWasm = (): Promise<KohakuRailgunWasmModule> =>
  import(
    "../../../node_modules/@kohaku-eth/railgun/dist/pkg/index.js"
  ) as Promise<KohakuRailgunWasmModule>;

export const startKohakuRailgunAdapter = async (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<PrivacyToolkitHandle> => {
  const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

  if (!ethereumRpcUrl) {
    throw new Error("Configure an Ethereum RPC endpoint before starting Kohaku.");
  }

  onStatus("Loading Kohaku RAILGUN modules");
  const kohaku = await loadKohakuRailgunWasm();

  onStatus("Initializing Kohaku RAILGUN WASM");
  await kohaku.default();
  kohaku.initLogging(policy.debugLogging ? "Debug" : "Warn");

  onStatus("Connecting configured Ethereum RPC");
  const provider = createExplicitRpcProvider(ethereumRpcUrl);
  const chainId = await provider.getChainId();
  const chain = kohaku.chainConfig(chainId);

  if (!chain) {
    throw new Error(`Kohaku RAILGUN does not support chain ID ${chainId}.`);
  }

  if (policy.poiAggregatorUrls.length > 0) {
    onStatus("Kohaku custom POI endpoints are not wired; starting RPC-only");
  } else {
    onStatus(`Provider connected to chain ${chain.id}`);
  }

  const database = createKohakuIndexedDbDatabase(`railgun:${chain.id}`);
  const syncer = kohaku.UtxoSyncer.rpc(chain, provider, 10n);

  onStatus("Starting Kohaku RAILGUN provider with RPC-only sync");
  const railgunProvider = await new kohaku.RailgunBuilder(chain, provider)
    .withDatabase(database)
    .withUtxoSyncer(syncer)
    .build();

  onStatus("Kohaku RAILGUN provider ready");

  return {
    id: "kohaku-railgun",
    label: "Kohaku RAILGUN",
    state: "ready",
    chainId: chain.id,
    stop: async () => {
      railgunProvider.free();
      syncer.free();
    }
  };
};
