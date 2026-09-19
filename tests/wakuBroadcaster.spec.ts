import { expect, test } from "@playwright/test";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { encodeFunctionData, zeroAddress, type Hex } from "viem";
import type { SelectedBroadcaster } from "@railgun-community/shared-models";
import { defaultConnectionPolicy, type ConnectionPolicy } from "../src/privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../src/intents/uniswapV4PayRoute";
import {
  broadcasterOptionsForPolicy, broadcasterPolicyKey, createPolicyDnsClient, createBroadcasterTransportManager,
  describeRailgunWakuPubSubTopic, normalizeSelectedBroadcaster,
  RailgunBroadcasterTransport, type OfficialBroadcasterClient
} from "../src/railgun/broadcasterTransport";
import {
  normalizeKohakuPrivateTransaction, railgunTransactAbi,
  RAILGUN_MAINNET_SMART_WALLET, type PreparedPrivateRailgunTransaction
} from "../src/railgun/privateTransactionBridge";

const fixtureAddress = "0zk1qynw6pq3nvntq90sts0khgs8ndqxzsrza88cd553dqwt28mskxlxtrv7j6fe3z53l7lczqdhfmfffxa8cps4hw7nprhx3hv3ykx097l8p7gjh2xla365qacrwu2";
const now = 1_800_000_000_000;
const word = (value: number): Hex => `0x${value.toString(16).padStart(64, "0")}`;
const listKey = word(101).slice(2);
const policy = (): ConnectionPolicy => ({
  ...structuredClone(defaultConnectionPolicy),
  wakuEnabled: true, railgunBroadcasterEnabled: true, railgunBroadcasterMode: "waku-public-network",
  railgunPoiListKeys: [listKey], railgunBroadcasterTrustedFeeSigner: ""
});
const advertisement = (): SelectedBroadcaster => ({
  railgunAddress: fixtureAddress,
  tokenAddress: UNISWAP_V4_WETH_ADDRESS,
  tokenFee: {
    feePerUnitGas: "1100000000000000000", expiration: now + 120_000, feesID: "fixture-fee-1",
    availableWallets: 2, relayAdapt: "0x2222222222222222222222222222222222222222", reliability: 0.98
  }
});
const setup = (initial: SelectedBroadcaster | undefined = advertisement()) => {
  let current = initial;
  let clock = now;
  let refreshes = 0;
  let creates = 0;
  let stopped = 0;
  let startedOptions: unknown;
  const client: OfficialBroadcasterClient = {
    start: async (_chain, options) => { startedOptions = options; },
    stop: async () => { stopped += 1; },
    refreshFees: async () => { refreshes += 1; },
    getFeeMessages: () => [],
    findBestBroadcaster: () => current,
    findAllBroadcastersForChain: () => current ? [current] : [],
    findBroadcastersForToken: () => current ? [current] : [],
    getWakuCore: () => undefined
  };
  const transport = new RailgunBroadcasterTransport(policy(), {
    load: async () => ({
      WakuBroadcasterClient: client,
      BroadcasterTransaction: { create: async () => { creates += 1; throw new Error("Unexpected live payload construction"); } }
    }),
    now: () => clock,
    sleep: async milliseconds => { clock += milliseconds; }
  });
  return {
    transport, client, disappear: () => { current = undefined; }, advance: (ms: number) => { clock += ms; },
    stats: () => ({ refreshes, creates, stopped, startedOptions })
  };
};

// Synthetic proof-shaped public fixture for structural checks only. It cannot
// satisfy the separate Kohaku runtime capability guard or be sent on-chain.
const preparedFixture = (): PreparedPrivateRailgunTransaction => normalizeKohakuPrivateTransaction({
  now,
  requiredPoiListKeys: [listKey],
  fee: {
    broadcasterRailgunAddress: fixtureAddress, feesID: "fixture-fee-1",
    tokenAddress: UNISWAP_V4_WETH_ADDRESS, amount: 26_400_000_000_000n,
    gasEstimate: 10_000n, perUnitGas: 1_100_000_000_000_000_000n, expiresAt: now + 120_000
  },
  preTransactionPOIs: {
    [listKey]: {
      [word(102)]: {
        snarkProof: { pi_a: ["1", "2"], pi_b: [["3", "4"], ["5", "6"]], pi_c: ["7", "8"] },
        txidMerkleroot: word(10), poiMerkleroots: [word(11)], blindedCommitmentsOut: [word(12)], railgunTxidIfHasUnshield: word(0)
      }
    }
  },
  transaction: {
    to: RAILGUN_MAINNET_SMART_WALLET, value: "0x0",
    data: encodeFunctionData({ abi: railgunTransactAbi, functionName: "transact", args: [[{
      proof: { a: { x: 1n, y: 2n }, b: { x: [3n, 4n], y: [5n, 6n] }, c: { x: 7n, y: 8n } },
      merkleRoot: word(13), nullifiers: [word(14)], commitments: [word(16)],
      boundParams: {
        treeNumber: 0, minGasPrice: 2_000_000_000n, unshield: 0, chainID: 1n, adaptContract: zeroAddress, adaptParams: word(0),
        commitmentCiphertext: [{ ciphertext: [word(17), word(18), word(19), word(20)], blindedSenderViewingKey: word(21), blindedReceiverViewingKey: word(22), annotationData: "0x1122", memo: "0x3344" }]
      },
      unshieldPreimage: { npk: word(0), token: { tokenType: 0, tokenAddress: zeroAddress, tokenSubID: 0n }, value: 0n }
    }]] })
  }
});

test("Waku topic and enabled DNS plus direct peers come only from policy", () => {
  const configured = policy();
  const options = broadcasterOptionsForPolicy(configured);
  expect(describeRailgunWakuPubSubTopic("/waku/2/rs/5/1")).toBe("cluster 5, shard 1");
  expect(() => describeRailgunWakuPubSubTopic("/waku/2/default-waku/proto")).toThrow(/Invalid/);
  expect(options.dnsDiscoveryUrls).toEqual(configured.railgunBroadcasterDnsDiscoveryUrls);
  expect(options.additionalDirectPeers).toEqual(configured.railgunBroadcasterDirectPeers);
  expect(options.useCustomDNS?.onlyCustom).toBe(true);
  expect(options.storePeers).toEqual([]);
  expect(options.poiActiveListKeys).toEqual([listKey]);
  expect(options.dnsClient).toBeDefined();
});

test("DNS-only and direct-only policies preserve explicitly empty endpoints", () => {
  const dnsOnly = broadcasterOptionsForPolicy({ ...policy(), railgunBroadcasterDirectPeers: [] });
  expect(dnsOnly.additionalDirectPeers).toEqual([]);
  expect(dnsOnly.storePeers).toEqual([]);
  const directOnly = broadcasterOptionsForPolicy({ ...policy(), railgunBroadcasterDnsDiscoveryEnabled: false });
  expect(directOnly.useDNSDiscovery).toBe(false);
  expect(directOnly.dnsDiscoveryUrls).toEqual([]);
  expect(directOnly.useCustomDNS?.enrTreePeers).toEqual([]);
  expect(directOnly.dnsClient).toBeUndefined();
});

test("disabled, missing and malformed peer policies fail before loading transport", async () => {
  for (const configured of [
    { ...policy(), wakuEnabled: false },
    { ...policy(), railgunBroadcasterDirectPeers: [], railgunBroadcasterDnsDiscoveryEnabled: false },
    { ...policy(), railgunBroadcasterDirectPeers: ["mock://fake-peer"] },
    { ...policy(), railgunBroadcasterDnsDiscoveryUrls: ["https://not-an-enr-tree.example"] },
    { ...policy(), railgunBroadcasterDnsResolverUrls: [] }
  ]) {
    let loaded = false;
    const transport = new RailgunBroadcasterTransport(configured, { load: async () => { loaded = true; throw new Error("Should not import"); } });
    await expect(transport.start()).rejects.toThrow();
    expect(loaded).toBe(false);
  }
});

test("DNS queries use only configured resolvers without cookies or redirects", async () => {
  const seen: Array<{ url: string; init?: RequestInit }> = [];
  const fetcher: typeof fetch = async (url, init) => {
    seen.push({ url: String(url), init });
    return Response.json({ Status: 0, Answer: [{ type: 16, data: '"enrtree-root:part1" "part2"' }] });
  };
  const client = createPolicyDnsClient(["https://resolver.example/dns-query"], fetcher);
  expect(await client.resolveTXT("discovery.example")).toEqual(["enrtree-root:part1part2"]);
  expect(seen).toHaveLength(1);
  expect(seen[0].url).toBe("https://resolver.example/dns-query?name=discovery.example&type=TXT");
  expect(seen[0].init).toMatchObject({ credentials: "omit", redirect: "error", referrerPolicy: "no-referrer" });
});

test("DNS failure never falls back to hidden resolver endpoints", async () => {
  const seen: string[] = [];
  const client = createPolicyDnsClient(["https://operator.example/dns-query"], async url => {
    seen.push(String(url)); return Response.json({ Status: 2 });
  });
  await expect(client.resolveTXT("discovery.example")).rejects.toThrow(/Configured Waku DNS resolvers failed/);
  expect(seen).toHaveLength(1);
  expect(() => createPolicyDnsClient(["http://resolver.example/"])).toThrow(/HTTPS/);
});

test("stopping policy cancels an in-flight DNS request without trying another resolver", async () => {
  const controller = new AbortController();
  const seen: string[] = [];
  const client = createPolicyDnsClient(["https://first.example/dns-query", "https://second.example/dns-query"], async (url, init) => {
    seen.push(String(url));
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("cancelled fetch")), { once: true }));
  }, controller.signal);
  const query = client.resolveTXT("discovery.example");
  const rejected = expect(query).rejects.toThrow(/cancelled/);
  controller.abort();
  await rejected;
  await expect(client.resolveTXT("later.example")).rejects.toThrow(/cancelled/);
  expect(seen).toHaveLength(1);
});

test("selection refreshes official state and keeps fee metadata without opaque objects", async () => {
  const fixture = setup();
  await fixture.transport.start();
  const selected = await fixture.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS });
  expect(fixture.stats().refreshes).toBe(1);
  expect(selected).toMatchObject({ submitter: "waku-railgun-broadcaster", railgunAddress: fixtureAddress, chain: { type: 0, id: 1 }, tokenFee: { feesID: "fixture-fee-1", perUnitGas: "1100000000000000000" } });
  expect(selected).not.toHaveProperty("raw");
  expect(selected).not.toHaveProperty("address");
  await fixture.transport.stop();
  expect(fixture.stats().stopped).toBe(1);
});

test("malformed, stale, unavailable and wrong-token advertisements fail closed", async () => {
  for (const change of [{ expiration: now }, { availableWallets: 0 }, { feePerUnitGas: "NaN" }, { feePerUnitGas: "0" }, { reliability: NaN }]) {
    const original = advertisement();
    expect(() => normalizeSelectedBroadcaster({ ...original, tokenFee: { ...original.tokenFee, ...change } }, "policy", now)).toThrow(/malformed|unavailable|expired/);
  }
  const wrong = setup({ ...advertisement(), tokenAddress: "0x1111111111111111111111111111111111111111" });
  await wrong.transport.start();
  await expect(wrong.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS })).rejects.toThrow(/wrong fee token/);
  const empty = setup(); empty.disappear(); await empty.transport.start();
  await expect(empty.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS })).rejects.toThrow(/No compatible/);
});

test("registry copies, expired selections and disappeared broadcasters cannot authorize submission", async () => {
  const fixture = setup();
  await fixture.transport.start();
  const selected = await fixture.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS });
  expect(() => fixture.transport.prepareSubmission(preparedFixture(), structuredClone(selected))).toThrow(/Refresh and review/);
  fixture.disappear();
  expect(() => fixture.transport.prepareSubmission(preparedFixture(), selected)).toThrow(/no longer available/);
  fixture.advance(31_000);
  expect(() => fixture.transport.prepareSubmission(preparedFixture(), selected)).toThrow(/Refresh and review/);
});

test("preparation binds target calldata POI and fee while live submission remains blocked", async () => {
  const fixture = setup();
  await fixture.transport.start();
  const selected = await fixture.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS });
  const tx = preparedFixture();
  const prepared = fixture.transport.prepareSubmission(tx, selected);
  expect(prepared.transaction).toEqual(tx);
  expect(prepared.transaction).not.toBe(tx);
  expect(() => fixture.transport.prepareSubmission({ ...tx, fee: { ...tx.fee, feesID: "changed" } }, selected)).toThrow(/reviewed broadcaster fee/);
  await expect(fixture.transport.submit(prepared)).rejects.toThrow(/no pre-transaction POI proof export/);
  expect(fixture.stats().creates).toBe(0);
});

test("transport policy identity changes for trust or DNS changes", () => {
  const original = policy();
  for (const patch of [{ railgunBroadcasterDnsDiscoveryEnabled: false }, { railgunBroadcasterDnsResolverUrls: ["https://operator.example/dns-query"] }, { railgunPoiListKeys: [] }, { railgunBroadcasterTrustedFeeSigner: fixtureAddress }]) {
    expect(broadcasterPolicyKey({ ...original, ...patch })).not.toBe(broadcasterPolicyKey(original));
  }
});

test("concurrent startup is serialized and old scoped cleanup cannot stop a replacement", async () => {
  const instances: ReturnType<typeof setup>[] = [];
  const manager = createBroadcasterTransportManager(() => {
    const fixture = setup(); instances.push(fixture); return fixture.transport;
  });
  const options = { policy: policy(), onStatus: () => undefined };
  const [first, duplicate] = await Promise.all([manager.ensure(options), manager.ensure(options)]);
  expect(first).toBe(duplicate);
  expect(instances).toHaveLength(1);
  const replacement = await manager.ensure({ ...options, policy: { ...policy(), railgunBroadcasterTrustedFeeSigner: fixtureAddress } });
  expect(replacement).not.toBe(first);
  await manager.stop(first);
  expect(instances[1].stats().stopped).toBe(0);
  await manager.stop(replacement);
  expect(instances[1].stats().stopped).toBe(1);
});

test("policy cancellation interrupts pending startup and does not revive after it resolves", async () => {
  const fixture = setup();
  let resolveStart: (() => void) | undefined;
  fixture.client.start = () => new Promise<void>(resolve => { resolveStart = resolve; });
  const manager = createBroadcasterTransportManager(() => fixture.transport);
  const controller = new AbortController();
  const started = manager.ensure({ policy: policy(), onStatus: () => undefined, signal: controller.signal });
  await expect.poll(() => Boolean(resolveStart)).toBe(true);
  controller.abort();
  await expect(started).rejects.toThrow(/cancelled/);
  resolveStart?.();
  await expect(fixture.transport.select({ feeTokenAddress: UNISWAP_V4_WETH_ADDRESS })).rejects.toThrow(/not started/);
  expect(fixture.stats().stopped).toBeGreaterThan(0);
});

test("a hanging Store refresh is bounded and stops its network before returning", async () => {
  const fixture = setup();
  fixture.client.refreshFees = () => new Promise<void>(() => undefined);
  await fixture.transport.start();
  await expect(fixture.transport.refresh(1)).rejects.toThrow(/timed out/);
  expect(fixture.stats().stopped).toBe(1);
});

test("failed network cleanup blocks replacement instead of starting another client", async () => {
  const fixture = setup();
  fixture.client.stop = async () => { throw new Error("cleanup unavailable"); };
  let created = 0;
  const manager = createBroadcasterTransportManager(() => { created += 1; return fixture.transport; });
  await manager.ensure({ policy: policy(), onStatus: () => undefined });
  await expect(manager.ensure({ policy: { ...policy(), railgunPoiListKeys: [] }, onStatus: () => undefined })).rejects.toThrow(/cleanup unavailable/);
  expect(created).toBe(1);
});

test("patched official lifecycle retains failed cleanup and discards obsolete callbacks", async () => {
  const packagePath = realpathSync("node_modules/@railgun-community/waku-broadcaster-client-web");
  const { WakuBroadcasterWakuCoreBase: core } = await import(pathToFileURL(`${packagePath}/dist/waku/waku-broadcaster-waku-core-base.js`).href);
  const { WakuObservers: observers } = await import(pathToFileURL(`${packagePath}/dist/waku/waku-observers.js`).href);
  let callbacks = 0;
  const oldCallback = observers.wrapCallbackWithCache(() => { callbacks += 1; });
  let attempts = 0;
  core.waku = {
    filter: { unsubscribeAll: () => undefined }, // SDK facade returns void.
    stop: async () => { attempts += 1; if (attempts === 1) throw new Error("fixture stop failed"); }
  };
  await expect(core.disconnect()).rejects.toThrow(/cleanup failed/);
  oldCallback({ payload: new Uint8Array([1]), contentTopic: "fixture" });
  expect(callbacks).toBe(0);
  await core.disconnect();
  expect(attempts).toBe(2);
  expect(core.stoppingWaku).toBeUndefined();
});

test("patched official startup cannot become active after stop while initialization is pending", async () => {
  const packagePath = realpathSync("node_modules/@railgun-community/waku-broadcaster-client-web");
  const { WakuBroadcasterClient: client } = await import(pathToFileURL(`${packagePath}/dist/waku-broadcaster-client.js`).href);
  const { WakuBroadcasterWakuCore: core } = await import(pathToFileURL(`${packagePath}/dist/waku/waku-broadcaster-waku-core.js`).href);
  const originalInit = core.initWaku;
  let finish: (() => void) | undefined;
  core.initWaku = () => new Promise<void>(resolve => { finish = resolve; });
  try {
    const starting = client.start({ type: 0, id: 1 }, broadcasterOptionsForPolicy(policy()), () => undefined);
    const rejected = expect(starting).rejects.toThrow(/Cannot connect/);
    await client.stop();
    finish?.();
    await rejected;
    expect(client.isStarted()).toBe(false);
    expect(client.pollTimer).toBeUndefined();
  } finally { core.initWaku = originalInit; await client.stop(); }
});

test("patched DNS discovery ignores records arriving from a previous connection policy", async () => {
  const packagePath = realpathSync("node_modules/@railgun-community/waku-broadcaster-client-web");
  const { WakuBroadcasterWakuCore: core } = await import(pathToFileURL(`${packagePath}/dist/waku/waku-broadcaster-waku-core.js`).href);
  const originalFactory = core.createDnsPeerDiscovery;
  const originalQueue = core.queueDiscoveredPeer;
  const originalDial = core.dialDiscoveredPeers;
  let attempted = 0;
  core.createDnsPeerDiscovery = () => () => new EventTarget();
  core.queueDiscoveredPeer = () => { attempted += 1; };
  core.dialDiscoveredPeers = async () => { attempted += 1; };
  try {
    const discovery = core.createDialingDnsPeerDiscovery([])({});
    core.connectionGeneration = (core.connectionGeneration ?? 0) + 1;
    discovery.dispatchEvent(new CustomEvent("peer", { detail: { id: "obsolete-peer" } }));
    expect(attempted).toBe(0);
  } finally {
    core.createDnsPeerDiscovery = originalFactory;
    core.queueDiscoveredPeer = originalQueue;
    core.dialDiscoveredPeers = originalDial;
  }
});

test("official browser import and encrypted payload construction make no outbound connections", async ({ page }) => {
  const outbound: string[] = [];
  await page.route("**/*", async route => {
    if (new URL(route.request().url()).hostname !== "localhost") {
      outbound.push(route.request().url()); await route.abort(); return;
    }
    await route.continue();
  });
  await page.goto("/");
  const result = await page.evaluate(async address => {
    const { loadOfficialBroadcasterClient } = await import("/src/railgun/broadcasterTransport.ts");
    const client = await loadOfficialBroadcasterClient();
    const transaction = await client.BroadcasterTransaction.create(
      "V2_PoseidonMerkle", "0x1111111111111111111111111111111111111111", "0x1234", address,
      "fixture-never-submit", { type: 0, id: 1 }, [`0x${"01".repeat(32)}`], 0n, false, {}
    );
    return { constructed: typeof transaction.send === "function", started: client.WakuBroadcasterClient.isStarted() };
  }, fixtureAddress);
  expect(result).toEqual({ constructed: true, started: false });
  expect(outbound).toEqual([]);
});
