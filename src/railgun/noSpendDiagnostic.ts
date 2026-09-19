import type { Database, Eip1193Provider } from "@kohaku-eth/railgun";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createKohakuIndexedDbDatabase } from "../privacy/storage/kohakuDatabase";
import { loadKohakuRailgunBrowserModule } from "./kohakuRailgunModule";
import { deriveRailgunKeys, canonicalRailgunDerivation, type RailgunDerivationVersion } from "./railgunDerivation";
import { getKohakuPrivateCapabilities } from "./privateTransactionBridge";
import {
  createPolicyDnsClient,
  RailgunBroadcasterTransport,
  type BroadcasterSnapshot,
  type SelectedRailgunBroadcaster
} from "./broadcasterTransport";
import { resolveRailgunBroadcasterFeeTokenAddress } from "./wakuBroadcaster";

export type DiagnosticStatus = { status: string; detail: string };
export type NoSpendDiagnosticReport = {
  schemaVersion: 1;
  startedAt: string;
  completedAt: string;
  mode: "local" | "live";
  policy: {
    pubsubTopic: string;
    dnsEnabled: boolean;
    enrTrees: string[];
    dnsResolvers: string[];
    directPeers: string[];
    feeToken: string;
    activePoiListKeys: string[];
  };
  kohaku: DiagnosticStatus;
  walletIndependentInitialization: DiagnosticStatus;
  indexedDb: DiagnosticStatus;
  utxoSync: DiagnosticStatus;
  nativeEthShieldConstruction: DiagnosticStatus;
  derivationCompatibility: DiagnosticStatus;
  proofApi: DiagnosticStatus;
  poiApi: DiagnosticStatus;
  transactionBridge: DiagnosticStatus;
  submissionPayload: DiagnosticStatus;
  waku: DiagnosticStatus;
  wakuProtocols: DiagnosticStatus;
  dnsDiscovery: DiagnosticStatus;
  directPeers: DiagnosticStatus;
  feeQuotes: DiagnosticStatus;
  broadcasterSelection: DiagnosticStatus;
  broadcastersFound: number;
  compatibleBroadcasters: number;
  compatibleFeeQuotes: number;
  peerConnections: Array<{ peerId: string; remoteAddress: string }>;
  snapshot: BroadcasterSnapshot | null;
  selected: SelectedRailgunBroadcaster | null;
  capabilities: ReturnType<typeof getKohakuPrivateCapabilities>;
  liveSubmission: "intentionally-not-attempted";
  errors: string[];
  localChecksPassed: boolean;
};

type PublicDerivationFixture = {
  recoveryPhrase: string;
  keyIndex: number;
  derivationVersion: RailgunDerivationVersion;
  expectedAddress: string;
};

const message = (error: unknown): string => {
  if (error instanceof AggregateError) {
    return `${error.message}: ${error.errors.map((cause: unknown) => message(cause)).join("; ")}`;
  }
  return error instanceof Error ? error.message : String(error);
};
const state = (status: string, detail: string): DiagnosticStatus => ({ status, detail });

const withDeadline = async <T>(operation: Promise<T>, milliseconds: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${milliseconds}ms.`)), milliseconds);
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
};

/** Runs in an isolated, ephemeral browser opened by scan-railgun.mjs. This
 * module deliberately has no wallet-state/secret-store, smart-wallet, bundler,
 * paymaster, broadcast, proof-generation, or live provider synchronization calls.
 * The empty UTXO sync uses a controlled provider whose network methods are sentinels.
 */
export const runNoSpendRailgunDiagnostic = async ({
  policy,
  localOnly = false,
  timeoutMs = 60_000,
  publicDerivationFixtures = [],
  onStatus = () => undefined
}: {
  policy: ConnectionPolicy;
  localOnly?: boolean;
  timeoutMs?: number;
  publicDerivationFixtures?: readonly PublicDerivationFixture[];
  onStatus?: (value: string) => void;
}): Promise<NoSpendDiagnosticReport> => {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) {
    throw new Error("Diagnostic timeout must be 1000-600000 milliseconds.");
  }
  const capabilities = getKohakuPrivateCapabilities();
  const pending = state("not-attempted", "This check has not run.");
  const report: NoSpendDiagnosticReport = {
    schemaVersion: 1,
    startedAt: new Date().toISOString(),
    completedAt: "",
    mode: localOnly ? "local" : "live",
    policy: {
      pubsubTopic: policy.railgunBroadcasterPubSubTopic,
      dnsEnabled: policy.railgunBroadcasterDnsDiscoveryEnabled,
      enrTrees: [...policy.railgunBroadcasterDnsDiscoveryUrls],
      dnsResolvers: [...policy.railgunBroadcasterDnsResolverUrls],
      directPeers: [...policy.railgunBroadcasterDirectPeers],
      feeToken: resolveRailgunBroadcasterFeeTokenAddress(policy),
      activePoiListKeys: [...policy.railgunPoiListKeys]
    },
    kohaku: pending,
    walletIndependentInitialization: pending,
    indexedDb: pending,
    utxoSync: pending,
    nativeEthShieldConstruction: pending,
    derivationCompatibility: pending,
    proofApi: state("not-tested", "No notes are loaded and no proof generation is attempted."),
    poiApi: state("blocked", capabilities.blockers[0]),
    transactionBridge: state("public-fields-only", "Mainnet transact ABI decoder preserves target, calldata, nullifiers and proof-bound parameters; required pre-POI and fee-output binding are unavailable."),
    submissionPayload: state("blocked", "No real broadcaster payload can be constructed without pre-transaction POI and a verified private fee output. Deterministic fixture tests cover serialization separately."),
    waku: pending,
    wakuProtocols: pending,
    dnsDiscovery: pending,
    directPeers: policy.railgunBroadcasterDirectPeers.length
      ? pending
      : state("not-configured", "No direct fallback peers were configured."),
    feeQuotes: pending,
    broadcasterSelection: pending,
    broadcastersFound: 0,
    compatibleBroadcasters: 0,
    compatibleFeeQuotes: 0,
    peerConnections: [],
    snapshot: null,
    selected: null,
    capabilities,
    liveSubmission: "intentionally-not-attempted",
    errors: [],
    localChecksPassed: false
  };

  try {
    onStatus("Loading the pinned Kohaku browser WASM.");
    const kohaku = await loadKohakuRailgunBrowserModule();
    report.kohaku = state("ready", `Kohaku ${capabilities.version} WASM loaded in this browser.`);
    const chain = kohaku.chainConfig(1n);
    if (!chain || chain.id !== 1) throw new Error("Kohaku mainnet chain configuration is unavailable.");
    // Initialization uses fail-closed sentinels. The later empty-state sync
    // explicitly switches only block/log reads to controlled fixtures; these
    // can never enter a saved wallet or its displayed balance.
    const forbiddenRpc = async (): Promise<never> => { throw new Error("Wallet-independent initialization attempted an RPC call."); };
    let emptySyncEnabled = false;
    let mockedLogRequests = 0;
    const provider: Eip1193Provider = {
      getChainId: forbiddenRpc,
      getBlockNumber: async () => emptySyncEnabled ? BigInt(chain.deploymentBlock) : forbiddenRpc(),
      getLogs: async (address, _signature, fromBlock, toBlock) => {
        if (!emptySyncEnabled) return forbiddenRpc();
        // alpha.30 declarations say number, but wasm-bindgen passes Rust u64
        // block bounds as JS bigints. Normalize without precision loss.
        if (address.toLowerCase() !== chain.railgunSmartWallet.toLowerCase() ||
            fromBlock === undefined || toBlock === undefined ||
            BigInt(fromBlock) !== BigInt(chain.deploymentBlock) || BigInt(toBlock) !== BigInt(chain.deploymentBlock)) {
          throw new Error(`Controlled empty-state sync queried an unexpected address or block range: ${address} ${String(fromBlock)}-${String(toBlock)}.`);
        }
        mockedLogRequests++;
        return [];
      },
      ethCall: forbiddenRpc, estimateGas: forbiddenRpc, getGasPrice: forbiddenRpc,
      getTransactionCount: forbiddenRpc
    };
    const memory = new Map<string, string>();
    const database: Database = {
      get: async (key) => memory.get(key) ?? null,
      set: async (key, value) => { memory.set(key, value); },
      delete: async (key) => { memory.delete(key); }
    };
    const syncer = kohaku.UtxoSyncer.rpc(chain, provider, 500n);
    try {
      const railgun = await new kohaku.RailgunBuilder(chain, provider)
        .withDatabase(database).withUtxoSyncer(syncer).build();
      try {
        report.walletIndependentInitialization = state("ready", "In-memory provider built with an explicit RPC syncer; no signers registered, persistent databases opened, or RPC calls made.");
        report.proofApi = typeof railgun.build === "function" && typeof kohaku.TransactionBuilder.prototype.transfer === "function"
          ? state("available-not-executed", "Public RailgunProvider.build and transfer/unshield builder APIs exist. No spendable notes or proof-generation success are claimed.")
          : state("missing", "Expected Kohaku transaction proof API is missing.");
        emptySyncEnabled = true;
        await withDeadline(railgun.sync(), 10_000, "Controlled empty-state UTXO sync");
        if (mockedLogRequests !== 1) throw new Error("Controlled UTXO sync did not perform the expected single log query.");
        report.utxoSync = state("pass-controlled-empty-state", "Real Kohaku UTXO sync completed with one injected empty log response at the deployment block. This is a mocked RPC fixture, not live mainnet history or a wallet balance.");
      } finally { railgun.free(); }
    } finally { syncer.free(); }

    if (!publicDerivationFixtures.length) throw new Error("Public derivation fixtures must be supplied for this diagnostic.");
    for (const fixture of publicDerivationFixtures) {
      const keys = deriveRailgunKeys({
        recoveryPhrase: fixture.recoveryPhrase,
        keyIndex: fixture.keyIndex,
        derivationVersion: fixture.derivationVersion
      });
      const signer = kohaku.RailgunSigner.privateKey(keys.spendingKey, keys.viewingKey, 1n);
      try {
        if (signer.address !== fixture.expectedAddress) throw new Error(`Public derivation fixture mismatch for ${fixture.derivationVersion} index ${fixture.keyIndex}.`);
      } finally { signer.free(); }
    }
    if (!publicDerivationFixtures.some((fixture) => fixture.derivationVersion === canonicalRailgunDerivation)) {
      throw new Error("Canonical RAILGUN derivation fixture was not checked.");
    }
    report.derivationCompatibility = state("pass", `${publicDerivationFixtures.length} public test vectors match the independently pinned reference addresses. No test wallet is saved or queried.`);
    const canonicalFixture = publicDerivationFixtures.find((fixture) => fixture.derivationVersion === canonicalRailgunDerivation)!;
    const shieldCalls = new kohaku.ShieldBuilder(chain).shieldNative(canonicalFixture.expectedAddress as `0zk${string}`, 1n).build();
    if (shieldCalls.length !== 1 || shieldCalls[0].to.toLowerCase() !== chain.relayAdaptContract.toLowerCase() || BigInt(shieldCalls[0].value) !== 1n || shieldCalls[0].data.length <= 10) {
      throw new Error("Native ETH shield fixture did not produce the expected RelayAdapt transaction.");
    }
    report.nativeEthShieldConstruction = state("pass-no-submission", "Real alpha.30 ShieldBuilder produced RelayAdapt native-ETH calldata for one wei to a public unfunded test fixture. No account signs or submits it.");

    const databaseName = `bindle-diagnostic-${crypto.randomUUID()}`;
    try {
      const isolatedDatabase = createKohakuIndexedDbDatabase("diagnostic", databaseName);
      const marker = JSON.stringify({ diagnostic: true });
      await isolatedDatabase.set("marker", marker);
      if (await isolatedDatabase.get("marker") !== marker) throw new Error("IndexedDB round-trip mismatch.");
      await isolatedDatabase.delete("marker");
      if (await isolatedDatabase.get("marker") !== null) throw new Error("IndexedDB deletion failed.");
      report.indexedDb = state("pass-isolated-database", "Production database adapter passed set/get/delete in a fresh diagnostic database; existing app databases are never opened.");
    } finally {
      await new Promise<void>((resolve, reject) => {
        const deletion = indexedDB.deleteDatabase(databaseName);
        deletion.onsuccess = () => resolve();
        deletion.onerror = () => reject(deletion.error);
        deletion.onblocked = () => reject(new Error("Diagnostic database cleanup was blocked."));
      });
    }
    report.localChecksPassed = report.proofApi.status === "available-not-executed";
  } catch (error) {
    report.errors.push(message(error));
    if (report.kohaku.status === "not-attempted") report.kohaku = state("failed", message(error));
    else if (report.walletIndependentInitialization.status === "not-attempted") report.walletIndependentInitialization = state("failed", message(error));
    else if (report.utxoSync.status === "not-attempted") report.utxoSync = state("failed", message(error));
    else if (report.derivationCompatibility.status === "not-attempted") report.derivationCompatibility = state("failed", message(error));
    else if (report.nativeEthShieldConstruction.status === "not-attempted") report.nativeEthShieldConstruction = state("failed", message(error));
    else report.indexedDb = state("failed", message(error));
  }

  if (localOnly) {
    for (const key of ["waku", "wakuProtocols", "dnsDiscovery", "directPeers", "feeQuotes", "broadcasterSelection"] as const) {
      report[key] = state("not-attempted-local-mode", "External networking is disabled for this run.");
    }
  } else {
    const deadline = Date.now() + timeoutMs;
    if (policy.railgunBroadcasterDnsDiscoveryEnabled) {
      try {
        const dns = createPolicyDnsClient(policy.railgunBroadcasterDnsResolverUrls);
        for (const tree of policy.railgunBroadcasterDnsDiscoveryUrls) {
          const domain = tree.slice(tree.lastIndexOf("@") + 1);
          const records = await withDeadline(dns.resolveTXT(domain), Math.min(12_000, timeoutMs), "Visible DNS resolver");
          if (!records.some((record) => record.startsWith("enrtree-root:v1"))) throw new Error(`No ENR tree root TXT record at ${domain}.`);
        }
        report.dnsDiscovery = state("txt-resolved", "Configured resolvers returned ENR root TXT records. The official client validates and discovers peers; a TXT response alone does not prove a working relay connection.");
      } catch (error) {
        report.dnsDiscovery = state("failed", message(error));
        report.errors.push(message(error));
      }
    } else report.dnsDiscovery = state("disabled", "DNS discovery is disabled in this scan policy.");

    const transport = new RailgunBroadcasterTransport(policy);
    try {
      await withDeadline(transport.start(onStatus), Math.max(1000, deadline - Date.now()), "Official Waku startup");
      const refreshTime = Math.max(0, deadline - Date.now());
      report.snapshot = await withDeadline(transport.refresh(refreshTime), refreshTime + 1500, "Broadcaster advertisement refresh");
      report.peerConnections = await transport.peerSnapshot();
      const protocols = await transport.protocolSnapshot();
      report.wakuProtocols = state(
        Object.values(protocols).every((value) => value === "ready") ? "ready" : "partial",
        `Connected peer protocol advertisements: Filter ${protocols.filter}, LightPush ${protocols.lightPush}, Store ${protocols.store}. No message is published by this diagnostic.`
      );
      report.waku = report.peerConnections.length
        ? state("connected", `${report.peerConnections.length} actual Waku peer connections.`)
        : state("no-peers", "The client initialized but has no live peer connections.");
      const directIds = new Set(policy.railgunBroadcasterDirectPeers.map((peer) => peer.split("/p2p/")[1]));
      const directCount = report.peerConnections.filter((peer) => directIds.has(peer.peerId)).length;
      const directEndpointCount = report.peerConnections.filter((peer) => policy.railgunBroadcasterDirectPeers.includes(peer.remoteAddress)).length;
      report.directPeers = !directIds.size
        ? state("not-configured", "No direct fallback peers were configured.")
        : directCount
          ? state("connected", `${directCount} live connections match configured direct peer IDs.`)
          : directEndpointCount
            ? state("connected-peer-id-changed", `${directEndpointCount} live connections use configured direct endpoints, but authenticated peer IDs differ from the configured multiaddress IDs. Review those peer IDs in the report.`)
            : state("not-connected", "No live connection matches a configured direct peer ID or endpoint. Discovered peers may still work.");
      report.broadcastersFound = new Set(report.snapshot.parsedAds.map((ad) => ad.railgunAddress)).size;
      report.compatibleBroadcasters = new Set(report.snapshot.compatible.map((ad) => ad.railgunAddress)).size;
      report.compatibleFeeQuotes = report.snapshot.compatible.length;
      report.feeQuotes = report.snapshot.compatible.length
        ? state("verified", `${report.snapshot.compatible.length} current fee-token offers accepted by the official client.`)
        : state("none-compatible", `${report.snapshot.parsedAds.length} raw advertisements observed; none currently pass official compatibility checks.`);
      try {
        report.selected = await transport.select({ feeTokenAddress: resolveRailgunBroadcasterFeeTokenAddress(policy), refresh: false });
        report.broadcasterSelection = state("selected", "A fresh official-client broadcaster fee quote was selected. Proof/submission readiness is checked separately and remains blocked.");
      } catch (error) { report.broadcasterSelection = state("none-compatible", message(error)); }
    } catch (error) {
      report.waku = state("failed", message(error));
      report.wakuProtocols = state("not-observed", "Startup or refresh did not finish; connected protocol capabilities are unknown.");
      report.feeQuotes = state("not-observed", "Startup or refresh did not finish; no conclusion about current broadcaster availability is possible.");
      report.broadcasterSelection = state("not-attempted", "No completed refresh is available for selecting a current broadcaster.");
      if (report.directPeers.status === "not-attempted") {
        report.directPeers = state("unknown", "Startup or refresh did not finish; direct connection state was not observed.");
      }
      report.errors.push(message(error));
    } finally {
      try { await withDeadline(transport.stop(), 5000, "Waku cleanup"); }
      catch (error) { report.errors.push(message(error)); }
    }
  }
  report.completedAt = new Date().toISOString();
  return report;
};
