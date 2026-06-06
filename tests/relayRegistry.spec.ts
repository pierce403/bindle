import { expect, test } from "@playwright/test";
import type { WakuBroadcasterMapSnapshot } from "../src/debug/relayMap";
import {
  selectRailgunRelay,
  selectedRailgunRelay,
  upsertRelaysFromWakuSnapshot
} from "../src/railgun/relayRegistry";

const snapshot = {
  createdAt: "2026-06-06T00:00:00.000Z",
  chainId: 1,
  network: "ethereum-mainnet",
  status: "partial",
  elapsedMs: 100,
  transport: "kohaku-waku",
  pubsubTopic: "/waku/2/rs/5/1",
  wakuPeerCount: 3,
  requiredProtocols: {
    filter: "ready",
    lightPush: "ready",
    store: "ready"
  },
  rawFeeMessagesObserved: 2,
  rawFeeAdsParsed: 2,
  kohakuManagerSelections: 0,
  feeTokens: [],
  discoveredBroadcasters: [
    {
      railgunAddress: "0zk1relayweth",
      supportedFeeTokens: ["WETH"],
      feeTokenQuotes: [
        {
          symbol: "WETH",
          tokenAddress: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
          feePerUnitGas: "10"
        }
      ],
      feesId: "fees-weth",
      identifier: "weth relay",
      version: "8.2.0",
      availableWallets: 2,
      reliability: 0.91,
      selectionSource: "raw-fee-ad",
      signatureStatus: "unverified-no-wallet-sdk"
    },
    {
      railgunAddress: "0zk1relayusdc",
      supportedFeeTokens: ["USDC"],
      feeTokenQuotes: [
        {
          symbol: "USDC",
          tokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
          feePerUnitGas: "12"
        }
      ],
      feesId: "fees-usdc",
      identifier: "usdc relay",
      version: "8.2.0",
      availableWallets: 4,
      reliability: 0.99,
      selectionSource: "raw-fee-ad",
      signatureStatus: "unverified-no-wallet-sdk"
    }
  ],
  notes: [],
  error: null
} satisfies WakuBroadcasterMapSnapshot;

test("relay registry auto-selects the first compatible preferred token relay", () => {
  const registry = upsertRelaysFromWakuSnapshot({
    preferredFeeToken: "WETH",
    registry: {
      version: 1,
      selectedRelayId: null,
      relays: []
    },
    snapshot
  });
  const selected = selectedRailgunRelay(registry);

  expect(selected?.railgunAddress).toBe("0zk1relayweth");
  expect(selected?.supportedFeeTokens).toEqual(["WETH"]);
  expect(selected?.advertisedReliability).toBe(0.91);
});

test("relay registry preserves manual relay selection across new observations", () => {
  const first = upsertRelaysFromWakuSnapshot({
    preferredFeeToken: "WETH",
    registry: {
      version: 1,
      selectedRelayId: null,
      relays: []
    },
    snapshot
  });
  const manuallySelected = selectRailgunRelay(first, "0zk1relayusdc");
  const second = upsertRelaysFromWakuSnapshot({
    preferredFeeToken: "WETH",
    registry: manuallySelected,
    snapshot
  });

  expect(selectedRailgunRelay(second)?.railgunAddress).toBe("0zk1relayusdc");
  expect(second.relays.find((relay) => relay.id === "0zk1relayweth")?.seenCount).toBe(
    2
  );
});
