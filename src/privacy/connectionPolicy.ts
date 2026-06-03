export type OutboundClass =
  | "ethereum-rpc"
  | "railgun-poi"
  | "railgun-broadcaster"
  | "provider-resolution"
  | "price-quotes"
  | "waku"
  | "erc4337-bundler"
  | "erc4337-paymaster"
  | "passkey-attestation"
  | "wallet-recovery";

export type PrivacyToolkitId = "kohaku-railgun" | "railgun-wallet-sdk";

export type ConnectionPolicy = {
  privacyToolkit: PrivacyToolkitId;
  ethereumRpcUrl: string;
  poiAggregatorUrls: string[];
  broadcasterUrl: string;
  providerResolverUrl: string;
  priceQuoteUrl: string;
  bundlerUrl: string;
  paymasterUrl: string;
  passkeyAttestationUrl: string;
  recoveryServiceUrl: string;
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
  privacyToolkit: "kohaku-railgun",
  ethereumRpcUrl: "",
  poiAggregatorUrls: [],
  broadcasterUrl: "",
  providerResolverUrl: "",
  priceQuoteUrl: "",
  bundlerUrl: "",
  paymasterUrl: "",
  passkeyAttestationUrl: "",
  recoveryServiceUrl: "",
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
    id: "erc4337-bundler",
    label: "ERC-4337 bundler",
    mode: policy.bundlerUrl ? "optional" : "off",
    value: policy.bundlerUrl || "not connected"
  },
  {
    id: "erc4337-paymaster",
    label: "Paymaster",
    mode: policy.paymasterUrl ? "optional" : "off",
    value: policy.paymasterUrl || "not connected"
  },
  {
    id: "passkey-attestation",
    label: "Passkey attestation",
    mode: policy.passkeyAttestationUrl ? "optional" : "off",
    value: policy.passkeyAttestationUrl || "none"
  },
  {
    id: "wallet-recovery",
    label: "Wallet recovery",
    mode: policy.recoveryServiceUrl ? "optional" : "off",
    value: policy.recoveryServiceUrl || "none"
  },
  {
    id: "waku",
    label: "Waku",
    mode: policy.wakuEnabled ? "optional" : "off",
    value: policy.wakuEnabled ? "enabled" : "off"
  }
];
