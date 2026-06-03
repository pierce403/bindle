import { Send, Shuffle, WalletCards } from "lucide-react";
import { providerRoutes } from "../intents/providers";
import { routeIntent, type IntentDraft, type RoutedIntent } from "../intents/router";

type SendComposerProps = {
  draft: IntentDraft;
  routedIntent: RoutedIntent;
  onDraftChange: (draft: IntentDraft) => void;
  onRouteChange: (intent: RoutedIntent) => void;
};

export function SendComposer({
  draft,
  routedIntent,
  onDraftChange,
  onRouteChange
}: SendComposerProps) {
  const hasRecipient = draft.recipient.trim().length > 0;
  const canReview = hasRecipient && Number(draft.amount) > 0;

  const updateDraft = (nextDraft: IntentDraft) => {
    onDraftChange(nextDraft);
    onRouteChange(routeIntent(nextDraft));
  };

  return (
    <section className="panel composer" aria-labelledby="send-heading">
      <div className="section-heading">
        <h2 id="send-heading">Pay</h2>
        <WalletCards size={21} aria-hidden="true" />
      </div>

      <div className="amount-entry">
        <input
          aria-label="Amount"
          inputMode="decimal"
          value={draft.amount}
          onChange={(event) =>
            updateDraft({ ...draft, amount: event.currentTarget.value })
          }
        />
        <select
          aria-label="Asset"
          value={draft.asset}
          onChange={(event) =>
            updateDraft({
              ...draft,
              asset: event.currentTarget.value as IntentDraft["asset"]
            })
          }
        >
          <option value="USDC">USDC</option>
          <option value="ETH">ETH</option>
          <option value="DAI">DAI</option>
        </select>
      </div>

      <label className="field">
        <span>To</span>
        <input
          value={draft.recipient}
          onChange={(event) =>
            updateDraft({ ...draft, recipient: event.currentTarget.value })
          }
          placeholder="0zk, .eth, @provider"
        />
      </label>

      <label className="field">
        <span>Note</span>
        <input
          value={draft.note}
          onChange={(event) =>
            updateDraft({ ...draft, note: event.currentTarget.value })
          }
          placeholder="What is it for?"
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

      <div className="provider-strip">
        {providerRoutes.map((route) => (
          <span key={route.id}>{route.handle}</span>
        ))}
      </div>

      <button className="primary-action wide" type="button" disabled={!canReview}>
        <Send size={18} aria-hidden="true" />
        Review
      </button>
    </section>
  );
}
