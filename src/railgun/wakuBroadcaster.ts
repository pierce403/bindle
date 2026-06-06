import { getAddress, type Address } from "viem";
import type {
  CreateNodeOptions,
  IDecodedMessage,
  IRoutingInfo,
  LightNode
} from "@waku/sdk";
import type {
  Fee,
  JsBroadcaster,
  JsBroadcasterManager,
  JsPoiProvedTx,
  WakuAdapter,
  WakuMessage
} from "@kohaku-eth/railgun-waku";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";

const mainnetUsdcAddress = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
) as Address;
const railgunMainnetChainId = 1n;
const peerDiscoveryTimeoutMs = 60_000;
const historicalLookbackMs = 300_000;

type WakuSdkModule = typeof import("@waku/sdk");
type KohakuRailgunWakuModule = typeof import("@kohaku-eth/railgun-waku");

export type PreparedBroadcasterSubmit = {
  submitter: "waku-railgun-broadcaster";
  chain: "ethereum-mainnet";
  provedTx: JsPoiProvedTx;
  broadcaster: {
    raw: JsBroadcaster;
    address: `0x${string}`;
    railgunAddress: `0zk${string}`;
    tokenFee: {
      feesID: string;
    };
  };
};

export type WakuBroadcasterSubmitResult = {
  transactionHash: `0x${string}` | null;
  broadcasterId: string;
};

export type SelectedRailgunBroadcaster = {
  submitter: "waku-railgun-broadcaster";
  address: `0x${string}`;
  railgunAddress: `0zk${string}`;
  tokenFee: {
    feesID: string;
    token: `0x${string}`;
    perUnitGas: string;
    recipient: `0zk${string}`;
    expiration: number;
    availableWallets: number;
    relayAdapt: `0x${string}`;
    reliability: number;
  };
  raw: JsBroadcaster;
};

export type RailgunWakuBroadcasterStatus =
  | "starting-waku"
  | "waiting-for-peers"
  | "broadcaster-manager-started"
  | "selecting-broadcaster"
  | "broadcaster-selected"
  | "submitting-private-operation";

export type RailgunWakuBroadcasterTransport = {
  policyKey: string;
  pubsubTopic: string;
  manager: JsBroadcasterManager;
  adapter: BindleWakuNodeAdapter;
};

type RailgunBroadcasterManagerLike = Pick<
  JsBroadcasterManager,
  "bestBroadcasterForToken"
>;

let wakuSdkModulePromise: Promise<WakuSdkModule> | null = null;
let kohakuRailgunWakuModulePromise: Promise<KohakuRailgunWakuModule> | null =
  null;
let activeTransportPromise: Promise<RailgunWakuBroadcasterTransport> | null =
  null;
let activeTransportKey: string | null = null;

const loadWakuSdkModule = (): Promise<WakuSdkModule> => {
  wakuSdkModulePromise ??= import("@waku/sdk");
  return wakuSdkModulePromise;
};

const loadKohakuRailgunWakuModule =
  (): Promise<KohakuRailgunWakuModule> => {
    kohakuRailgunWakuModulePromise ??= import("@kohaku-eth/railgun-waku");
    return kohakuRailgunWakuModulePromise;
  };

const parseRailgunWakuPubSubTopic = (pubsubTopic: string): IRoutingInfo => {
  const match = /^\/waku\/2\/rs\/(\d+)\/(\d+)$/.exec(pubsubTopic.trim());

  if (!match) {
    throw new Error(
      `Invalid RAILGUN Waku pubsub topic "${pubsubTopic}". Expected /waku/2/rs/<cluster>/<shard>.`
    );
  }

  return {
    clusterId: Number(match[1]),
    shardId: Number(match[2]),
    pubsubTopic: pubsubTopic.trim()
  };
};

export const describeRailgunWakuPubSubTopic = (
  pubsubTopic: string
): string => {
  const routingInfo = parseRailgunWakuPubSubTopic(pubsubTopic);
  return `cluster ${routingInfo.clusterId}, shard ${routingInfo.shardId}`;
};

const transportKeyForPolicy = (policy: ConnectionPolicy): string =>
  JSON.stringify({
    pubsubTopic: policy.railgunBroadcasterPubSubTopic.trim(),
    dnsDiscoveryUrls: policy.railgunBroadcasterDnsDiscoveryUrls,
    directPeers: policy.railgunBroadcasterDirectPeers
  });

const createWakuNodeOptions = (
  policy: ConnectionPolicy,
  routingInfo: IRoutingInfo
): CreateNodeOptions => {
  const directPeers = policy.railgunBroadcasterDirectPeers.filter(Boolean);

  return {
    defaultBootstrap: false,
    bootstrapPeers: directPeers,
    networkConfig: {
      clusterId: routingInfo.clusterId
    },
    discovery: {
      // @waku/sdk 0.0.36 hardcodes its DNS ENR trees. Keep DNS discovery off so
      // Bindle only dials the direct peers shown in ConnectionPolicy.
      dns: false,
      peerExchange: true,
      peerCache: true
    },
    store: {
      peers: []
    },
    userAgent: "bindle"
  };
};

const makeWakuMessage = (decoded: IDecodedMessage): WakuMessage => ({
  payload: Array.from(decoded.payload),
  contentTopic: decoded.contentTopic,
  timestamp: decoded.timestamp ? decoded.timestamp.getTime() : undefined
});

class BindleWakuNodeAdapter implements WakuAdapter {
  private messageQueue: WakuMessage[] = [];
  private waiters: Array<(value: WakuMessage | null) => void> = [];
  private closed = false;

  constructor(
    private readonly sdk: WakuSdkModule,
    private readonly node: LightNode,
    private readonly routingInfo: IRoutingInfo
  ) {}

  async subscribe(topics: string[]): Promise<void> {
    const decoders = topics.map((contentTopic) =>
      this.sdk.createDecoder(contentTopic, this.routingInfo)
    );

    await this.node.filter.subscribe(decoders, (decoded) => {
      this.enqueue(makeWakuMessage(decoded));
    });
  }

  async nextMessage(): Promise<WakuMessage | null> {
    if (this.messageQueue.length > 0) {
      return this.messageQueue.shift() ?? null;
    }

    if (this.closed) {
      return null;
    }

    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }

  async send(topic: string, payload: Uint8Array): Promise<void> {
    const encoder = this.sdk.createEncoder({
      contentTopic: topic,
      routingInfo: this.routingInfo
    });

    await this.node.lightPush.send(encoder, { payload });
  }

  async retrieveHistorical(topic: string): Promise<WakuMessage[]> {
    const decoder = this.sdk.createDecoder(topic, this.routingInfo);
    const messages: WakuMessage[] = [];
    const generator = this.node.store.queryGenerator([decoder], {
      includeData: true,
      pubsubTopic: this.routingInfo.pubsubTopic,
      contentTopics: [topic],
      paginationForward: true,
      timeStart: new Date(Date.now() - historicalLookbackMs),
      timeEnd: new Date()
    });

    for await (const page of generator) {
      for (const promise of page) {
        const decoded = await promise;

        if (decoded) {
          messages.push(makeWakuMessage(decoded));
        }
      }
    }

    return messages;
  }

  close(): void {
    this.closed = true;

    for (const resolve of this.waiters) {
      resolve(null);
    }

    this.waiters = [];
  }

  async stop(): Promise<void> {
    this.close();
    await this.node.stop();
  }

  private enqueue(message: WakuMessage): void {
    const waiter = this.waiters.shift();

    if (waiter) {
      waiter(message);
      return;
    }

    this.messageQueue.push(message);
  }
}

const stopActiveTransport = async (): Promise<void> => {
  const transport = await activeTransportPromise?.catch(() => null);
  activeTransportPromise = null;
  activeTransportKey = null;

  if (transport) {
    await transport.adapter.stop().catch(() => undefined);
  }
};

export const ensureRailgunWakuBroadcasterTransport = async ({
  policy,
  onStatus
}: {
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<RailgunWakuBroadcasterTransport> => {
  const pubsubTopic = policy.railgunBroadcasterPubSubTopic.trim();

  if (!policy.wakuEnabled || !policy.railgunBroadcasterEnabled) {
    throw new Error("Enable Waku broadcaster discovery before Private Pay.");
  }

  if (
    policy.railgunBroadcasterMode !== "waku-public-network" &&
    policy.railgunBroadcasterMode !== "custom-waku"
  ) {
    throw new Error("Select Waku broadcaster mode before Private Pay.");
  }

  if (!pubsubTopic) {
    throw new Error("Configure a RAILGUN Waku pubsub topic.");
  }

  if (policy.railgunBroadcasterDirectPeers.length === 0) {
    throw new Error(
      "Configure at least one visible RAILGUN Waku direct peer. This Waku SDK version cannot consume custom DNS ENR trees without hidden defaults."
    );
  }

  const policyKey = transportKeyForPolicy(policy);

  if (activeTransportPromise && activeTransportKey === policyKey) {
    return activeTransportPromise;
  }

  await stopActiveTransport();

  activeTransportKey = policyKey;
  activeTransportPromise = (async () => {
    const routingInfo = parseRailgunWakuPubSubTopic(pubsubTopic);
    const [wakuSdk, railgunWaku] = await Promise.all([
      loadWakuSdkModule(),
      loadKohakuRailgunWakuModule()
    ]);

    onStatus(
      `Starting RAILGUN Waku broadcaster node (${describeRailgunWakuPubSubTopic(
        pubsubTopic
      )}).`
    );
    const node = await wakuSdk.createLightNode(
      createWakuNodeOptions(policy, routingInfo)
    );

    if (!node.isStarted()) {
      await node.start();
    }

    onStatus("Waiting for Waku Filter, LightPush, and Store peers.");
    await node.waitForPeers(
      [
        wakuSdk.Protocols.Filter,
        wakuSdk.Protocols.LightPush,
        wakuSdk.Protocols.Store
      ],
      peerDiscoveryTimeoutMs
    );

    const adapter = new BindleWakuNodeAdapter(wakuSdk, node, routingInfo);
    const manager = new railgunWaku.JsBroadcasterManager(
      railgunMainnetChainId,
      adapter,
      []
    );
    manager.start();
    onStatus("RAILGUN Waku broadcaster manager started.");

    return {
      policyKey,
      pubsubTopic,
      manager,
      adapter
    };
  })();

  try {
    return await activeTransportPromise;
  } catch (error) {
    activeTransportPromise = null;
    activeTransportKey = null;
    throw error;
  }
};

const serializeFee = (fee: Fee): SelectedRailgunBroadcaster["tokenFee"] => ({
  feesID: fee.feesId,
  token: fee.token,
  perUnitGas: fee.perUnitGas.toString(),
  recipient: fee.recipient,
  expiration: fee.expiration,
  availableWallets: fee.availableWallets,
  relayAdapt: fee.relayAdapt,
  reliability: fee.reliability
});

export const resolveRailgunBroadcasterFeeTokenAddress = (
  policy: Pick<
    ConnectionPolicy,
    "railgunBroadcasterFeeToken" | "railgunBroadcasterCustomFeeTokenAddress"
  >
): Address => {
  if (policy.railgunBroadcasterFeeToken === "USDC") {
    return mainnetUsdcAddress;
  }

  if (policy.railgunBroadcasterFeeToken === "WETH") {
    return UNISWAP_V4_WETH_ADDRESS;
  }

  if (policy.railgunBroadcasterFeeToken === "custom") {
    const value = policy.railgunBroadcasterCustomFeeTokenAddress.trim();

    if (!value) {
      throw new Error("Configure a custom broadcaster fee token address.");
    }

    return getAddress(value) as Address;
  }

  throw new Error(
    `${policy.railgunBroadcasterFeeToken} is not wired as a RAILGUN broadcaster fee token yet. Use USDC, WETH, or a custom ERC-20 token address.`
  );
};

export const selectRailgunWakuBroadcaster = async ({
  manager,
  feeTokenAddress,
  onStatus
}: {
  manager: RailgunBroadcasterManagerLike;
  feeTokenAddress: Address;
  onStatus: (message: string) => void;
}): Promise<SelectedRailgunBroadcaster> => {
  onStatus(`Selecting RAILGUN Waku broadcaster for ${feeTokenAddress}.`);
  const broadcaster = await manager.bestBroadcasterForToken(
    feeTokenAddress,
    BigInt(Date.now())
  );

  if (!broadcaster) {
    throw new Error(
      `No RAILGUN Waku broadcaster is advertising fee token ${feeTokenAddress}.`
    );
  }

  onStatus(
    `Selected RAILGUN Waku broadcaster ${broadcaster.address}; fee ${broadcaster.fee.perUnitGas.toString()} per gas in ${broadcaster.fee.token}.`
  );

  return {
    submitter: "waku-railgun-broadcaster",
    address: broadcaster.address,
    railgunAddress: broadcaster.fee.recipient,
    tokenFee: serializeFee(broadcaster.fee),
    raw: broadcaster
  };
};

export const getRailgunWakuBroadcasterQuote = async ({
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

export const submitRailgunWakuBroadcasterTransaction = async ({
  prepared,
  policy,
  onStatus
}: {
  prepared: PreparedBroadcasterSubmit;
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<WakuBroadcasterSubmitResult> => {
  if (prepared.submitter !== "waku-railgun-broadcaster") {
    throw new Error(
      "Private RAILGUN actions can only be submitted through a Waku RAILGUN broadcaster."
    );
  }

  await ensureRailgunWakuBroadcasterTransport({ policy, onStatus });
  onStatus(
    `Submitting private RAILGUN operation through Waku broadcaster ${prepared.broadcaster.address}.`
  );
  const transactionHash = await prepared.broadcaster.raw.broadcast(
    prepared.provedTx
  );

  return {
    transactionHash,
    broadcasterId: prepared.broadcaster.address
  };
};

export const getRailgunWakuBroadcasterNetworkName = (): "ethereum-mainnet" =>
  "ethereum-mainnet";
