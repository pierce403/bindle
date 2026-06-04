import { formatEther, isAddress, type Address } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "./mainnetClient";

export type PublicEthBalance = {
  address: Address;
  wei: bigint;
  formatted: string;
  blockNumber: bigint;
  syncedAt: string;
};

export const formatEthAmount = (wei: bigint): string => {
  const exact = formatEther(wei);
  const [whole, fraction = ""] = exact.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");

  if (!trimmedFraction) {
    return whole;
  }

  return `${whole}.${trimmedFraction}`;
};

export const formatEthBalance = (wei: bigint): string =>
  `${formatEthAmount(wei)} ETH`;

export const fetchPublicEthBalance = async (
  policy: ConnectionPolicy,
  smartWalletAddress: string
): Promise<PublicEthBalance> => {
  const normalizedAddress = smartWalletAddress.trim();

  if (!isAddress(normalizedAddress)) {
    throw new Error("Smart-wallet funding address is not a valid EVM address.");
  }

  const address = normalizedAddress as Address;
  const client = await createVisibleMainnetClient(policy);
  const [wei, blockNumber] = await Promise.all([
    client.getBalance({ address }),
    client.getBlockNumber()
  ]);

  return {
    address,
    wei,
    formatted: formatEthBalance(wei),
    blockNumber,
    syncedAt: new Date().toISOString()
  };
};
