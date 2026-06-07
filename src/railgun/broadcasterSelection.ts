import { getAddress, type Address } from "viem";
import {
  scanWakuBroadcasterMap,
  type WakuBroadcasterMapSnapshot
} from "../debug/relayMap";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import {
  saveRailgunRelayRegistry,
  selectRailgunRelay,
  upsertRelaysFromWakuSnapshot,
  type RailgunRelayRegistry,
  type RegisteredRailgunRelay
} from "./relayRegistry";
import {
  ensureRailgunWakuBroadcasterTransport,
  resolveRailgunBroadcasterFeeTokenAddress,
  selectRailgunWakuBroadcaster,
  type SelectedRailgunBroadcaster
} from "./wakuBroadcaster";

export type FreshRailgunBroadcasterSelection = {
  selectedRelay: RegisteredRailgunRelay;
  selectedBroadcaster: SelectedRailgunBroadcaster;
  snapshot: WakuBroadcasterMapSnapshot;
  registry: RailgunRelayRegistry;
  source: "manual-fresh" | "auto-fresh";
};

type RefreshDependencies = {
  scanWakuBroadcasterMap?: (
    policy: ConnectionPolicy
  ) => Promise<WakuBroadcasterMapSnapshot>;
  selectBroadcaster?: (args: {
    policy: ConnectionPolicy;
    feeTokenAddress: Address;
    onStatus: (message: string) => void;
  }) => Promise<SelectedRailgunBroadcaster>;
};

const normalizeAddress = (value: string): string => getAddress(value).toLowerCase();

const feeExpirationIsFresh = (
  expiration: number | null | undefined,
  now = Date.now()
): boolean => {
  if (expiration === null || expiration === undefined) {
    return true;
  }

  if (!Number.isFinite(expiration) || expiration <= 0) {
    return false;
  }

  const normalizedExpiration =
    expiration < 10_000_000_000 ? expiration * 1_000 : expiration;

  return normalizedExpiration > now;
};

const relaySupportsFeeToken = ({
  feeTokenAddress,
  preferredFeeToken,
  relay
}: {
  feeTokenAddress: Address;
  preferredFeeToken: string;
  relay: Pick<RegisteredRailgunRelay, "feeTokenQuotes" | "supportedFeeTokens">;
}): boolean => {
  const normalizedPreferred = preferredFeeToken.trim().toLowerCase();
  const normalizedAddress = normalizeAddress(feeTokenAddress);

  return (
    relay.supportedFeeTokens.some(
      (token) => token.toLowerCase() === normalizedPreferred
    ) ||
    relay.feeTokenQuotes.some((quote) => {
      try {
        return normalizeAddress(quote.tokenAddress) === normalizedAddress;
      } catch {
        return false;
      }
    })
  );
};

const snapshotRelayId = (
  relay: WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number]
): string => relay.railgunAddress;

const relayFromFreshSnapshot = ({
  registry,
  snapshot,
  relayId
}: {
  registry: RailgunRelayRegistry;
  snapshot: WakuBroadcasterMapSnapshot;
  relayId: string;
}): RegisteredRailgunRelay | null => {
  const freshIds = new Set(
    snapshot.discoveredBroadcasters.map((relay) => snapshotRelayId(relay))
  );

  if (!freshIds.has(relayId)) {
    return null;
  }

  return registry.relays.find((relay) => relay.id === relayId) ?? null;
};

const freshRelayIsCompatible = ({
  feeTokenAddress,
  preferredFeeToken,
  relay,
  snapshot
}: {
  feeTokenAddress: Address;
  preferredFeeToken: string;
  relay: RegisteredRailgunRelay;
  snapshot: WakuBroadcasterMapSnapshot;
}): boolean => {
  const freshRelay = snapshot.discoveredBroadcasters.find(
    (candidate) => snapshotRelayId(candidate) === relay.id
  );

  if (!freshRelay) {
    return false;
  }

  if ((freshRelay.availableWallets ?? relay.availableWallets ?? 0) <= 0) {
    return false;
  }

  if (
    !relaySupportsFeeToken({
      feeTokenAddress,
      preferredFeeToken,
      relay
    })
  ) {
    return false;
  }

  return feeExpirationIsFresh(freshRelay.feeExpiration);
};

const selectedBroadcasterIsFresh = ({
  broadcaster,
  feeTokenAddress
}: {
  broadcaster: SelectedRailgunBroadcaster;
  feeTokenAddress: Address;
}): boolean =>
  normalizeAddress(broadcaster.tokenFee.token) === normalizeAddress(feeTokenAddress) &&
  broadcaster.tokenFee.availableWallets > 0 &&
  feeExpirationIsFresh(broadcaster.tokenFee.expiration);

const patchRegistryWithSelectedBroadcaster = ({
  feeTokenAddress,
  preferredFeeToken,
  registry,
  selectedBroadcaster
}: {
  feeTokenAddress: Address;
  preferredFeeToken: string;
  registry: RailgunRelayRegistry;
  selectedBroadcaster: SelectedRailgunBroadcaster;
}): RailgunRelayRegistry => {
  const now = new Date().toISOString();
  const relayId = selectedBroadcaster.railgunAddress;
  const existing = registry.relays.find((relay) => relay.id === relayId);
  const quote = {
    symbol: preferredFeeToken,
    tokenAddress: feeTokenAddress,
    feePerUnitGas: selectedBroadcaster.tokenFee.perUnitGas
  };
  const relays = [
    ...registry.relays.filter((relay) => relay.id !== relayId),
    {
      id: relayId,
      railgunAddress: selectedBroadcaster.railgunAddress,
      identifier: existing?.identifier ?? null,
      version: existing?.version ?? null,
      supportedFeeTokens: Array.from(
        new Set([...(existing?.supportedFeeTokens ?? []), preferredFeeToken])
      ).sort(),
      feeTokenQuotes: [
        ...(existing?.feeTokenQuotes.filter(
          (candidate) =>
            normalizeAddress(candidate.tokenAddress) !==
            normalizeAddress(feeTokenAddress)
        ) ?? []),
        quote
      ],
      feesId: selectedBroadcaster.tokenFee.feesID,
      availableWallets: selectedBroadcaster.tokenFee.availableWallets,
      advertisedReliability: selectedBroadcaster.tokenFee.reliability,
      signatureStatus: "kohaku-manager",
      selectionSource: "kohaku-manager" as const,
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      seenCount: existing?.seenCount ?? 1,
      selectedAt: existing?.selectedAt ?? null,
      selectedBy: existing?.selectedBy ?? null
    }
  ];

  return saveRailgunRelayRegistry({
    version: 1,
    selectedRelayId: registry.selectedRelayId,
    relays
  });
};

const defaultSelectBroadcaster = async ({
  policy,
  feeTokenAddress,
  onStatus
}: {
  policy: ConnectionPolicy;
  feeTokenAddress: Address;
  onStatus: (message: string) => void;
}): Promise<SelectedRailgunBroadcaster> => {
  const transport = await ensureRailgunWakuBroadcasterTransport({
    policy,
    onStatus
  });

  return selectRailgunWakuBroadcaster({
    manager: transport.manager,
    feeTokenAddress,
    onStatus
  });
};

export const refreshAndSelectRailgunBroadcasterForPrivateAction = async ({
  dependencies = {},
  manualRelayId,
  onStatus,
  policy,
  preferredFeeToken,
  registry
}: {
  policy: ConnectionPolicy;
  registry: RailgunRelayRegistry;
  preferredFeeToken: string;
  manualRelayId?: string | null;
  onStatus: (message: string) => void;
  dependencies?: RefreshDependencies;
}): Promise<FreshRailgunBroadcasterSelection> => {
  onStatus("Refreshing RAILGUN Waku broadcaster fee ads before private action.");
  const scan = dependencies.scanWakuBroadcasterMap ?? scanWakuBroadcasterMap;
  const selectBroadcaster =
    dependencies.selectBroadcaster ?? defaultSelectBroadcaster;
  const snapshot = await scan(policy);
  const feeTokenAddress = resolveRailgunBroadcasterFeeTokenAddress(policy);
  let updatedRegistry = upsertRelaysFromWakuSnapshot({
    preferredFeeToken,
    registry,
    snapshot
  });
  const manualRelay =
    manualRelayId && manualRelayId.trim()
      ? relayFromFreshSnapshot({
          registry: updatedRegistry,
          snapshot,
          relayId: manualRelayId
        })
      : null;
  const manualRelayCompatible = manualRelay
    ? freshRelayIsCompatible({
        feeTokenAddress,
        preferredFeeToken,
        relay: manualRelay,
        snapshot
      })
    : false;

  if (manualRelayId && !manualRelayCompatible) {
    onStatus(
      "Saved broadcaster was not advertising a fresh compatible fee. Bindle selected a fresh compatible relay."
    );
  }

  let selectedBroadcaster: SelectedRailgunBroadcaster;

  try {
    selectedBroadcaster = await selectBroadcaster({
      policy,
      feeTokenAddress,
      onStatus
    });
  } catch (error) {
    const hasRawDiagnostic = snapshot.discoveredBroadcasters.some(
      (relay) =>
        relay.selectionSource === "raw-fee-ad" &&
        (relay.availableWallets ?? 0) > 0 &&
        feeExpirationIsFresh(relay.feeExpiration) &&
        relay.supportedFeeTokens.some(
          (token) => token.toLowerCase() === preferredFeeToken.toLowerCase()
        )
    );

    if (hasRawDiagnostic) {
      throw new Error(
        "Fresh raw RAILGUN Waku fee ads were observed, but Bindle does not yet have a Kohaku-manager selectable broadcaster for live private submission. Raw fee ads remain diagnostic until they can produce a valid JsBroadcaster."
      );
    }

    throw error;
  }

  if (selectedBroadcaster.submitter !== "waku-railgun-broadcaster") {
    throw new Error(
      "Private RAILGUN actions require submitter = waku-railgun-broadcaster."
    );
  }

  if (
    !selectedBroadcasterIsFresh({
      broadcaster: selectedBroadcaster,
      feeTokenAddress
    })
  ) {
    throw new Error(
      "Selected RAILGUN Waku broadcaster did not advertise a fresh compatible fee with available wallets."
    );
  }

  updatedRegistry = patchRegistryWithSelectedBroadcaster({
    feeTokenAddress,
    preferredFeeToken,
    registry: updatedRegistry,
    selectedBroadcaster
  });

  const source =
    manualRelayCompatible &&
    manualRelay?.railgunAddress === selectedBroadcaster.railgunAddress
      ? "manual-fresh"
      : "auto-fresh";

  if (manualRelayId && source === "auto-fresh") {
    onStatus(
      "Saved broadcaster was not advertising a fresh compatible fee. Bindle selected a fresh compatible relay."
    );
  }

  updatedRegistry = selectRailgunRelay(
    updatedRegistry,
    selectedBroadcaster.railgunAddress,
    source === "manual-fresh" ? "manual" : "auto"
  );

  const selectedRelay = updatedRegistry.relays.find(
    (relay) => relay.id === selectedBroadcaster.railgunAddress
  );

  if (!selectedRelay) {
    throw new Error("Selected RAILGUN broadcaster was not saved in registry.");
  }

  onStatus(
    `Selected fresh RAILGUN Waku broadcaster ${selectedRelay.identifier ?? selectedRelay.railgunAddress}; fee ${selectedBroadcaster.tokenFee.perUnitGas} per gas in ${selectedBroadcaster.tokenFee.token}.`
  );

  return {
    selectedRelay,
    selectedBroadcaster,
    snapshot,
    registry: updatedRegistry,
    source
  };
};
