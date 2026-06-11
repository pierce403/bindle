import { isAddress, type Address, type Hash } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "./mainnetClient";
import { formatEthAmount } from "./publicBalance";

const DEFAULT_ACTIVITY_LOOKBACK_BLOCKS = 512n;
const BLOCK_FETCH_BATCH_SIZE = 8;

export type PublicEthActivityDirection = "in" | "out";

export type PublicEthActivity = {
  id: string;
  hash: Hash;
  blockNumber: bigint;
  transactionIndex: number;
  from: Address;
  to: Address | null;
  valueWei: bigint;
  amount: string;
  direction: PublicEthActivityDirection;
  timestamp: string;
};

export type PublicEthActivityScan = {
  address: Address;
  blockNumber: bigint;
  scannedFromBlock: bigint;
  scannedToBlock: bigint;
  items: PublicEthActivity[];
  syncedAt: string;
};

export type PublicEthActivityBlock = {
  number: bigint | null;
  timestamp: bigint;
  transactions: PublicEthActivityTransaction[];
};

export type PublicEthActivityTransaction = {
  hash: Hash;
  from: Address;
  to: Address | null;
  value: bigint;
  transactionIndex?: number | null;
};

const normalizeAddress = (address: string): Address => {
  const trimmedAddress = address.trim();

  if (!isAddress(trimmedAddress)) {
    throw new Error("Smart-wallet funding address is not a valid EVM address.");
  }

  return trimmedAddress as Address;
};

const sameAddress = (left: Address | null, right: Address): boolean =>
  left !== null && left.toLowerCase() === right.toLowerCase();

export const collectPublicEthTransfers = ({
  address,
  blocks,
  limit
}: {
  address: Address;
  blocks: PublicEthActivityBlock[];
  limit: number;
}): PublicEthActivity[] => {
  const items = blocks.flatMap((block) => {
    const blockNumber = block.number;

    if (blockNumber === null) {
      return [];
    }

    return block.transactions.flatMap((transaction) => {
      if (transaction.value <= 0n) {
        return [];
      }

      const incoming = sameAddress(transaction.to, address);
      const outgoing = sameAddress(transaction.from, address);

      if (!incoming && !outgoing) {
        return [];
      }

      const direction: PublicEthActivityDirection =
        incoming && !outgoing ? "in" : "out";

      return [
        {
          id: transaction.hash,
          hash: transaction.hash,
          blockNumber,
          transactionIndex: transaction.transactionIndex ?? 0,
          from: transaction.from,
          to: transaction.to,
          valueWei: transaction.value,
          amount: formatEthAmount(transaction.value),
          direction,
          timestamp: new Date(Number(block.timestamp) * 1000).toISOString()
        }
      ];
    });
  });

  return items
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber > right.blockNumber ? -1 : 1;
      }

      return right.transactionIndex - left.transactionIndex;
    })
    .slice(0, limit);
};

export const fetchPublicEthActivity = async ({
  latestBlockNumber,
  limit = 10,
  lookbackBlocks = DEFAULT_ACTIVITY_LOOKBACK_BLOCKS,
  policy,
  smartWalletAddress
}: {
  latestBlockNumber?: bigint;
  limit?: number;
  lookbackBlocks?: bigint;
  policy: ConnectionPolicy;
  smartWalletAddress: string;
}): Promise<PublicEthActivityScan> => {
  const address = normalizeAddress(smartWalletAddress);
  const client = await createVisibleMainnetClient(policy);
  const blockNumber = latestBlockNumber ?? (await client.getBlockNumber());
  const scannedFromBlock =
    blockNumber > lookbackBlocks ? blockNumber - lookbackBlocks : 0n;
  const discoveredItems: PublicEthActivity[] = [];

  for (
    let batchEnd = blockNumber;
    batchEnd >= scannedFromBlock && discoveredItems.length < limit;
    batchEnd -= BigInt(BLOCK_FETCH_BATCH_SIZE)
  ) {
    const batchStart =
      batchEnd - BigInt(BLOCK_FETCH_BATCH_SIZE - 1) > scannedFromBlock
        ? batchEnd - BigInt(BLOCK_FETCH_BATCH_SIZE - 1)
        : scannedFromBlock;
    const blockNumbers: bigint[] = [];

    for (
      let currentBlock = batchEnd;
      currentBlock >= batchStart;
      currentBlock -= 1n
    ) {
      blockNumbers.push(currentBlock);
    }

    const blocks = (
      await Promise.all(
        blockNumbers.map((currentBlock) =>
          client
            .getBlock({
              blockNumber: currentBlock,
              includeTransactions: true
            })
            .catch(() => null)
        )
      )
    ).filter((block): block is NonNullable<typeof block> => block !== null);
    const batchItems = collectPublicEthTransfers({
      address,
      blocks,
      limit
    });

    discoveredItems.push(...batchItems);
  }

  const items = discoveredItems
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber > right.blockNumber ? -1 : 1;
      }

      return right.transactionIndex - left.transactionIndex;
    })
    .slice(0, limit);

  return {
    address,
    blockNumber,
    scannedFromBlock,
    scannedToBlock: blockNumber,
    items,
    syncedAt: new Date().toISOString()
  };
};

export type SerializedPublicEthActivity = {
  id: string;
  hash: Hash;
  blockNumber: string;
  transactionIndex: number;
  from: Address;
  to: Address | null;
  valueWei: string;
  amount: string;
  direction: PublicEthActivityDirection;
  timestamp: string;
};

export const serializeActivityItem = (item: PublicEthActivity): SerializedPublicEthActivity => ({
  ...item,
  blockNumber: item.blockNumber.toString(),
  valueWei: item.valueWei.toString()
});

export const deserializeActivityItem = (item: SerializedPublicEthActivity): PublicEthActivity => ({
  ...item,
  blockNumber: BigInt(item.blockNumber),
  valueWei: BigInt(item.valueWei)
});

export const loadCachedPublicActivity = (smartWalletAddress: string): PublicEthActivity[] => {
  if (!smartWalletAddress) return [];
  try {
    const key = `bindle.activity.v1.${smartWalletAddress.toLowerCase()}`;
    const data = localStorage.getItem(key);
    if (!data) return [];
    const parsed = JSON.parse(data) as SerializedPublicEthActivity[];
    return parsed.map(deserializeActivityItem);
  } catch (error) {
    console.error("Failed to load cached public activity:", error);
    return [];
  }
};

export const saveCachedPublicActivity = (
  smartWalletAddress: string,
  items: PublicEthActivity[]
): void => {
  if (!smartWalletAddress) return;
  try {
    const key = `bindle.activity.v1.${smartWalletAddress.toLowerCase()}`;
    const serialized = items.map(serializeActivityItem);
    localStorage.setItem(key, JSON.stringify(serialized));
  } catch (error) {
    console.error("Failed to save cached public activity:", error);
  }
};

export const mergePublicActivity = (
  existing: PublicEthActivity[],
  newItems: PublicEthActivity[]
): PublicEthActivity[] => {
  const mergedMap = new Map<string, PublicEthActivity>();
  
  for (const item of existing) {
    mergedMap.set(item.id, item);
  }
  for (const item of newItems) {
    mergedMap.set(item.id, item);
  }
  
  return Array.from(mergedMap.values())
    .sort((left, right) => {
      if (left.blockNumber !== right.blockNumber) {
        return left.blockNumber > right.blockNumber ? -1 : 1;
      }
      return right.transactionIndex - left.transactionIndex;
    })
    .slice(0, 100);
};

