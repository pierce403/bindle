import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { ContractTransaction } from "ethers";
import type { PayAsset } from "../intents/assets";
import {
  prepareUniswapV4EthToUsdcExactOutputRoute,
  UNISWAP_V4_WETH_ADDRESS,
  type CrossContractCall,
  type UniswapV4PayRoute
} from "../intents/uniswapV4PayRoute";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "../wallet/mainnetClient";
import type { SmartWalletCall } from "../wallet/smartAccountAdapter";
import type { WalletState } from "../wallet/walletState";
import { ensureRailgunBrowserEngine } from "./client";
import { normalizeRailgunProofProgress } from "./proofProgress";
import { unlockEncryptedRailgunWallet, type UnlockedRailgunWallet } from "./railgunWallet";
import type {
  NetworkName,
  TransactionGasDetails
} from "@railgun-community/shared-models";

type WalletSdkModule = typeof import("@railgun-community/wallet");
type SharedModelsModule = typeof import("@railgun-community/shared-models");

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  calls: SmartWalletCall[];
  route: UniswapV4PayRoute;
  railgunWalletID: string;
  relayAdaptTransaction: {
    to: Address;
    value: bigint;
  };
  nullifiers: string[];
};

const sdkWalletIdPrefix = "bindle:railgun-wallet-sdk-id:v1";

const sdkWalletIdStorageKey = (railgunAddress: string): string =>
  `${sdkWalletIdPrefix}:${railgunAddress}`;

const canUseLocalStorage = (): boolean =>
  typeof window !== "undefined" && "localStorage" in window;

const loadStoredSdkWalletId = (railgunAddress: string): string | null => {
  if (!canUseLocalStorage()) {
    return null;
  }

  return window.localStorage.getItem(sdkWalletIdStorageKey(railgunAddress));
};

const saveStoredSdkWalletId = (
  railgunAddress: string,
  railgunWalletID: string
): void => {
  if (!canUseLocalStorage()) {
    return;
  }

  // Storage boundary: this localStorage value is SDK metadata only. It is not
  // recovery material, a spending key, or a viewing key. RAILGUN secrets stay in
  // the encrypted IndexedDB wallet store owned by railgunWallet.ts.
  window.localStorage.setItem(
    sdkWalletIdStorageKey(railgunAddress),
    railgunWalletID
  );
};

const clearStoredSdkWalletId = (railgunAddress: string): void => {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(sdkWalletIdStorageKey(railgunAddress));
};

const sdkEncryptionKeyForWallet = (
  unlockedWallet: UnlockedRailgunWallet
): string =>
  keccak256(
    toBytes(
      [
        "bindle-railgun-wallet-sdk",
        "v1",
        unlockedWallet.recoveryPhrase,
        unlockedWallet.keyIndex.toString(),
        unlockedWallet.chainId.toString()
      ].join(":")
    )
  ).slice(2);

const assertSdkAddressMatches = ({
  expected,
  received
}: {
  expected: string;
  received: string;
}): void => {
  if (received !== expected) {
    throw new Error(
      `RAILGUN Wallet SDK fallback derived ${received}, but Bindle's local 0zk wallet is ${expected}. Pay is blocked to avoid spending from the wrong shielded account.`
    );
  }
};

const loadOrCreateSdkWallet = async ({
  sharedModels,
  unlockedWallet,
  walletSdk,
  onStatus
}: {
  sharedModels: SharedModelsModule;
  unlockedWallet: UnlockedRailgunWallet;
  walletSdk: WalletSdkModule;
  onStatus: (message: string) => void;
}): Promise<{
  encryptionKey: string;
  networkName: NetworkName;
  railgunWalletID: string;
}> => {
  const encryptionKey = sdkEncryptionKeyForWallet(unlockedWallet);
  const storedWalletID = loadStoredSdkWalletId(unlockedWallet.railgunAddress);
  const networkName = sharedModels.NetworkName.Ethereum;

  if (storedWalletID) {
    const loadedAddress = walletSdk.getRailgunAddress(storedWalletID);

    if (loadedAddress) {
      assertSdkAddressMatches({
        expected: unlockedWallet.railgunAddress,
        received: loadedAddress
      });
      return { encryptionKey, networkName, railgunWalletID: storedWalletID };
    }

    try {
      onStatus("Loading local RAILGUN SDK wallet metadata");
      const walletInfo = await walletSdk.loadWalletByID(
        encryptionKey,
        storedWalletID,
        false
      );
      assertSdkAddressMatches({
        expected: unlockedWallet.railgunAddress,
        received: walletInfo.railgunAddress
      });
      return {
        encryptionKey,
        networkName,
        railgunWalletID: walletInfo.id
      };
    } catch {
      clearStoredSdkWalletId(unlockedWallet.railgunAddress);
    }
  }

  onStatus("Creating local RAILGUN SDK wallet view");
  const walletInfo = await walletSdk.createRailgunWallet(
    encryptionKey,
    unlockedWallet.recoveryPhrase,
    { [networkName]: 0 },
    unlockedWallet.keyIndex
  );
  assertSdkAddressMatches({
    expected: unlockedWallet.railgunAddress,
    received: walletInfo.railgunAddress
  });
  saveStoredSdkWalletId(unlockedWallet.railgunAddress, walletInfo.id);

  return {
    encryptionKey,
    networkName,
    railgunWalletID: walletInfo.id
  };
};

const valueToBigInt = (value: unknown): bigint => {
  if (value === undefined || value === null) {
    return 0n;
  }

  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    return BigInt(value);
  }

  if (typeof value === "string") {
    return BigInt(value);
  }

  if (
    typeof value === "object" &&
    value !== null &&
    "toString" in value &&
    typeof value.toString === "function"
  ) {
    return BigInt(value.toString());
  }

  throw new Error("Prepared RAILGUN transaction has an unsupported value type.");
};

const toContractTransaction = (
  call: CrossContractCall
): ContractTransaction => ({
  to: call.to,
  data: call.data,
  value: call.value ?? 0n
});

const toSmartWalletCall = (transaction: ContractTransaction): SmartWalletCall => {
  if (!transaction.to || typeof transaction.to !== "string") {
    throw new Error("Prepared RAILGUN transaction is missing a target address.");
  }

  if (!transaction.data || typeof transaction.data !== "string") {
    throw new Error("Prepared RAILGUN transaction is missing calldata.");
  }

  if (!transaction.to.startsWith("0x") || !transaction.data.startsWith("0x")) {
    throw new Error("Prepared RAILGUN transaction is not EVM hex calldata.");
  }

  return {
    to: transaction.to as Address,
    data: transaction.data as Hex,
    value: valueToBigInt(transaction.value)
  };
};

const createInitialGasDetails = async (
  policy: ConnectionPolicy,
  sharedModels: SharedModelsModule
): Promise<TransactionGasDetails> => {
  const client = await createVisibleMainnetClient(policy);
  const fees = await client.estimateFeesPerGas();

  if (!fees.maxFeePerGas || !fees.maxPriorityFeePerGas) {
    throw new Error("Configured RPC did not return EIP-1559 gas fee data.");
  }

  return {
    evmGasType: sharedModels.EVMGasType.Type2,
    gasEstimate: 0n,
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas
  } as TransactionGasDetails;
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

  const smartWalletAddress = walletState.smartWalletAddress as Address;

  onStatus("Quoting Uniswap v4 ETH to USDC route");
  const route = await prepareUniswapV4EthToUsdcExactOutputRoute({
    amount,
    outputAsset: asset,
    policy,
    quoterAccount: smartWalletAddress,
    recipient,
    refundRecipient: smartWalletAddress
  });

  onStatus("Unlocking local RAILGUN wallet secrets");
  const unlockedWallet = await unlockEncryptedRailgunWallet();

  if (unlockedWallet.railgunAddress !== walletState.railgunAddress) {
    throw new Error("Local RAILGUN wallet secrets do not match the saved 0zk address.");
  }

  onStatus("Starting explicit RAILGUN Wallet SDK proof engine");
  await ensureRailgunBrowserEngine(policy, onStatus);

  const [walletSdk, sharedModels] = await Promise.all([
    import("@railgun-community/wallet"),
    import("@railgun-community/shared-models")
  ]);
  const { encryptionKey, networkName, railgunWalletID } =
    await loadOrCreateSdkWallet({
      sharedModels,
      unlockedWallet,
      walletSdk,
      onStatus
    });
  const network = sharedModels.NETWORK_CONFIG[networkName];

  onStatus("Waiting for local RAILGUN wallet scan");
  await walletSdk.awaitWalletScan(railgunWalletID, network.chain);

  const txidVersion = sharedModels.TXIDVersion.V2_PoseidonMerkle;
  const sendWithPublicWallet = true;
  const overallBatchMinGasPrice = 0n;
  const unshieldAmounts = [
    {
      tokenAddress: UNISWAP_V4_WETH_ADDRESS,
      amount: route.maxInputAmount
    }
  ];
  const crossContractCalls = route.calls.map(toContractTransaction);
  const emptyNfts: [] = [];
  const emptyErc20Recipients: [] = [];
  const emptyNftRecipients: [] = [];

  onStatus("Estimating RAILGUN RelayAdapt gas");
  const initialGasDetails = await createInitialGasDetails(policy, sharedModels);
  const gasEstimate =
    await walletSdk.gasEstimateForUnprovenCrossContractCalls(
      txidVersion,
      networkName,
      railgunWalletID,
      encryptionKey,
      unshieldAmounts,
      emptyNfts,
      emptyErc20Recipients,
      emptyNftRecipients,
      crossContractCalls,
      initialGasDetails,
      undefined,
      sendWithPublicWallet,
      undefined
    );
  const gasDetails: TransactionGasDetails = {
    ...initialGasDetails,
    gasEstimate: gasEstimate.gasEstimate
  } as TransactionGasDetails;

  onStatus("Generating RAILGUN cross-contract Pay proof");
  onProgress({ percent: 0, status: "Generating RAILGUN proof" });
  await walletSdk.generateCrossContractCallsProof(
    txidVersion,
    networkName,
    railgunWalletID,
    encryptionKey,
    unshieldAmounts,
    emptyNfts,
    emptyErc20Recipients,
    emptyNftRecipients,
    crossContractCalls,
    undefined,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    undefined,
    (progress, status) => {
      onProgress({
        percent: normalizeRailgunProofProgress(progress),
        status
      });
    }
  );

  onStatus("Populating proved RAILGUN Pay transaction");
  const proved = await walletSdk.populateProvedCrossContractCalls(
    txidVersion,
    networkName,
    railgunWalletID,
    unshieldAmounts,
    emptyNfts,
    emptyErc20Recipients,
    emptyNftRecipients,
    crossContractCalls,
    undefined,
    sendWithPublicWallet,
    overallBatchMinGasPrice,
    gasDetails
  );
  const smartWalletCall = toSmartWalletCall(proved.transaction);
  onProgress({ percent: 100, status: "RAILGUN proof ready" });

  return {
    calls: [smartWalletCall],
    route,
    railgunWalletID,
    relayAdaptTransaction: {
      to: smartWalletCall.to,
      value: smartWalletCall.value ?? 0n
    },
    nullifiers: proved.nullifiers ?? []
  };
};
