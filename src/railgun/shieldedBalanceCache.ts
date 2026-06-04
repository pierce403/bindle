import type { ShieldedEthBalance } from "./shieldedBalance";

type StoredShieldedEthBalance = {
  railgunAddress: string;
  wei: string;
  formattedEth: string;
  usd: string | null;
  blockNumber: string;
  syncedAt: string;
  rawBalanceCount: number;
  matchedWrappedBaseTokenBalances: number;
  price: {
    answer: string;
    decimals: number;
    updatedAt: string;
    source: "chainlink-eth-usd-via-rpc";
  } | null;
};

const storageKey = "bindle.railgun.shieldedBalanceCache.v1";

const canUseStorage = (): boolean =>
  typeof window !== "undefined" && "localStorage" in window;

const cacheKeyForRailgunAddress = (railgunAddress: string): string =>
  railgunAddress.trim().toLowerCase();

const isStoredShieldedEthBalance = (
  value: unknown
): value is StoredShieldedEthBalance => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const parsed = value as Partial<StoredShieldedEthBalance>;

  return (
    typeof parsed.railgunAddress === "string" &&
    typeof parsed.wei === "string" &&
    typeof parsed.formattedEth === "string" &&
    (typeof parsed.usd === "string" || parsed.usd === null) &&
    typeof parsed.blockNumber === "string" &&
    typeof parsed.syncedAt === "string" &&
    typeof parsed.rawBalanceCount === "number" &&
    typeof parsed.matchedWrappedBaseTokenBalances === "number" &&
    (parsed.price === null ||
      (typeof parsed.price === "object" &&
        typeof parsed.price.answer === "string" &&
        typeof parsed.price.decimals === "number" &&
        typeof parsed.price.updatedAt === "string" &&
        parsed.price.source === "chainlink-eth-usd-via-rpc"))
  );
};

const loadCacheMap = (): Record<string, unknown> => {
  if (!canUseStorage()) {
    return {};
  }

  const stored = window.localStorage.getItem(storageKey);
  if (!stored) {
    return {};
  }

  try {
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

const saveCacheMap = (cache: Record<string, StoredShieldedEthBalance>): void => {
  if (!canUseStorage()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(cache));
};

const loadTypedCacheMap = (): Record<string, StoredShieldedEthBalance> => {
  const cache: Record<string, StoredShieldedEthBalance> = {};

  for (const [key, value] of Object.entries(loadCacheMap())) {
    if (isStoredShieldedEthBalance(value)) {
      cache[key] = value;
    }
  }

  return cache;
};

const deserializeBalance = (
  stored: StoredShieldedEthBalance
): ShieldedEthBalance | null => {
  try {
    return {
      railgunAddress: stored.railgunAddress,
      wei: BigInt(stored.wei),
      formattedEth: stored.formattedEth,
      usd: stored.usd,
      blockNumber: BigInt(stored.blockNumber),
      syncedAt: stored.syncedAt,
      rawBalanceCount: stored.rawBalanceCount,
      matchedWrappedBaseTokenBalances:
        stored.matchedWrappedBaseTokenBalances,
      price: stored.price
        ? {
            answer: BigInt(stored.price.answer),
            decimals: stored.price.decimals,
            updatedAt: BigInt(stored.price.updatedAt),
            source: stored.price.source
          }
        : null
    };
  } catch {
    return null;
  }
};

const serializeBalance = (
  balance: ShieldedEthBalance
): StoredShieldedEthBalance => ({
  railgunAddress: balance.railgunAddress,
  wei: balance.wei.toString(),
  formattedEth: balance.formattedEth,
  usd: balance.usd,
  blockNumber: balance.blockNumber.toString(),
  syncedAt: balance.syncedAt,
  rawBalanceCount: balance.rawBalanceCount,
  matchedWrappedBaseTokenBalances:
    balance.matchedWrappedBaseTokenBalances,
  price: balance.price
    ? {
        answer: balance.price.answer.toString(),
        decimals: balance.price.decimals,
        updatedAt: balance.price.updatedAt.toString(),
        source: balance.price.source
      }
    : null
});

export const loadCachedShieldedEthBalance = (
  railgunAddress: string
): ShieldedEthBalance | null => {
  const cached = loadCacheMap()[cacheKeyForRailgunAddress(railgunAddress)];

  if (!isStoredShieldedEthBalance(cached)) {
    return null;
  }

  return deserializeBalance(cached);
};

export const saveCachedShieldedEthBalance = (
  balance: ShieldedEthBalance
): void => {
  const cache = loadTypedCacheMap();

  // Storage boundary: this localStorage record stores only the last displayable
  // shielded ETH balance for the local 0zk address. It does not store RAILGUN
  // spending keys, viewing keys, mnemonics, proofs, notes, transaction history,
  // or endpoint credentials. It does reveal the last known shielded amount to
  // this browser profile, which is the explicit tradeoff that lets Bindle paint
  // the balance immediately while the slow shielded sync refreshes in the
  // background.
  saveCacheMap({
    ...cache,
    [cacheKeyForRailgunAddress(balance.railgunAddress)]:
      serializeBalance(balance)
  });
};

export const clearCachedShieldedEthBalance = (
  railgunAddress?: string | null
): void => {
  if (!canUseStorage()) {
    return;
  }

  if (!railgunAddress) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  const cache = loadTypedCacheMap();
  delete cache[cacheKeyForRailgunAddress(railgunAddress)];
  saveCacheMap(cache);
};
