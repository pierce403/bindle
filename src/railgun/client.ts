import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createBrowserArtifactStore } from "./browserArtifactStore";

export type RailgunEngineState =
  | "idle"
  | "starting"
  | "ready"
  | "error"
  | "stopped";

export type RailgunEngineHandle = {
  state: RailgunEngineState;
  stop: () => Promise<void>;
};

type WalletModule = {
  ArtifactStore: new (
    getFile: (path: string) => Promise<string | Uint8Array>,
    storeFile: (
      dir: string,
      path: string,
      item: string | Uint8Array
    ) => Promise<void>,
    fileExists: (path: string) => Promise<boolean>
  ) => unknown;
  getProver: () => {
    setSnarkJSGroth16: (groth16: unknown) => void;
  };
  loadProvider: (
    config: unknown,
    networkName: unknown,
    pollingInterval: number
  ) => Promise<unknown>;
  startRailgunEngine: (...args: unknown[]) => Promise<void>;
  stopRailgunEngine: () => Promise<void>;
};

type SharedModelsModule = {
  NETWORK_CONFIG: Record<string, { chain: { id: number } }>;
  NetworkName?: Record<string, unknown>;
};

type RailgunFallbackProviderJsonConfig = {
  chainId: number;
  providers: Array<{
    provider: string;
    priority: number;
    weight: number;
    stallTimeout: number;
    maxLogsPerBatch: number;
  }>;
};

type LevelJsModule = {
  default: new (databaseName: string) => unknown;
};

type SnarkJsModule = {
  groth16: unknown;
};

const walletSource = "bindle";
let activeEngineHandle: RailgunEngineHandle | null = null;
let activeEnginePolicyKey: string | null = null;
let engineStartPromise: Promise<RailgunEngineHandle> | null = null;
let engineStartPolicyKey: string | null = null;

const enginePolicyKey = (policy: ConnectionPolicy): string =>
  JSON.stringify({
    debugLogging: policy.debugLogging,
    ethereumRpcUrl: policy.ethereumRpcUrl.trim(),
    poiAggregatorUrls: policy.poiAggregatorUrls,
    providerMode: policy.providerMode
  });

const getEthereumNetworkName = (sharedModels: SharedModelsModule): unknown => {
  if (sharedModels.NetworkName?.Ethereum) {
    return sharedModels.NetworkName.Ethereum;
  }

  if (sharedModels.NetworkName?.EthereumGoerli_DEPRECATED) {
    return sharedModels.NetworkName.EthereumGoerli_DEPRECATED;
  }

  return "Ethereum";
};

export const createRailgunFallbackProviderConfig = ({
  chainId,
  ethereumRpcUrl
}: {
  chainId: number;
  ethereumRpcUrl: string;
}): RailgunFallbackProviderJsonConfig => ({
  chainId,
  providers: [
    {
      provider: ethereumRpcUrl,
      priority: 3,
      // @railgun-community/shared-models rejects configs whose total provider
      // weight is below 2. Bindle intentionally keeps this as one visible RPC
      // endpoint instead of adding a hidden fallback, so the single provider
      // carries quorum weight by itself.
      weight: 2,
      stallTimeout: 2500,
      maxLogsPerBatch: 5
    }
  ]
});

const startRailgunBrowserEngineFresh = async (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<RailgunEngineHandle> => {
  if (policy.providerMode === "helios") {
    throw new Error(
      "Helios provider mode is explicit in ConnectionPolicy but not wired for the RAILGUN Wallet SDK fallback yet."
    );
  }

  onStatus("Loading Railgun modules");

  const [wallet, sharedModels, levelJs, snarkJs] = await Promise.all([
    import("@railgun-community/wallet") as Promise<WalletModule>,
    import("@railgun-community/shared-models") as Promise<SharedModelsModule>,
    import("level-js") as Promise<LevelJsModule>,
    import("snarkjs") as Promise<SnarkJsModule>
  ]);

  const database = new levelJs.default("bindle-railgun-engine");
  const artifactStore = createBrowserArtifactStore(wallet.ArtifactStore);
  const useNativeArtifacts = false;
  const skipMerkletreeScans = false;
  const customPoiLists: unknown[] = [];
  const verboseScanLogging = false;

  onStatus("Starting Railgun engine");

  await wallet.startRailgunEngine(
    walletSource,
    database,
    policy.debugLogging,
    artifactStore,
    useNativeArtifacts,
    skipMerkletreeScans,
    policy.poiAggregatorUrls,
    customPoiLists,
    verboseScanLogging
  );

  wallet.getProver().setSnarkJSGroth16(snarkJs.groth16);

  if (policy.ethereumRpcUrl) {
    const networkName = getEthereumNetworkName(sharedModels);
    const networkConfig = sharedModels.NETWORK_CONFIG[String(networkName)];

    if (!networkConfig) {
      throw new Error("Unable to find Ethereum network config in Railgun SDK.");
    }

    onStatus("Connecting Ethereum provider");

    await wallet.loadProvider(
      createRailgunFallbackProviderConfig({
        chainId: networkConfig.chain.id,
        ethereumRpcUrl: policy.ethereumRpcUrl.trim()
      }),
      networkName,
      1000 * 60 * 5
    );
  }

  onStatus("Railgun engine ready");

  return {
    state: "ready",
    stop: async () => {
      await wallet.stopRailgunEngine();
    }
  };
};

export const ensureRailgunBrowserEngine = async (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<RailgunEngineHandle> => {
  const policyKey = enginePolicyKey(policy);

  if (activeEngineHandle && activeEnginePolicyKey === policyKey) {
    onStatus("Railgun engine already ready");
    return activeEngineHandle;
  }

  if (engineStartPromise) {
    if (engineStartPolicyKey !== policyKey) {
      throw new Error(
        "RAILGUN engine is already starting with a different visible endpoint policy. Wait for it to finish before changing Connections."
      );
    }

    return engineStartPromise;
  }

  if (activeEngineHandle) {
    onStatus("Restarting Railgun engine with updated visible endpoints");
    await activeEngineHandle.stop();
    activeEngineHandle = null;
    activeEnginePolicyKey = null;
  }

  engineStartPolicyKey = policyKey;
  engineStartPromise = startRailgunBrowserEngineFresh(policy, onStatus).then(
    (handle) => {
      const wrappedHandle: RailgunEngineHandle = {
        state: handle.state,
        stop: async () => {
          await handle.stop();
          if (activeEngineHandle === wrappedHandle) {
            activeEngineHandle = null;
            activeEnginePolicyKey = null;
          }
        }
      };

      activeEngineHandle = wrappedHandle;
      activeEnginePolicyKey = policyKey;
      return wrappedHandle;
    }
  );

  try {
    return await engineStartPromise;
  } finally {
    engineStartPromise = null;
    engineStartPolicyKey = null;
  }
};

export const startRailgunBrowserEngine = ensureRailgunBrowserEngine;

export const getRailgunEngineHandle = (): RailgunEngineHandle | null =>
  activeEngineHandle;
