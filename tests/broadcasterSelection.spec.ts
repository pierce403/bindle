import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

test("Private Pay readiness uses smart-wallet submission", () => {
  const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
  const submitPayStart = appSource.indexOf("const submitPay = async () =>");
  const submitPayEnd = appSource.indexOf("const submitShield = async", submitPayStart);
  const submitPaySource = appSource.slice(submitPayStart, submitPayEnd);

  expect(submitPayStart).toBeGreaterThan(-1);
  expect(submitPaySource).toContain("prepareRailgunPayForRecipient");
  expect(submitPaySource).toContain("sendSmartWalletCalls");
  expect(submitPaySource).not.toContain("submitRailgunWakuBroadcasterTransaction");
});

test("Private Pay preparation specifies erc4337-bundler submission mode", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).toContain('submissionMode: "erc4337-bundler"');
  expect(paySource).toContain('submitter: "erc4337-bundler"');
  expect(paySource).not.toContain('submissionMode: "disabled-pending-kohaku-broadcaster"');
  expect(paySource).not.toContain('submitter: "waku-railgun-broadcaster"');
});
