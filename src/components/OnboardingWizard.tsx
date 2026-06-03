import {
  CheckCircle2,
  Circle,
  Fingerprint,
  LockKeyhole,
  PlugZap,
  ShieldCheck
} from "lucide-react";
import { useState } from "react";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { PrivacyToolkitState } from "../privacy/toolkit";
import type { PasskeyCapability } from "../wallet/passkeys";
import type { WalletState } from "../wallet/walletState";

type OnboardingWizardProps = {
  walletState: WalletState;
  passkeyCapability: PasskeyCapability;
  isCreatingPasskey: boolean;
  isDerivingSmartWallet: boolean;
  policy: ConnectionPolicy;
  toolkitState: PrivacyToolkitState;
  statusMessage: string;
  onCreatePasskey: () => void;
  onDeriveSmartWallet: () => void;
  onOpenConnections: () => void;
  onStartToolkit: () => void;
};

type WizardStepId =
  | "passkey"
  | "connections"
  | "smart-wallet"
  | "toolkit"
  | "shielded";

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
  isDerivingSmartWallet,
  policy,
  toolkitState,
  statusMessage,
  onCreatePasskey,
  onDeriveSmartWallet,
  onOpenConnections,
  onStartToolkit
}: OnboardingWizardProps) {
  const [copiedFundingAddress, setCopiedFundingAddress] = useState(false);
  const passkeyDone = walletState.passkeyPresent;
  const fundingCredentialReady =
    walletState.passkeyCredentialId !== null && walletState.passkeyPublicKey !== null;
  const rpcConfigured = policy.ethereumRpcUrl.trim().length > 0;
  const toolkitReady = toolkitState === "ready";
  const smartWalletReady = walletState.smartWalletAddress !== null;
  const shieldedWalletReady = walletState.railgunAddress !== null;
  const addressWorkReady = smartWalletReady && shieldedWalletReady;
  const passkeyUnavailable =
    passkeyCapability.checked && !passkeyCapability.available;

  const currentStep: WizardStepId = !passkeyDone
    ? "passkey"
    : !fundingCredentialReady
      ? "passkey"
    : !rpcConfigured
      ? "connections"
      : !smartWalletReady
        ? "smart-wallet"
      : !toolkitReady
        ? "toolkit"
        : "shielded";

  const steps: WizardStep[] = [
    {
      id: "passkey",
      label: "Passkey",
      detail: fundingCredentialReady
        ? "funding passkey enrolled"
        : passkeyDone
          ? "legacy passkey needs public-key metadata"
          : passkeyCapability.message,
      done: fundingCredentialReady,
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
      id: "smart-wallet",
      label: "Funding address",
      detail: walletState.smartWalletAddress ?? "derive from passkey and RPC",
      done: smartWalletReady,
      blocked: !rpcConfigured || !fundingCredentialReady,
      Icon: LockKeyhole
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
    passkeyCapability.available && !fundingCredentialReady && !isCreatingPasskey;
  const canDeriveSmartWallet =
    fundingCredentialReady &&
    rpcConfigured &&
    !smartWalletReady &&
    !isDerivingSmartWallet;
  const canStartToolkit =
    rpcConfigured && toolkitState !== "starting" && toolkitState !== "ready";
  const currentStatus =
    walletState.status === "error" && walletState.lastError
      ? walletState.lastError
      : currentStep === "shielded" && toolkitReady
        ? "Public smart wallet is ready; shielded RAILGUN address creation is still pending."
        : statusMessage || steps.find((step) => step.id === currentStep)?.detail;
  const copyFundingAddress = async () => {
    if (!walletState.smartWalletAddress) {
      return;
    }

    await navigator.clipboard.writeText(walletState.smartWalletAddress);
    setCopiedFundingAddress(true);
  };

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
          {isCreatingPasskey
            ? "Creating passkey"
            : passkeyDone
              ? "Create funding passkey"
              : "Create passkey"}
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

      {currentStep === "smart-wallet" ? (
        <button
          className="primary-action wide"
          type="button"
          disabled={!canDeriveSmartWallet}
          onClick={onDeriveSmartWallet}
        >
          <LockKeyhole size={18} aria-hidden="true" />
          {isDerivingSmartWallet ? "Creating address" : "Create funding address"}
        </button>
      ) : null}

      {currentStep === "toolkit" ? (
        <>
          {walletState.smartWalletAddress ? (
            <div className="funding-card" aria-label="Funding address">
              <span>Fund this address with mainnet ETH</span>
              <strong>{walletState.smartWalletAddress}</strong>
              <button
                className="secondary-action wide"
                type="button"
                onClick={() => void copyFundingAddress()}
              >
                <LockKeyhole size={18} aria-hidden="true" />
                {copiedFundingAddress ? "Copied" : "Copy funding address"}
              </button>
            </div>
          ) : null}
          <button
            className="primary-action wide"
            type="button"
            disabled={!canStartToolkit}
            onClick={onStartToolkit}
          >
            <ShieldCheck size={18} aria-hidden="true" />
            {toolkitState === "starting" ? "Starting toolkit" : "Start toolkit"}
          </button>
        </>
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
