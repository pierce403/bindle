import { useMemo, useState } from "react";
import { CircleDollarSign, LockKeyhole, MessageCircle, Settings } from "lucide-react";
import { ActivityFeed } from "./components/ActivityFeed";
import { BalancePanel } from "./components/BalancePanel";
import { PrivacySwitchboard } from "./components/PrivacySwitchboard";
import { SendComposer } from "./components/SendComposer";
import { activity } from "./data/activity";
import { defaultConnectionPolicy, type ConnectionPolicy } from "./privacy/connectionPolicy";
import { startRailgunBrowserEngine, type RailgunEngineState } from "./railgun/client";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";

const initialDraft: IntentDraft = {
  recipient: "@coinbase/maya",
  amount: "125.00",
  asset: "USDC",
  note: "Rent share"
};

function App() {
  const [draft, setDraft] = useState<IntentDraft>(initialDraft);
  const [routedIntent, setRoutedIntent] = useState<RoutedIntent>(() =>
    routeIntent(initialDraft)
  );
  const [policy, setPolicy] = useState<ConnectionPolicy>(defaultConnectionPolicy);
  const [engineState, setEngineState] = useState<RailgunEngineState>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  const totals = useMemo(() => {
    const incoming = activity
      .filter((item) => item.direction === "in" && item.asset === "USDC")
      .reduce((sum, item) => sum + Number(item.amount), 0);
    const outgoing = activity
      .filter((item) => item.direction === "out" && item.asset === "USDC")
      .reduce((sum, item) => sum + Number(item.amount), 0);

    return {
      shielded: `$${(2400 + incoming - outgoing).toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}`,
      public: "0.18 ETH"
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
    <main className="app-shell">
      <section className="phone-frame" aria-label="Bindle wallet">
        <header className="app-header">
          <div>
            <span className="eyebrow">Bindle</span>
            <strong>Pay privately</strong>
          </div>
          <button className="icon-button" type="button" title="Settings">
            <Settings size={20} aria-hidden="true" />
          </button>
        </header>

        <BalancePanel
          shieldedBalance={totals.shielded}
          publicBalance={totals.public}
          railgunAddress="bindle1q8k...n5h2"
        />

        <nav className="tab-bar" aria-label="Wallet tabs">
          <button type="button" className="active">
            <CircleDollarSign size={18} aria-hidden="true" />
            Home
          </button>
          <button type="button">
            <MessageCircle size={18} aria-hidden="true" />
            Feed
          </button>
          <button type="button">
            <LockKeyhole size={18} aria-hidden="true" />
            Vault
          </button>
        </nav>

        <SendComposer
          draft={draft}
          routedIntent={routedIntent}
          onDraftChange={setDraft}
          onRouteChange={setRoutedIntent}
        />

        <ActivityFeed items={activity} />
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
