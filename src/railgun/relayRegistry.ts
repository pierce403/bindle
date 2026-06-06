import type { WakuBroadcasterMapSnapshot } from "../debug/relayMap";

export type RegisteredRailgunRelay = {
  id: string;
  railgunAddress: string;
  identifier: string | null;
  version: string | null;
  supportedFeeTokens: string[];
  feeTokenQuotes: Array<{
    symbol: string;
    tokenAddress: string;
    feePerUnitGas: string;
  }>;
  feesId: string | null;
  availableWallets: number | null;
  advertisedReliability: number | null;
  signatureStatus: string | null;
  selectionSource: "kohaku-manager" | "raw-fee-ad" | null;
  firstSeenAt: string;
  lastSeenAt: string;
  seenCount: number;
  selectedAt: string | null;
};

export type RailgunRelayRegistry = {
  version: 1;
  selectedRelayId: string | null;
  relays: RegisteredRailgunRelay[];
};

const storageKey = "bindle.railgun.relayRegistry.v1";
const maxStoredRelays = 50;

const emptyRegistry = (): RailgunRelayRegistry => ({
  version: 1,
  selectedRelayId: null,
  relays: []
});

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === "string" && value.length > 0 ? value : null;

const numberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const normalizeQuote = (value: unknown): RegisteredRailgunRelay["feeTokenQuotes"][number] | null => {
  if (!isRecord(value)) {
    return null;
  }

  const symbol = stringOrNull(value.symbol);
  const tokenAddress = stringOrNull(value.tokenAddress);
  const feePerUnitGas = stringOrNull(value.feePerUnitGas);

  if (!symbol || !tokenAddress || !feePerUnitGas) {
    return null;
  }

  return {
    symbol,
    tokenAddress,
    feePerUnitGas
  };
};

const normalizeRelay = (value: unknown): RegisteredRailgunRelay | null => {
  if (!isRecord(value)) {
    return null;
  }

  const id = stringOrNull(value.id);
  const railgunAddress = stringOrNull(value.railgunAddress);
  const firstSeenAt = stringOrNull(value.firstSeenAt);
  const lastSeenAt = stringOrNull(value.lastSeenAt);

  if (!id || !railgunAddress || !firstSeenAt || !lastSeenAt) {
    return null;
  }

  return {
    id,
    railgunAddress,
    identifier: stringOrNull(value.identifier),
    version: stringOrNull(value.version),
    supportedFeeTokens: stringArray(value.supportedFeeTokens),
    feeTokenQuotes: Array.isArray(value.feeTokenQuotes)
      ? value.feeTokenQuotes
          .map(normalizeQuote)
          .filter(
            (
              quote
            ): quote is RegisteredRailgunRelay["feeTokenQuotes"][number] =>
              quote !== null
          )
      : [],
    feesId: stringOrNull(value.feesId),
    availableWallets: numberOrNull(value.availableWallets),
    advertisedReliability: numberOrNull(value.advertisedReliability),
    signatureStatus: stringOrNull(value.signatureStatus),
    selectionSource:
      value.selectionSource === "kohaku-manager" ||
      value.selectionSource === "raw-fee-ad"
        ? value.selectionSource
        : null,
    firstSeenAt,
    lastSeenAt,
    seenCount: numberOrNull(value.seenCount) ?? 1,
    selectedAt: stringOrNull(value.selectedAt)
  };
};

const normalizeRegistry = (value: unknown): RailgunRelayRegistry => {
  if (!isRecord(value)) {
    return emptyRegistry();
  }

  const relays = Array.isArray(value.relays)
    ? value.relays.map(normalizeRelay).filter((relay): relay is RegisteredRailgunRelay => relay !== null)
    : [];
  const selectedRelayId = stringOrNull(value.selectedRelayId);

  return {
    version: 1,
    selectedRelayId: relays.some((relay) => relay.id === selectedRelayId)
      ? selectedRelayId
      : null,
    relays
  };
};

export const loadRailgunRelayRegistry = (): RailgunRelayRegistry => {
  if (!canUseStorage()) {
    return emptyRegistry();
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return emptyRegistry();
  }

  try {
    return normalizeRegistry(JSON.parse(stored));
  } catch {
    return emptyRegistry();
  }
};

export const saveRailgunRelayRegistry = (
  registry: RailgunRelayRegistry
): RailgunRelayRegistry => {
  const normalized = normalizeRegistry(registry);

  if (canUseStorage()) {
    // Storage boundary: this is non-secret Waku relay observation metadata only.
    // It contains broadcaster public identifiers, advertised fees, and local
    // selection state. It must not contain a user 0zk address, proofs, tx data,
    // passkeys, mnemonics, or endpoint credentials.
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  }

  return normalized;
};

export const clearRailgunRelayRegistry = (): RailgunRelayRegistry => {
  if (canUseStorage()) {
    window.localStorage.removeItem(storageKey);
  }

  return emptyRegistry();
};

const relayIdForAddress = (railgunAddress: string): string => railgunAddress;

const mergeUnique = (left: string[], right: string[]): string[] =>
  Array.from(new Set([...left, ...right])).sort();

const mergeQuotes = (
  left: RegisteredRailgunRelay["feeTokenQuotes"],
  right: RegisteredRailgunRelay["feeTokenQuotes"]
): RegisteredRailgunRelay["feeTokenQuotes"] => {
  const byToken = new Map<string, RegisteredRailgunRelay["feeTokenQuotes"][number]>();

  for (const quote of [...left, ...right]) {
    byToken.set(quote.tokenAddress.toLowerCase(), quote);
  }

  return Array.from(byToken.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
};

const relaySupportsPreferredToken = (
  relay: RegisteredRailgunRelay,
  preferredFeeToken: string
): boolean =>
  relay.supportedFeeTokens.some(
    (token) => token.toLowerCase() === preferredFeeToken.toLowerCase()
  );

const relayIsCompatible = (
  relay: RegisteredRailgunRelay,
  preferredFeeToken: string
): boolean =>
  relay.availableWallets !== null &&
  relay.availableWallets > 0 &&
  relaySupportsPreferredToken(relay, preferredFeeToken);

const compareRelays = (
  preferredFeeToken: string,
  left: RegisteredRailgunRelay,
  right: RegisteredRailgunRelay
): number => {
  const leftCompatible = relayIsCompatible(left, preferredFeeToken);
  const rightCompatible = relayIsCompatible(right, preferredFeeToken);

  if (leftCompatible !== rightCompatible) {
    return leftCompatible ? -1 : 1;
  }

  if (left.selectionSource !== right.selectionSource) {
    return left.selectionSource === "kohaku-manager" ? -1 : 1;
  }

  const reliabilityDelta =
    (right.advertisedReliability ?? 0) - (left.advertisedReliability ?? 0);

  if (reliabilityDelta !== 0) {
    return reliabilityDelta;
  }

  return right.seenCount - left.seenCount;
};

export const upsertRelaysFromWakuSnapshot = ({
  preferredFeeToken,
  registry,
  snapshot
}: {
  preferredFeeToken: string;
  registry: RailgunRelayRegistry;
  snapshot: WakuBroadcasterMapSnapshot;
}): RailgunRelayRegistry => {
  const now = new Date().toISOString();
  const byId = new Map<string, RegisteredRailgunRelay>(
    registry.relays.map((relay) => [relay.id, relay])
  );

  for (const relay of snapshot.discoveredBroadcasters) {
    const id = relayIdForAddress(relay.railgunAddress);
    const existing = byId.get(id);
    const observed: RegisteredRailgunRelay = {
      id,
      railgunAddress: relay.railgunAddress,
      identifier: relay.identifier ?? null,
      version: relay.version ?? null,
      supportedFeeTokens: relay.supportedFeeTokens,
      feeTokenQuotes: relay.feeTokenQuotes ?? [],
      feesId: relay.feesId ?? null,
      availableWallets: relay.availableWallets ?? null,
      advertisedReliability: relay.reliability ?? null,
      signatureStatus: relay.signatureStatus ?? null,
      selectionSource: relay.selectionSource ?? null,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      seenCount: (existing?.seenCount ?? 0) + 1,
      selectedAt: existing?.selectedAt ?? null
    };

    byId.set(
      id,
      existing
        ? {
            ...observed,
            supportedFeeTokens: mergeUnique(
              existing.supportedFeeTokens,
              observed.supportedFeeTokens
            ),
            feeTokenQuotes: mergeQuotes(
              existing.feeTokenQuotes,
              observed.feeTokenQuotes
            ),
            advertisedReliability: Math.max(
              existing.advertisedReliability ?? 0,
              observed.advertisedReliability ?? 0
            ),
            seenCount: existing.seenCount + 1
          }
        : observed
    );
  }

  const relays = Array.from(byId.values())
    .sort((left, right) => compareRelays(preferredFeeToken, left, right))
    .slice(0, maxStoredRelays);
  const selectedRelayStillAvailable = relays.some(
    (relay) => relay.id === registry.selectedRelayId
  );
  const selectedRelayId = selectedRelayStillAvailable
    ? registry.selectedRelayId
    : relays.find((relay) => relayIsCompatible(relay, preferredFeeToken))?.id ??
      registry.selectedRelayId;

  return saveRailgunRelayRegistry({
    version: 1,
    selectedRelayId,
    relays: relays.map((relay) =>
      relay.id === selectedRelayId && relay.selectedAt === null
        ? { ...relay, selectedAt: now }
        : relay
    )
  });
};

export const selectRailgunRelay = (
  registry: RailgunRelayRegistry,
  relayId: string | null
): RailgunRelayRegistry =>
  saveRailgunRelayRegistry({
    version: 1,
    selectedRelayId: relayId,
    relays: registry.relays.map((relay) =>
      relay.id === relayId
        ? { ...relay, selectedAt: new Date().toISOString() }
        : relay
    )
  });

export const selectedRailgunRelay = (
  registry: RailgunRelayRegistry
): RegisteredRailgunRelay | null =>
  registry.relays.find((relay) => relay.id === registry.selectedRelayId) ?? null;
