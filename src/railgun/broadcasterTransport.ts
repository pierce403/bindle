import { getAddress, type Address, type Hex } from "viem";
import type { BroadcasterOptions } from "@railgun-community/waku-broadcaster-client-web";
import { TXIDVersion, type SelectedBroadcaster } from "@railgun-community/shared-models";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";
import { installBroadcasterBrowserRuntime } from "./broadcasterBrowserRuntime";
import {
  assertKohakuPrivateSubmissionReady,
  assertPreparedPrivateRailgunTransaction,
  type PreparedPrivateRailgunTransaction
} from "./privateTransactionBridge";
import {
  parseRailgunWakuFeeMessage, selectBestRawRailgunBroadcasterTokenAd,
  type RailgunBroadcasterFeeAd, type RailgunBroadcasterTokenAd
} from "./wakuFeeAds";

const mainnet = { type: 0, id: 1 } as const;
const mainnetUsdcAddress = getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48");
const feeExpirationBufferMs = 40_000;
const selectionMaxAgeMs = 30_000;
type OfficialModule = typeof import("@railgun-community/waku-broadcaster-client-web");
export type OfficialBroadcasterClient = Pick<OfficialModule["WakuBroadcasterClient"],
  "start" | "stop" | "refreshFees" | "getFeeMessages" | "findBestBroadcaster" |
  "findAllBroadcastersForChain" | "findBroadcastersForToken" | "getWakuCore">;
type ClientModule = { WakuBroadcasterClient: OfficialBroadcasterClient; BroadcasterTransaction: Pick<OfficialModule["BroadcasterTransaction"], "create"> };
export const loadOfficialBroadcasterClient = async (): Promise<ClientModule> => {
  installBroadcasterBrowserRuntime();
  return import("@railgun-community/waku-broadcaster-client-web");
};

export type SelectedRailgunBroadcaster = {
  submitter: "waku-railgun-broadcaster";
  chain: typeof mainnet;
  policyKey: string;
  selectedAt: number;
  railgunAddress: `0zk${string}`;
  tokenFee: {
    feesID: string; token: Address; perUnitGas: string; recipient: `0zk${string}`;
    expiration: number; availableWallets: number; relayAdapt: Address; reliability: number;
  };
};
export type PreparedBroadcasterSubmit = {
  submitter: "waku-railgun-broadcaster";
  chain: "ethereum-mainnet";
  policyKey: string;
  transaction: PreparedPrivateRailgunTransaction;
  broadcaster: SelectedRailgunBroadcaster;
};
export type WakuBroadcasterSubmitResult = { transactionHash: Hex; broadcasterId: string };
export type RawRailgunWakuFeeAdSnapshot = {
  observedMessages: number; parsedAds: RailgunBroadcasterFeeAd[]; parseErrors: string[];
};
export type BroadcasterSnapshot = RawRailgunWakuFeeAdSnapshot & {
  compatible: SelectedRailgunBroadcaster[]; refreshedAt: number;
};
type TransportDependencies = {
  load?: () => Promise<ClientModule>;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};
const wait = (milliseconds: number) => new Promise<void>(resolve => setTimeout(resolve, milliseconds));
const list = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];
const abortError = () => new Error("RAILGUN broadcaster operation cancelled by connection policy.");
const bounded = async <T>(operation: Promise<T>, milliseconds: number, signal?: AbortSignal): Promise<T> => {
  if (signal?.aborted) {
    void operation.catch(() => undefined);
    throw abortError();
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error("RAILGUN broadcaster operation timed out.")), milliseconds);
      cancel = () => reject(abortError());
      signal?.addEventListener("abort", cancel, { once: true });
    })]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener("abort", cancel);
  }
};

export const parseRailgunWakuPubSubTopic = (topic: string) => {
  const match = /^\/waku\/2\/rs\/(\d+)\/(\d+)$/.exec(topic.trim());
  if (!match || Number(match[1]) > 65535 || Number(match[2]) > 65535) {
    throw new Error(`Invalid RAILGUN Waku pubsub topic "${topic}". Expected /waku/2/rs/<cluster>/<shard>.`);
  }
  return { clusterId: Number(match[1]), shardId: Number(match[2]), pubsubTopic: topic.trim() };
};
export const describeRailgunWakuPubSubTopic = (topic: string): string => {
  const routing = parseRailgunWakuPubSubTopic(topic);
  return `cluster ${routing.clusterId}, shard ${routing.shardId}`;
};
const validateResolver = (value: string): string => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error("Waku DNS resolvers must be explicit HTTPS URLs without credentials or fragments.");
  }
  return url.href;
};

/** Explicit JSON DoH endpoints only. No cookies, redirects, or SDK resolver defaults. */
export const createPolicyDnsClient = (resolverUrls: string[], fetcher: typeof fetch = fetch, signal?: AbortSignal) => {
  const resolvers = list(resolverUrls).map(validateResolver);
  if (!resolvers.length) throw new Error("Configure at least one visible Waku DNS resolver.");
  return {
    async resolveTXT(domain: string): Promise<string[]> {
      if (signal?.aborted) throw abortError();
      if (!/^[a-zA-Z0-9_.-]+$/.test(domain)) throw new Error("Invalid DNS TXT name.");
      const errors: string[] = [];
      for (const resolver of resolvers) {
        const url = new URL(resolver);
        url.searchParams.set("name", domain);
        url.searchParams.set("type", "TXT");
        try {
          const response = await fetcher(url.href, {
            headers: { accept: "application/dns-json" }, credentials: "omit",
            redirect: "error", referrerPolicy: "no-referrer", cache: "no-store",
            signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000)
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const body: unknown = await response.json();
          if (!body || typeof body !== "object" || !("Status" in body) || body.Status !== 0 || !("Answer" in body) || !Array.isArray(body.Answer)) {
            throw new Error("DNS resolver returned no successful TXT answer.");
          }
          const answers = body.Answer.flatMap((answer: unknown) => {
            if (!answer || typeof answer !== "object" || !("type" in answer) || answer.type !== 16 || !("data" in answer) || typeof answer.data !== "string") return [];
            const pieces = answer.data.match(/"(?:[^"\\]|\\.)*"/g);
            if (!pieces || pieces.join(" ") !== answer.data.trim()) return [];
            return [pieces.map(piece => JSON.parse(piece) as string).join("")];
          });
          if (!answers.length) throw new Error("DNS resolver returned no TXT records.");
          return answers;
        } catch (error) {
          if (signal?.aborted) throw abortError();
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
      throw new Error(`Configured Waku DNS resolvers failed: ${errors.join("; ")}`);
    }
  };
};

export const broadcasterOptionsForPolicy = (policy: ConnectionPolicy, signal?: AbortSignal): BroadcasterOptions => {
  if (!policy.wakuEnabled || !policy.railgunBroadcasterEnabled) throw new Error("Enable Waku broadcaster discovery before Private Pay.");
  if (!["waku-public-network", "custom-waku"].includes(policy.railgunBroadcasterMode)) throw new Error("Select Waku broadcaster mode before Private Pay.");
  const routing = parseRailgunWakuPubSubTopic(policy.railgunBroadcasterPubSubTopic);
  const directPeers = list(policy.railgunBroadcasterDirectPeers);
  for (const peer of directPeers) {
    if (!/^\/(?:dns4|dns6|ip4|ip6)\/[^/]+\/tcp\/\d+\/(?:wss|tls\/ws)\/p2p\/[a-zA-Z0-9]+$/.test(peer)) {
      throw new Error("Invalid Waku direct peer. Use an explicit secure WebSocket multiaddress with a peer ID.");
    }
  }
  const trees = policy.railgunBroadcasterDnsDiscoveryEnabled ? list(policy.railgunBroadcasterDnsDiscoveryUrls) : [];
  if (trees.some(tree => !/^enrtree:\/\/[A-Z2-7]+@[a-zA-Z0-9.-]+$/.test(tree))) throw new Error("Invalid Waku DNS ENR tree.");
  if (!directPeers.length && !trees.length) throw new Error("Configure visible Waku ENR trees or direct peers.");
  if (policy.railgunBroadcasterDnsDiscoveryEnabled && !trees.length) throw new Error("Configure a visible Waku ENR tree or disable DNS discovery.");
  return {
    trustedFeeSigner: policy.railgunBroadcasterTrustedFeeSigner.trim(),
    poiActiveListKeys: list(policy.railgunPoiListKeys),
    pubSubTopic: routing.pubsubTopic, clusterId: routing.clusterId, shardId: routing.shardId,
    useDNSDiscovery: policy.railgunBroadcasterDnsDiscoveryEnabled,
    dnsDiscoveryUrls: trees, useCustomDNS: { onlyCustom: true, enrTreePeers: trees },
    dnsClient: policy.railgunBroadcasterDnsDiscoveryEnabled ? createPolicyDnsClient(policy.railgunBroadcasterDnsResolverUrls, fetch, signal) : undefined,
    additionalDirectPeers: directPeers, storePeers: [], peerDiscoveryTimeout: 30_000,
    historicalLookBackTime: 60_000, feeExpirationTimeout: 120_000, enableHealthcheckLogs: false,
    broadcasterVersionRange: { minVersion: "8.0.0", maxVersion: "8.999.0" }
  };
};
export const broadcasterPolicyKey = (policy: ConnectionPolicy): string => JSON.stringify({
  enabled: policy.wakuEnabled && policy.railgunBroadcasterEnabled, mode: policy.railgunBroadcasterMode,
  pubsubTopic: policy.railgunBroadcasterPubSubTopic.trim(), dnsEnabled: policy.railgunBroadcasterDnsDiscoveryEnabled,
  trees: list(policy.railgunBroadcasterDnsDiscoveryUrls), resolvers: list(policy.railgunBroadcasterDnsResolverUrls),
  peers: list(policy.railgunBroadcasterDirectPeers), trustedFeeSigner: policy.railgunBroadcasterTrustedFeeSigner.trim(),
  poiListKeys: list(policy.railgunPoiListKeys)
});

export const normalizeSelectedBroadcaster = (selected: SelectedBroadcaster, policyKey: string, now: number): SelectedRailgunBroadcaster => {
  if (!/^0zk[a-zA-Z0-9]+$/.test(selected.railgunAddress)) throw new Error("Invalid broadcaster RAILGUN address.");
  const fee = selected.tokenFee;
  if (!fee.feesID || !Number.isFinite(fee.expiration) || fee.expiration < now + feeExpirationBufferMs ||
      !Number.isSafeInteger(fee.availableWallets) || fee.availableWallets < 1 || !Number.isFinite(fee.reliability) || fee.reliability < 0 ||
      !/^(?:0x[0-9a-fA-F]+|[0-9]+)$/.test(fee.feePerUnitGas) || BigInt(fee.feePerUnitGas) <= 0n) {
    throw new Error("Broadcaster fee is malformed, unavailable, or expired.");
  }
  const railgunAddress = selected.railgunAddress as `0zk${string}`;
  return {
    submitter: "waku-railgun-broadcaster", chain: mainnet, policyKey, selectedAt: now, railgunAddress,
    tokenFee: {
      feesID: fee.feesID, token: getAddress(selected.tokenAddress), perUnitGas: BigInt(fee.feePerUnitGas).toString(), recipient: railgunAddress,
      expiration: fee.expiration, availableWallets: fee.availableWallets, relayAdapt: getAddress(fee.relayAdapt), reliability: fee.reliability
    }
  };
};
const sameQuote = (left: SelectedRailgunBroadcaster, right: SelectedRailgunBroadcaster) =>
  left.railgunAddress === right.railgunAddress && left.tokenFee.feesID === right.tokenFee.feesID &&
  left.tokenFee.token.toLowerCase() === right.tokenFee.token.toLowerCase() && left.tokenFee.perUnitGas === right.tokenFee.perUnitGas &&
  left.tokenFee.expiration === right.tokenFee.expiration && left.tokenFee.relayAdapt.toLowerCase() === right.tokenFee.relayAdapt.toLowerCase();

/** Official client owns all Waku/protocol/crypto work; Bindle owns policy and eligibility. */
export class RailgunBroadcasterTransport {
  readonly policyKey: string;
  readonly pubsubTopic: string;
  private module: ClientModule | null = null;
  private started = false;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly issuedSelections = new WeakSet<SelectedRailgunBroadcaster>();
  private readonly preparedSubmissions = new WeakSet<PreparedBroadcasterSubmit>();
  private refreshPromise: Promise<BroadcasterSnapshot> | null = null;
  private submitting = false;
  private readonly cancellation = new AbortController();
  private stopping: Promise<void> | null = null;

  constructor(private readonly policy: ConnectionPolicy, private readonly dependencies: TransportDependencies = {}) {
    this.policyKey = broadcasterPolicyKey(policy);
    this.pubsubTopic = policy.railgunBroadcasterPubSubTopic.trim();
    this.now = dependencies.now ?? Date.now;
    this.sleep = dependencies.sleep ?? wait;
  }
  async start(onStatus: (message: string) => void = () => undefined): Promise<void> {
    if (this.started) return;
    if (this.cancellation.signal.aborted) throw abortError();
    const options = broadcasterOptionsForPolicy(this.policy, this.cancellation.signal);
    this.module = await (this.dependencies.load?.() ?? loadOfficialBroadcasterClient());
    if (this.cancellation.signal.aborted) { await this.stop(); throw abortError(); }
    onStatus(`Starting official RAILGUN broadcaster client (${describeRailgunWakuPubSubTopic(this.pubsubTopic)}).`);
    try {
      await bounded(this.module.WakuBroadcasterClient.start(mainnet, options, (_chain, status) => onStatus(`RAILGUN broadcaster network: ${status}.`)), 35_000, this.cancellation.signal);
      this.started = true;
    } catch (error) {
      try { await this.stop(); } catch (cleanupError) { throw new AggregateError([error, cleanupError], "Broadcaster startup and cleanup failed; new connections are blocked."); }
      throw error;
    }
  }
  cancel(): void {
    this.cancellation.abort();
    void this.stop().catch(() => undefined); // Manager retains failed cleanup for retry.
  }
  async stop(): Promise<void> {
    if (this.stopping) return this.stopping;
    if (this.submitting) throw new Error("Cannot stop broadcaster transport during submission.");
    this.cancellation.abort();
    this.started = false;
    const module = this.module;
    if (!module) return;
    this.stopping = bounded(module.WakuBroadcasterClient.stop(), 5_000).then(() => { this.module = null; });
    try { await this.stopping; } finally { this.stopping = null; }
  }
  private client(): OfficialBroadcasterClient {
    if (!this.module || !this.started) throw new Error("RAILGUN broadcaster transport is not started.");
    return this.module.WakuBroadcasterClient;
  }
  async peerCount(): Promise<number> { return this.client().getWakuCore()?.libp2p.getConnections().length ?? 0; }
  async peerSnapshot(): Promise<Array<{ peerId: string; remoteAddress: string }>> {
    return (this.client().getWakuCore()?.libp2p.getConnections() ?? []).map((connection: { remotePeer: { toString(): string }; remoteAddr: { toString(): string } }) => ({
      peerId: connection.remotePeer.toString(), remoteAddress: connection.remoteAddr.toString()
    }));
  }
  async protocolSnapshot(): Promise<{ filter: "ready" | "unknown"; lightPush: "ready" | "unknown"; store: "ready" | "unknown" }> {
    const peers = await this.client().getWakuCore()?.getConnectedPeers() ?? [];
    const protocols = peers.flatMap((peer: { protocols: string[] }) => peer.protocols);
    const available = (prefix: string): "ready" | "unknown" => protocols.some((protocol: string) => protocol.startsWith(prefix)) ? "ready" : "unknown";
    return { filter: available("/vac/waku/filter-subscribe/2."), lightPush: available("/vac/waku/lightpush/"), store: available("/vac/waku/store-query/3.") };
  }
  getRawFeeAdSnapshot(): RawRailgunWakuFeeAdSnapshot {
    const messages = this.client().getFeeMessages();
    const parsedAds: RailgunBroadcasterFeeAd[] = [];
    const parseErrors: string[] = [];
    for (const message of messages) {
      const parsed = parseRailgunWakuFeeMessage({ payload: message.payload, contentTopic: message.contentTopic, timestamp: message.timestamp?.getTime() });
      if (parsed.ok) parsedAds.push(parsed.ad); else parseErrors.push(parsed.error);
    }
    return { observedMessages: messages.length, parsedAds, parseErrors };
  }
  private compatible(useRelayAdapt = false): SelectedRailgunBroadcaster[] {
    return (this.client().findAllBroadcastersForChain(mainnet, useRelayAdapt) ?? []).flatMap((selected: SelectedBroadcaster) => {
      try { return [normalizeSelectedBroadcaster(selected, this.policyKey, this.now())]; } catch { return []; }
    });
  }
  async refresh(timeoutMs = 5_000): Promise<BroadcasterSnapshot> {
    this.client();
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = bounded((async () => {
      const deadline = this.now() + timeoutMs;
      await this.client().refreshFees();
      do {
        await this.sleep(100); // Official signature verification follows Waku delivery asynchronously.
        if (this.compatible().length) break;
      } while (this.now() < deadline);
      return { ...this.getRawFeeAdSnapshot(), compatible: this.compatible(), refreshedAt: this.now() };
    })(), timeoutMs + 250, this.cancellation.signal);
    try { return await this.refreshPromise; }
    catch (error) { await this.stop(); throw error; }
    finally { this.refreshPromise = null; }
  }
  async select(request: { feeTokenAddress: Address; useRelayAdapt?: boolean; refresh?: boolean }): Promise<SelectedRailgunBroadcaster> {
    if (request.refresh !== false) await this.refresh();
    const selected = this.client().findBestBroadcaster(mainnet, request.feeTokenAddress, request.useRelayAdapt ?? false);
    if (!selected) throw new Error(`No compatible RAILGUN Waku broadcaster is advertising fee token ${request.feeTokenAddress}.`);
    const normalized = normalizeSelectedBroadcaster(selected, this.policyKey, this.now());
    if (normalized.tokenFee.token.toLowerCase() !== request.feeTokenAddress.toLowerCase()) throw new Error("Broadcaster selected the wrong fee token.");
    this.issuedSelections.add(normalized);
    return normalized;
  }
  prepareSubmission(transaction: PreparedPrivateRailgunTransaction, broadcaster: SelectedRailgunBroadcaster): PreparedBroadcasterSubmit {
    this.assertSelection(broadcaster);
    assertPreparedPrivateRailgunTransaction(transaction, { now: this.now(), requiredPoiListKeys: this.policy.railgunPoiListKeys });
    if (transaction.relayAdapt.kind === "relay-adapt-7702") throw new Error("The stable broadcaster client does not support RelayAdapt7702 submission.");
    const fee = transaction.fee;
    if (fee.broadcasterRailgunAddress !== broadcaster.railgunAddress || fee.feesID !== broadcaster.tokenFee.feesID ||
        fee.tokenAddress.toLowerCase() !== broadcaster.tokenFee.token.toLowerCase() || fee.perUnitGas !== BigInt(broadcaster.tokenFee.perUnitGas) ||
        fee.expiresAt !== broadcaster.tokenFee.expiration) throw new Error("Prepared private transaction does not match the reviewed broadcaster fee.");
    for (const key of this.policy.railgunPoiListKeys) {
      if (!Object.keys(transaction.preTransactionPOIs[key] ?? {}).length) throw new Error(`Missing pre-transaction POI for configured list ${key}.`);
    }
    if (!this.policy.railgunPoiListKeys.length) throw new Error("Configure active POI list keys before private broadcaster submission.");
    if (transaction.relayAdapt.kind === "relay-adapt" && transaction.relayAdapt.contract?.toLowerCase() !== broadcaster.tokenFee.relayAdapt.toLowerCase()) {
      throw new Error("Prepared RelayAdapt contract differs from the broadcaster advertisement.");
    }
    const prepared: PreparedBroadcasterSubmit = { submitter: "waku-railgun-broadcaster", chain: "ethereum-mainnet", policyKey: this.policyKey, transaction: structuredClone(transaction), broadcaster };
    this.preparedSubmissions.add(prepared);
    return prepared;
  }
  private assertSelection(broadcaster: SelectedRailgunBroadcaster): void {
    if (!this.issuedSelections.has(broadcaster) || broadcaster.policyKey !== this.policyKey || broadcaster.chain.id !== 1 || broadcaster.chain.type !== 0 ||
        this.now() - broadcaster.selectedAt > selectionMaxAgeMs || broadcaster.selectedAt > this.now() || broadcaster.tokenFee.expiration < this.now() + feeExpirationBufferMs) {
      throw new Error("Refresh and review a current broadcaster quote before submitting.");
    }
    if (!this.compatible().some(candidate => sameQuote(candidate, broadcaster))) throw new Error("The reviewed broadcaster is no longer available. Refresh and review again.");
  }
  async submit(prepared: PreparedBroadcasterSubmit): Promise<WakuBroadcasterSubmitResult> {
    if (this.submitting) throw new Error("A private broadcaster submission is already active.");
    if (!this.preparedSubmissions.has(prepared) || prepared.policyKey !== this.policyKey || prepared.submitter !== "waku-railgun-broadcaster") {
      throw new Error("Private transactions require a prepared submission from the current broadcaster transport.");
    }
    // Syntactic fixtures cannot attest to fee-bound POI. This gate remains
    // closed until Kohaku exposes the complete pre-transaction proof pipeline.
    assertKohakuPrivateSubmissionReady();
    this.submitting = true;
    try {
      await this.refresh();
      this.assertSelection(prepared.broadcaster);
      this.prepareSubmission(prepared.transaction, prepared.broadcaster);
      if (!this.module) throw new Error("Broadcaster client is not loaded.");
      const tx = prepared.transaction;
      const operation = await this.module.BroadcasterTransaction.create(
        TXIDVersion.V2_PoseidonMerkle, tx.target, tx.calldata, prepared.broadcaster.railgunAddress,
        prepared.broadcaster.tokenFee.feesID, mainnet, tx.nullifiers,
        tx.overallBatchMinGasPrice, tx.relayAdapt.kind === "relay-adapt", tx.preTransactionPOIs
      );
      const hash = await operation.send();
      if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) throw new Error("Broadcaster returned an invalid transaction hash.");
      this.preparedSubmissions.delete(prepared);
      return { transactionHash: hash as Hex, broadcasterId: prepared.broadcaster.railgunAddress };
    } finally { this.submitting = false; }
  }
}

export type RailgunWakuBroadcasterTransport = RailgunBroadcasterTransport;
export const createBroadcasterTransportManager = (factory: (policy: ConnectionPolicy) => RailgunBroadcasterTransport = policy => new RailgunBroadcasterTransport(structuredClone(policy))) => {
  let current: { key: string; transport: RailgunBroadcasterTransport; ready: boolean } | null = null;
  let lifecycle: Promise<void> = Promise.resolve();
  let requestedPolicyKey: string | null = null;
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = lifecycle.then(operation, operation);
    lifecycle = next.then(() => undefined, () => undefined);
    return next;
  };
  const stop = async (expected?: RailgunBroadcasterTransport): Promise<void> => {
    const target = current;
    if (!target || (expected && target.transport !== expected)) return;
    target.ready = false;
    target.transport.cancel();
    return serialize(async () => {
      if (current !== target) return;
      await target.transport.stop();
      current = null;
    });
  };
  const ensure = ({ policy, onStatus, signal }: { policy: ConnectionPolicy; onStatus: (message: string) => void; signal?: AbortSignal }): Promise<RailgunBroadcasterTransport> => {
    const key = broadcasterPolicyKey(policy);
    requestedPolicyKey = key;
    if (current && current.key !== key) { current.ready = false; current.transport.cancel(); }
    return serialize(async () => {
    if (signal?.aborted || key !== requestedPolicyKey) throw abortError();
    if (current?.key === key && current.ready) return current.transport;
    if (current) {
      await current.transport.stop();
      current = null;
    }
    const transport = factory(policy);
    current = { key, transport, ready: false };
    const cancel = () => transport.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await transport.start(onStatus);
      if (signal?.aborted) { await transport.stop(); throw abortError(); }
      current.ready = true;
      return transport;
    } finally { signal?.removeEventListener("abort", cancel); }
    });
  };
  return { ensure, stop };
};
const transportManager = createBroadcasterTransportManager();
export const ensureRailgunWakuBroadcasterTransport = transportManager.ensure;
export const stopRailgunWakuBroadcasterTransport = transportManager.stop;
export const resolveRailgunBroadcasterFeeTokenAddress = (policy: Pick<ConnectionPolicy, "railgunBroadcasterFeeToken" | "railgunBroadcasterCustomFeeTokenAddress">): Address => {
  if (policy.railgunBroadcasterFeeToken === "USDC") return mainnetUsdcAddress;
  if (policy.railgunBroadcasterFeeToken === "WETH") return UNISWAP_V4_WETH_ADDRESS;
  if (policy.railgunBroadcasterFeeToken === "custom" && policy.railgunBroadcasterCustomFeeTokenAddress.trim()) return getAddress(policy.railgunBroadcasterCustomFeeTokenAddress.trim());
  throw new Error("Use WETH, USDC, or a configured custom ERC-20 broadcaster fee token.");
};
export const selectRailgunWakuBroadcaster = async ({ transport, feeTokenAddress, onStatus }: {
  transport: RailgunBroadcasterTransport; feeTokenAddress: Address; onStatus: (message: string) => void;
}): Promise<SelectedRailgunBroadcaster> => {
  const selected = await transport.select({ feeTokenAddress });
  onStatus(`Selected RAILGUN Waku broadcaster ${selected.railgunAddress}; fee conversion rate ${selected.tokenFee.perUnitGas} per 10^18 wei of gas cost.`);
  return selected;
};
export const getRailgunWakuBroadcasterQuote = async ({ policy, feeTokenAddress, onStatus }: {
  policy: ConnectionPolicy; feeTokenAddress: Address; onStatus: (message: string) => void;
}): Promise<SelectedRailgunBroadcaster> => selectRailgunWakuBroadcaster({ transport: await ensureRailgunWakuBroadcasterTransport({ policy, onStatus }), feeTokenAddress, onStatus });
export const selectRawRailgunWakuBroadcasterAd = ({ feeAds, feeTokenAddress, activePoiListKeys = [] }: { feeAds: RailgunBroadcasterFeeAd[]; feeTokenAddress: Address; activePoiListKeys?: readonly string[] }): RailgunBroadcasterTokenAd | null =>
  selectBestRawRailgunBroadcasterTokenAd({ ads: feeAds, tokenAddress: feeTokenAddress, activePoiListKeys });
export const submitRailgunWakuBroadcasterTransaction = async ({ prepared, policy, onStatus }: {
  prepared: PreparedBroadcasterSubmit; policy: ConnectionPolicy; onStatus: (message: string) => void;
}): Promise<WakuBroadcasterSubmitResult> => {
  const transport = await ensureRailgunWakuBroadcasterTransport({ policy, onStatus });
  onStatus("Checking private RAILGUN broadcaster submission prerequisites.");
  return transport.submit(prepared);
};
export const getRailgunWakuBroadcasterNetworkName = (): "ethereum-mainnet" => "ethereum-mainnet";
