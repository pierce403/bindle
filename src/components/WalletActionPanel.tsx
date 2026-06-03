import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  Fingerprint,
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
import type { PasskeyCapability } from "../wallet/passkeys";
import type { WalletState } from "../wallet/walletState";
import type { WalletAction } from "./BalancePanel";

type WalletActionPanelProps = {
  action: WalletAction;
  draft: IntentDraft;
  routedIntent: RoutedIntent;
  hasRailgunWallet: boolean;
  rpcReady: boolean;
  walletState: WalletState;
  passkeyCapability: PasskeyCapability;
  isCreatingPasskey: boolean;
  endpointDisclosures: EndpointDisclosure[];
  onCreatePasskey: () => void;
  onDraftChange: (draft: IntentDraft) => void;
  onRouteChange: (intent: RoutedIntent) => void;
};

export function WalletActionPanel({
  action,
  draft,
  routedIntent,
  hasRailgunWallet,
  rpcReady,
  walletState,
  passkeyCapability,
  isCreatingPasskey,
  endpointDisclosures,
  onCreatePasskey,
  onDraftChange,
  onRouteChange
}: WalletActionPanelProps) {
  const [receiveMode, setReceiveMode] = useState<"shielded" | "public">(
    "shielded"
  );
  const [sendMode, setSendMode] = useState<"shielded" | "public">("shielded");
  const hasRecipient = draft.recipient.trim().length > 0;
  const hasAmount = isValidEthAmount(draft.amount);
  const hasValidRecipient = isValidRecipientShape(draft.recipient);
  const requiredEndpointsReady = endpointDisclosures.every(
    (endpoint) => !endpoint.required || endpoint.configured
  );
  const canReview =
    hasRecipient &&
    hasValidRecipient &&
    hasAmount &&
    hasRailgunWallet &&
    rpcReady &&
    requiredEndpointsReady;
  const canCreatePasskey =
    passkeyCapability.available && !walletState.passkeyPresent && !isCreatingPasskey;

  const updateDraft = (nextDraft: IntentDraft) => {
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
            <Fingerprint size={22} aria-hidden="true" />
            <strong>
              {walletState.passkeyPresent
                ? "Passkey enrolled"
                : walletState.status === "error"
                  ? "Passkey enrollment failed"
                : passkeyCapability.available
                  ? "Create Bindle with passkey"
                  : "Passkey not available"}
            </strong>
            <span>
              {walletState.passkeyPresent
                ? "Smart-wallet address pending; shielded 0zk address not created."
                : walletState.status === "error" && walletState.lastError
                  ? walletState.lastError
                : passkeyCapability.message}
            </span>
            <button
              className="primary-action wide"
              type="button"
              disabled={!canCreatePasskey}
              onClick={onCreatePasskey}
              title={
                canCreatePasskey
                  ? "Create a local passkey credential"
                  : "Passkey enrollment unavailable or already complete"
              }
            >
              <Fingerprint size={18} aria-hidden="true" />
              {isCreatingPasskey
                ? "Creating passkey"
                : walletState.passkeyPresent
                  ? "Passkey enrolled"
                  : "Create Bindle with passkey"}
            </button>
          </div>
        ) : (
          <div className="empty-state compact">
            <LockKeyhole size={22} aria-hidden="true" />
            <strong>
              {walletState.smartWalletAddress
                ? "Smart-wallet address ready"
                : walletState.passkeyPresent
                  ? "Public smart-wallet address pending"
                  : "No public smart wallet yet"}
            </strong>
            <span>
              {walletState.smartWalletAddress
                ? walletState.smartWalletAddress
                : walletState.passkeyPresent
                  ? "Kohaku passkey smart-account derivation is not wired."
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

      <div className="preflight-card" aria-label="Endpoint preflight">
        <span>Could contact</span>
        {endpointDisclosures.map((endpoint) => (
          <div className="preflight-row" key={endpoint.id}>
            <strong>{endpoint.label}</strong>
            <span>
              {endpoint.configured
                ? endpoint.value
                : endpoint.required
                  ? "required, not connected"
                  : "off"}
            </span>
          </div>
        ))}
      </div>

      <button className="primary-action wide" type="button" disabled={!canReview}>
        <Send size={18} aria-hidden="true" />
        Review
      </button>
    </section>
  );
}
