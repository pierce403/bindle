#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { getAddress } from "viem";
import * as wakuSdk from "@waku/sdk";

const chainId = 1n;
const defaultTopic = "/waku/2/rs/5/1";
const defaultDirectPeers = [
  "/dns4/relay-a.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x",
  "/dns4/relay-b.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmPtEAoPPok7VLrpNNC6t92ZQFqLndHvkdx6Fk3CxA4MaG",
  "/dns4/client-edge.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A"
];
const defaultTokens = [
  ["WETH", "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"],
  ["USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"]
];
const defaultTimeoutMs = 90_000;
const pollMs = 2_500;
const historyLookbackMs = 300_000;

const usage = () => `Usage:
  pnpm scan:waku
  pnpm scan:waku -- --timeout 120000
  pnpm scan:waku -- --token DAI=0x6B175474E89094C44Da98b954EedeAC495271d0F
  pnpm scan:waku -- --peer /dns4/example/tcp/8000/wss/p2p/...
  pnpm scan:waku -- --json

Options:
  --topic <topic>       RAILGUN Waku pubsub topic. Default: ${defaultTopic}
  --peer <multiaddr>    Visible Waku direct peer. Repeatable. Defaults to Bindle public peers.
  --token <sym=addr>    Fee token to probe. Repeatable. Defaults to WETH and USDC.
  --timeout <ms>        Total scan timeout. Default: ${defaultTimeoutMs}
  --json                Print machine-readable JSON.
  --help                Show this help.

This is a no-spend diagnostic: it starts a Waku light node, searches for
Kohaku RAILGUN broadcaster fee advertisements, and stops. It does not create a
proof, sign, submit a transaction, call Pimlico, or touch the smart wallet.`;

const parseArgs = (argv) => {
  const options = {
    json: false,
    peers: [],
    timeoutMs: defaultTimeoutMs,
    tokens: [],
    topic: defaultTopic
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--") {
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      console.log(usage());
      process.exit(0);
    }

    if (arg === "--json") {
      options.json = true;
      continue;
    }

    const nextValue = () => {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} requires a value.`);
      }

      index += 1;
      return value;
    };

    if (arg === "--topic") {
      options.topic = nextValue();
      continue;
    }

    if (arg === "--peer") {
      options.peers.push(nextValue());
      continue;
    }

    if (arg === "--token") {
      const token = nextValue();
      const separator = token.indexOf("=");

      if (separator === -1) {
        throw new Error("--token must use SYMBOL=0xAddress.");
      }

      options.tokens.push([
        token.slice(0, separator).trim(),
        token.slice(separator + 1).trim()
      ]);
      continue;
    }

    if (arg === "--timeout") {
      const timeout = Number(nextValue());

      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error("--timeout must be a positive millisecond value.");
      }

      options.timeoutMs = timeout;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    ...options,
    peers: options.peers.length > 0 ? options.peers : defaultDirectPeers,
    tokens: options.tokens.length > 0 ? options.tokens : defaultTokens
  };
};

const parseRailgunWakuTopic = (topic) => {
  const match = /^\/waku\/2\/rs\/(\d+)\/(\d+)$/.exec(topic.trim());

  if (!match) {
    throw new Error(
      `Invalid topic "${topic}". Expected /waku/2/rs/<cluster>/<shard>.`
    );
  }

  return {
    clusterId: Number(match[1]),
    shardId: Number(match[2]),
    pubsubTopic: topic.trim()
  };
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const unixSeconds = () => BigInt(Math.floor(Date.now() / 1000));

const stopNode = async (node) => {
  if (!node?.stop) {
    return;
  }

  await Promise.race([
    node.stop(),
    delay(2_000).then(() => {
      throw new Error("Timed out while stopping Waku node.");
    })
  ]).catch(() => undefined);
};

const serializeBroadcaster = (broadcaster) => ({
  broadcasterAddress: broadcaster.address,
  railgunFeeRecipient: broadcaster.fee.recipient,
  token: broadcaster.fee.token,
  perUnitGas: broadcaster.fee.perUnitGas.toString(),
  expiration: broadcaster.fee.expiration,
  feesId: broadcaster.fee.feesId,
  availableWallets: broadcaster.fee.availableWallets,
  relayAdapt: broadcaster.fee.relayAdapt,
  reliability: broadcaster.fee.reliability
});

const loadRailgunWaku = async () => {
  const require = createRequire(import.meta.url);
  const packageJsonPath = require.resolve("@kohaku-eth/railgun-waku/package.json");
  const packageRoot = dirname(packageJsonPath);
  const modulePath = join(packageRoot, "dist/pkg/railgun_rs.js");
  const wasmPath = join(packageRoot, "dist/pkg/railgun_rs_bg.wasm");
  const railgunWaku = await import(pathToFileURL(modulePath).href);
  const wasmBytes = await readFile(wasmPath);

  await railgunWaku.default({ module_or_path: wasmBytes });

  return railgunWaku;
};

const createNodeOptions = ({ peers, routingInfo }) => ({
  defaultBootstrap: false,
  bootstrapPeers: peers,
  networkConfig: {
    clusterId: routingInfo.clusterId
  },
  discovery: {
    dns: false,
    peerExchange: true,
    peerCache: true
  },
  store: {
    peers: []
  },
  userAgent: "bindle-waku-relay-scanner"
});

const makeWakuMessage = (decoded) => ({
  payload: Array.from(decoded.payload),
  contentTopic: decoded.contentTopic,
  timestamp: decoded.timestamp ? decoded.timestamp.getTime() : undefined
});

class ScriptWakuAdapter {
  messageQueue = [];
  waiters = [];
  closed = false;

  constructor(node, routingInfo) {
    this.node = node;
    this.routingInfo = routingInfo;
  }

  async subscribe(topics) {
    const decoders = topics.map((contentTopic) =>
      wakuSdk.createDecoder(contentTopic, this.routingInfo)
    );

    await this.node.filter.subscribe(decoders, (decoded) => {
      this.enqueue(makeWakuMessage(decoded));
    });
  }

  async nextMessage() {
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

  async send(topic, payload) {
    const encoder = wakuSdk.createEncoder({
      contentTopic: topic,
      routingInfo: this.routingInfo
    });

    await this.node.lightPush.send(encoder, { payload });
  }

  async retrieveHistorical(topic) {
    const decoder = wakuSdk.createDecoder(topic, this.routingInfo);
    const messages = [];
    const generator = this.node.store.queryGenerator([decoder], {
      includeData: true,
      pubsubTopic: this.routingInfo.pubsubTopic,
      contentTopics: [topic],
      paginationForward: true,
      timeStart: new Date(Date.now() - historyLookbackMs),
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

  close() {
    this.closed = true;

    for (const resolve of this.waiters) {
      resolve(null);
    }

    this.waiters = [];
  }

  enqueue(message) {
    const waiter = this.waiters.shift();

    if (waiter) {
      waiter(message);
      return;
    }

    this.messageQueue.push(message);
  }
}

const printHumanHeader = ({ options }) => {
  if (options.json) return;

  console.log("Kohaku RAILGUN Waku relay scan");
  console.log(`Topic: ${options.topic}`);
  console.log(`Timeout: ${options.timeoutMs}ms`);
  console.log("Direct peers:");

  for (const peer of options.peers) {
    console.log(`  - ${peer}`);
  }

  console.log("Fee tokens:");

  for (const [symbol, address] of options.tokens) {
    console.log(`  - ${symbol}: ${address}`);
  }

  console.log(
    "No-spend scan: no proof, no transaction, no smart wallet, no Pimlico."
  );
  console.log("");
};

const scan = async (options) => {
  const startedAt = Date.now();
  const routingInfo = parseRailgunWakuTopic(options.topic);
  const tokens = options.tokens.map(([symbol, address]) => ({
    symbol,
    address: getAddress(address)
  }));
  let node;
  let adapter;
  let manager;

  try {
    const railgunWaku = await loadRailgunWaku();

    if (!options.json) {
      console.log("Starting Waku light node...");
    }

    node = await wakuSdk.createLightNode(createNodeOptions({
      peers: options.peers,
      routingInfo
    }));

    if (!node.isStarted()) {
      await node.start();
    }

    if (!options.json) {
      console.log("Waiting for Filter, LightPush, and Store peers...");
    }

    await node.waitForPeers(
      [wakuSdk.Protocols.Filter, wakuSdk.Protocols.LightPush, wakuSdk.Protocols.Store],
      options.timeoutMs
    );

    adapter = new ScriptWakuAdapter(node, routingInfo);
    manager = new railgunWaku.JsBroadcasterManager(chainId, adapter, []);
    manager.start();

    const found = new Map();
    const tokenResults = new Map(tokens.map((token) => [
      token.symbol,
      {
        ...token,
        broadcaster: null,
        error: null
      }
    ]));
    const deadline = Date.now() + options.timeoutMs;

    if (!options.json) {
      const peerCount = (await node.getConnectedPeers()).length;
      console.log(`Connected Waku peers: ${peerCount}`);
      console.log("Searching broadcaster fee advertisements...");
    }

    while (Date.now() < deadline) {
      for (const token of tokens) {
        const current = tokenResults.get(token.symbol);

        if (current?.broadcaster) {
          continue;
        }

        try {
          const broadcaster = await manager.bestBroadcasterForToken(
            token.address,
            unixSeconds()
          );

          if (!broadcaster) {
            continue;
          }

          const serialized = serializeBroadcaster(broadcaster);
          tokenResults.set(token.symbol, {
            ...token,
            broadcaster: serialized,
            error: null
          });
          found.set(`${serialized.railgunFeeRecipient}:${serialized.feesId}`, {
            ...serialized,
            supportedProbeTokens: [
              ...(found.get(`${serialized.railgunFeeRecipient}:${serialized.feesId}`)
                ?.supportedProbeTokens ?? []),
              token.symbol
            ]
          });

          if (!options.json) {
            console.log(
              `Found ${token.symbol}: ${serialized.railgunFeeRecipient} fee ${serialized.perUnitGas} per gas`
            );
          }
        } catch (error) {
          tokenResults.set(token.symbol, {
            ...token,
            broadcaster: null,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      if ([...tokenResults.values()].every((result) => result.broadcaster)) {
        break;
      }

      await delay(Math.min(pollMs, Math.max(0, deadline - Date.now())));
    }

    const peerCount = (await node.getConnectedPeers()).length;
    const result = {
      ok: found.size > 0,
      createdAt: new Date().toISOString(),
      elapsedMs: Date.now() - startedAt,
      chainId: Number(chainId),
      topic: options.topic,
      peers: {
        configured: options.peers,
        connectedCount: peerCount
      },
      tokens: [...tokenResults.values()],
      broadcasters: [...found.values()],
      notes: [
        "This is a no-spend Waku scan.",
        "No proof was generated.",
        "No transaction was submitted.",
        "No public smart wallet, ERC-4337 bundler, paymaster, or Pimlico endpoint was contacted.",
        "This scanner uses visible direct peers and disables @waku/sdk default DNS discovery."
      ]
    };

    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      console.log("");
      console.log(found.size > 0 ? "Broadcasters found." : "No broadcasters found.");

      for (const result of tokenResults.values()) {
        if (result.broadcaster) {
          console.log(
            `${result.symbol}: ${result.broadcaster.railgunFeeRecipient} (${result.broadcaster.broadcasterAddress})`
          );
        } else {
          console.log(`${result.symbol}: none`);
        }
      }
    }

    return result;
  } finally {
    adapter?.close();
    manager?.free?.();
    await stopNode(node);
  }
};

try {
  const options = parseArgs(process.argv.slice(2));
  const originalConsole = {
    info: console.info,
    log: console.log,
    warn: console.warn
  };

  if (options.json) {
    console.log = () => undefined;
    console.info = () => undefined;
    console.warn = () => undefined;
  }

  printHumanHeader({ options });
  await scan(options);
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
