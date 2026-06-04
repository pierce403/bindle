import { expect, test } from "@playwright/test";
import { getPayAsset } from "../src/intents/assets";
import {
  DEFAULT_PAY_MAX_SLIPPAGE_BPS,
  formatSlippageBps,
  getPaySwapRoutePlan
} from "../src/intents/swapRouting";

test("USDC pay routes default to Uniswap v4 with 1 percent max slippage", () => {
  const plan = getPaySwapRoutePlan(getPayAsset("USDC"));

  expect(plan).toEqual(
    expect.objectContaining({
      protocol: "Uniswap v4",
      quoteSource: "onchain:uniswap-v4",
      slippageBps: DEFAULT_PAY_MAX_SLIPPAGE_BPS,
      slippageLabel: "Max 1%",
      remainderLabel: "Leftover ETH may remain unshielded for a later sweep",
      requiresSwap: true
    })
  );
});

test("formats slippage basis points for route review", () => {
  expect(formatSlippageBps(0)).toBe("0%");
  expect(formatSlippageBps(50)).toBe("0.5%");
  expect(formatSlippageBps(100)).toBe("1%");
});
