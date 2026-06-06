import { expect, test } from "@playwright/test";
import type { JsBroadcaster } from "@kohaku-eth/railgun-waku";
import { UNISWAP_V4_WETH_ADDRESS } from "../src/intents/uniswapV4PayRoute";
import {
  describeRailgunWakuPubSubTopic,
  selectRailgunWakuBroadcaster
} from "../src/railgun/wakuBroadcaster";

const fakeBroadcaster = {
  address: "0x1111111111111111111111111111111111111111",
  fee: {
    token: UNISWAP_V4_WETH_ADDRESS,
    perUnitGas: 42n,
    recipient: "0zk1broadcaster",
    expiration: 1_799_999_999,
    feesId: "fee-offer-1",
    availableWallets: 2,
    relayAdapt: "0x2222222222222222222222222222222222222222",
    reliability: 98,
    listKeys: []
  },
  broadcast: async () => "0x3333333333333333333333333333333333333333333333333333333333333333"
} as unknown as JsBroadcaster;

test("Waku pubsub topic is parsed from visible ConnectionPolicy format", () => {
  expect(describeRailgunWakuPubSubTopic("/waku/2/rs/5/1")).toBe(
    "cluster 5, shard 1"
  );
  expect(() => describeRailgunWakuPubSubTopic("/waku/2/default-waku/proto")).toThrow(
    /Invalid RAILGUN Waku pubsub topic/
  );
});

test("Waku broadcaster selection returns the required private submitter", async () => {
  const statuses: string[] = [];
  const quote = await selectRailgunWakuBroadcaster({
    manager: {
      bestBroadcasterForToken: async (tokenAddress, currentTime) => {
        expect(tokenAddress).toBe(UNISWAP_V4_WETH_ADDRESS);
        expect(typeof currentTime).toBe("bigint");
        expect(Number(currentTime)).toBeGreaterThan(1_700_000_000_000);
        return fakeBroadcaster;
      }
    },
    feeTokenAddress: UNISWAP_V4_WETH_ADDRESS,
    onStatus: (message) => statuses.push(message)
  });

  expect(quote.submitter).toBe("waku-railgun-broadcaster");
  expect(quote.address).toBe(fakeBroadcaster.address);
  expect(quote.railgunAddress).toBe("0zk1broadcaster");
  expect(quote.tokenFee.feesID).toBe("fee-offer-1");
  expect(quote.tokenFee.perUnitGas).toBe("42");
  expect(statuses.join("\n")).toMatch(/Selected RAILGUN Waku broadcaster/);
});

test("Waku broadcaster selection fails closed without an advertised fee token", async () => {
  await expect(
    selectRailgunWakuBroadcaster({
      manager: {
        bestBroadcasterForToken: async () => undefined
      },
      feeTokenAddress: UNISWAP_V4_WETH_ADDRESS,
      onStatus: () => undefined
    })
  ).rejects.toThrow(/No RAILGUN Waku broadcaster is advertising fee token/);
});
