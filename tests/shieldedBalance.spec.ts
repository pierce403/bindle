import { expect, test } from "@playwright/test";
import {
  formatShieldedEthBalance,
  formatUsdFromEth,
  summarizeWrappedBaseTokenBalance,
  sumWrappedBaseTokenBalance
} from "../src/railgun/shieldedBalance";

const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const otherToken = "0x1111111111111111111111111111111111111111";

test("sums only wrapped base token notes as shielded ETH", () => {
  expect(
    sumWrappedBaseTokenBalance({
      wrappedBaseToken: weth,
      balances: [
        { asset: { type: "Erc20", value: weth.toLowerCase() as `0x${string}` }, amount: 2n, poiStatus: undefined },
        { asset: { type: "Erc20", value: weth }, amount: 3n, poiStatus: "Valid" },
        { asset: { type: "Erc20", value: otherToken }, amount: 5n, poiStatus: undefined },
        { asset: { type: "Erc721", value: [otherToken, "0x01"] }, amount: 7n, poiStatus: undefined }
      ]
    })
  ).toBe(5n);

  expect(
    summarizeWrappedBaseTokenBalance({
      wrappedBaseToken: weth,
      balances: [
        { asset: { type: "Erc20", value: weth.toLowerCase() as `0x${string}` }, amount: 2n, poiStatus: undefined },
        { asset: { type: "Erc20", value: weth }, amount: 3n, poiStatus: "Valid" },
        { asset: { type: "Erc20", value: otherToken }, amount: 5n, poiStatus: undefined },
        { asset: { type: "Erc721", value: [otherToken, "0x01"] }, amount: 7n, poiStatus: undefined }
      ]
    })
  ).toEqual({
    wei: 5n,
    rawBalanceCount: 4,
    matchedWrappedBaseTokenBalances: 2
  });
});

test("POI-restricted balances are not presented as spendable ETH", () => {
  const balances = ["Missing", "ProofSubmitted", "ShieldBlocked"].map((poiStatus) => ({
    asset: { type: "Erc20" as const, value: weth },
    amount: 10n,
    poiStatus: poiStatus as "Missing" | "ProofSubmitted" | "ShieldBlocked"
  }));
  expect(sumWrappedBaseTokenBalance({ balances, wrappedBaseToken: weth })).toBe(0n);
  expect(summarizeWrappedBaseTokenBalance({ balances, wrappedBaseToken: weth })).toEqual({
    wei: 0n,
    rawBalanceCount: 3,
    matchedWrappedBaseTokenBalances: 3
  });
});

test("formats shielded ETH and Chainlink USD values", () => {
  expect(formatShieldedEthBalance(1_500_000_000_000_000_000n)).toBe("1.5 ETH");
  expect(
    formatUsdFromEth({
      ethWei: 1_500_000_000_000_000_000n,
      priceAnswer: 350_050_000_000n,
      priceDecimals: 8
    })
  ).toBe("$5,250.75");
});
