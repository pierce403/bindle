import { expect, test } from "@playwright/test";
import {
  buildPayProofProgress,
  normalizeRailgunProofProgress
} from "../src/railgun/proofProgress";

test("normalizes RAILGUN proof callback progress", () => {
  expect(normalizeRailgunProofProgress(0)).toBe(0);
  expect(normalizeRailgunProofProgress(0.42)).toBe(42);
  expect(normalizeRailgunProofProgress(42)).toBe(42);
  expect(normalizeRailgunProofProgress(142)).toBe(100);
  expect(normalizeRailgunProofProgress(Number.NaN)).toBe(0);
});

test("pay proof progress exposes honest blocked stages", () => {
  const progress = buildPayProofProgress({
    intentReady: true,
    endpointsReady: true,
    routeReady: false,
    proofReady: false,
    submitting: false,
    missingEndpointLabels: [],
    routeLabel: "ETH to USDC through Uniswap v4"
  });

  expect(progress.percent).toBe(40);
  expect(progress.status).toBe(
    "Waiting for ETH to USDC through Uniswap v4"
  );
  expect(progress.stages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "intent", status: "complete" }),
      expect.objectContaining({ id: "endpoints", status: "complete" }),
      expect.objectContaining({ id: "route", status: "blocked" }),
      expect.objectContaining({ id: "proof", status: "waiting" })
    ])
  );
});

test("pay proof progress includes live proof callback progress", () => {
  const progress = buildPayProofProgress({
    intentReady: true,
    endpointsReady: true,
    routeReady: true,
    proofReady: false,
    submitting: false,
    missingEndpointLabels: [],
    routeLabel: "ETH to USDC through Uniswap v4",
    proofPercent: 50,
    proofStatus: "Proving batch 1"
  });

  expect(progress.percent).toBe(70);
  expect(progress.status).toBe("Proving batch 1");
  expect(progress.stages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "route", status: "complete" }),
      expect.objectContaining({
        id: "proof",
        detail: "Proving batch 1",
        status: "active"
      })
    ])
  );
});
