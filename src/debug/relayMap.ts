import { getAddress, numberToHex, type Address } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";
import {
  ensureRailgunWakuBroadcasterTransport,
  selectRawRailgunWakuBroadcasterAd,
  selectRailgunWakuBroadcaster,
  stopRailgunWakuBroadcasterTransport
} from "../railgun/wakuBroadcaster";
import { isPimlicoBundlerUrl } from "../wallet/userOperationGas";

export type RelayMapStatus =
  | "idle"
  | "scanning"
  | "connected"
  | "no-waku-peers"
  | "no-broadcasters"
  | "partial"
  | "error";

export type FeeTokenProbe = {
  symbol: "WETH" | "USDC" | "custom";
  tokenAddress: string;
  broadcasterFound: boolean;
  rawAdFound?: boolean;
  selectionSource?: "kohaku-manager" | "raw-fee-ad" | null;
  selectedBroadcasterRailgunAddress: string | null;
  feesId: string | null;
  feePerUnitGas: string | null;
  signatureStatus?: string | null;
  rawTokenFee?: unknown;
  error: string | null;
};

export type WakuBroadcasterMapSnapshot = {
  createdAt: string;
  chainId: 1;
  network: "ethereum-mainnet";
  status: RelayMapStatus;
  elapsedMs: number;
  transport: "kohaku-waku" | "unavailable";
  pubsubTopic: string | null;
  wakuPeerCount: number | null;
  requiredProtocols: {
    filter: "ready" | "unknown" | "error";
    lightPush: "ready" | "unknown" | "error";
    store: "ready" | "unknown" | "error";
  };
  rawFeeMessagesObserved: number;
  rawFeeAdsParsed: number;
  kohakuManagerSelections: number;
  feeTokens: FeeTokenProbe[];
  discoveredBroadcasters: Array<{
    railgunAddress: string;
    supportedFeeTokens: string[];
    feeTokenQuotes?: Array<{
      symbol: string;
      tokenAddress: string;
      feePerUnitGas: string;
    }>;
    feesId?: string;
    identifier?: string;
    version?: string;
    availableWallets?: number;
    feeExpiration?: number;
    relayAdapt?: string;
    relayAdapt7702?: string;
    requiredPoiListKeys?: string[];
    reliability?: number;
    receivedAt?: number | null;
    selectionSource?: "kohaku-manager" | "raw-fee-ad";
    signatureStatus?: string;
    raw?: unknown;
  }>;
  notes: string[];
  error: string | null;
};

export type PublicEndpointMapSnapshot = {
  ethereumRpc: {
    url: string;
    configured: boolean;
    chainId: number | null;
    blockNumber: string | null;
    error: string | null;
  };
  bundler: {
    url: string;
    configured: boolean;
    supportedEntryPoints?: string[];
    pimlicoGasPriceSupported?: boolean;
    error: string | null;
  };
  paymaster: {
    url: string;
    configured: boolean;
    error: string | null;
  };
  railgunSyncIndexer: {
    url: string;
    configured: boolean;
    error: string | null;
  };
};

export type DebugMapSnapshot = {
  createdAt: string;
  endpointPreset: ConnectionPolicy["endpointPreset"];
  providerMode: ConnectionPolicy["providerMode"];
  wakuBroadcaster: WakuBroadcasterMapSnapshot | null;
  publicEndpoints: PublicEndpointMapSnapshot | null;
};

const mainnetUsdcAddress = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
) as Address;

const knownFeeTokenSymbols = new Map<string, string>([
  [UNISWAP_V4_WETH_ADDRESS.toLowerCase(), "WETH"],
  [mainnetUsdcAddress.toLowerCase(), "USDC"],
  [getAddress("0x6B175474E89094C44Da98b954EedeAC495271d0F").toLowerCase(), "DAI"],
  [getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7").toLowerCase(), "USDT"],
  [getAddress("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599").toLowerCase(), "WBTC"]
]);

const noSpendNotes = [
  "No transaction was created.",
  "No proof was generated.",
  "No public smart wallet or ERC-4337 bundler was contacted for Waku scanning."
];

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const jsonRpcRequest = async <Result>(
  url: string,
  method: string,
  params: unknown[] = []
): Promise<Result> => {
  const response = await fetch(url, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method,
      params
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const responseText = await response.text();
  const payload = responseText ? (JSON.parse(responseText) as unknown) : null;

  if (!response.ok) {
    throw new Error(`${method} failed with HTTP ${response.status}`);
  }

  if (
    !payload ||
    typeof payload !== "object" ||
    !("result" in payload)
  ) {
    const maybeError =
      payload && typeof payload === "object" && "error" in payload
        ? JSON.stringify((payload as { error: unknown }).error)
        : "missing result";
    throw new Error(`${method} returned ${maybeError}`);
  }

  return (payload as { result: Result }).result;
};

const feeTokensForPolicy = (
  policy: ConnectionPolicy
): Array<Pick<FeeTokenProbe, "symbol" | "tokenAddress">> => {
  const feeTokens: Array<Pick<FeeTokenProbe, "symbol" | "tokenAddress">> = [
    {
      symbol: "WETH",
      tokenAddress: UNISWAP_V4_WETH_ADDRESS
    },
    {
      symbol: "USDC",
      tokenAddress: mainnetUsdcAddress
    }
  ];
  const customToken = policy.railgunBroadcasterCustomFeeTokenAddress.trim();

  if (policy.railgunBroadcasterFeeToken === "custom" && customToken) {
    feeTokens.push({
      symbol: "custom",
      tokenAddress: customToken
    });
  }

  return feeTokens;
};

const feeTokenSymbolForAddress = (tokenAddress: string): string => {
  try {
    const normalized = getAddress(tokenAddress);
    return (
      knownFeeTokenSymbols.get(normalized.toLowerCase()) ??
      `${normalized.slice(0, 6)}...${normalized.slice(-4)}`
    );
  } catch {
    return tokenAddress;
  }
};

const mergeUnique = (left: string[], right: string[]): string[] =>
  Array.from(new Set([...left, ...right]));

const mergeFeeTokenQuotes = (
  left: NonNullable<
    WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number]["feeTokenQuotes"]
  >,
  right: NonNullable<
    WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number]["feeTokenQuotes"]
  >
) => {
  const byAddress = new Map<string, (typeof left)[number]>();

  for (const quote of [...left, ...right]) {
    byAddress.set(quote.tokenAddress.toLowerCase(), quote);
  }

  return Array.from(byAddress.values()).sort((a, b) =>
    a.symbol.localeCompare(b.symbol)
  );
};

const unavailableWakuSnapshot = ({
  policy,
  startedAt,
  error
}: {
  policy: ConnectionPolicy;
  startedAt: number;
  error: string;
}): WakuBroadcasterMapSnapshot => ({
  createdAt: new Date().toISOString(),
  chainId: 1,
  network: "ethereum-mainnet",
  status: "error",
  elapsedMs: Date.now() - startedAt,
  transport: "unavailable",
  pubsubTopic: policy.railgunBroadcasterPubSubTopic.trim() || null,
  wakuPeerCount: null,
  requiredProtocols: {
    filter: "error",
    lightPush: "error",
    store: "error"
  },
  rawFeeMessagesObserved: 0,
  rawFeeAdsParsed: 0,
  kohakuManagerSelections: 0,
  feeTokens: [],
  discoveredBroadcasters: [],
  notes: [
    ...noSpendNotes,
    "Installed Kohaku package did not complete Waku broadcaster discovery. Bindle needs the Kohaku Waku adapter path or a standalone Waku client before private actions can submit."
  ],
  error
});

export const scanWakuBroadcasterMap = async (
  policy: ConnectionPolicy
): Promise<WakuBroadcasterMapSnapshot> => {
  const startedAt = Date.now();
  const notes = [
    ...noSpendNotes,
    "The current Waku SDK build uses visible direct peers; custom DNS ENR trees are shown for policy visibility but not dialed."
  ];

  try {
    const transport = await ensureRailgunWakuBroadcasterTransport({
      policy,
      onStatus: () => undefined
    });
    const wakuPeerCount = await transport.adapter.peerCount();
    await transport.adapter.waitForRawFeeAds(15_000);
    const rawFeeAdSnapshot = transport.adapter.getRawFeeAdSnapshot();
    const discoveredByRailgunAddress = new Map<
      string,
      WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number]
    >();

    for (const ad of rawFeeAdSnapshot.parsedAds) {
      const feeTokenQuotes = Object.entries(ad.fees)
        .map(([tokenAddress, feePerUnitGas]) => {
          const normalizedTokenAddress = getAddress(tokenAddress);
          return {
            symbol: feeTokenSymbolForAddress(normalizedTokenAddress),
            tokenAddress: normalizedTokenAddress,
            feePerUnitGas
          };
        })
        .sort((a, b) => a.symbol.localeCompare(b.symbol));
      const supportedFeeTokens = feeTokenQuotes.map((quote) => quote.symbol);
      const existing = discoveredByRailgunAddress.get(ad.railgunAddress);

      if (existing) {
        existing.supportedFeeTokens = mergeUnique(
          existing.supportedFeeTokens,
          supportedFeeTokens
        );
        existing.feeTokenQuotes = mergeFeeTokenQuotes(
          existing.feeTokenQuotes ?? [],
          feeTokenQuotes
        );
        existing.feeExpiration = Math.max(
          existing.feeExpiration ?? 0,
          ad.feeExpiration
        );
        existing.availableWallets = Math.max(
          existing.availableWallets ?? 0,
          ad.availableWallets
        );
        existing.reliability = Math.max(
          existing.reliability ?? 0,
          ad.reliability
        );
        existing.receivedAt =
          Math.max(existing.receivedAt ?? 0, ad.receivedAt ?? 0) || null;
        existing.raw = ad;
      } else {
        discoveredByRailgunAddress.set(ad.railgunAddress, {
          railgunAddress: ad.railgunAddress,
          supportedFeeTokens,
          feeTokenQuotes,
          feesId: ad.feesID,
          identifier: ad.identifier,
          version: ad.version,
          availableWallets: ad.availableWallets,
          feeExpiration: ad.feeExpiration,
          relayAdapt: ad.relayAdapt,
          relayAdapt7702: ad.relayAdapt7702,
          requiredPoiListKeys: ad.requiredPOIListKeys,
          reliability: ad.reliability,
          receivedAt: ad.receivedAt,
          selectionSource: "raw-fee-ad",
          signatureStatus: ad.signatureStatus,
          raw: ad
        });
      }
    }

    const feeTokenResults: FeeTokenProbe[] = [];
    let kohakuManagerSelections = 0;

    for (const feeToken of feeTokensForPolicy(policy)) {
      let tokenAddress: Address;

      try {
        tokenAddress = getAddress(feeToken.tokenAddress) as Address;
      } catch (error) {
        feeTokenResults.push({
          ...feeToken,
          broadcasterFound: false,
          rawAdFound: false,
          selectionSource: null,
          selectedBroadcasterRailgunAddress: null,
          feesId: null,
          feePerUnitGas: null,
          signatureStatus: null,
          error: errorMessage(error)
        });
        continue;
      }

      const rawSelected = selectRawRailgunWakuBroadcasterAd({
        feeAds: rawFeeAdSnapshot.parsedAds,
        feeTokenAddress: tokenAddress
      });

      try {
        const selected = await selectRailgunWakuBroadcaster({
          manager: transport.manager,
          feeTokenAddress: tokenAddress,
          onStatus: () => undefined
        });
        kohakuManagerSelections += 1;

        feeTokenResults.push({
          ...feeToken,
          tokenAddress,
          broadcasterFound: true,
          rawAdFound: Boolean(rawSelected),
          selectionSource: "kohaku-manager",
          selectedBroadcasterRailgunAddress: selected.railgunAddress,
          feesId: selected.tokenFee.feesID,
          feePerUnitGas: selected.tokenFee.perUnitGas,
          signatureStatus: "kohaku-manager",
          rawTokenFee: selected.tokenFee,
          error: null
        });

        const existing = discoveredByRailgunAddress.get(
          selected.railgunAddress
        );

        if (existing) {
          existing.supportedFeeTokens = mergeUnique(existing.supportedFeeTokens, [
            feeToken.symbol
          ]);
          existing.selectionSource = "kohaku-manager";
          existing.signatureStatus = "kohaku-manager";
        } else {
          discoveredByRailgunAddress.set(selected.railgunAddress, {
            railgunAddress: selected.railgunAddress,
            supportedFeeTokens: [feeToken.symbol],
            feeTokenQuotes: [
              {
                symbol: feeToken.symbol,
                tokenAddress,
                feePerUnitGas: selected.tokenFee.perUnitGas
              }
            ],
            feesId: selected.tokenFee.feesID,
            selectionSource: "kohaku-manager",
            signatureStatus: "kohaku-manager",
            raw: selected.tokenFee
          });
        }
      } catch (error) {
        if (rawSelected) {
          feeTokenResults.push({
            ...feeToken,
            tokenAddress,
            broadcasterFound: false,
            rawAdFound: true,
            selectionSource: "raw-fee-ad",
            selectedBroadcasterRailgunAddress: rawSelected.railgunAddress,
            feesId: rawSelected.feesID,
            feePerUnitGas: rawSelected.feePerUnitGas,
            signatureStatus: rawSelected.signatureStatus,
            rawTokenFee: rawSelected,
            error:
              "Raw Waku fee ad observed, but Kohaku did not return a selectable JsBroadcaster yet."
          });

          const existing = discoveredByRailgunAddress.get(
            rawSelected.railgunAddress
          );

          if (existing) {
            existing.supportedFeeTokens = mergeUnique(existing.supportedFeeTokens, [
              feeToken.symbol
            ]);
          } else {
            discoveredByRailgunAddress.set(rawSelected.railgunAddress, {
              railgunAddress: rawSelected.railgunAddress,
              supportedFeeTokens: [feeToken.symbol],
              feeTokenQuotes: [
                {
                  symbol: feeToken.symbol,
                  tokenAddress,
                  feePerUnitGas: rawSelected.feePerUnitGas
                }
              ],
              feesId: rawSelected.feesID,
              version: rawSelected.version,
              identifier: rawSelected.identifier,
              availableWallets: rawSelected.availableWallets,
              feeExpiration: rawSelected.feeExpiration,
              relayAdapt: rawSelected.relayAdapt,
              relayAdapt7702: rawSelected.relayAdapt7702,
              requiredPoiListKeys: rawSelected.requiredPOIListKeys,
              reliability: rawSelected.reliability,
              receivedAt: rawSelected.receivedAt,
              selectionSource: "raw-fee-ad",
              signatureStatus: rawSelected.signatureStatus,
              raw: rawSelected
            });
          }
          continue;
        }

        feeTokenResults.push({
          ...feeToken,
          tokenAddress,
          broadcasterFound: false,
          rawAdFound: false,
          selectionSource: null,
          selectedBroadcasterRailgunAddress: null,
          feesId: null,
          feePerUnitGas: null,
          signatureStatus: null,
          error: errorMessage(error)
        });
      }
    }

    const foundCount = feeTokenResults.filter(
      (feeToken) => feeToken.broadcasterFound
    ).length;
    const rawFoundCount = feeTokenResults.filter(
      (feeToken) => feeToken.rawAdFound
    ).length;
    const status: RelayMapStatus =
      wakuPeerCount === 0
        ? "no-waku-peers"
        : foundCount === 0 && rawFoundCount === 0
          ? "no-broadcasters"
          : foundCount === feeTokenResults.length
            ? "connected"
            : "partial";

    return {
      createdAt: new Date().toISOString(),
      chainId: 1,
      network: "ethereum-mainnet",
      status,
      elapsedMs: Date.now() - startedAt,
      transport: "kohaku-waku",
      pubsubTopic: transport.pubsubTopic,
      wakuPeerCount,
      requiredProtocols: {
        filter: "ready",
        lightPush: "ready",
        store: "ready"
      },
      rawFeeMessagesObserved: rawFeeAdSnapshot.observedMessages,
      rawFeeAdsParsed: rawFeeAdSnapshot.parsedAds.length,
      kohakuManagerSelections,
      feeTokens: feeTokenResults,
      discoveredBroadcasters: Array.from(discoveredByRailgunAddress.values())
        .map((broadcaster) => ({
          ...broadcaster,
          supportedFeeTokens: Array.from(new Set(broadcaster.supportedFeeTokens)).sort()
        }))
        .sort((left, right) =>
          (left.identifier ?? left.railgunAddress).localeCompare(
            right.identifier ?? right.railgunAddress
          )
        ),
      notes: [
        ...notes,
        rawFeeAdSnapshot.parsedAds.length > 0 && kohakuManagerSelections === 0
          ? "Raw current RAILGUN fee ads were observed, but the installed Kohaku Waku manager did not expose a selectable JsBroadcaster. Private Pay remains blocked until that compatibility gap is fixed."
          : null,
        rawFeeAdSnapshot.parseErrors.length > 0
          ? `Fee-ad parse errors: ${rawFeeAdSnapshot.parseErrors.slice(-3).join("; ")}`
          : null
      ].filter((note): note is string => Boolean(note)),
      error: rawFeeAdSnapshot.parseErrors.length
        ? rawFeeAdSnapshot.parseErrors.slice(-3).join("; ")
        : null
    };
  } catch (error) {
    const message = errorMessage(error);
    const lowerMessage = message.toLowerCase();

    return {
      ...unavailableWakuSnapshot({
        policy,
        startedAt,
        error: message
      }),
      status:
        lowerMessage.includes("peer") || lowerMessage.includes("waku")
          ? "no-waku-peers"
          : "error"
    };
  } finally {
    await stopRailgunWakuBroadcasterTransport();
  }
};

export const scanPublicEndpointMap = async (
  policy: ConnectionPolicy
): Promise<PublicEndpointMapSnapshot> => {
  const ethereumRpcUrl = policy.ethereumRpcUrl.trim();
  const bundlerUrl = policy.bundlerUrl.trim();
  const paymasterUrl = policy.paymasterUrl.trim();
  const railgunSyncUrl = policy.railgunSyncUrl.trim();
  const snapshot: PublicEndpointMapSnapshot = {
    ethereumRpc: {
      url: ethereumRpcUrl,
      configured: ethereumRpcUrl.length > 0,
      chainId: null,
      blockNumber: null,
      error: ethereumRpcUrl ? null : "not configured"
    },
    bundler: {
      url: bundlerUrl,
      configured: bundlerUrl.length > 0,
      error: bundlerUrl ? null : "not configured"
    },
    paymaster: {
      url: paymasterUrl,
      configured: paymasterUrl.length > 0,
      error: paymasterUrl
        ? "configured, not probed; paymaster APIs are provider-specific"
        : "not configured"
    },
    railgunSyncIndexer: {
      url: railgunSyncUrl,
      configured: railgunSyncUrl.length > 0,
      error: railgunSyncUrl ? null : "not configured"
    }
  };

  if (ethereumRpcUrl) {
    try {
      const [chainIdHex, blockNumberHex] = await Promise.all([
        jsonRpcRequest<string>(ethereumRpcUrl, "eth_chainId"),
        jsonRpcRequest<string>(ethereumRpcUrl, "eth_blockNumber")
      ]);

      snapshot.ethereumRpc.chainId = Number(BigInt(chainIdHex));
      snapshot.ethereumRpc.blockNumber = BigInt(blockNumberHex).toString();
    } catch (error) {
      snapshot.ethereumRpc.error = errorMessage(error);
    }
  }

  if (bundlerUrl) {
    try {
      snapshot.bundler.supportedEntryPoints = await jsonRpcRequest<string[]>(
        bundlerUrl,
        "eth_supportedEntryPoints"
      );
    } catch (error) {
      snapshot.bundler.error = errorMessage(error);
    }

    if (isPimlicoBundlerUrl(bundlerUrl)) {
      try {
        await jsonRpcRequest<unknown>(
          bundlerUrl,
          "pimlico_getUserOperationGasPrice"
        );
        snapshot.bundler.pimlicoGasPriceSupported = true;
      } catch (error) {
        snapshot.bundler.pimlicoGasPriceSupported = false;
        snapshot.bundler.error = [
          snapshot.bundler.error,
          errorMessage(error)
        ]
          .filter(Boolean)
          .join("; ");
      }
    }
  }

  if (railgunSyncUrl) {
    try {
      const response = await fetch(railgunSyncUrl, {
        body: JSON.stringify({
          query: "{ __typename }"
        }),
        headers: {
          "content-type": "application/json"
        },
        method: "POST"
      });

      if (!response.ok) {
        snapshot.railgunSyncIndexer.error = `health query failed with HTTP ${response.status}`;
      }
    } catch (error) {
      snapshot.railgunSyncIndexer.error = errorMessage(error);
    }
  }

  return snapshot;
};

const redactSensitiveWords = (value: string): string =>
  value.replace(
    /\b(mnemonics?|seed phrases?|spending keys?|viewing keys?|private keys?)\b/gi,
    "[redacted-label]"
  );

export const formatDebugMapSnapshot = (snapshot: DebugMapSnapshot): string =>
  redactSensitiveWords(
    JSON.stringify(
      {
        ...snapshot,
        warning:
          "Copy includes endpoint URLs, public relay map results, and errors only. It must not include mnemonics, private keys, spending keys, or viewing keys.",
        publicEndpointHexChainId: snapshot.publicEndpoints?.ethereumRpc.chainId
          ? numberToHex(snapshot.publicEndpoints.ethereumRpc.chainId)
          : null
      },
      null,
      2
    )
  );
