import { ChevronDown, Eye, MoreHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ActivityFeed } from "./components/ActivityFeed";
import { BalancePanel, type WalletAction } from "./components/BalancePanel";
import { BottomNav, type AppTab } from "./components/BottomNav";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PrivacySwitchboard } from "./components/PrivacySwitchboard";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { SettingsPanel } from "./components/SettingsPanel";
import { UnshieldedBalanceBanner } from "./components/UnshieldedBalanceBanner";
import { WalletActionPanel } from "./components/WalletActionPanel";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";
import type { ConnectionPolicy } from "./privacy/connectionPolicy";
import {
  loadConnectionPolicy,
  saveConnectionPolicy
} from "./privacy/connectionPolicyState";
import { buildEndpointDisclosure } from "./privacy/preflightDisclosure";
import {
  assessShieldReadiness,
  assessUnshieldReadiness,
  summarizeMissingRequirements
} from "./railgun/shielding";
import {
  clearEncryptedRailgunWallet,
  createEncryptedRailgunWallet,
  importEncryptedRailgunWallet
} from "./railgun/railgunWallet";
import {
  startPrivacyToolkit,
  type PrivacyToolkitHandle,
  type PrivacyToolkitState
} from "./privacy/toolkit";
import { defaultTheme, type ThemeSelection } from "./theme/theme";
import {
  deriveSmartWalletAddressFromPasskey,
  sendSmartWalletEthPayment
} from "./wallet/smartAccountAdapter";
import {
  fetchPublicEthBalance,
  type PublicEthBalance
} from "./wallet/publicBalance";
import {
  detectPasskeyCapability,
  createBindlePasskeyCredential,
  type PasskeyCapability
} from "./wallet/passkeys";
import {
  loadWalletState,
  markPasskeyEnrolled,
  markRailgunWalletReady,
  markSmartWalletReady,
  markWalletError,
  resetWalletState,
  type WalletState
} from "./wallet/walletState";

const initialDraft: IntentDraft = {
  recipient: "",
  amount: "",
  asset: "ETH",
  note: ""
};

type PublicBalanceState =
  | { status: "missing-wallet" | "missing-rpc" | "idle" | "syncing" }
  | { status: "ready"; balance: PublicEthBalance }
  | { status: "error"; message: string };

const initialPublicBalanceState = (): PublicBalanceState =>
  loadWalletState().smartWalletAddress
    ? { status: "idle" }
    : { status: "missing-wallet" };

const publicBalanceText = (state: PublicBalanceState): string | null => {
  switch (state.status) {
    case "ready":
      return state.balance.formatted;
    case "syncing":
      return "syncing";
    case "error":
      return "sync failed";
    case "missing-rpc":
      return "RPC required";
    case "missing-wallet":
    case "idle":
      return null;
  }
};

const publicBalanceNetworkStatus = (state: PublicBalanceState): string => {
  switch (state.status) {
    case "ready":
      return `public synced at block ${state.balance.blockNumber.toString()}`;
    case "syncing":
      return "syncing public ETH";
    case "error":
      return "public sync failed";
    case "missing-rpc":
      return "RPC required";
    case "missing-wallet":
      return "funding wallet pending";
    case "idle":
      return "public balance not synced";
  }
};

function App() {
  const [draft, setDraft] = useState<IntentDraft>(initialDraft);
  const [routedIntent, setRoutedIntent] = useState<RoutedIntent>(() =>
    routeIntent(initialDraft)
  );
  const [policy, setPolicy] = useState<ConnectionPolicy>(() =>
    loadConnectionPolicy()
  );
  const [toolkitState, setToolkitState] = useState<PrivacyToolkitState>("idle");
  const [toolkitHandle, setToolkitHandle] =
    useState<PrivacyToolkitHandle | null>(null);
  const toolkitStartRef = useRef<Promise<PrivacyToolkitHandle> | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [theme, setTheme] = useState<ThemeSelection>(defaultTheme);
  const [activeAction, setActiveAction] = useState<WalletAction | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("wallet");
  const [walletState, setWalletState] = useState<WalletState>(() =>
    loadWalletState()
  );
  const [passkeyCapability, setPasskeyCapability] =
    useState<PasskeyCapability>({
      checked: false,
      webAuthnSupported: false,
      platformAuthenticatorAvailable: false,
      userVerificationAvailable: false,
      available: false,
      message: "Checking passkey support"
    });
  const [isCreatingPasskey, setIsCreatingPasskey] = useState(false);
  const [isDerivingSmartWallet, setIsDerivingSmartWallet] = useState(false);
  const [isCreatingRailgunWallet, setIsCreatingRailgunWallet] = useState(false);
  const [isImportingRailgunWallet, setIsImportingRailgunWallet] =
    useState(false);
  const [isSubmittingSmartPayment, setIsSubmittingSmartPayment] = useState(false);
  const [smartPaymentStatus, setSmartPaymentStatus] = useState("");
  const [publicBalance, setPublicBalance] = useState<PublicBalanceState>(
    initialPublicBalanceState
  );
  const publicBalanceRequestRef = useRef(0);
  const hasRailgunWallet = walletState.railgunAddress !== null;
  const hasSmartWallet = walletState.smartWalletAddress !== null;
  const rpcReady = toolkitState === "ready" && policy.ethereumRpcUrl.length > 0;
  const bundlerReady = policy.bundlerUrl.trim().length > 0;
  const rpcConfigured = policy.ethereumRpcUrl.trim().length > 0;
  const smartWalletStatus = walletState.smartWalletAddress
    ? "ready"
    : walletState.passkeyPresent
      ? "pending"
      : "not created";
  const railgunStatus = walletState.railgunAddress ? "ready" : "not created";
  const onboardingComplete =
    walletState.smartWalletAddress !== null &&
    walletState.railgunAddress !== null &&
    toolkitState === "ready";
  const sendEndpointDisclosure = buildEndpointDisclosure(
    policy,
    hasSmartWallet && !hasRailgunWallet ? "public-smart-payment" : "send-review"
  );
  const publicBalanceDisclosure = buildEndpointDisclosure(
    policy,
    "public-balance-sync"
  );
  const publicBalanceEndpointSummary = publicBalanceDisclosure
    .filter((endpoint) => endpoint.configured || endpoint.required)
    .map((endpoint) =>
      endpoint.configured
        ? `${endpoint.label} (${endpoint.source}: ${endpoint.value})`
        : `${endpoint.label} (${endpoint.required ? "required, off" : "off"})`
    )
    .join(", ");
  const knownPublicBalance = publicBalanceText(publicBalance);
  const publicBalanceWei =
    publicBalance.status === "ready" ? publicBalance.balance.wei : null;
  const hasRecoverableRailgunKeyMaterial =
    walletState.railgunAddress !== null &&
    walletState.railgunKeyStore === "encrypted-local";
  const balanceLabel =
    publicBalance.status === "ready" && !hasRailgunWallet ? "Known ETH" : "Total ETH";
  const shieldReadiness = assessShieldReadiness({
    smartWalletAddress: walletState.smartWalletAddress,
    railgunAddress: walletState.railgunAddress,
    hasRecoverableRailgunKeyMaterial,
    publicBalanceWei,
    ethereumRpcUrl: policy.ethereumRpcUrl,
    bundlerUrl: policy.bundlerUrl,
    providerMode: policy.providerMode
  });
  const shieldSubmissionReady = false;
  const canShield = shieldReadiness.ready && shieldSubmissionReady;
  const unshieldReadiness = assessUnshieldReadiness({
    railgunAddress: walletState.railgunAddress,
    hasRecoverableRailgunKeyMaterial,
    shieldedBalanceWei: null,
    toolkitReady: toolkitState === "ready",
    ethereumRpcUrl: policy.ethereumRpcUrl,
    broadcasterUrl: policy.broadcasterUrl,
    providerMode: policy.providerMode
  });
  const shieldDisclosure =
    publicBalance.status === "ready"
      ? shieldReadiness.ready
        ? "Shield blocked: transaction submission is not wired yet."
        : `Shield blocked: ${summarizeMissingRequirements(shieldReadiness)}.`
      : null;
  const unshieldMissing = summarizeMissingRequirements(unshieldReadiness);
  const shieldedStatus = hasRailgunWallet
    ? unshieldReadiness.ready
      ? "not synced"
      : `unshield blocked: ${unshieldMissing}`
    : "0zk pending";
  const canSyncPublicBalance =
    walletState.smartWalletAddress !== null &&
    rpcConfigured &&
    publicBalance.status !== "syncing";

  useEffect(() => {
    let cancelled = false;

    void detectPasskeyCapability().then((capability) => {
      if (!cancelled) {
        setPasskeyCapability(capability);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!walletState.smartWalletAddress) {
      setPublicBalance({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setPublicBalance({ status: "missing-rpc" });
      return;
    }

    setPublicBalance({ status: "idle" });
  }, [walletState.smartWalletAddress, policy.ethereumRpcUrl, policy.providerMode]);

  const startToolkit = async () => {
    if (toolkitStartRef.current || toolkitState === "starting") {
      return;
    }

    if (toolkitHandle) {
      setStatusMessage(`${toolkitHandle.label} is already ready`);
      return;
    }

    setToolkitState("starting");
    setStatusMessage("Starting privacy toolkit");

    try {
      const startPromise = startPrivacyToolkit(policy, setStatusMessage);
      toolkitStartRef.current = startPromise;
      const handle = await startPromise;
      setToolkitHandle(handle);
      setToolkitState("ready");
    } catch (error) {
      setToolkitState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to start");
    } finally {
      toolkitStartRef.current = null;
    }
  };

  const updateConnectionPolicy = (nextPolicy: ConnectionPolicy) => {
    setPolicy(saveConnectionPolicy(nextPolicy));
  };

  const syncPublicBalance = async () => {
    const smartWalletAddress = walletState.smartWalletAddress;

    if (!smartWalletAddress) {
      setPublicBalance({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setPublicBalance({ status: "missing-rpc" });
      return;
    }

    const requestId = publicBalanceRequestRef.current + 1;
    publicBalanceRequestRef.current = requestId;
    setPublicBalance({ status: "syncing" });
    setStatusMessage("Syncing public ETH balance");

    try {
      const balance = await fetchPublicEthBalance(policy, smartWalletAddress);

      if (publicBalanceRequestRef.current === requestId) {
        setPublicBalance({ status: "ready", balance });
        setStatusMessage(
          `Public ETH balance synced at block ${balance.blockNumber.toString()}`
        );
      }
    } catch (error) {
      if (publicBalanceRequestRef.current === requestId) {
        const message =
          error instanceof Error ? error.message : "Unable to sync public balance";
        setPublicBalance({ status: "error", message });
        setStatusMessage(message);
      }
    }
  };

  const deriveSmartWallet = async (state = walletState) => {
    if (!state.passkeyCredentialId || !state.passkeyPublicKey) {
      setStatusMessage(
        "Create a funding passkey before deriving a smart-wallet address."
      );
      return state;
    }

    setIsDerivingSmartWallet(true);

    try {
      const smartWalletAddress = await deriveSmartWalletAddressFromPasskey(
        policy,
        state
      );

      if (smartWalletAddress.status === "ready") {
        const nextState = markSmartWalletReady(state, smartWalletAddress.address);
        setWalletState(nextState);
        setStatusMessage("Smart-wallet funding address ready");
        return nextState;
      }

      setStatusMessage(smartWalletAddress.reason);
      return state;
    } finally {
      setIsDerivingSmartWallet(false);
    }
  };

  const createPasskeyWallet = async () => {
    if (
      !passkeyCapability.available ||
      (walletState.passkeyPresent && walletState.passkeyPublicKey)
    ) {
      return;
    }

    setIsCreatingPasskey(true);

    try {
      const credential = await createBindlePasskeyCredential();
      const passkeyState = markPasskeyEnrolled(walletState, credential);
      setWalletState(passkeyState);

      if (policy.ethereumRpcUrl.trim()) {
        await deriveSmartWallet(passkeyState);
      } else {
        setStatusMessage(
          "Passkey enrolled. Configure Ethereum RPC to derive the funding address."
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to create passkey";
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
    } finally {
      setIsCreatingPasskey(false);
    }
  };

  const createRailgunWallet = async (
    passphrase: string
  ): Promise<string | null> => {
    if (isCreatingRailgunWallet || walletState.railgunAddress) {
      return null;
    }

    setIsCreatingRailgunWallet(true);
    setStatusMessage("Creating shielded RAILGUN wallet");

    try {
      const wallet = await createEncryptedRailgunWallet({ passphrase });
      const nextState = markRailgunWalletReady(
        walletState,
        wallet.railgunAddress,
        "created"
      );
      setWalletState(nextState);
      setStatusMessage("Shielded RAILGUN wallet created");
      return wallet.recoveryPhrase;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to create shielded RAILGUN wallet";
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
      return null;
    } finally {
      setIsCreatingRailgunWallet(false);
    }
  };

  const importRailgunWallet = async (
    recoveryPhrase: string,
    passphrase: string
  ): Promise<void> => {
    if (isImportingRailgunWallet || walletState.railgunAddress) {
      return;
    }

    setIsImportingRailgunWallet(true);
    setStatusMessage("Importing shielded RAILGUN wallet");

    try {
      const wallet = await importEncryptedRailgunWallet({
        recoveryPhrase,
        passphrase
      });
      const nextState = markRailgunWalletReady(
        walletState,
        wallet.railgunAddress,
        "imported"
      );
      setWalletState(nextState);
      setStatusMessage("Shielded RAILGUN wallet imported");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to import shielded RAILGUN wallet";
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
    } finally {
      setIsImportingRailgunWallet(false);
    }
  };

  const submitSmartPayment = async () => {
    if (!walletState.smartWalletAddress) {
      setSmartPaymentStatus("Create the smart-wallet funding address first.");
      return;
    }

    setIsSubmittingSmartPayment(true);
    setSmartPaymentStatus("Submitting ERC-4337 user operation");

    try {
      const result = await sendSmartWalletEthPayment({
        amount: draft.amount,
        policy,
        recipient: draft.recipient,
        walletState
      });
      setSmartPaymentStatus(
        result.transactionHash
          ? `Submitted: ${result.transactionHash}`
          : `Submitted user operation: ${result.userOperationHash}`
      );
    } catch (error) {
      setSmartPaymentStatus(
        error instanceof Error ? error.message : "Unable to submit payment"
      );
    } finally {
      setIsSubmittingSmartPayment(false);
    }
  };

  const resetLocalWallet = () => {
    setWalletState(resetWalletState());
    setStatusMessage("Local wallet metadata cleared");
    void clearEncryptedRailgunWallet()
      .then(() => setStatusMessage("Local wallet metadata and secrets cleared"))
      .catch((error) =>
        setStatusMessage(
          error instanceof Error
            ? error.message
            : "Unable to clear encrypted RAILGUN wallet secrets"
        )
      );
  };

  return (
    <main
      className="app-shell"
      data-theme-accent={theme.accent}
      data-theme-mode={theme.mode}
    >
      <section className="phone-frame" aria-label="Bindle wallet">
        <header className="app-header">
          <div className="brand-lockup">
            <img className="brand-mark" src="/logo.png" alt="" />
            <div className="brand-copy">
              <strong>Bindle</strong>
              <span className="eyebrow">ETH mainnet</span>
            </div>
            <ChevronDown size={22} aria-hidden="true" />
          </div>

          <div className="header-actions">
            <button className="icon-button ghost" type="button" title="Hide balance">
              <Eye size={21} aria-hidden="true" />
            </button>
            <button className="icon-button ghost" type="button" title="More">
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        {activeTab === "wallet" ? (
          <>
            {!onboardingComplete ? (
              <OnboardingWizard
                walletState={walletState}
                passkeyCapability={passkeyCapability}
                isCreatingPasskey={isCreatingPasskey}
                isCreatingRailgunWallet={isCreatingRailgunWallet}
                isImportingRailgunWallet={isImportingRailgunWallet}
                policy={policy}
                toolkitState={toolkitState}
                statusMessage={statusMessage}
                onCreatePasskey={() => void createPasskeyWallet()}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onCreateRailgunWallet={createRailgunWallet}
                onImportRailgunWallet={importRailgunWallet}
                onOpenConnections={() => setActiveTab("nodes")}
                onStartToolkit={() => void startToolkit()}
                isDerivingSmartWallet={isDerivingSmartWallet}
              />
            ) : null}

            <BalancePanel
              totalBalance={knownPublicBalance}
              balanceLabel={balanceLabel}
              networkStatus={publicBalanceNetworkStatus(publicBalance)}
              shieldedStatus={shieldedStatus}
              networkLabel="Ethereum mainnet"
              smartWalletAddress={walletState.smartWalletAddress}
              smartWalletStatus={smartWalletStatus}
              railgunAddress={walletState.railgunAddress}
              railgunStatus={railgunStatus}
              activeAction={activeAction}
              onActionChange={setActiveAction}
            />

            <UnshieldedBalanceBanner
              balance={knownPublicBalance}
              canShield={canShield}
              canSync={canSyncPublicBalance}
              isSyncing={publicBalance.status === "syncing"}
              syncDisclosure={
                canSyncPublicBalance ? publicBalanceEndpointSummary : null
              }
              shieldDisclosure={shieldDisclosure}
              onSync={() => void syncPublicBalance()}
            />

            {activeAction ? (
              <WalletActionPanel
                action={activeAction}
                draft={draft}
                routedIntent={routedIntent}
                hasRailgunWallet={hasRailgunWallet}
                hasSmartWallet={hasSmartWallet}
                rpcConfigured={rpcConfigured}
                rpcReady={rpcReady}
                bundlerReady={bundlerReady}
                walletState={walletState}
                isSubmittingSmartPayment={isSubmittingSmartPayment}
                smartPaymentStatus={smartPaymentStatus}
                endpointDisclosures={sendEndpointDisclosure}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onOpenConnections={() => setActiveTab("nodes")}
                onSubmitSmartPayment={() => void submitSmartPayment()}
                onDraftChange={setDraft}
                onRouteChange={setRoutedIntent}
              />
            ) : null}

            <ActivityFeed items={[]} />
          </>
        ) : null}

        {activeTab === "nodes" ? (
          <PrivacySwitchboard
            policy={policy}
            toolkitState={toolkitState}
            statusMessage={statusMessage}
            isStarting={toolkitState === "starting"}
            onConnect={startToolkit}
            onChange={updateConnectionPolicy}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsPanel
            theme={theme}
            onThemeChange={setTheme}
            onResetWallet={resetLocalWallet}
          />
        ) : null}

        <PwaInstallPrompt />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </section>
    </main>
  );
}

export default App;
