import type { PayAsset } from "./assets";

export const UNISWAP_V4_PROTOCOL_LABEL = "Uniswap v4";
export const UNISWAP_V4_QUOTE_SOURCE = "onchain:uniswap-v4";

export const uniswapV4MainnetContracts = {
  poolManager: "0x000000000004444c5dc75cB358380D2e3dE08A90",
  quoter: "0x52f0e24d1c21c8a0cb1e5a5dd6198556bd9e1203",
  universalRouter: "0x66a9893cc07d91d95644aedd05d03f95e1dba8af",
  permit2: "0x000000000022D473030F116dDEE9F6B43aC78BA3"
} as const;

export type PaySwapRoutePlan = {
  protocol: typeof UNISWAP_V4_PROTOCOL_LABEL | "none";
  quoteSource: typeof UNISWAP_V4_QUOTE_SOURCE | "none";
  quoteLabel: string;
  routerLabel: string;
  executionLabel: string;
  requiresSwap: boolean;
};

export const getPaySwapRoutePlan = (
  outputAsset: PayAsset | null
): PaySwapRoutePlan | null => {
  if (!outputAsset) {
    return null;
  }

  if (outputAsset.symbol === "ETH") {
    return {
      protocol: "none",
      quoteSource: "none",
      quoteLabel: "No quote needed",
      routerLabel: "No swap",
      executionLabel: "Unshield ETH to recipient",
      requiresSwap: false
    };
  }

  return {
    protocol: UNISWAP_V4_PROTOCOL_LABEL,
    quoteSource: UNISWAP_V4_QUOTE_SOURCE,
    quoteLabel: "Onchain v4 Quoter through the visible Ethereum RPC",
    routerLabel: "Uniswap v4 Universal Router",
    executionLabel: `ETH to ${outputAsset.symbol} through Uniswap v4`,
    requiresSwap: true
  };
};
