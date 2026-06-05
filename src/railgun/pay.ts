import { getAddress, type Address, type Hex } from "viem";
import type { ContractTransaction } from "ethers";
import {
  EVMGasType,
  NETWORK_CONFIG,
  NetworkName,
  TXIDVersion,
  type FeeTokenDetails,
  type PreTransactionPOIsPerTxidLeafPerList,
  type RailgunERC20Amount,
  type RailgunERC20AmountRecipient,
  type RailgunERC20Recipient,
  type RailgunNFTAmount,
  type RailgunNFTAmountRecipient,
  type SelectedBroadcaster,
  type TransactionGasDetails,
  type TransactionGasDetailsType1
} from "@railgun-community/shared-models";
import type { PayAsset } from "../intents/assets";
import {
  prepareUniswapV4EthToUsdcExactOutputRoute,
  UNISWAP_V4_WETH_ADDRESS,
  type CrossContractCall,
  type UniswapV4PayRoute
} from "../intents/uniswapV4PayRoute";
import {
  BINDLE_RAILGUN_ARTIFACT_BASE_PATH,
  type ConnectionPolicy
} from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "../wallet/mainnetClient";
import type { WalletState } from "../wallet/walletState";
import { ensureRailgunWalletSdkWalletForLocalWallet } from "./railgunWalletSdk";
import {
  getRailgunWakuBroadcasterQuote,
  resolveRailgunBroadcasterFeeTokenAddress
} from "./wakuBroadcaster";

type RailgunWalletSdkTransactionModule = Pick<
  typeof import("@railgun-community/wallet"),
  | "calculateBroadcasterFeeERC20Amount"
  | "gasEstimateForUnprovenCrossContractCalls"
  | "generateCrossContractCallsProof"
  | "populateProvedCrossContractCalls"
>;

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  route: UniswapV4PayRoute;
  railgunAdapter: "railgun-wallet-sdk";
  submissionMode: "railgun-waku-broadcaster";
  railgunAddress: string;
  txidVersion: TXIDVersion;
  networkName: NetworkName.Ethereum;
  transaction: {
    to: Address;
    data: Hex;
  };
  nullifiers: string[];
  preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList;
  broadcaster: SelectedBroadcaster;
  broadcasterFee: RailgunERC20AmountRecipient;
  broadcasterFeeTokenAddress: Address;
  overallBatchMinGasPrice: bigint;
  useRelayAdapt: true;
  unshieldAmountWei: bigint;
  publicWethInputWei: bigint;
};

const bindleArtifactProxyVersion = "railgun-artifacts-v1";
const railgunMainnetUnshieldFeeBps = 25;

const normalizeArtifactBaseUrl = (value: string): string => {
  const trimmed = value.trim();

  return trimmed ? `${trimmed.replace(/\/+$/, "")}/` : "";
};

export const validateKohakuRailgunArtifactPolicy = (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): void => {
  const configuredArtifactUrl = normalizeArtifactBaseUrl(policy.railgunArtifactUrl);
  const bindleArtifactUrl = normalizeArtifactBaseUrl(
    BINDLE_RAILGUN_ARTIFACT_BASE_PATH
  );

  if (!configuredArtifactUrl) {
    throw new Error(
      "Configure RAILGUN proving artifacts before Pay. Proof generation needs visible artifacts."
    );
  }

  if (configuredArtifactUrl !== bindleArtifactUrl) {
    throw new Error(
      `Pay requires Bindle-hosted RAILGUN proving artifacts at ${bindleArtifactUrl}. Custom artifact origins are blocked until the active RAILGUN adapter exposes a configurable artifact loader.`
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

const loadRailgunWalletSdkTransactionModule =
  async (): Promise<RailgunWalletSdkTransactionModule> =>
    import("@railgun-community/wallet");

const payProgressPercent = (progress: unknown): number => {
  if (!progress || typeof progress !== "object") {
    return 65;
  }

  const value = (progress as { progress?: unknown }).progress;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 65;
  }

  const normalized = value > 1 ? value : value * 100;
  return Math.max(55, Math.min(90, 55 + Math.round(normalized * 0.35)));
};

const payProgressStatus = (progress: unknown): string => {
  if (!progress || typeof progress !== "object") {
    return "Generating RAILGUN proof";
  }

  const status = (progress as { status?: unknown }).status;
  return typeof status === "string" && status.trim()
    ? status
    : "Generating RAILGUN proof";
};

const transactionGasDetailsForBroadcaster = async (
  policy: ConnectionPolicy
): Promise<TransactionGasDetailsType1> => {
  const client = await createVisibleMainnetClient(policy);
  const gasPrice = await client.getGasPrice();

  return {
    evmGasType: EVMGasType.Type1,
    gasEstimate: 0n,
    gasPrice
  };
};

const crossContractCallsForRailgun = (
  calls: CrossContractCall[]
): ContractTransaction[] =>
  calls.map((call) => ({
    to: call.to,
    data: call.data,
    value: call.value ?? 0n
  }));

const toPreparedTransaction = (
  transaction: ContractTransaction
): PreparedRailgunPay["transaction"] => {
  if (!transaction.to || !transaction.data) {
    throw new Error("RAILGUN Pay proof did not produce relay calldata.");
  }

  if (typeof transaction.to !== "string" || typeof transaction.data !== "string") {
    throw new Error("RAILGUN Pay relay transaction is not hex calldata.");
  }

  return {
    to: getAddress(transaction.to) as Address,
    data: transaction.data as Hex
  };
};

const broadcasterFeeRecipient = ({
  broadcaster,
  amount,
  tokenAddress
}: {
  broadcaster: SelectedBroadcaster;
  amount: bigint;
  tokenAddress: Address;
}): RailgunERC20AmountRecipient => ({
  tokenAddress,
  amount,
  recipientAddress: broadcaster.railgunAddress
});

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

  await ensureKohakuRailgunArtifactPolicyReady(policy);

  const networkName = NetworkName.Ethereum;
  const txidVersion = TXIDVersion.V2_PoseidonMerkle;
  const networkConfig = NETWORK_CONFIG[networkName];
  const relayAdaptAddress = getAddress(networkConfig.relayAdaptContract) as Address;

  onStatus("Quoting Uniswap v4 ETH to USDC route");
  onProgress({ percent: 0, status: "Quoting Uniswap v4 route" });
  const route = await prepareUniswapV4EthToUsdcExactOutputRoute({
    amount,
    outputAsset: asset,
    policy,
    quoterAccount: relayAdaptAddress,
    recipient,
    refundRecipient: recipient
  });

  const railgunWallet = await ensureRailgunWalletSdkWalletForLocalWallet({
    policy,
    onStatus
  });

  if (railgunWallet.railgunAddress !== walletState.railgunAddress) {
    throw new Error("Prepared RAILGUN Pay wallet does not match the saved 0zk address.");
  }

  const publicWethInputWei = route.maxInputAmount;
  const unshieldAmountWei = grossUpUnshieldAmount({
    desiredPublicAmount: publicWethInputWei,
    unshieldFeeBps: railgunMainnetUnshieldFeeBps
  });
  const relayAdaptUnshieldERC20Amounts: RailgunERC20Amount[] = [
    {
      tokenAddress: UNISWAP_V4_WETH_ADDRESS,
      amount: unshieldAmountWei
    }
  ];
  const relayAdaptUnshieldNFTAmounts: RailgunNFTAmount[] = [];
  const relayAdaptShieldERC20Recipients: RailgunERC20Recipient[] = [];
  const relayAdaptShieldNFTRecipients: RailgunNFTAmountRecipient[] = [];
  const crossContractCalls = crossContractCallsForRailgun(route.calls);
  const feeTokenAddress = resolveRailgunBroadcasterFeeTokenAddress(policy);

  onProgress({ percent: 15, status: "Finding RAILGUN broadcaster" });
  const broadcaster = await getRailgunWakuBroadcasterQuote({
    chain: railgunWallet.chain,
    feeTokenAddress,
    policy,
    onStatus
  });
  const feeTokenDetails: FeeTokenDetails = {
    tokenAddress: feeTokenAddress,
    feePerUnitGas: BigInt(broadcaster.tokenFee.feePerUnitGas)
  };
  const originalGasDetails = await transactionGasDetailsForBroadcaster(policy);
  const walletSdk = await loadRailgunWalletSdkTransactionModule();

  onStatus("Estimating Private Pay broadcaster gas and fee");
  onProgress({ percent: 30, status: "Estimating RAILGUN broadcaster fee" });
  const gasEstimate = await walletSdk.gasEstimateForUnprovenCrossContractCalls(
    txidVersion,
    networkName,
    railgunWallet.walletID,
    railgunWallet.encryptionKey,
    relayAdaptUnshieldERC20Amounts,
    relayAdaptUnshieldNFTAmounts,
    relayAdaptShieldERC20Recipients,
    relayAdaptShieldNFTRecipients,
    crossContractCalls,
    originalGasDetails,
    feeTokenDetails,
    false,
    undefined
  );
  const gasDetails: TransactionGasDetails = {
    ...originalGasDetails,
    gasEstimate: gasEstimate.gasEstimate
  };
  const broadcasterFeeAmount =
    walletSdk.calculateBroadcasterFeeERC20Amount(feeTokenDetails, gasDetails);
  const broadcasterFee = broadcasterFeeRecipient({
    broadcaster,
    amount: broadcasterFeeAmount.amount,
    tokenAddress: feeTokenAddress
  });
  const overallBatchMinGasPrice = originalGasDetails.gasPrice;

  onStatus("Generating Private Pay RAILGUN proof");
  onProgress({ percent: 55, status: "Generating RAILGUN proof" });
  await walletSdk.generateCrossContractCallsProof(
    txidVersion,
    networkName,
    railgunWallet.walletID,
    railgunWallet.encryptionKey,
    relayAdaptUnshieldERC20Amounts,
    relayAdaptUnshieldNFTAmounts,
    relayAdaptShieldERC20Recipients,
    relayAdaptShieldNFTRecipients,
    crossContractCalls,
    broadcasterFee,
    false,
    overallBatchMinGasPrice,
    undefined,
    (progress) =>
      onProgress({
        percent: payProgressPercent(progress),
        status: payProgressStatus(progress)
      })
  );

  onStatus("Populating RAILGUN broadcaster transaction");
  onProgress({ percent: 92, status: "Preparing broadcaster request" });
  const populated = await walletSdk.populateProvedCrossContractCalls(
    txidVersion,
    networkName,
    railgunWallet.walletID,
    relayAdaptUnshieldERC20Amounts,
    relayAdaptUnshieldNFTAmounts,
    relayAdaptShieldERC20Recipients,
    relayAdaptShieldNFTRecipients,
    crossContractCalls,
    broadcasterFee,
    false,
    overallBatchMinGasPrice,
    gasDetails
  );

  if (!populated.nullifiers?.length) {
    throw new Error("RAILGUN Pay proof did not return transaction nullifiers.");
  }

  onStatus("Private Pay broadcaster request ready");
  onProgress({ percent: 100, status: "Ready for RAILGUN broadcaster" });

  return {
    route,
    railgunAdapter: "railgun-wallet-sdk",
    submissionMode: "railgun-waku-broadcaster",
    railgunAddress: railgunWallet.railgunAddress,
    txidVersion,
    networkName,
    transaction: toPreparedTransaction(populated.transaction),
    nullifiers: populated.nullifiers,
    preTransactionPOIsPerTxidLeafPerList:
      populated.preTransactionPOIsPerTxidLeafPerList,
    broadcaster,
    broadcasterFee,
    broadcasterFeeTokenAddress: feeTokenAddress,
    overallBatchMinGasPrice,
    useRelayAdapt: true,
    unshieldAmountWei,
    publicWethInputWei
  };
};
