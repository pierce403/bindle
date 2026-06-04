import { expect, test } from "@playwright/test";
import {
  formatShieldedEthBalance,
  formatUsdFromEth,
  sumWrappedBaseTokenBalance
} from "../src/railgun/shieldedBalance";

const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const otherToken = "0x1111111111111111111111111111111111111111";

test("sums only wrapped base token notes as shielded ETH", () => {
  expect(
    sumWrappedBaseTokenBalance({
      wrappedBaseToken: weth,
      balances: [
        [{ type: "Erc20", value: weth.toLowerCase() as `0x${string}` }, 2n],
        [{ type: "Erc20", value: weth }, 3n],
        [{ type: "Erc20", value: otherToken }, 5n],
        [{ type: "Erc721" }, 7n]
      ]
    })
  ).toBe(5n);
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
