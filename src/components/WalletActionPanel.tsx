import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Fingerprint,
  LockKeyhole,
  Repeat2,
  Send,
  Shuffle,
  WalletCards
} from "lucide-react";
import { useState } from "react";
import { routeIntent, type IntentDraft, type RoutedIntent } from "../intents/router";
import type { WalletAction } from "./BalancePanel";

type WalletActionPanelProps = {
  action: WalletAction;
  draft: IntentDraft;
  routedIntent: RoutedIntent;
  hasRailgunWallet: boolean;
  rpcReady: boolean;
  onDraftChange: (draft: IntentDraft) => void;
  onRouteChange: (intent: RoutedIntent) => void;
};

export function WalletActionPanel({
  action,
  draft,
  routedIntent,
  hasRailgunWallet,
  rpcReady,
  onDraftChange,
  onRouteChange
}: WalletActionPanelProps) {
  const [receiveMode, setReceiveMode] = useState<"shielded" | "public">(
    "shielded"
  );
  const [sendMode, setSendMode] = useState<"shielded" | "public">("shielded");
  const hasRecipient = draft.recipient.trim().length > 0;
  const hasAmount = Number(draft.amount) > 0;
  const canReview = hasRecipient && hasAmount && hasRailgunWallet && rpcReady;

  const updateDraft = (nextDraft: IntentDraft) => {
    onDraftChange(nextDraft);
    onRouteChange(routeIntent(nextDraft));
  };

  if (action === "receive") {
    return (
      <section className="panel action-panel" aria-labelledby="receive-heading">
        <div className="section-heading">
          <div>
            <h2 id="receive-heading">Receive ETH</h2>
            <span>Ethereum mainnet</span>
          </div>
          <ArrowDownToLine size={21} aria-hidden="true" />
        </div>

        <div className="mode-selector" aria-label="Receive mode">
          <button
            type="button"
            aria-pressed={receiveMode === "shielded"}
            onClick={() => setReceiveMode("shielded")}
          >
            Shielded
          </button>
          <button
            type="button"
            aria-pressed={receiveMode === "public"}
            onClick={() => setReceiveMode("public")}
          >
            Public
          </button>
        </div>

        <div className="empty-state compact">
          {receiveMode === "shielded" ? (
            <Fingerprint size={22} aria-hidden="true" />
          ) : (
            <LockKeyhole size={22} aria-hidden="true" />
          )}
          <strong>
            {receiveMode === "shielded"
              ? "Passkey smart wallet not wired yet"
              : "Public smart-wallet address pending"}
          </strong>
          <span>
            {receiveMode === "shielded"
              ? "Waiting for Kohaku passkey account support before showing a real public or 0zk address."
              : "Create the passkey-backed smart wallet before receiving public ETH."}
          </span>
          <button
            className="primary-action wide"
            type="button"
            disabled
            title="Waiting for Kohaku passkey smart-account support"
          >
            <Fingerprint size={18} aria-hidden="true" />
            Create Bindle with passkey
          </button>
        </div>
      </section>
    );
  }

  if (action === "pay") {
    return (
      <section className="panel action-panel" aria-labelledby="pay-heading">
        <div className="section-heading">
          <div>
            <h2 id="pay-heading">Pay</h2>
            <span>LayerZero routing planned</span>
          </div>
          <ArrowRight size={21} aria-hidden="true" />
        </div>

        <div className="empty-state compact">
          <WalletCards size={22} aria-hidden="true" />
          <strong>Provider payments unavailable</strong>
          <span>Cross-network settlement is not wired.</span>
        </div>
      </section>
    );
  }

  if (action === "swap") {
    return (
      <section className="panel action-panel" aria-labelledby="swap-heading">
        <div className="section-heading">
          <div>
            <h2 id="swap-heading">Swap</h2>
            <span>Uniswap planned</span>
          </div>
          <Repeat2 size={21} aria-hidden="true" />
        </div>

        <div className="empty-state compact">
          <Shuffle size={22} aria-hidden="true" />
          <strong>Swap unavailable</strong>
          <span>Uniswap routing is not wired.</span>
        </div>
      </section>
    );
  }

  return (
    <section className="panel action-panel" aria-labelledby="send-heading">
      <div className="section-heading">
        <div>
          <h2 id="send-heading">Send ETH</h2>
          <span>
            {sendMode === "shielded" ? "Railgun shielded ETH" : "Public ETH"}
          </span>
        </div>
        <ArrowUpFromLine size={21} aria-hidden="true" />
      </div>

      <div className="mode-selector" aria-label="Send mode">
        <button
          type="button"
          aria-pressed={sendMode === "shielded"}
          onClick={() => setSendMode("shielded")}
        >
          Shielded
        </button>
        <button
          type="button"
          aria-pressed={sendMode === "public"}
          onClick={() => setSendMode("public")}
        >
          Public
        </button>
      </div>

      <div className="amount-entry single-asset">
        <input
          aria-label="Amount"
          inputMode="decimal"
          value={draft.amount}
          placeholder="0.00"
          onChange={(event) =>
            updateDraft({ ...draft, amount: event.currentTarget.value })
          }
        />
        <span>ETH</span>
      </div>

      <label className="field">
        <span>To</span>
        <input
          value={draft.recipient}
          onChange={(event) =>
            updateDraft({ ...draft, recipient: event.currentTarget.value })
          }
          placeholder="0zk, 0x, or .eth"
        />
      </label>

      <label className="field">
        <span>Note</span>
        <input
          value={draft.note}
          onChange={(event) =>
            updateDraft({ ...draft, note: event.currentTarget.value })
          }
          placeholder="optional"
        />
      </label>

      <div className="route-card">
        <div>
          <span>Route</span>
          <strong>{hasRecipient ? routedIntent.route.name : "pending"}</strong>
        </div>
        <Shuffle size={19} aria-hidden="true" />
        <div>
          <span>Action</span>
          <strong>{hasRecipient ? routedIntent.privateLeg.action : "pending"}</strong>
        </div>
      </div>

      <button className="primary-action wide" type="button" disabled={!canReview}>
        <Send size={18} aria-hidden="true" />
        Review
      </button>
    </section>
  );
}
