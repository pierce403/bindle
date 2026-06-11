import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  LoaderCircle
} from "lucide-react";
import type {
  ProofProgressSnapshot,
  ProofStageStatus
} from "../railgun/proofProgress";

const statusIcon = (status: ProofStageStatus) => {
  if (status === "complete") {
    return <CheckCircle2 size={17} aria-hidden="true" />;
  }

  if (status === "active") {
    return <LoaderCircle size={17} aria-hidden="true" />;
  }

  if (status === "blocked") {
    return <AlertTriangle size={17} aria-hidden="true" />;
  }

  return <Circle size={17} aria-hidden="true" />;
};

type ProofProgressPanelProps = {
  progress: ProofProgressSnapshot;
};

export function ProofProgressPanel({ progress }: ProofProgressPanelProps) {
  return (
    <div className="proof-progress-card" aria-label="Proof generation progress">
      <div className="proof-progress-header">
        <span>Proof path</span>
        <strong>{progress.percent}%</strong>
      </div>
      <div
        className="proof-progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label="Proof path readiness"
      >
        <div style={{ width: `${progress.percent}%` }} />
      </div>
      <ol className="proof-stage-list">
        {progress.stages.map((stage) => (
          <li className={`proof-stage ${stage.status}`} key={stage.id}>
            {statusIcon(stage.status)}
            <div>
              <strong>{stage.label}</strong>
              <span>{stage.detail}</span>
              {stage.percent !== undefined ? (
                <div
                  className="proof-stage-progress-track"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={stage.percent}
                  aria-label={`${stage.label} progress`}
                >
                  <div style={{ width: `${stage.percent}%` }} />
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
