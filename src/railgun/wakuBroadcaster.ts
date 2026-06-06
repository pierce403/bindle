import { getAddress, type Address } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";

const mainnetUsdcAddress = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
) as Address;

export type PreparedBroadcasterSubmit = {
  txidVersion: string;
  chain: "ethereum-mainnet";
  transaction: {
    to: string;
    data: string;
  };
  broadcaster: {
    railgunAddress: string;
    tokenFee: {
      feesID: string;
    };
  };
  nullifiers: string[];
  overallBatchMinGasPrice: bigint;
  useRelayAdapt: true;
  preTransactionPOIsPerTxidLeafPerList: unknown;
};

export type WakuBroadcasterSubmitResult = {
  transactionHash: `0x${string}` | null;
  broadcasterId: string;
};

export type SelectedRailgunBroadcaster = {
  railgunAddress: string;
  tokenFee: {
    feesID: string;
  };
};

export const railgunBroadcasterTransportUnavailableMessage =
  "RAILGUN Waku broadcaster transport is not bundled after the legacy dependency purge. Bindle needs a standalone Waku client or Kohaku-native broadcaster submission before Private Pay can submit.";

export const resolveRailgunBroadcasterFeeTokenAddress = (
  policy: Pick<
    ConnectionPolicy,
    "railgunBroadcasterFeeToken" | "railgunBroadcasterCustomFeeTokenAddress"
  >
): Address => {
  if (policy.railgunBroadcasterFeeToken === "USDC") {
    return mainnetUsdcAddress;
  }

  if (policy.railgunBroadcasterFeeToken === "WETH") {
    return UNISWAP_V4_WETH_ADDRESS;
  }

  if (policy.railgunBroadcasterFeeToken === "custom") {
    const value = policy.railgunBroadcasterCustomFeeTokenAddress.trim();

    if (!value) {
      throw new Error("Configure a custom broadcaster fee token address.");
    }

    return getAddress(value) as Address;
  }

  throw new Error(
    `${policy.railgunBroadcasterFeeToken} is not wired as a RAILGUN broadcaster fee token yet. Use USDC, WETH, or a custom ERC-20 token address.`
  );
};

export const getRailgunWakuBroadcasterQuote = async ({
  onStatus
}: {
  policy: ConnectionPolicy;
  feeTokenAddress: Address;
  onStatus: (message: string) => void;
}): Promise<SelectedRailgunBroadcaster> => {
  onStatus(railgunBroadcasterTransportUnavailableMessage);
  throw new Error(railgunBroadcasterTransportUnavailableMessage);
};

export const submitRailgunWakuBroadcasterTransaction = async ({
  onStatus
}: {
  prepared: PreparedBroadcasterSubmit;
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<WakuBroadcasterSubmitResult> => {
  onStatus(railgunBroadcasterTransportUnavailableMessage);
  throw new Error(railgunBroadcasterTransportUnavailableMessage);
};

export const getRailgunWakuBroadcasterNetworkName = (): "ethereum-mainnet" =>
  "ethereum-mainnet";
