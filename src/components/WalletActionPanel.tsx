import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  LockKeyhole,
  Repeat2,
  Send,
  Shuffle,
  WalletCards
} from "lucide-react";
import { useState } from "react";
import { routeIntent, type IntentDraft, type RoutedIntent } from "../intents/router";
import { isValidEthAmount, isValidRecipientShape } from "../intents/validation";
import type { EndpointDisclosure } from "../privacy/preflightDisclosure";
import type { WalletState } from "../wallet/walletState";
import type { WalletAction } from "./BalancePanel";

type WalletActionPanelProps = {
  action: WalletAction;
  draft: IntentDraft;
  routedIntent: RoutedIntent;
  hasRailgunWallet: boolean;
  hasSmartWallet: boolean;
  rpcConfigured: boolean;
  rpcReady: boolean;
  bundlerReady: boolean;
  walletState: WalletState;
  isSubmittingSmartPayment: boolean;
  smartPaymentStatus: string;
  endpointDisclosures: EndpointDisclosure[];
  onDeriveSmartWallet: () => void;
  onOpenConnections: () => void;
  onSubmitSmartPayment: () => void;
  onDraftChange: (draft: IntentDraft) => void;
  onRouteChange: (intent: RoutedIntent) => void;
};

export function WalletActionPanel({
  action,
  draft,
  routedIntent,
  hasRailgunWallet,
  hasSmartWallet,
  rpcConfigured,
  rpcReady,
  bundlerReady,
  walletState,
  isSubmittingSmartPayment,
  smartPaymentStatus,
  endpointDisclosures,
  onDeriveSmartWallet,
  onOpenConnections,
  onSubmitSmartPayment,
  onDraftChange,
  onRouteChange
}: WalletActionPanelProps) {
  const [receiveMode, setReceiveMode] = useState<"shielded" | "public">(
    "shielded"
  );
  const [sendMode, setSendMode] = useState<"shielded" | "public">("shielded");
  const [reviewingPayment, setReviewingPayment] = useState(false);
  const hasRecipient = draft.recipient.trim().length > 0;
  const hasAmount = isValidEthAmount(draft.amount);
  const hasValidRecipient = isValidRecipientShape(draft.recipient);
  const requiredEndpointsReady = endpointDisclosures.every(
    (endpoint) => !endpoint.required || endpoint.configured
  );
  const hasRecoverableRailgunKeyMaterial =
    walletState.railgunAddress !== null &&
    walletState.railgunKeyStore === "encrypted-local";
  const canReviewShielded =
    hasRecipient &&
    hasValidRecipient &&
    hasAmount &&
    hasRailgunWallet &&
    hasRecoverableRailgunKeyMaterial &&
    rpcReady &&
    requiredEndpointsReady;
  const canReviewPublic =
    hasRecipient &&
    hasValidRecipient &&
    hasAmount &&
    hasSmartWallet &&
    rpcReady &&
    bundlerReady &&
    requiredEndpointsReady;
  const canReview =
    sendMode === "public" ? canReviewPublic : canReviewShielded;
  const canCreateFundingAddress =
    walletState.passkeyPublicKey !== null &&
    rpcConfigured &&
    !walletState.smartWalletAddress;

  const updateDraft = (nextDraft: IntentDraft) => {
    setReviewingPayment(false);
    onDraftChange(nextDraft);
    onRouteChange(routeIntent(nextDraft));
  };

  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
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

        {receiveMode === "shielded" ? (
          <div className="empty-state compact">
            <LockKeyhole size={22} aria-hidden="true" />
            <strong>
              {walletState.railgunAddress
                ? "Shielded address ready"
                : "Shielded address pending"}
            </strong>
            <span>
              {walletState.railgunAddress
                ? walletState.railgunAddress
                : "Create or import a shielded RAILGUN wallet in setup."}
            </span>
            {walletState.railgunAddress ? (
              <button
                className="secondary-action wide"
                type="button"
                onClick={() => void copyAddress(walletState.railgunAddress ?? "")}
              >
                <Copy size={18} aria-hidden="true" />
                Copy 0zk address
              </button>
            ) : walletState.status === "error" && walletState.lastError ? (
              <span>{walletState.lastError}</span>
            ) : null}
          </div>
        ) : (
          <div className="empty-state compact">
            <LockKeyhole size={22} aria-hidden="true" />
            <strong>
              {walletState.smartWalletAddress
                ? "Funding address ready"
                : walletState.passkeyPublicKey
                  ? "Funding address pending"
                : walletState.passkeyPresent
                  ? "Funding passkey needed"
                  : "No public smart wallet yet"}
            </strong>
            <span>
              {walletState.smartWalletAddress
                ? walletState.smartWalletAddress
                : walletState.passkeyPublicKey
                  ? rpcConfigured
                    ? "Create the funding address, then send ETH to it from another wallet."
                    : "Configure Ethereum RPC to create the funding address."
                : walletState.passkeyPresent
                  ? "Create a funding passkey to derive a public smart-wallet address."
                  : "Create the passkey-backed smart wallet before receiving public ETH."}
            </span>
            {walletState.smartWalletAddress ? (
              <button
                className="secondary-action wide"
                type="button"
                onClick={() => void copyAddress(walletState.smartWalletAddress ?? "")}
              >
                <Copy size={18} aria-hidden="true" />
                Copy address
              </button>
            ) : canCreateFundingAddress ? (
              <button
                className="primary-action wide"
                type="button"
                onClick={onDeriveSmartWallet}
              >
                <LockKeyhole size={18} aria-hidden="true" />
                Create funding address
              </button>
            ) : walletState.passkeyPublicKey ? (
              <button
                className="secondary-action wide"
                type="button"
                onClick={onOpenConnections}
              >
                <LockKeyhole size={18} aria-hidden="true" />
                Configure RPC
              </button>
            ) : null}
          </div>
        )}
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
          onClick={() => {
            setReviewingPayment(false);
            setSendMode("shielded");
          }}
        >
          Shielded
        </button>
        <button
          type="button"
          aria-pressed={sendMode === "public"}
          onClick={() => {
            setReviewingPayment(false);
            setSendMode("public");
          }}
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

      <div className="preflight-card" aria-label="Endpoint preflight">
        <span>Could contact</span>
        {endpointDisclosures.map((endpoint) => (
          <div className="preflight-row" key={endpoint.id}>
            <strong>{endpoint.label}</strong>
            <span>
              {endpoint.configured
                ? `${endpoint.source}: ${endpoint.value}`
                : endpoint.required
                  ? "required, not connected"
                  : "off"}
            </span>
          </div>
        ))}
      </div>

      {reviewingPayment && sendMode === "public" ? (
        <div className="review-card" aria-label="Review public payment">
          <span>Review public payment</span>
          <div>
            <strong>From</strong>
            <span>{walletState.smartWalletAddress}</span>
          </div>
          <div>
            <strong>To</strong>
            <span>{draft.recipient.trim()}</span>
          </div>
          <div>
            <strong>Amount</strong>
            <span>{draft.amount.trim()} ETH</span>
          </div>
          <button
            className="primary-action wide"
            type="button"
            disabled={!canReviewPublic || isSubmittingSmartPayment}
            onClick={onSubmitSmartPayment}
          >
            <Send size={18} aria-hidden="true" />
            {isSubmittingSmartPayment ? "Submitting" : "Submit public payment"}
          </button>
        </div>
      ) : null}

      {reviewingPayment && sendMode === "shielded" ? (
        <div className="review-card" aria-label="Review shielded payment">
          <span>Review shielded payment</span>
          <div>
            <strong>From</strong>
            <span>{walletState.railgunAddress}</span>
          </div>
          <div>
            <strong>To</strong>
            <span>{draft.recipient.trim()}</span>
          </div>
          <div>
            <strong>Amount</strong>
            <span>{draft.amount.trim()} ETH</span>
          </div>
          <button className="secondary-action wide" type="button" disabled>
            <Send size={18} aria-hidden="true" />
            Private send pending
          </button>
        </div>
      ) : null}

      {smartPaymentStatus ? (
        <p className="status-message">{smartPaymentStatus}</p>
      ) : null}

      <button
        className="primary-action wide"
        type="button"
        disabled={!canReview}
        onClick={() => {
          setReviewingPayment(true);
        }}
      >
        <Send size={18} aria-hidden="true" />
        {sendMode === "public" && hasSmartWallet
          ? "Review public payment"
          : "Review"}
      </button>
    </section>
  );
}
