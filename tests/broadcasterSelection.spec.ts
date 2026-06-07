import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import type { WakuBroadcasterMapSnapshot } from "../src/debug/relayMap";
import { UNISWAP_V4_WETH_ADDRESS } from "../src/intents/uniswapV4PayRoute";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { submitPayIntent } from "../src/railgun/broadcaster";
import { refreshAndSelectRailgunBroadcasterForPrivateAction } from "../src/railgun/broadcasterSelection";
import {
  selectRailgunRelay,
  upsertRelaysFromWakuSnapshot,
  type RailgunRelayRegistry
} from "../src/railgun/relayRegistry";
import type { SelectedRailgunBroadcaster } from "../src/railgun/wakuBroadcaster";

const futureExpiration = () => Date.now() + 120_000;

const emptyRegistry = (): RailgunRelayRegistry => ({
  version: 1,
  selectedRelayId: null,
  relays: []
});

const snapshotWithRelays = (
  relays: WakuBroadcasterMapSnapshot["discoveredBroadcasters"]
): WakuBroadcasterMapSnapshot => ({
  createdAt: new Date().toISOString(),
  chainId: 1,
  network: "ethereum-mainnet",
  status: relays.length > 0 ? "partial" : "no-broadcasters",
  elapsedMs: 120,
  transport: "kohaku-waku",
  pubsubTopic: "/waku/2/rs/5/1",
  wakuPeerCount: 3,
  requiredProtocols: {
    filter: "ready",
    lightPush: "ready",
    store: "ready"
  },
  rawFeeMessagesObserved: relays.length,
  rawFeeAdsParsed: relays.length,
  kohakuManagerSelections: relays.filter(
    (relay) => relay.selectionSource === "kohaku-manager"
  ).length,
  feeTokens: [],
  discoveredBroadcasters: relays,
  notes: [],
  error: null
});

const relay = ({
  address,
  availableWallets = 2,
  expiration = futureExpiration(),
  source = "kohaku-manager"
}: {
  address: `0zk${string}`;
  availableWallets?: number;
  expiration?: number;
  source?: "kohaku-manager" | "raw-fee-ad";
}): WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number] => ({
  railgunAddress: address,
  supportedFeeTokens: ["WETH"],
  feeTokenQuotes: [
    {
      symbol: "WETH",
      tokenAddress: UNISWAP_V4_WETH_ADDRESS,
      feePerUnitGas: "42"
    }
  ],
  feesId: `fees-${address}`,
  identifier: address,
  availableWallets,
  feeExpiration: expiration,
  reliability: address.endsWith("manual") ? 90 : 99,
  selectionSource: source,
  signatureStatus:
    source === "kohaku-manager" ? "kohaku-manager" : "unverified-no-wallet-sdk"
});

const selectedBroadcaster = ({
  address,
  availableWallets = 2,
  expiration = futureExpiration()
}: {
  address: `0zk${string}`;
  availableWallets?: number;
  expiration?: number;
}): SelectedRailgunBroadcaster => ({
  submitter: "waku-railgun-broadcaster",
  address: "0x1111111111111111111111111111111111111111",
  railgunAddress: address,
  tokenFee: {
    feesID: `fees-${address}`,
    token: UNISWAP_V4_WETH_ADDRESS as Address,
    perUnitGas: "42",
    recipient: address,
    expiration,
    availableWallets,
    relayAdapt: "0x2222222222222222222222222222222222222222",
    reliability: 99
  },
  raw: {} as SelectedRailgunBroadcaster["raw"]
});

test("saved broadcaster is not used for private submit without fresh Waku re-check", async () => {
  const staleRegistry = selectRailgunRelay(
    upsertRelaysFromWakuSnapshot({
      preferredFeeToken: "WETH",
      registry: emptyRegistry(),
      snapshot: snapshotWithRelays([relay({ address: "0zk1stale" })])
    }),
    "0zk1stale"
  );
  const order: string[] = [];

  const selection = await refreshAndSelectRailgunBroadcasterForPrivateAction({
    policy: defaultConnectionPolicy,
    registry: staleRegistry,
    preferredFeeToken: "WETH",
    manualRelayId: "0zk1stale",
    onStatus: () => undefined,
    dependencies: {
      scanWakuBroadcasterMap: async () => {
        order.push("scan");
        return snapshotWithRelays([relay({ address: "0zk1fresh" })]);
      },
      selectBroadcaster: async () => {
        order.push("select");
        return selectedBroadcaster({ address: "0zk1fresh" });
      }
    }
  });

  expect(order).toEqual(["scan", "select"]);
  expect(selection.source).toBe("auto-fresh");
  expect(selection.selectedRelay.railgunAddress).toBe("0zk1fresh");
  expect(selection.registry.selectedRelayId).toBe("0zk1fresh");
});

test("manual selected broadcaster is reused only when fresh and compatible", async () => {
  const initial = upsertRelaysFromWakuSnapshot({
    preferredFeeToken: "WETH",
    registry: emptyRegistry(),
    snapshot: snapshotWithRelays([relay({ address: "0zk1manual" })])
  });
  const manualRegistry = selectRailgunRelay(initial, "0zk1manual");

  const selection = await refreshAndSelectRailgunBroadcasterForPrivateAction({
    policy: defaultConnectionPolicy,
    registry: manualRegistry,
    preferredFeeToken: "WETH",
    manualRelayId: "0zk1manual",
    onStatus: () => undefined,
    dependencies: {
      scanWakuBroadcasterMap: async () =>
        snapshotWithRelays([relay({ address: "0zk1manual" })]),
      selectBroadcaster: async () =>
        selectedBroadcaster({ address: "0zk1manual" })
    }
  });

  expect(selection.source).toBe("manual-fresh");
  expect(selection.selectedRelay.selectedBy).toBe("manual");
});

test("stale manual broadcaster falls back to fresh auto-selection", async () => {
  const initial = upsertRelaysFromWakuSnapshot({
    preferredFeeToken: "WETH",
    registry: emptyRegistry(),
    snapshot: snapshotWithRelays([relay({ address: "0zk1manual" })])
  });
  const manualRegistry = selectRailgunRelay(initial, "0zk1manual");
  const statuses: string[] = [];

  const selection = await refreshAndSelectRailgunBroadcasterForPrivateAction({
    policy: defaultConnectionPolicy,
    registry: manualRegistry,
    preferredFeeToken: "WETH",
    manualRelayId: "0zk1manual",
    onStatus: (message) => statuses.push(message),
    dependencies: {
      scanWakuBroadcasterMap: async () =>
        snapshotWithRelays([relay({ address: "0zk1auto" })]),
      selectBroadcaster: async () => selectedBroadcaster({ address: "0zk1auto" })
    }
  });

  expect(selection.source).toBe("auto-fresh");
  expect(selection.selectedRelay.selectedBy).toBe("auto");
  expect(statuses.join("\n")).toMatch(/Saved broadcaster was not advertising/i);
});

test("raw-fee-ad-only candidate stays diagnostic for live private submit", async () => {
  await expect(
    refreshAndSelectRailgunBroadcasterForPrivateAction({
      policy: defaultConnectionPolicy,
      registry: emptyRegistry(),
      preferredFeeToken: "WETH",
      onStatus: () => undefined,
      dependencies: {
        scanWakuBroadcasterMap: async () =>
          snapshotWithRelays([
            relay({ address: "0zk1rawonly", source: "raw-fee-ad" })
          ]),
        selectBroadcaster: async () => {
          throw new Error("No selectable JsBroadcaster");
        }
      }
    })
  ).rejects.toThrow(/Raw fee ads remain diagnostic/i);
});

test("fresh selector rejects unavailable or expired broadcaster fees", async () => {
  await expect(
    refreshAndSelectRailgunBroadcasterForPrivateAction({
      policy: defaultConnectionPolicy,
      registry: emptyRegistry(),
      preferredFeeToken: "WETH",
      onStatus: () => undefined,
      dependencies: {
        scanWakuBroadcasterMap: async () =>
          snapshotWithRelays([
            relay({ address: "0zk1empty", availableWallets: 0 })
          ]),
        selectBroadcaster: async () =>
          selectedBroadcaster({ address: "0zk1empty", availableWallets: 0 })
      }
    })
  ).rejects.toThrow(/fresh compatible fee with available wallets/i);

  await expect(
    refreshAndSelectRailgunBroadcasterForPrivateAction({
      policy: defaultConnectionPolicy,
      registry: emptyRegistry(),
      preferredFeeToken: "WETH",
      onStatus: () => undefined,
      dependencies: {
        scanWakuBroadcasterMap: async () =>
          snapshotWithRelays([
            relay({ address: "0zk1expired", expiration: Date.now() - 1_000 })
          ]),
        selectBroadcaster: async () =>
          selectedBroadcaster({
            address: "0zk1expired",
            expiration: Date.now() - 1_000
          })
      }
    })
  ).rejects.toThrow(/fresh compatible fee with available wallets/i);
});

test("Private Pay readiness calls fresh selector before final blockers", () => {
  const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
  const helperSource = readFileSync(
    resolve("src/railgun/broadcasterSelection.ts"),
    "utf8"
  );
  const submitPayStart = appSource.indexOf("const submitPay = async () =>");
  const submitPayEnd = appSource.indexOf("const submitShield = async", submitPayStart);
  const submitPaySource = appSource.slice(submitPayStart, submitPayEnd);

  expect(submitPayStart).toBeGreaterThan(-1);
  expect(submitPaySource).toContain(
    "refreshAndSelectRailgunBroadcasterForPrivateAction"
  );
  expect(submitPaySource.indexOf("refreshAndSelectRailgunBroadcasterForPrivateAction")).toBeLessThan(
    submitPaySource.indexOf("Kohaku proved private operation not built yet")
  );
  expect(submitPaySource).not.toContain("sendSmartWalletCalls");
  expect(submitPaySource).not.toContain("pimlico");
  expect(submitPaySource).not.toContain("paymaster");
  expect(helperSource).not.toContain("sendSmartWalletCalls");
  expect(helperSource).not.toContain("pimlico");
  expect(helperSource).not.toContain("paymaster");
});

test("Private Pay final submit requires fresh broadcaster selection metadata", async () => {
  await expect(
    submitPayIntent({
      policy: defaultConnectionPolicy,
      intent: {
        kind: "pay",
        source: "railgun-private",
        legs: [],
        recipient: "0x000000000000000000000000000000000000dEaD",
        amount: "5",
        preparedPay: {
          railgunAdapter: "kohaku-railgun",
          submissionMode: "disabled-pending-kohaku-broadcaster",
          railgunAddress: "0zk1local",
          privateOperation: {
            submitter: "waku-railgun-broadcaster",
            chain: "ethereum-mainnet",
            provedTx: {},
            broadcaster: {
              raw: {},
              address: "0x1111111111111111111111111111111111111111",
              railgunAddress: "0zk1fresh",
              tokenFee: {
                feesID: "fees-0zk1fresh"
              }
            }
          } as never
        }
      }
    })
  ).rejects.toThrow(/fresh RAILGUN Waku broadcaster/i);
});

test("Private Pay final submit rejects broadcaster mismatch after preflight", async () => {
  const freshSelection = {
    selectedRelay: {
      id: "0zk1fresh",
      railgunAddress: "0zk1fresh"
    },
    selectedBroadcaster: selectedBroadcaster({ address: "0zk1fresh" }),
    snapshot: snapshotWithRelays([relay({ address: "0zk1fresh" })]),
    registry: emptyRegistry(),
    source: "auto-fresh"
  };

  await expect(
    submitPayIntent({
      policy: defaultConnectionPolicy,
      intent: {
        kind: "pay",
        source: "railgun-private",
        legs: [],
        recipient: "0x000000000000000000000000000000000000dEaD",
        amount: "5",
        preparedPay: {
          railgunAdapter: "kohaku-railgun",
          submissionMode: "disabled-pending-kohaku-broadcaster",
          railgunAddress: "0zk1local",
          freshBroadcasterSelection: freshSelection as never,
          privateOperation: {
            submitter: "waku-railgun-broadcaster",
            chain: "ethereum-mainnet",
            provedTx: {},
            broadcaster: {
              raw: {},
              address: "0x1111111111111111111111111111111111111111",
              railgunAddress: "0zk1other",
              tokenFee: {
                feesID: "fees-0zk1other"
              }
            }
          } as never
        }
      }
    })
  ).rejects.toThrow(/does not match the fresh preflight-selected broadcaster/i);
});
