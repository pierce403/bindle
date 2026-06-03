import { ChevronDown, Eye, MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { ActivityFeed } from "./components/ActivityFeed";
import { BalancePanel, type WalletAction } from "./components/BalancePanel";
import { BottomNav, type AppTab } from "./components/BottomNav";
import { PrivacySwitchboard } from "./components/PrivacySwitchboard";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { SettingsPanel } from "./components/SettingsPanel";
import { UnshieldedBalanceBanner } from "./components/UnshieldedBalanceBanner";
import { WalletActionPanel } from "./components/WalletActionPanel";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";
import { defaultConnectionPolicy, type ConnectionPolicy } from "./privacy/connectionPolicy";
import { startRailgunBrowserEngine, type RailgunEngineState } from "./railgun/client";
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
  const [activeAction, setActiveAction] = useState<WalletAction | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("wallet");
  const hasRailgunWallet = false;
  const rpcReady = engineState === "ready" && policy.ethereumRpcUrl.length > 0;
  const canShield = rpcReady && hasRailgunWallet;

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
            <BalancePanel
              totalBalance={null}
              fiatValue={null}
              shieldedBalance={null}
              networkLabel="Ethereum mainnet"
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
                rpcReady={rpcReady}
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
            engineState={engineState}
            statusMessage={statusMessage}
            onConnect={startEngine}
            onChange={setPolicy}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsPanel theme={theme} onThemeChange={setTheme} />
        ) : null}

        <PwaInstallPrompt />
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </section>
    </main>
  );
}

export default App;
