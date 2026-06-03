export type ProviderRoute = {
  id: string;
  name: string;
  handle: string;
  destination: string;
  settlementAsset: "USDC" | "ETH" | "DAI";
  railgunAction: "private-transfer" | "unshield-and-call";
  disclosure: "address-only" | "provider-memo" | "public-call";
};

export const providerRoutes: ProviderRoute[] = [
  {
    id: "0zk",
    name: "RAILGUN address",
    handle: "0zk",
    destination: "recipient supplied",
    settlementAsset: "USDC",
    railgunAction: "private-transfer",
    disclosure: "address-only"
  },
  {
    id: "coinbase",
    name: "Coinbase",
    handle: "@coinbase",
    destination: "0x provider deposit contract",
    settlementAsset: "USDC",
    railgunAction: "unshield-and-call",
    disclosure: "provider-memo"
  },
  {
    id: "safe",
    name: "Safe",
    handle: "@safe",
    destination: "0x Safe account",
    settlementAsset: "ETH",
    railgunAction: "unshield-and-call",
    disclosure: "public-call"
  },
  {
    id: "ens",
    name: "ENS",
    handle: ".eth",
    destination: "resolved 0x address",
    settlementAsset: "USDC",
    railgunAction: "unshield-and-call",
    disclosure: "address-only"
  }
];

export const findProviderRoute = (recipient: string): ProviderRoute => {
  const normalized = recipient.trim().toLowerCase();

  if (normalized.startsWith("0zk")) {
    return providerRoutes[0];
  }

  if (normalized.endsWith(".eth")) {
    return providerRoutes.find((route) => route.id === "ens") ?? providerRoutes[0];
  }

  if (normalized.startsWith("@coinbase")) {
    return (
      providerRoutes.find((route) => route.id === "coinbase") ??
      providerRoutes[0]
    );
  }

  if (normalized.startsWith("@safe")) {
    return providerRoutes.find((route) => route.id === "safe") ?? providerRoutes[0];
  }

  return providerRoutes[0];
};
