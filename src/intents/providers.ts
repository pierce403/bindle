export type ProviderRoute = {
  id: string;
  name: string;
  handle: string;
  destination: string;
  settlementAsset: "ETH";
  railgunAction: "private-transfer" | "unshield-and-call";
  disclosure: "address-only" | "provider-memo" | "public-call";
};

export const providerRoutes: ProviderRoute[] = [
  {
    id: "railgun-private",
    name: "Private RAILGUN address",
    handle: "0zk",
    destination: "recipient supplied",
    settlementAsset: "ETH",
    railgunAction: "private-transfer",
    disclosure: "address-only"
  },
  {
    id: "evm-address",
    name: "Public EVM address",
    handle: "0x",
    destination: "recipient supplied",
    settlementAsset: "ETH",
    railgunAction: "unshield-and-call",
    disclosure: "address-only"
  },
  {
    id: "ens",
    name: "ENS",
    handle: ".eth",
    destination: "resolved at send time",
    settlementAsset: "ETH",
    railgunAction: "unshield-and-call",
    disclosure: "address-only"
  }
];

export const findProviderRoute = (recipient: string): ProviderRoute => {
  const normalized = recipient.trim().toLowerCase();

  if (normalized.startsWith("0zk")) {
    return providerRoutes[0];
  }

  if (normalized.startsWith("0x")) {
    return (
      providerRoutes.find((route) => route.id === "evm-address") ??
      providerRoutes[0]
    );
  }

  if (normalized.endsWith(".eth")) {
    return providerRoutes.find((route) => route.id === "ens") ?? providerRoutes[0];
  }

  return providerRoutes[0];
};
