export type PayAssetSymbol = "ETH" | "USDC";

export type PayAsset = {
  symbol: PayAssetSymbol;
  name: string;
  chainId: 1;
  decimals: number;
  kind: "native" | "erc20";
  address: "native" | `0x${string}`;
  settlementNetwork: "ethereum-mainnet";
  searchTerms: string[];
};

export const mainnetPayAssets: PayAsset[] = [
  {
    symbol: "ETH",
    name: "Ether",
    chainId: 1,
    decimals: 18,
    kind: "native",
    address: "native",
    settlementNetwork: "ethereum-mainnet",
    searchTerms: ["eth", "ether", "ethereum", "native"]
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    chainId: 1,
    decimals: 6,
    kind: "erc20",
    address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    settlementNetwork: "ethereum-mainnet",
    searchTerms: ["usdc", "usd coin", "circle", "dollar"]
  }
];

export const getPayAsset = (symbol: string): PayAsset | null => {
  const normalized = symbol.trim().toUpperCase();

  return mainnetPayAssets.find((asset) => asset.symbol === normalized) ?? null;
};

export const searchPayAssets = (query: string): PayAsset[] => {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return mainnetPayAssets;
  }

  return mainnetPayAssets.filter((asset) =>
    [asset.symbol, asset.name, ...asset.searchTerms].some((term) =>
      term.toLowerCase().includes(normalized)
    )
  );
};
