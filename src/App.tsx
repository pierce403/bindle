import { useMemo, useState } from "react";
import { ActivityFeed } from "./components/ActivityFeed";
import { BalancePanel } from "./components/BalancePanel";
import { EthOnboarding } from "./components/EthOnboarding";
import { PrivacySwitchboard } from "./components/PrivacySwitchboard";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { SendComposer } from "./components/SendComposer";
import { ThemeControls } from "./components/ThemeControls";
import { defaultConnectionPolicy, type ConnectionPolicy } from "./privacy/connectionPolicy";
import { startRailgunBrowserEngine, type RailgunEngineState } from "./railgun/client";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";
import { defaultTheme, type ThemeSelection } from "./theme/theme";

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
  const [engineState, setEngineState] = useState<RailgunEngineState>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [theme, setTheme] = useState<ThemeSelection>(defaultTheme);
  const [shieldAmount, setShieldAmount] = useState("");
  const hasRailgunWallet = false;
  const rpcReady = engineState === "ready" && policy.ethereumRpcUrl.length > 0;

  const totals = useMemo(() => {
    return {
      shielded: "0.00 ETH",
      public: "0.00 ETH"
    };
  }, []);

  const startEngine = async () => {
    setEngineState("starting");
    setStatusMessage("Starting");

    try {
      await startRailgunBrowserEngine(policy, setStatusMessage);
      setEngineState("ready");
    } catch (error) {
      setEngineState("error");
      setStatusMessage(error instanceof Error ? error.message : "Unable to start");
    }
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
              <span className="eyebrow">Bindle</span>
              <strong>Pay privately</strong>
            </div>
          </div>
        </header>

        <ThemeControls theme={theme} onChange={setTheme} />

        <BalancePanel
          shieldedBalance={totals.shielded}
          publicBalance={totals.public}
          canShield={rpcReady && hasRailgunWallet}
        />

        <SendComposer
          draft={draft}
          routedIntent={routedIntent}
          onDraftChange={setDraft}
          onRouteChange={setRoutedIntent}
        />

        <EthOnboarding
          amount={shieldAmount}
          hasRailgunAddress={hasRailgunWallet}
          rpcReady={rpcReady}
          onAmountChange={setShieldAmount}
        />

        <ActivityFeed items={[]} />

        <PwaInstallPrompt />
      </section>

      <aside className="desktop-rail">
        <PrivacySwitchboard
          policy={policy}
          engineState={engineState}
          statusMessage={statusMessage}
          onConnect={startEngine}
          onChange={setPolicy}
        />
      </aside>
    </main>
  );
}

export default App;
