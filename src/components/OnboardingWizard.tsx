import {
  CheckCircle2,
  Circle,
  Copy,
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
  isCreatingRailgunWallet: boolean;
  isImportingRailgunWallet: boolean;
  policy: ConnectionPolicy;
  toolkitState: PrivacyToolkitState;
  statusMessage: string;
  onCreatePasskey: () => void;
  onDeriveSmartWallet: () => void;
  onCreateRailgunWallet: (passphrase: string) => Promise<string | null>;
  onImportRailgunWallet: (
    recoveryPhrase: string,
    passphrase: string
  ) => Promise<void>;
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
  isCreatingRailgunWallet,
  isImportingRailgunWallet,
  policy,
  toolkitState,
  statusMessage,
  onCreatePasskey,
  onDeriveSmartWallet,
  onCreateRailgunWallet,
  onImportRailgunWallet,
  onOpenConnections,
  onStartToolkit
}: OnboardingWizardProps) {
  const [copiedFundingAddress, setCopiedFundingAddress] = useState(false);
  const [copiedShieldedAddress, setCopiedShieldedAddress] = useState(false);
  const [copiedRecoveryPhrase, setCopiedRecoveryPhrase] = useState(false);
  const [newWalletPassphrase, setNewWalletPassphrase] = useState("");
  const [newWalletPassphraseConfirm, setNewWalletPassphraseConfirm] =
    useState("");
  const [importRecoveryPhrase, setImportRecoveryPhrase] = useState("");
  const [importPassphrase, setImportPassphrase] = useState("");
  const [createdRecoveryPhrase, setCreatedRecoveryPhrase] = useState<
    string | null
  >(null);
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
          : !shieldedWalletReady
            ? "shielded"
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
      id: "shielded",
      label: "Shielded wallet",
      detail: addressWorkReady
        ? "ready"
        : smartWalletReady
          ? "0zk address pending"
          : "Smart-wallet address pending",
      done: addressWorkReady,
      blocked: !smartWalletReady,
      Icon: LockKeyhole
    },
    {
      id: "toolkit",
      label: "Toolkit",
      detail: toolkitReady ? "ready" : toolkitState,
      done: toolkitReady,
      blocked: !rpcConfigured || !addressWorkReady,
      Icon: ShieldCheck
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
      : currentStep === "shielded" && smartWalletReady && !shieldedWalletReady
        ? "Create or import a recoverable RAILGUN wallet to get a real 0zk address."
        : statusMessage || steps.find((step) => step.id === currentStep)?.detail;
  const canCreateRailgunWallet =
    newWalletPassphrase.length >= 12 &&
    newWalletPassphrase === newWalletPassphraseConfirm &&
    !isCreatingRailgunWallet &&
    !shieldedWalletReady;
  const canImportRailgunWallet =
    importRecoveryPhrase.trim().length > 0 &&
    importPassphrase.length >= 12 &&
    !isImportingRailgunWallet &&
    !shieldedWalletReady;

  const copyFundingAddress = async () => {
    if (!walletState.smartWalletAddress) {
      return;
    }

    await navigator.clipboard.writeText(walletState.smartWalletAddress);
    setCopiedFundingAddress(true);
  };
  const copyShieldedAddress = async () => {
    if (!walletState.railgunAddress) {
      return;
    }

    await navigator.clipboard.writeText(walletState.railgunAddress);
    setCopiedShieldedAddress(true);
  };
  const copyRecoveryPhrase = async () => {
    if (!createdRecoveryPhrase) {
      return;
    }

    await navigator.clipboard.writeText(createdRecoveryPhrase);
    setCopiedRecoveryPhrase(true);
  };
  const createShieldedWallet = async () => {
    setCreatedRecoveryPhrase(null);
    const recoveryPhrase = await onCreateRailgunWallet(newWalletPassphrase);

    if (recoveryPhrase) {
      setCreatedRecoveryPhrase(recoveryPhrase);
      setNewWalletPassphrase("");
      setNewWalletPassphraseConfirm("");
    }
  };
  const importShieldedWallet = async () => {
    await onImportRailgunWallet(importRecoveryPhrase, importPassphrase);
    setImportRecoveryPhrase("");
    setImportPassphrase("");
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
        <>
          {walletState.railgunAddress ? (
            <div className="funding-card" aria-label="Shielded 0zk address">
              <span>Receive shielded ETH at this 0zk address</span>
              <strong>{walletState.railgunAddress}</strong>
              <button
                className="secondary-action wide"
                type="button"
                onClick={() => void copyShieldedAddress()}
              >
                <Copy size={18} aria-hidden="true" />
                {copiedShieldedAddress ? "Copied" : "Copy 0zk address"}
              </button>
            </div>
          ) : (
            <>
              <div className="wallet-secret-card">
                <strong>Create shielded wallet</strong>
                <label className="field">
                  <span>Local passphrase</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    value={newWalletPassphrase}
                    onChange={(event) =>
                      setNewWalletPassphrase(event.currentTarget.value)
                    }
                    placeholder="12+ characters"
                  />
                </label>
                <label className="field">
                  <span>Confirm passphrase</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    value={newWalletPassphraseConfirm}
                    onChange={(event) =>
                      setNewWalletPassphraseConfirm(event.currentTarget.value)
                    }
                    placeholder="12+ characters"
                  />
                </label>
                <button
                  className="primary-action wide"
                  type="button"
                  disabled={!canCreateRailgunWallet}
                  onClick={() => void createShieldedWallet()}
                >
                  <LockKeyhole size={18} aria-hidden="true" />
                  {isCreatingRailgunWallet
                    ? "Creating 0zk wallet"
                    : "Create shielded wallet"}
                </button>
              </div>

              <div className="wallet-secret-card">
                <strong>Import shielded wallet</strong>
                <label className="field">
                  <span>Recovery phrase</span>
                  <textarea
                    value={importRecoveryPhrase}
                    onChange={(event) =>
                      setImportRecoveryPhrase(event.currentTarget.value)
                    }
                    placeholder="existing BIP-39 phrase"
                  />
                </label>
                <label className="field">
                  <span>Local passphrase</span>
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={12}
                    value={importPassphrase}
                    onChange={(event) =>
                      setImportPassphrase(event.currentTarget.value)
                    }
                    placeholder="12+ characters"
                  />
                </label>
                <button
                  className="secondary-action wide"
                  type="button"
                  disabled={!canImportRailgunWallet}
                  onClick={() => void importShieldedWallet()}
                >
                  <LockKeyhole size={18} aria-hidden="true" />
                  {isImportingRailgunWallet ? "Importing" : "Import existing"}
                </button>
              </div>
            </>
          )}
        </>
      ) : null}

      {createdRecoveryPhrase ? (
        <div className="recovery-card" aria-label="Shielded wallet recovery phrase">
          <span>Recovery phrase - save before funding</span>
          <strong>{createdRecoveryPhrase}</strong>
          <button
            className="secondary-action wide"
            type="button"
            onClick={() => void copyRecoveryPhrase()}
          >
            <Copy size={18} aria-hidden="true" />
            {copiedRecoveryPhrase ? "Copied" : "Copy recovery phrase"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
