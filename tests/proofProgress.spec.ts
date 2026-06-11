import { expect, test } from "@playwright/test";
import {
  buildPayProofProgress,
  buildSendProofProgress,
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

test("send proof progress exposes honest stages", () => {
  const progress = buildSendProofProgress({
    intentReady: true,
    endpointsReady: true,
    proofReady: false,
    submitting: false,
    missingEndpointLabels: []
  });

  expect(progress.percent).toBe(50);
  expect(progress.stages).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: "intent", status: "complete" }),
      expect.objectContaining({ id: "endpoints", status: "complete" }),
      expect.objectContaining({ id: "proof", status: "active" }),
      expect.objectContaining({ id: "submit", status: "waiting" })
    ])
  );
});

test("proof stage calculates correct inline percent and keeps submit waiting", () => {
  const progress = buildSendProofProgress({
    intentReady: true,
    endpointsReady: true,
    proofReady: false,
    submitting: true,
    missingEndpointLabels: [],
    proofPercent: 60 // 50% through the proof step [40, 80]
  });

  const proofStage = progress.stages.find(s => s.id === "proof");
  const submitStage = progress.stages.find(s => s.id === "submit");

  expect(proofStage?.percent).toBe(50);
  expect(proofStage?.status).toBe("active");
  expect(submitStage?.status).toBe("waiting");
});

test("submit stage becomes complete when proofPercent reaches 100", () => {
  const progress = buildSendProofProgress({
    intentReady: true,
    endpointsReady: true,
    proofReady: true,
    submitting: false,
    missingEndpointLabels: [],
    proofPercent: 100
  });

  const submitStage = progress.stages.find(s => s.id === "submit");
  expect(submitStage?.status).toBe("complete");
});

