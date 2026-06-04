export type ProofStageStatus = "complete" | "active" | "blocked" | "waiting";

export type ProofProgressStage = {
  id: "intent" | "endpoints" | "route" | "proof" | "submit";
  label: string;
  detail: string;
  status: ProofStageStatus;
};

export type ProofProgressSnapshot = {
  percent: number;
  status: string;
  stages: ProofProgressStage[];
};

const clampPercent = (percent: number): number =>
  Math.max(0, Math.min(100, Math.round(percent)));

export const normalizeRailgunProofProgress = (progress: number): number => {
  if (!Number.isFinite(progress) || progress <= 0) {
    return 0;
  }

  return clampPercent(progress <= 1 ? progress * 100 : progress);
};

export const buildPayProofProgress = ({
  intentReady,
  endpointsReady,
  routeReady,
  proofReady,
  submitting,
  missingEndpointLabels,
  routeLabel,
  proofPercent = 0,
  proofStatus
}: {
  intentReady: boolean;
  endpointsReady: boolean;
  routeReady: boolean;
  proofReady: boolean;
  submitting: boolean;
  missingEndpointLabels: string[];
  routeLabel: string;
  proofPercent?: number;
  proofStatus?: string;
}): ProofProgressSnapshot => {
  const normalizedProofPercent = clampPercent(proofPercent);
  const stages: ProofProgressStage[] = [
    {
      id: "intent",
      label: "Intent",
      detail: intentReady ? "Amount, asset, and recipient look valid" : "Waiting for valid pay details",
      status: intentReady ? "complete" : "active"
    },
    {
      id: "endpoints",
      label: "Endpoints",
      detail: endpointsReady
        ? "Required endpoints are visible and configured"
        : `Missing ${missingEndpointLabels.join(", ")}`,
      status: endpointsReady ? "complete" : "blocked"
    },
    {
      id: "route",
      label: "Route",
      detail: routeReady
        ? routeLabel
        : `Waiting for ${routeLabel}`,
      status: routeReady ? "complete" : endpointsReady ? "blocked" : "waiting"
    },
    {
      id: "proof",
      label: "Proof",
      detail: proofReady
        ? "RAILGUN proof generated"
        : routeReady
          ? (proofStatus ?? "Generating RAILGUN cross-contract proof")
          : "Waiting for RAILGUN cross-contract proof generation",
      status: proofReady ? "complete" : routeReady ? "active" : "waiting"
    },
    {
      id: "submit",
      label: "Submit",
      detail: submitting
        ? "Submitting transaction"
        : "Submission stays disabled until proof and route are complete",
      status: submitting ? "active" : proofReady ? "waiting" : "waiting"
    }
  ];
  const completeStages = stages.filter((stage) => stage.status === "complete");
  const blockedStage = stages.find((stage) => stage.status === "blocked");
  const activeProofProgress =
    stages.find((stage) => stage.id === "proof")?.status === "active"
      ? normalizedProofPercent / 100
      : 0;

  return {
    percent: clampPercent(
      ((completeStages.length + activeProofProgress) / stages.length) * 100
    ),
    status: blockedStage ? blockedStage.detail : stages.find((stage) => stage.status === "active")?.detail ?? "Ready",
    stages
  };
};
