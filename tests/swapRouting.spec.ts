import { expect, test } from "@playwright/test";
import { getPayAsset } from "../src/intents/assets";
import {
  DEFAULT_PAY_MAX_SLIPPAGE_BPS,
  formatSlippageBps,
  getPaySwapRoutePlan
} from "../src/intents/swapRouting";
import {
  buildUniswapV4EthToUsdcExactOutputCalls,
  UNISWAP_V4_USDC_ETH_CANDIDATE_POOLS,
  UNISWAP_V4_WETH_ADDRESS
} from "../src/intents/uniswapV4PayRoute";

test("USDC pay routes default to Uniswap v4 with 1 percent max slippage", () => {
  const plan = getPaySwapRoutePlan(getPayAsset("USDC"));

  expect(plan).toEqual(
    expect.objectContaining({
      protocol: "Uniswap v4",
      quoteSource: "onchain:uniswap-v4",
      slippageBps: DEFAULT_PAY_MAX_SLIPPAGE_BPS,
      slippageLabel: "Max 1%",
      remainderLabel: "Private change to 0zk required; not wired yet",
      changeDisposition: "unknown",
      requiresSwap: true
    })
  );
});

test("formats slippage basis points for route review", () => {
  expect(formatSlippageBps(0)).toBe("0%");
  expect(formatSlippageBps(50)).toBe("0.5%");
  expect(formatSlippageBps(100)).toBe("1%");
});

test("Uniswap v4 Pay route encodes WETH withdraw and router exact-output call", () => {
  const maxInputAmount = 2_000_000_000_000_000n;
  const calls = buildUniswapV4EthToUsdcExactOutputCalls({
    deadline: 1_800_000_000n,
    outputAmount: 5_000_000n,
    poolKey: UNISWAP_V4_USDC_ETH_CANDIDATE_POOLS[0],
    recipient: "0x000000000000000000000000000000000000dEaD",
    refundRecipient: "0x000000000000000000000000000000000000bEEF",
    maxInputAmount
  });

  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(
    expect.objectContaining({
      to: UNISWAP_V4_WETH_ADDRESS,
      value: 0n
    })
  );
  expect(calls[0].data.startsWith("0x2e1a7d4d")).toBe(true);
  expect(calls[1]).toEqual(
    expect.objectContaining({
      value: maxInputAmount
    })
  );
  expect(calls[1].data.startsWith("0x3593564c")).toBe(true);
});
