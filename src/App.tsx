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
import { defaultConnectionPolicy, type ConnectionPolicy } from "./privacy/connectionPolicy";
import { buildEndpointDisclosure } from "./privacy/preflightDisclosure";
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
  detectPasskeyCapability,
  createBindlePasskeyCredential,
  type PasskeyCapability
} from "./wallet/passkeys";
import {
  loadWalletState,
  markPasskeyEnrolled,
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

function App() {
  const [draft, setDraft] = useState<IntentDraft>(initialDraft);
  const [routedIntent, setRoutedIntent] = useState<RoutedIntent>(() =>
    routeIntent(initialDraft)
  );
  const [policy, setPolicy] = useState<ConnectionPolicy>(defaultConnectionPolicy);
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
  const [isSubmittingSmartPayment, setIsSubmittingSmartPayment] = useState(false);
  const [smartPaymentStatus, setSmartPaymentStatus] = useState("");
  const hasRailgunWallet = walletState.railgunAddress !== null;
  const hasSmartWallet = walletState.smartWalletAddress !== null;
  const rpcReady = toolkitState === "ready" && policy.ethereumRpcUrl.length > 0;
  const bundlerReady = policy.bundlerUrl.trim().length > 0;
  const shieldConstructionReady = false;
  const canShield =
    rpcReady && walletState.smartWalletAddress !== null && shieldConstructionReady;
  const smartWalletStatus = walletState.smartWalletAddress
    ? "ready"
    : walletState.passkeyPresent
      ? "pending"
      : "not created";
  const railgunStatus = walletState.railgunAddress ? "ready" : "not created";
  const onboardingComplete =
    walletState.smartWalletAddress !== null && walletState.railgunAddress !== null;
  const sendEndpointDisclosure = buildEndpointDisclosure(
    policy,
    hasSmartWallet && !hasRailgunWallet ? "public-smart-payment" : "send-review"
  );

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
                policy={policy}
                toolkitState={toolkitState}
                statusMessage={statusMessage}
                onCreatePasskey={() => void createPasskeyWallet()}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onOpenConnections={() => setActiveTab("nodes")}
                onStartToolkit={() => void startToolkit()}
                isDerivingSmartWallet={isDerivingSmartWallet}
              />
            ) : null}

            <BalancePanel
              totalBalance={null}
              fiatValue={null}
              shieldedBalance={null}
              networkLabel="Ethereum mainnet"
              smartWalletAddress={walletState.smartWalletAddress}
              smartWalletStatus={smartWalletStatus}
              railgunAddress={walletState.railgunAddress}
              railgunStatus={railgunStatus}
              activeAction={activeAction}
              onActionChange={setActiveAction}
            />

            <UnshieldedBalanceBanner balance={null} canShield={canShield} />

            {activeAction ? (
              <WalletActionPanel
                action={activeAction}
                draft={draft}
                routedIntent={routedIntent}
                hasRailgunWallet={hasRailgunWallet}
                hasSmartWallet={hasSmartWallet}
                rpcReady={rpcReady}
                bundlerReady={bundlerReady}
                walletState={walletState}
                passkeyCapability={passkeyCapability}
                isCreatingPasskey={isCreatingPasskey}
                isSubmittingSmartPayment={isSubmittingSmartPayment}
                smartPaymentStatus={smartPaymentStatus}
                endpointDisclosures={sendEndpointDisclosure}
                onCreatePasskey={() => void createPasskeyWallet()}
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
            onChange={setPolicy}
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
