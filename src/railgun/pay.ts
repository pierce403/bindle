import { getAddress, type Address, type Hex } from "viem";
import type { PayAsset } from "../intents/assets";
import {
  prepareUniswapV4EthToUsdcExactOutputRoute,
  UNISWAP_V4_WETH_ADDRESS,
  type UniswapV4PayRoute
} from "../intents/uniswapV4PayRoute";
import { createExplicitRpcProvider } from "../privacy/adapters/rpcProvider";
import {
  BINDLE_RAILGUN_ARTIFACT_BASE_PATH,
  KOHAKU_RAILGUN_ARTIFACT_BASE_URL,
  type ConnectionPolicy
} from "../privacy/connectionPolicy";
import { createKohakuIndexedDbDatabase } from "../privacy/storage/kohakuDatabase";
import {
  isKohakuArtifactLoaderFailure,
  isKohakuRpcFetchFailure,
  isWasmUnreachableTrap
} from "../privacy/toolkitErrors";
import type { SmartWalletCall } from "../wallet/smartAccountAdapter";
import type { WalletState } from "../wallet/walletState";
import { loadKohakuRailgunBrowserModule } from "./kohakuRailgunModule";
import { unlockEncryptedRailgunWallet } from "./railgunWallet";
import { createVisibleRailgunUtxoSyncer } from "./utxoSyncer";
import type {
  AssetId,
  ChainConfig,
  Eip1193Provider,
  RailgunSigner,
  TxData
} from "@kohaku-eth/railgun";

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuPayModule = Pick<
  KohakuRailgunTypes,
  "RailgunBuilder" | "RailgunSigner" | "UtxoSyncer" | "chainConfig" | "erc20"
>;

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  calls: SmartWalletCall[];
  route: UniswapV4PayRoute;
  railgunAdapter: "kohaku";
  railgunAddress: string;
  railgunUnshieldTransaction: {
    to: Address;
    value: bigint;
  };
  unshieldAmountWei: bigint;
  publicWethInputWei: bigint;
};

export const kohakuRailgunPayErrorName = "KohakuRailgunPayError";
const bindleArtifactProxyVersion = "railgun-artifacts-v1";

const normalizeArtifactBaseUrl = (value: string): string => {
  const trimmed = value.trim();

  return trimmed ? `${trimmed.replace(/\/+$/, "")}/` : "";
};

const loadKohakuPayModule = ({
  debugLogging
}: {
  debugLogging: boolean;
}): Promise<KohakuPayModule> =>
  loadKohakuRailgunBrowserModule({
    logLevel: debugLogging ? "Debug" : "Warn"
  });

export const validateKohakuRailgunArtifactPolicy = (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): void => {
  const configuredArtifactUrl = normalizeArtifactBaseUrl(policy.railgunArtifactUrl);
  const bindleArtifactUrl = normalizeArtifactBaseUrl(
    BINDLE_RAILGUN_ARTIFACT_BASE_PATH
  );

  if (!configuredArtifactUrl) {
    throw new Error(
      "Configure RAILGUN proving artifacts before Pay. Kohaku needs proving artifacts to build the unshield proof."
    );
  }

  if (configuredArtifactUrl !== bindleArtifactUrl) {
    throw new Error(
      `Pay requires Bindle-hosted RAILGUN proving artifacts at ${bindleArtifactUrl}. Custom artifact origins are blocked until Kohaku exposes a configurable artifact loader.`
    );
  }
};

const waitForServiceWorkerController = async (): Promise<ServiceWorker> => {
  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "Bindle-hosted RAILGUN proving artifacts require the installed PWA service worker."
    );
  }

  await navigator.serviceWorker.ready;

  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      reject(
        new Error(
          "Bindle's artifact proxy service worker is not controlling this page yet. Reopen or reload the PWA before Pay."
        )
      );
    }, 5_000);

    const handleControllerChange = () => {
      if (!navigator.serviceWorker.controller) {
        return;
      }

      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      resolve(navigator.serviceWorker.controller);
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );
  });
};

export const ensureKohakuRailgunArtifactPolicyReady = async (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): Promise<void> => {
  validateKohakuRailgunArtifactPolicy(policy);

  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return;
  }

  const controller = await waitForServiceWorkerController();
  const version = await new Promise<string>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          "Bindle's artifact proxy service worker did not confirm RAILGUN artifact support. Reopen or reload the PWA before Pay."
        )
      );
    }, 5_000);

    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timeout);
      const data = event.data as { type?: string; version?: string };

      if (data.type !== "BINDLE_ARTIFACT_PROXY_READY" || !data.version) {
        reject(
          new Error(
            "Bindle's artifact proxy service worker returned an invalid readiness response."
          )
        );
        return;
      }

      resolve(data.version);
    };

    controller.postMessage(
      {
        type: "BINDLE_ARTIFACT_PROXY_READY"
      },
      [channel.port2]
    );
  });

  if (version !== bindleArtifactProxyVersion) {
    throw new Error(
      `Bindle's artifact proxy service worker is ${version}, expected ${bindleArtifactProxyVersion}. Reopen or reload the PWA before Pay.`
    );
  }
};

const createKohakuPayError = (
  operation: string,
  error: unknown,
  artifactUrl = KOHAKU_RAILGUN_ARTIFACT_BASE_URL
): Error => {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const configuredArtifactUrl =
    normalizeArtifactBaseUrl(artifactUrl) || KOHAKU_RAILGUN_ARTIFACT_BASE_URL;
  const message = isKohakuArtifactLoaderFailure(error)
    ? `Kohaku could not load Bindle-hosted RAILGUN proving artifacts while ${operation}. Pay proof generation is configured for ${configuredArtifactUrl}; Bindle's service worker maps Kohaku's compiled artifact URL (${KOHAKU_RAILGUN_ARTIFACT_BASE_URL}) to that same-origin path before the request leaves the browser. Reopen or reload the PWA so the latest service worker controls the page, then retry.`
    : isKohakuRpcFetchFailure(error)
    ? `Configured Ethereum RPC failed while ${operation}. Pay needs browser-accessible RAILGUN note sync before it can build the unshield proof. Change the Ethereum RPC or RAILGUN sync indexer in Connections.`
    : isWasmUnreachableTrap(error)
      ? `Kohaku RAILGUN WASM trapped with \`unreachable\` while ${operation}. Pay uses Kohaku for this wallet because the shielded funds are tied to the local 0zk address.`
      : `Kohaku RAILGUN failed while ${operation}: ${rawMessage}`;
  const wrapped = new Error(message, { cause: error });
  wrapped.name = kohakuRailgunPayErrorName;
  return wrapped;
};

const withKohakuPayContext = async <T>(
  operation: string,
  action: () => Promise<T> | T,
  artifactUrl?: string
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    throw createKohakuPayError(operation, error, artifactUrl);
  }
};

const txDataToSmartWalletCall = (transaction: TxData): SmartWalletCall => {
  if (!transaction.to.startsWith("0x") || !transaction.data.startsWith("0x")) {
    throw new Error("Prepared RAILGUN Pay transaction is not EVM calldata.");
  }

  return {
    to: getAddress(transaction.to) as Address,
    data: transaction.data as Hex,
    value: BigInt(transaction.value)
  };
};

export const grossUpUnshieldAmount = ({
  desiredPublicAmount,
  unshieldFeeBps
}: {
  desiredPublicAmount: bigint;
  unshieldFeeBps: number;
}): bigint => {
  if (desiredPublicAmount <= 0n) {
    throw new Error("Desired Pay unshield amount must be greater than zero.");
  }

  if (unshieldFeeBps <= 0) {
    return desiredPublicAmount;
  }

  if (!Number.isInteger(unshieldFeeBps) || unshieldFeeBps >= 10_000) {
    throw new Error("Invalid RAILGUN unshield fee basis points.");
  }

  const denominator = 10_000n - BigInt(unshieldFeeBps);
  return (desiredPublicAmount * 10_000n + denominator - 1n) / denominator;
};

const getDirectMainnetRailgunChain = async ({
  kohaku,
  policy,
  provider,
  expectedChainId,
  onStatus
}: {
  kohaku: KohakuPayModule;
  policy: ConnectionPolicy;
  provider: Eip1193Provider;
  expectedChainId: bigint;
  onStatus: (message: string) => void;
}): Promise<ChainConfig> => {
  onStatus("Checking configured Ethereum RPC chain");
  const chainId = await withKohakuPayContext("checking Ethereum RPC chain", () =>
    provider.getChainId()
  );

  if (chainId !== expectedChainId) {
    throw new Error(
      `Stored 0zk wallet is for chain ${expectedChainId.toString()}, but the configured RPC is chain ${chainId.toString()}.`
    );
  }

  onStatus(`Loading Kohaku RAILGUN chain ${chainId.toString()}`);
  const chain = await withKohakuPayContext(
    `loading RAILGUN chain config for chain ${chainId.toString()}`,
    () => kohaku.chainConfig(chainId)
  );

  if (!chain) {
    throw new Error(`Kohaku RAILGUN does not support chain ID ${chainId}.`);
  }

  if (policy.providerMode !== "direct-rpc") {
    throw new Error("Pay is currently wired through visible direct RPC mode.");
  }

  return chain;
};

const buildKohakuUnshieldCall = async ({
  publicWethInputWei,
  policy,
  smartWalletAddress,
  onProgress,
  onStatus
}: {
  publicWethInputWei: bigint;
  policy: ConnectionPolicy;
  smartWalletAddress: Address;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
}): Promise<{
  call: SmartWalletCall;
  railgunAddress: string;
  unshieldAmountWei: bigint;
}> => {
  onStatus("Unlocking local Kohaku RAILGUN wallet");
  const unlockedWallet = await unlockEncryptedRailgunWallet();

  onStatus("Loading Kohaku RAILGUN Pay module");
  onProgress({ percent: 5, status: "Loading Kohaku RAILGUN" });
  const kohaku = await withKohakuPayContext("loading Kohaku RAILGUN Pay module", () =>
    loadKohakuPayModule({ debugLogging: policy.debugLogging })
  );
  const provider = createExplicitRpcProvider(policy.ethereumRpcUrl.trim());
  const chain = await getDirectMainnetRailgunChain({
    kohaku,
    policy,
    provider,
    expectedChainId: unlockedWallet.chainId,
    onStatus
  });
  const database = createKohakuIndexedDbDatabase(`railgun:${chain.id}`);
  const syncer = await withKohakuPayContext("creating RAILGUN Pay syncer", () =>
    createVisibleRailgunUtxoSyncer({
      chain,
      kohaku,
      policy,
      provider,
      onStatus
    })
  );

  onStatus("Building Kohaku RAILGUN Pay provider");
  const railgunProvider = await withKohakuPayContext(
    "building Kohaku RAILGUN Pay provider",
    () =>
      new kohaku.RailgunBuilder(chain, provider)
        .withDatabase(database)
        .withUtxoSyncer(syncer)
        .build()
  );
  const signer = kohaku.RailgunSigner.privateKey(
    unlockedWallet.spendingKey,
    unlockedWallet.viewingKey,
    unlockedWallet.chainId
  );
  const unshieldAmountWei = grossUpUnshieldAmount({
    desiredPublicAmount: publicWethInputWei,
    unshieldFeeBps: chain.unshieldFeeBps
  });

  try {
    if (signer.address !== unlockedWallet.railgunAddress) {
      throw new Error("Local Kohaku signer does not match the saved 0zk address.");
    }

    onStatus("Registering local Kohaku RAILGUN signer");
    onProgress({ percent: 15, status: "Registering local 0zk signer" });
    await withKohakuPayContext("registering the local RAILGUN signer", () =>
      railgunProvider.register(signer)
    );

    onStatus("Syncing local RAILGUN notes for Pay");
    onProgress({ percent: 35, status: "Syncing shielded notes" });
    await withKohakuPayContext("syncing RAILGUN notes for Pay", () =>
      railgunProvider.sync()
    );

    onStatus("Building Kohaku RAILGUN unshield proof");
    onProgress({ percent: 65, status: "Generating RAILGUN unshield proof" });
    const wethAsset = kohaku.erc20(UNISWAP_V4_WETH_ADDRESS as `0x${string}`);
    const transaction = await withKohakuPayContext(
      "building the RAILGUN WETH unshield transaction",
      () =>
        railgunProvider.build(
          railgunProvider
            .transact()
            .unshield(
              signer as RailgunSigner,
              smartWalletAddress,
              wethAsset as AssetId,
              unshieldAmountWei
            )
        ),
      policy.railgunArtifactUrl
    );

    onProgress({ percent: 90, status: "RAILGUN unshield proof ready" });

    return {
      call: txDataToSmartWalletCall(transaction),
      railgunAddress: unlockedWallet.railgunAddress,
      unshieldAmountWei
    };
  } finally {
    signer.free();
    railgunProvider.free();
  }
};

export const prepareRailgunUsdcPayForRecipient = async ({
  amount,
  asset,
  policy,
  recipient,
  walletState,
  onProgress,
  onStatus
}: {
  amount: string;
  asset: PayAsset;
  policy: ConnectionPolicy;
  recipient: Address;
  walletState: WalletState;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
}): Promise<PreparedRailgunPay> => {
  if (!walletState.smartWalletAddress) {
    throw new Error("Create the public passkey smart account before Pay.");
  }

  if (!walletState.railgunAddress) {
    throw new Error("Create or import a shielded 0zk wallet before Pay.");
  }

  if (asset.symbol !== "USDC") {
    throw new Error("Pay is currently wired for USDC output.");
  }

  if (policy.providerMode !== "direct-rpc") {
    throw new Error("Pay is currently wired through visible direct RPC mode.");
  }

  if (!policy.ethereumRpcUrl.trim()) {
    throw new Error("Configure an Ethereum RPC before Pay.");
  }

  if (!policy.bundlerUrl.trim()) {
    throw new Error("Configure an ERC-4337 bundler before Pay.");
  }

  await ensureKohakuRailgunArtifactPolicyReady(policy);

  const smartWalletAddress = walletState.smartWalletAddress as Address;

  onStatus("Quoting Uniswap v4 ETH to USDC route");
  onProgress({ percent: 0, status: "Quoting Uniswap v4 route" });
  const route = await prepareUniswapV4EthToUsdcExactOutputRoute({
    amount,
    outputAsset: asset,
    policy,
    quoterAccount: smartWalletAddress,
    recipient,
    refundRecipient: smartWalletAddress
  });
  const railgunUnshield = await buildKohakuUnshieldCall({
    publicWethInputWei: route.maxInputAmount,
    policy,
    smartWalletAddress,
    onProgress,
    onStatus
  });

  if (railgunUnshield.railgunAddress !== walletState.railgunAddress) {
    throw new Error("Prepared Kohaku Pay signer does not match the saved 0zk address.");
  }

  onStatus("Preparing smart-wallet Pay batch");
  onProgress({ percent: 100, status: "RAILGUN Pay batch ready" });

  return {
    calls: [railgunUnshield.call, ...route.calls],
    route,
    railgunAdapter: "kohaku",
    railgunAddress: railgunUnshield.railgunAddress,
    railgunUnshieldTransaction: {
      to: railgunUnshield.call.to,
      value: railgunUnshield.call.value ?? 0n
    },
    unshieldAmountWei: railgunUnshield.unshieldAmountWei,
    publicWethInputWei: route.maxInputAmount
  };
};
