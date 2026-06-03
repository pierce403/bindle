import {
  CheckCircle2,
  Circle,
  Fingerprint,
  LockKeyhole,
  PlugZap,
  ShieldCheck
} from "lucide-react";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { PrivacyToolkitState } from "../privacy/toolkit";
import type { PasskeyCapability } from "../wallet/passkeys";
import type { WalletState } from "../wallet/walletState";

type OnboardingWizardProps = {
  walletState: WalletState;
  passkeyCapability: PasskeyCapability;
  isCreatingPasskey: boolean;
  policy: ConnectionPolicy;
  toolkitState: PrivacyToolkitState;
  statusMessage: string;
  onCreatePasskey: () => void;
  onOpenConnections: () => void;
  onStartToolkit: () => void;
};

type WizardStepId = "passkey" | "connections" | "toolkit" | "shielded";

type WizardStep = {
  id: WizardStepId;
  label: string;
  detail: string;
  done: boolean;
  blocked?: boolean;
  Icon: typeof Fingerprint;
};

const stepStateLabel = (step: WizardStep, currentStep: WizardStepId): string => {
  if (step.done) {
    return "done";
  }

  if (step.blocked) {
    return "blocked";
  }

  return step.id === currentStep ? "now" : "next";
};

export function OnboardingWizard({
  walletState,
  passkeyCapability,
  isCreatingPasskey,
  policy,
  toolkitState,
  statusMessage,
  onCreatePasskey,
  onOpenConnections,
  onStartToolkit
}: OnboardingWizardProps) {
  const passkeyDone = walletState.passkeyPresent;
  const rpcConfigured = policy.ethereumRpcUrl.trim().length > 0;
  const toolkitReady = toolkitState === "ready";
  const smartWalletReady = walletState.smartWalletAddress !== null;
  const shieldedWalletReady = walletState.railgunAddress !== null;
  const addressWorkReady = smartWalletReady && shieldedWalletReady;
  const passkeyUnavailable =
    passkeyCapability.checked && !passkeyCapability.available;

  const currentStep: WizardStepId = !passkeyDone
    ? "passkey"
    : !rpcConfigured
      ? "connections"
      : !toolkitReady
        ? "toolkit"
        : "shielded";

  const steps: WizardStep[] = [
    {
      id: "passkey",
      label: "Passkey",
      detail: passkeyDone ? "passkey enrolled" : passkeyCapability.message,
      done: passkeyDone,
      blocked: passkeyUnavailable,
      Icon: Fingerprint
    },
    {
      id: "connections",
      label: "Connections",
      detail: rpcConfigured ? "RPC configured" : "no endpoints configured",
      done: rpcConfigured,
      Icon: PlugZap
    },
    {
      id: "toolkit",
      label: "Toolkit",
      detail: toolkitReady ? "ready" : toolkitState,
      done: toolkitReady,
      blocked: !rpcConfigured,
      Icon: ShieldCheck
    },
    {
      id: "shielded",
      label: "Shielded wallet",
      detail: addressWorkReady
        ? "ready"
        : smartWalletReady
          ? "0zk address pending"
          : "Smart-wallet address pending",
      done: addressWorkReady,
      blocked: !toolkitReady,
      Icon: LockKeyhole
    }
  ];

  const canCreatePasskey =
    passkeyCapability.available && !passkeyDone && !isCreatingPasskey;
  const canStartToolkit =
    rpcConfigured && toolkitState !== "starting" && toolkitState !== "ready";
  const currentStatus =
    walletState.status === "error" && walletState.lastError
      ? walletState.lastError
      : currentStep === "shielded" && toolkitReady
        ? "Kohaku passkey smart-account derivation is still pending."
        : statusMessage || steps.find((step) => step.id === currentStep)?.detail;

  return (
    <section
      className="panel onboarding-wizard"
      aria-labelledby="onboarding-heading"
    >
      <div className="section-heading">
        <div>
          <h2 id="onboarding-heading">Set Up Bindle</h2>
          <span>{currentStatus}</span>
        </div>
        <Fingerprint size={21} aria-hidden="true" />
      </div>

      <div className="wizard-steps" aria-label="Onboarding steps">
        {steps.map((step) => {
          const state = stepStateLabel(step, currentStep);
          const StatusIcon = step.done ? CheckCircle2 : Circle;

          return (
            <div className={`wizard-step ${state}`} key={step.id}>
              <step.Icon size={18} aria-hidden="true" />
              <div>
                <strong>{step.label}</strong>
                <span>{step.detail}</span>
              </div>
              <StatusIcon size={17} aria-hidden="true" />
            </div>
          );
        })}
      </div>

      {currentStep === "passkey" ? (
        <button
          className="primary-action wide"
          type="button"
          disabled={!canCreatePasskey}
          onClick={onCreatePasskey}
        >
          <Fingerprint size={18} aria-hidden="true" />
          {isCreatingPasskey ? "Creating passkey" : "Create passkey"}
        </button>
      ) : null}

      {currentStep === "connections" ? (
        <button
          className="secondary-action wide"
          type="button"
          onClick={onOpenConnections}
        >
          <PlugZap size={18} aria-hidden="true" />
          Open Connections
        </button>
      ) : null}

      {currentStep === "toolkit" ? (
        <button
          className="primary-action wide"
          type="button"
          disabled={!canStartToolkit}
          onClick={onStartToolkit}
        >
          <ShieldCheck size={18} aria-hidden="true" />
          {toolkitState === "starting" ? "Starting toolkit" : "Start toolkit"}
        </button>
      ) : null}

      {currentStep === "shielded" ? (
        <button className="secondary-action wide" type="button" disabled>
          <LockKeyhole size={18} aria-hidden="true" />
          Shielded wallet pending
        </button>
      ) : null}
    </section>
  );
}
