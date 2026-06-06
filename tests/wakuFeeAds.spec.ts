import { expect, test } from "@playwright/test";
import { UNISWAP_V4_WETH_ADDRESS } from "../src/intents/uniswapV4PayRoute";
import {
  KOHAKU_RAILGUN_ACTIVE_POI_LIST_KEYS,
  RAILGUN_MAINNET_WAKU_FEES_TOPIC,
  parseRailgunWakuFeeMessage,
  selectBestRawRailgunBroadcasterTokenAd
} from "../src/railgun/wakuFeeAds";

const textEncoder = new TextEncoder();

const utf8ToHex = (value: string): `0x${string}` => {
  const bytes = textEncoder.encode(value);
  let hex = "0x";

  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, "0");
  }

  return hex as `0x${string}`;
};

const makeFeeMessage = (overrides: Record<string, unknown> = {}) => {
  const feeData = {
    railgunAddress:
      "0zk1qy000000aszguc2h3e6f3wqrw5jun93ydmjxj3yqvwwew3x4304vtrv7j6fe3z53ladyl94j620lstw395duaa0fv3z85xval4p8red3dsr6zh7fpg6x7644n07",
    fees: {
      [UNISWAP_V4_WETH_ADDRESS]: "0xbbdadfb5598e000"
    },
    feeExpiration: Date.now() + 1_000_000,
    feesID: "vccjkhl8g9pi4b4d",
    availableWallets: 3,
    relayAdapt: "0xAc9f360Ae85469B27aEDdEaFC579Ef2d052aD405",
    relayAdapt7702: "0x2dF3D82C06339387A4532C685dAAf39a218Cf56e",
    requiredPOIListKeys: [...KOHAKU_RAILGUN_ACTIVE_POI_LIST_KEYS],
    reliability: 0.99,
    version: "8.2.3",
    identifier: "railoxide",
    ...overrides
  };
  const outer = {
    data: utf8ToHex(JSON.stringify(feeData)),
    signature: "0x1234"
  };

  return {
    payload: textEncoder.encode(JSON.stringify(outer)),
    contentTopic: RAILGUN_MAINNET_WAKU_FEES_TOPIC,
    timestamp: Date.now()
  };
};

test("parses current RAILGUN Waku broadcaster fee ads without Wallet SDK imports", () => {
  const result = parseRailgunWakuFeeMessage(makeFeeMessage());

  expect(result.ok).toBe(true);

  if (!result.ok) {
    return;
  }

  expect(result.ad.feesID).toBe("vccjkhl8g9pi4b4d");
  expect(result.ad.version).toBe("8.2.3");
  expect(result.ad.signatureStatus).toBe("unverified-no-wallet-sdk");
  expect(result.ad.fees[UNISWAP_V4_WETH_ADDRESS]).toBe("0xbbdadfb5598e000");
});

test("selects the lowest usable raw fee ad for a token", () => {
  const first = parseRailgunWakuFeeMessage(
    makeFeeMessage({
      fees: {
        [UNISWAP_V4_WETH_ADDRESS]: "0x20"
      },
      feesID: "higher"
    })
  );
  const second = parseRailgunWakuFeeMessage(
    makeFeeMessage({
      fees: {
        [UNISWAP_V4_WETH_ADDRESS]: "0x10"
      },
      feesID: "lower"
    })
  );

  expect(first.ok && second.ok).toBe(true);

  if (!first.ok || !second.ok) {
    return;
  }

  const selected = selectBestRawRailgunBroadcasterTokenAd({
    ads: [first.ad, second.ad],
    tokenAddress: UNISWAP_V4_WETH_ADDRESS
  });

  expect(selected?.feesID).toBe("lower");
  expect(selected?.signatureStatus).toBe("unverified-no-wallet-sdk");
});

test("raw fee ads are not usable when required POI list is inactive", () => {
  const result = parseRailgunWakuFeeMessage(
    makeFeeMessage({
      requiredPOIListKeys: ["inactive-list-key"]
    })
  );

  expect(result.ok).toBe(true);

  if (!result.ok) {
    return;
  }

  expect(
    selectBestRawRailgunBroadcasterTokenAd({
      ads: [result.ad],
      tokenAddress: UNISWAP_V4_WETH_ADDRESS
    })
  ).toBeNull();
});
