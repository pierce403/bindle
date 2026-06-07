import { expect, test } from "@playwright/test";
import { getPayAsset, searchPayAssets } from "../src/intents/assets";
import { parsePaymentRequest } from "../src/intents/paymentRequests";

test("local asset registry includes Ethereum mainnet USDC", () => {
  const usdc = getPayAsset("USDC");

  expect(usdc).toEqual(
    expect.objectContaining({
      symbol: "USDC",
      name: "USD Coin",
      chainId: 1,
      decimals: 6,
      kind: "erc20",
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
    })
  );
  expect(searchPayAssets("circle").map((asset) => asset.symbol)).toContain(
    "USDC"
  );
});

test("parses a bindle USDC payment request", () => {
  const parsed = parsePaymentRequest(
    "bindle:pay?to=deanpierce.eth&amount=5&asset=USDC&note=lunch"
  );

  expect(parsed).toEqual({
    ok: true,
    request: {
      recipient: "deanpierce.eth",
      amount: "5",
      asset: "USDC",
      note: "lunch"
    }
  });
});

test("parses a JSON payment request", () => {
  const parsed = parsePaymentRequest(
    JSON.stringify({
      recipient: "0x000000000000000000000000000000000000dEaD",
      amount: "0.25",
      asset: "ETH"
    })
  );

  expect(parsed).toEqual({
    ok: true,
    request: {
      recipient: "0x000000000000000000000000000000000000dEaD",
      amount: "0.25",
      asset: "ETH",
      note: ""
    }
  });
});

test("rejects unsupported payment request assets", () => {
  const parsed = parsePaymentRequest(
    "bindle:pay?to=deanpierce.eth&amount=5&asset=ZEC"
  );

  expect(parsed).toEqual({
    ok: false,
    error: "Payment request asset is not supported."
  });
});
