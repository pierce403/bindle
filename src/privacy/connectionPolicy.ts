export type OutboundClass =
  | "ethereum-rpc"
  | "railgun-poi"
  | "railgun-broadcaster"
  | "provider-resolution"
  | "price-quotes"
  | "waku";

export type ConnectionPolicy = {
  ethereumRpcUrl: string;
  poiAggregatorUrls: string[];
  broadcasterUrl: string;
  providerResolverUrl: string;
  priceQuoteUrl: string;
  wakuEnabled: boolean;
  debugLogging: boolean;
};

export type OutboundControl = {
  id: OutboundClass;
  label: string;
  mode: "required" | "optional" | "off";
  value: string;
};

export const defaultConnectionPolicy: ConnectionPolicy = {
  ethereumRpcUrl: "",
  poiAggregatorUrls: [],
  broadcasterUrl: "",
  providerResolverUrl: "",
  priceQuoteUrl: "",
  wakuEnabled: false,
  debugLogging: false
};

export const summarizeOutbound = (
  policy: ConnectionPolicy
): OutboundControl[] => [
  {
    id: "ethereum-rpc",
    label: "Ethereum RPC",
    mode: policy.ethereumRpcUrl ? "required" : "off",
    value: policy.ethereumRpcUrl || "not connected"
  },
  {
    id: "railgun-poi",
    label: "Private POI",
    mode: policy.poiAggregatorUrls.length > 0 ? "optional" : "off",
    value:
      policy.poiAggregatorUrls.length > 0
        ? `${policy.poiAggregatorUrls.length} configured`
        : "not connected"
  },
  {
    id: "railgun-broadcaster",
    label: "Broadcaster",
    mode: policy.broadcasterUrl ? "optional" : "off",
    value: policy.broadcasterUrl || "not connected"
  },
  {
    id: "provider-resolution",
    label: "Provider routing",
    mode: policy.providerResolverUrl ? "optional" : "off",
    value: policy.providerResolverUrl || "local table"
  },
  {
    id: "price-quotes",
    label: "Quotes",
    mode: policy.priceQuoteUrl ? "optional" : "off",
    value: policy.priceQuoteUrl || "manual"
  },
  {
    id: "waku",
    label: "Waku",
    mode: policy.wakuEnabled ? "optional" : "off",
    value: policy.wakuEnabled ? "enabled" : "off"
  }
];
