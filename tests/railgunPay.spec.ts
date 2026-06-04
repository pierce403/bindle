import { expect, test } from "@playwright/test";
import { grossUpUnshieldAmount } from "../src/railgun/pay";

test("Pay grosses up RAILGUN unshield amount so public WETH covers the swap input", () => {
  expect(
    grossUpUnshieldAmount({
      desiredPublicAmount: 1_000_000n,
      unshieldFeeBps: 25
    })
  ).toBe(1_002_507n);
});

test("Pay does not gross up when the chain reports no unshield fee", () => {
  expect(
    grossUpUnshieldAmount({
      desiredPublicAmount: 1_000_000n,
      unshieldFeeBps: 0
    })
  ).toBe(1_000_000n);
});
