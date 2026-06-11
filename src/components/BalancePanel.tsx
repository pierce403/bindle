import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Repeat2
} from "lucide-react";

export type WalletAction = "receive" | "send" | "pay" | "swap";

type BalancePanelProps = {
  totalBalance: string | null;
  balanceLabel: string;
  networkStatus: string | null;
  shieldedStatus: string;
  networkLabel: string;
  canSyncShielded: boolean;
  isSyncingShielded: boolean;
  syncShieldedDisclosure: string | null;
  activeAction: WalletAction | null;
  onActionChange: (action: WalletAction) => void;
  onSyncShielded: () => void;
};

const walletActions: Array<{
  id: WalletAction;
  label: string;
  status: "active" | "planned";
  Icon: typeof ArrowDownToLine;
}> = [
  { id: "receive", label: "Receive", status: "active", Icon: ArrowDownToLine },
  { id: "send", label: "Send", status: "active", Icon: ArrowUpFromLine },
  { id: "pay", label: "Pay", status: "active", Icon: ArrowRight },
  { id: "swap", label: "Swap", status: "planned", Icon: Repeat2 }
];

export function BalancePanel({
  totalBalance,
  balanceLabel,
  networkStatus,
  shieldedStatus,
  networkLabel,
  canSyncShielded,
  isSyncingShielded,
  syncShieldedDisclosure,
  activeAction,
  onActionChange,
  onSyncShielded
}: BalancePanelProps) {
  return (
    <section className="balance-panel" aria-labelledby="balance-heading">

      <div className="balance-display">
        <span>{balanceLabel}</span>
        <h1 id="balance-heading">{totalBalance ?? "$--"}</h1>
        <div className="network-pill">
          <span>{networkStatus ?? "not synced"}</span>
          <strong>{networkLabel}</strong>
        </div>
      </div>

      <div className="balance-meta">
        <span>Shielded ETH</span>
        <strong>{shieldedStatus}</strong>
        <button
          className="balance-sync"
          type="button"
          disabled={!canSyncShielded || isSyncingShielded}
          onClick={onSyncShielded}
        >
          {isSyncingShielded ? "Syncing" : "Sync"}
        </button>
      </div>
      {syncShieldedDisclosure ? (
        <small className="balance-disclosure">{syncShieldedDisclosure}</small>
      ) : null}

      <div className="wallet-action-grid" aria-label="Wallet actions">
        {walletActions.map(({ id, label, status, Icon }) => (
          <button
            className="wallet-action"
            type="button"
            key={id}
            disabled={status === "planned"}
            aria-pressed={activeAction === id}
            onClick={() => onActionChange(id)}
            title={status === "planned" ? `${label} is planned` : label}
          >
            <Icon size={26} aria-hidden="true" />
            <strong>{label}</strong>
            {status === "planned" ? <span>planned</span> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
