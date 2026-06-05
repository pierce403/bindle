import { UNISWAP_V4_QUOTE_SOURCE } from "../intents/swapRouting";

export type OutboundClass =
  | "ethereum-rpc"
  | "helios-consensus-rpc"
  | "helios-checkpoint"
  | "railgun-sync"
  | "railgun-artifacts"
  | "railgun-poi"
  | "railgun-broadcaster"
  | "provider-resolution"
  | "price-quotes"
  | "waku"
  | "erc4337-bundler"
  | "erc4337-paymaster"
  | "passkey-attestation"
  | "wallet-recovery";

export type EndpointPresetId =
  | "bindle-default"
  | "privacy-max"
  | "custom"
  | "local-dev";

export type ProviderMode = "direct-rpc" | "helios";

export type HeliosNetwork = "mainnet" | "sepolia" | "holesky";

export type EndpointSource = "default" | "custom" | "off" | "local";

export type PrivacyToolkitId = "kohaku-railgun" | "railgun-wallet-sdk";

export type RailgunBroadcasterMode =
  | "waku-public-network"
  | "custom-waku"
  | "off";

export type RailgunBroadcasterFeeToken =
  | "USDC"
  | "ETH"
  | "WETH"
  | "RAIL"
  | "custom";

export type ConnectionPolicy = {
  endpointPreset: EndpointPresetId;
  providerMode: ProviderMode;
  privacyToolkit: PrivacyToolkitId;
  ethereumRpcUrl: string;
  heliosConsensusRpcUrl: string;
  heliosCheckpoint: string;
  heliosNetwork: HeliosNetwork;
  railgunSyncUrl: string;
  railgunArtifactUrl: string;
  poiAggregatorUrls: string[];
  broadcasterUrl: string;
  railgunBroadcasterMode: RailgunBroadcasterMode;
  railgunBroadcasterEnabled: boolean;
  railgunBroadcasterFeeToken: RailgunBroadcasterFeeToken;
  railgunBroadcasterCustomFeeTokenAddress: string;
  railgunBroadcasterTrustedFeeSigner: string;
  railgunBroadcasterPubSubTopic: string;
  railgunBroadcasterDnsDiscoveryUrls: string[];
  railgunBroadcasterDirectPeers: string[];
  providerResolverUrl: string;
  priceQuoteUrl: string;
  bundlerUrl: string;
  paymasterUrl: string;
  passkeyAttestationUrl: string;
  recoveryServiceUrl: string;
  autoStartToolkit: boolean;
  wakuEnabled: boolean;
  debugLogging: boolean;
};

export type OutboundControl = {
  id: OutboundClass;
  label: string;
  mode: "required" | "optional" | "off";
  source: EndpointSource;
  value: string;
};

export type EndpointPreset = {
  id: EndpointPresetId;
  label: string;
  description: string;
  policy: ConnectionPolicy;
};

export type EndpointChoice = {
  label: string;
  value: string;
};

export const KOHAKU_RAILGUN_ARTIFACT_BASE_URL =
  "https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";
export const BINDLE_RAILGUN_ARTIFACT_BASE_PATH = "/railgun-artifacts/";
export const RAILGUN_PUBLIC_WAKU_BROADCASTER_NETWORK =
  "waku://railgun-public-broadcasters";
export const RAILGUN_PUBLIC_WAKU_BROADCASTER_PUBSUB_TOPIC = "/waku/2/rs/5/1";
export const RAILGUN_PUBLIC_WAKU_BROADCASTER_DNS_DISCOVERY_URLS = [
  "enrtree://APMYHUVNQWHJNPI5L2KQ765EMCKUAMRWPUH3U2QIKPK6XEV3OW442@discovery.rootedinprivacy.com"
];
export const RAILGUN_PUBLIC_WAKU_BROADCASTER_DIRECT_PEERS = [
  "/dns4/relay-a.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmFbD2ZvAFi2j9jjDo6g4HFbQAhfjDfnTTrbyRGQRmtG7x",
  "/dns4/relay-b.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmPtEAoPPok7VLrpNNC6t92ZQFqLndHvkdx6Fk3CxA4MaG",
  "/dns4/client-edge.rootedinprivacy.com/tcp/8000/wss/p2p/16Uiu2HAmQdCGG5qREQCq96kucmpUVupmvLwrTRjMazPAaMTNP97A"
];

export const endpointChoices = {
  ethereumRpcUrl: [
    {
      label: "Bindle default RPC",
      value: "https://ethereum-rpc.publicnode.com"
    },
    {
      label: "Local node",
      value: "http://127.0.0.1:8545"
    }
  ],
  railgunSyncUrl: [
    {
      label: "Bindle default RAILGUN sync indexer",
      value: "https://rail-squid.squids.live/squid-railgun-ethereum-v2/v/v1/graphql"
    }
  ],
  railgunArtifactUrl: [
    {
      label: "Bindle-hosted RAILGUN proving artifacts",
      value: BINDLE_RAILGUN_ARTIFACT_BASE_PATH
    }
  ],
  bundlerUrl: [
    {
      label: "Bindle default ERC-4337 bundler",
      value: "https://public.pimlico.io/v2/1/rpc"
    },
    {
      label: "Local ERC-4337 bundler",
      value: "http://127.0.0.1:4337"
    }
  ],
  priceQuoteUrl: [
    {
      label: "Bindle default Uniswap v4 onchain quote",
      value: UNISWAP_V4_QUOTE_SOURCE
    }
  ],
  broadcasterUrl: [
    {
      label: "RAILGUN public Waku broadcaster network",
      value: RAILGUN_PUBLIC_WAKU_BROADCASTER_NETWORK
    }
  ],
  railgunBroadcasterPubSubTopic: [
    {
      label: "RAILGUN public Waku pubsub shard",
      value: RAILGUN_PUBLIC_WAKU_BROADCASTER_PUBSUB_TOPIC
    }
  ]
} as const;

const policyBase = {
  privacyToolkit: "kohaku-railgun" as PrivacyToolkitId,
  heliosConsensusRpcUrl: "",
  heliosCheckpoint: "",
  heliosNetwork: "mainnet" as HeliosNetwork,
  railgunSyncUrl: "",
  railgunArtifactUrl: "",
  poiAggregatorUrls: [],
  broadcasterUrl: "",
  railgunBroadcasterMode: "off" as RailgunBroadcasterMode,
  railgunBroadcasterEnabled: false,
  railgunBroadcasterFeeToken: "WETH" as RailgunBroadcasterFeeToken,
  railgunBroadcasterCustomFeeTokenAddress: "",
  railgunBroadcasterTrustedFeeSigner: "",
  railgunBroadcasterPubSubTopic: "",
  railgunBroadcasterDnsDiscoveryUrls: [],
  railgunBroadcasterDirectPeers: [],
  providerResolverUrl: "",
  priceQuoteUrl: "",
  paymasterUrl: "",
  passkeyAttestationUrl: "",
  recoveryServiceUrl: "",
  autoStartToolkit: true,
  wakuEnabled: false,
  debugLogging: false
};

export const endpointPresets: Record<EndpointPresetId, EndpointPreset> = {
  "bindle-default": {
    id: "bindle-default",
    label: "Bindle default",
    description:
      "Visible public defaults for normal use. These endpoints see network metadata.",
    policy: {
      ...policyBase,
      endpointPreset: "bindle-default",
      providerMode: "direct-rpc",
      ethereumRpcUrl: "https://ethereum-rpc.publicnode.com",
      railgunSyncUrl:
        "https://rail-squid.squids.live/squid-railgun-ethereum-v2/v/v1/graphql",
      railgunArtifactUrl: BINDLE_RAILGUN_ARTIFACT_BASE_PATH,
      broadcasterUrl: RAILGUN_PUBLIC_WAKU_BROADCASTER_NETWORK,
      railgunBroadcasterMode: "waku-public-network",
      railgunBroadcasterEnabled: true,
      railgunBroadcasterFeeToken: "WETH",
      railgunBroadcasterPubSubTopic:
        RAILGUN_PUBLIC_WAKU_BROADCASTER_PUBSUB_TOPIC,
      railgunBroadcasterDnsDiscoveryUrls:
        RAILGUN_PUBLIC_WAKU_BROADCASTER_DNS_DISCOVERY_URLS,
      railgunBroadcasterDirectPeers:
        RAILGUN_PUBLIC_WAKU_BROADCASTER_DIRECT_PEERS,
      bundlerUrl: "https://public.pimlico.io/v2/1/rpc",
      priceQuoteUrl: UNISWAP_V4_QUOTE_SOURCE,
      wakuEnabled: true
    }
  },
  "privacy-max": {
    id: "privacy-max",
    label: "Privacy max",
    description:
      "Starts with hosted endpoints empty/off for users bringing local or self-hosted infrastructure.",
    policy: {
      ...policyBase,
      autoStartToolkit: false,
      endpointPreset: "privacy-max",
      providerMode: "direct-rpc",
      ethereumRpcUrl: "",
      railgunSyncUrl: "",
      railgunArtifactUrl: "",
      bundlerUrl: ""
    }
  },
  custom: {
    id: "custom",
    label: "Custom",
    description: "Keep current values and edit each endpoint manually.",
    policy: {
      ...policyBase,
      autoStartToolkit: false,
      endpointPreset: "custom",
      providerMode: "direct-rpc",
      ethereumRpcUrl: "",
      railgunSyncUrl: "",
      railgunArtifactUrl: "",
      bundlerUrl: ""
    }
  },
  "local-dev": {
    id: "local-dev",
    label: "Local dev",
    description: "Localhost-style endpoints for development.",
    policy: {
      ...policyBase,
      endpointPreset: "local-dev",
      providerMode: "direct-rpc",
      ethereumRpcUrl: "http://127.0.0.1:8545",
      railgunSyncUrl: "",
      railgunArtifactUrl: "",
      bundlerUrl: "http://127.0.0.1:4337"
    }
  }
};

export const defaultConnectionPolicy: ConnectionPolicy =
  endpointPresets["bindle-default"].policy;

const localEndpointPattern = /^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?/i;

const sourceForValue = (
  policy: ConnectionPolicy,
  value: string,
  presetValue: string
): EndpointSource => {
  if (!value) {
    return "off";
  }

  if (localEndpointPattern.test(value)) {
    return "local";
  }

  return value === presetValue && policy.endpointPreset === "bindle-default"
    ? "default"
    : "custom";
};

const sourceForArray = (
  policy: ConnectionPolicy,
  value: string[],
  presetValue: string[]
): EndpointSource => {
  if (value.length === 0) {
    return "off";
  }

  if (value.every((item) => localEndpointPattern.test(item))) {
    return "local";
  }

  return JSON.stringify(value) === JSON.stringify(presetValue) &&
    policy.endpointPreset === "bindle-default"
    ? "default"
    : "custom";
};

const sourceForLiteral = (
  value: string,
  source: EndpointSource
): EndpointSource => (value ? source : "off");

export const applyEndpointPreset = (
  currentPolicy: ConnectionPolicy,
  endpointPreset: EndpointPresetId
): ConnectionPolicy => {
  if (endpointPreset === "custom") {
    return {
      ...currentPolicy,
      endpointPreset
    };
  }

  return endpointPresets[endpointPreset].policy;
};

export const markConnectionPolicyCustom = (
  policy: ConnectionPolicy
): ConnectionPolicy => ({
  ...policy,
  endpointPreset: "custom"
});

export const summarizeOutbound = (
  policy: ConnectionPolicy
): OutboundControl[] => {
  const bindleDefault = endpointPresets["bindle-default"].policy;

  return [
    {
      id: "ethereum-rpc",
      label:
        policy.providerMode === "helios"
          ? "Execution RPC"
          : "Ethereum RPC",
      mode: policy.ethereumRpcUrl ? "required" : "off",
      source: sourceForValue(
        policy,
        policy.ethereumRpcUrl,
        bindleDefault.ethereumRpcUrl
      ),
      value: policy.ethereumRpcUrl || "not connected"
    },
    {
      id: "helios-consensus-rpc",
      label: "Helios consensus RPC",
      mode:
        policy.providerMode === "helios" && policy.heliosConsensusRpcUrl
          ? "required"
          : "off",
      source: sourceForValue(
        policy,
        policy.heliosConsensusRpcUrl,
        bindleDefault.heliosConsensusRpcUrl
      ),
      value:
        policy.providerMode === "helios"
          ? policy.heliosConsensusRpcUrl || "not connected"
          : "off"
    },
    {
      id: "helios-checkpoint",
      label: "Helios checkpoint",
      mode:
        policy.providerMode === "helios" && policy.heliosCheckpoint
          ? "required"
          : "off",
      source: sourceForLiteral(policy.heliosCheckpoint, "custom"),
      value:
        policy.providerMode === "helios"
          ? policy.heliosCheckpoint || "not configured"
          : "off"
    },
    {
      id: "railgun-sync",
      label: "RAILGUN sync indexer",
      mode: policy.railgunSyncUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.railgunSyncUrl,
        bindleDefault.railgunSyncUrl
      ),
      value: policy.railgunSyncUrl || "not connected"
    },
    {
      id: "railgun-artifacts",
      label: "RAILGUN proving artifacts",
      mode: policy.railgunArtifactUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.railgunArtifactUrl,
        bindleDefault.railgunArtifactUrl
      ),
      value: policy.railgunArtifactUrl || "not connected"
    },
    {
      id: "railgun-poi",
      label: "Private POI",
      mode: policy.poiAggregatorUrls.length > 0 ? "optional" : "off",
      source: sourceForArray(
        policy,
        policy.poiAggregatorUrls,
        bindleDefault.poiAggregatorUrls
      ),
      value:
        policy.poiAggregatorUrls.length > 0
          ? `${policy.poiAggregatorUrls.length} configured`
          : "not connected"
    },
    {
      id: "railgun-broadcaster",
      label: "Broadcaster",
      mode:
        policy.railgunBroadcasterMode !== "off" &&
        policy.railgunBroadcasterEnabled &&
        policy.broadcasterUrl
          ? "optional"
          : "off",
      source: sourceForValue(
        policy,
        policy.broadcasterUrl,
        bindleDefault.broadcasterUrl
      ),
      value:
        policy.railgunBroadcasterMode === "off" ||
        !policy.railgunBroadcasterEnabled
          ? "off"
          : [
              policy.broadcasterUrl || "not selected",
              policy.railgunBroadcasterPubSubTopic
                ? `pubsub ${policy.railgunBroadcasterPubSubTopic}`
                : "pubsub off",
              policy.railgunBroadcasterTrustedFeeSigner
                ? `trusted fee signer ${policy.railgunBroadcasterTrustedFeeSigner}`
                : "trusted fee signer off",
              policy.railgunBroadcasterDnsDiscoveryUrls.length > 0
                ? `${policy.railgunBroadcasterDnsDiscoveryUrls.length} DNS discovery URL(s)`
                : "DNS discovery off",
              policy.railgunBroadcasterDirectPeers.length > 0
                ? `${policy.railgunBroadcasterDirectPeers.length} direct peer(s)`
                : "direct peers off"
            ].join("; ")
    },
    {
      id: "provider-resolution",
      label: "Provider routing",
      mode: policy.providerResolverUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.providerResolverUrl,
        bindleDefault.providerResolverUrl
      ),
      value: policy.providerResolverUrl || "local table"
    },
    {
      id: "price-quotes",
      label: "Quotes",
      mode: policy.priceQuoteUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.priceQuoteUrl,
        bindleDefault.priceQuoteUrl
      ),
      value: policy.priceQuoteUrl || "manual"
    },
    {
      id: "erc4337-bundler",
      label: "ERC-4337 bundler",
      mode: policy.bundlerUrl ? "optional" : "off",
      source: sourceForValue(policy, policy.bundlerUrl, bindleDefault.bundlerUrl),
      value: policy.bundlerUrl || "not connected"
    },
    {
      id: "erc4337-paymaster",
      label: "Paymaster",
      mode: policy.paymasterUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.paymasterUrl,
        bindleDefault.paymasterUrl
      ),
      value: policy.paymasterUrl || "not connected"
    },
    {
      id: "passkey-attestation",
      label: "Passkey attestation",
      mode: policy.passkeyAttestationUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.passkeyAttestationUrl,
        bindleDefault.passkeyAttestationUrl
      ),
      value: policy.passkeyAttestationUrl || "none"
    },
    {
      id: "wallet-recovery",
      label: "Wallet recovery",
      mode: policy.recoveryServiceUrl ? "optional" : "off",
      source: sourceForValue(
        policy,
        policy.recoveryServiceUrl,
        bindleDefault.recoveryServiceUrl
      ),
      value: policy.recoveryServiceUrl || "none"
    },
    {
      id: "waku",
      label: "Waku",
      mode: policy.wakuEnabled ? "optional" : "off",
      source:
        policy.wakuEnabled &&
        bindleDefault.wakuEnabled &&
        policy.endpointPreset === "bindle-default"
          ? "default"
          : policy.wakuEnabled
            ? "custom"
            : "off",
      value: policy.wakuEnabled ? "enabled" : "off"
    }
  ];
};
