import { expect, test } from "@playwright/test";
import { collectPublicEthTransfers } from "../src/wallet/publicActivity";

const walletAddress = "0x000000000000000000000000000000000000dEaD";
const senderAddress = "0x1111111111111111111111111111111111111111";
const otherAddress = "0x2222222222222222222222222222222222222222";

test("collects only real native ETH transfers involving the funding wallet", () => {
  const items = collectPublicEthTransfers({
    address: walletAddress,
    limit: 10,
    blocks: [
      {
        number: 256n,
        timestamp: 1_780_000_000n,
        transactions: [
          {
            hash: "0x1000000000000000000000000000000000000000000000000000000000000000",
            from: senderAddress,
            to: walletAddress,
            value: 1_000_000_000_000_000_000n,
            transactionIndex: 1
          },
          {
            hash: "0x2000000000000000000000000000000000000000000000000000000000000000",
            from: senderAddress,
            to: otherAddress,
            value: 1_000_000_000_000_000_000n,
            transactionIndex: 2
          },
          {
            hash: "0x3000000000000000000000000000000000000000000000000000000000000000",
            from: senderAddress,
            to: walletAddress,
            value: 0n,
            transactionIndex: 3
          }
        ]
      }
    ]
  });

  expect(items).toEqual([
    expect.objectContaining({
      amount: "1",
      direction: "in",
      from: senderAddress,
      to: walletAddress
    })
  ]);
});
