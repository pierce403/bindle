import { expect, test } from "@playwright/test";
import {
  classifyPayTransactionOrigin,
  assertPrivatePayChangeDisposition,
  ephemeralPrivatePayChangeMessage,
  getRailgunBroadcasterReadiness,
  privatePayChangeRequiredMessage,
  privatePayLegs
} from "../src/intents/payFlow";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";

test("Private Pay classifies as railgun-private", () => {
  expect(classifyPayTransactionOrigin(privatePayLegs)).toBe(
    "railgun-private"
  );
});

test("Private Pay accepts private or ephemeral change dispositions", () => {
  expect(() => assertPrivatePayChangeDisposition("unknown")).toThrow(
    privatePayChangeRequiredMessage
  );
  expect(() => assertPrivatePayChangeDisposition("public-recipient")).toThrow(
    privatePayChangeRequiredMessage
  );
  expect(() => assertPrivatePayChangeDisposition("provider-retained")).toThrow(
    privatePayChangeRequiredMessage
  );
  expect(() =>
    assertPrivatePayChangeDisposition("private-change-to-0zk")
  ).not.toThrow();
  expect(() =>
    assertPrivatePayChangeDisposition("ephemeral-settlement-account")
  ).not.toThrow();
  expect(ephemeralPrivatePayChangeMessage).toMatch(/ephemeral settlement account/i);
});

test("Pay is disabled when Waku Broadcaster is not configured", () => {
  const readiness = getRailgunBroadcasterReadiness({
    ...defaultConnectionPolicy,
    broadcasterUrl: ""
  });

  expect(readiness.ready).toBe(false);
  expect(readiness.status).toBe("off");
  expect(readiness.message).toBe("Configure a Waku Broadcaster before shielded pay.");
});

test("Pay is enabled when Waku Broadcaster is configured", () => {
  const readiness = getRailgunBroadcasterReadiness({
    ...defaultConnectionPolicy,
    broadcasterUrl: "mock://simulated-broadcaster"
  });

  expect(readiness.ready).toBe(true);
  expect(readiness.status).toBe("configured");
  expect(readiness.message).toMatch(/Waku Broadcaster configured/i);
});
