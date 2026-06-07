export type PayAssetSymbol = string;

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
    symbol: "WETH",
    name: "Wrapped Ether",
    chainId: 1,
    decimals: 18,
    kind: "erc20",
    address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    settlementNetwork: "ethereum-mainnet",
    searchTerms: ["weth", "wrapped ether", "wrapped eth", "ethereum"]
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
  },
  {
    symbol: "DAI",
    name: "Dai Stablecoin",
    chainId: 1,
    decimals: 18,
    kind: "erc20",
    address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    settlementNetwork: "ethereum-mainnet",
    searchTerms: ["dai", "stablecoin", "dollar"]
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    chainId: 1,
    decimals: 6,
    kind: "erc20",
    address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
    settlementNetwork: "ethereum-mainnet",
    searchTerms: ["usdt", "tether", "stablecoin", "dollar"]
  }
];

export const getPayAsset = (symbol: string): PayAsset | null => {
  const normalized = symbol.trim();
  const normalizedSymbol = normalized.toUpperCase();
  const normalizedAddress = normalized.toLowerCase();

  return (
    mainnetPayAssets.find(
      (asset) =>
        asset.symbol === normalizedSymbol ||
        (asset.address !== "native" &&
          asset.address.toLowerCase() === normalizedAddress)
    ) ?? null
  );
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
