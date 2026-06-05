import { expect, test } from "@playwright/test";
import {
  classifyPayTransactionOrigin,
  getRailgunBroadcasterReadiness,
  privatePayBroadcasterRequiredMessage,
  privateUsdcPayLegs
} from "../src/intents/payFlow";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";

test("Private Pay classifies as railgun-private", () => {
  expect(classifyPayTransactionOrigin(privateUsdcPayLegs)).toBe(
    "railgun-private"
  );
});

test("Pay is disabled when broadcaster mode is off", () => {
  const readiness = getRailgunBroadcasterReadiness({
    ...defaultConnectionPolicy,
    railgunBroadcasterMode: "off",
    railgunBroadcasterEnabled: false,
    broadcasterUrl: "",
    wakuEnabled: false
  });

  expect(readiness.ready).toBe(false);
  expect(readiness.status).toBe("off");
  expect(readiness.message).toBe(privatePayBroadcasterRequiredMessage);
  expect(readiness.feeToken).toBe("WETH");
  expect(readiness.fee).toBe("unquoted");
});

test("Pay is disabled when no broadcaster is selected", () => {
  const readiness = getRailgunBroadcasterReadiness({
    ...defaultConnectionPolicy,
    railgunBroadcasterMode: "waku-public-network",
    railgunBroadcasterEnabled: true,
    broadcasterUrl: "",
    wakuEnabled: true
  });

  expect(readiness.ready).toBe(false);
  expect(readiness.status).toBe("not-selected");
  expect(readiness.message).toBe(privatePayBroadcasterRequiredMessage);
});

test("default public Waku broadcaster is configured for Private Pay", () => {
  const readiness = getRailgunBroadcasterReadiness(defaultConnectionPolicy);

  expect(readiness.ready).toBe(true);
  expect(readiness.status).toBe("configured");
  expect(readiness.message).toMatch(/discovery, fee quote, and encrypted submission/i);
});
