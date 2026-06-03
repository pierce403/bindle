import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Repeat2
} from "lucide-react";

export type WalletAction = "receive" | "send" | "pay" | "swap";

type BalancePanelProps = {
  totalBalance: string | null;
  fiatValue: string | null;
  shieldedBalance: string | null;
  networkLabel: string;
  railgunAddress?: string;
  activeAction: WalletAction | null;
  onActionChange: (action: WalletAction) => void;
};

const walletActions: Array<{
  id: WalletAction;
  label: string;
  status: "active" | "planned";
  Icon: typeof ArrowDownToLine;
}> = [
  { id: "receive", label: "Receive", status: "active", Icon: ArrowDownToLine },
  { id: "send", label: "Send", status: "active", Icon: ArrowUpFromLine },
  { id: "pay", label: "Pay", status: "planned", Icon: ArrowRight },
  { id: "swap", label: "Swap", status: "planned", Icon: Repeat2 }
];

export function BalancePanel({
  totalBalance,
  fiatValue,
  shieldedBalance,
  networkLabel,
  railgunAddress,
  activeAction,
  onActionChange
}: BalancePanelProps) {
  return (
    <section className="balance-panel" aria-labelledby="balance-heading">
      <div className="wallet-topline">
        <div className="wallet-address">
          <span>0zk</span>
          <strong>{railgunAddress ?? "not created"}</strong>
        </div>
      </div>

      <div className="balance-display">
        <span>Total ETH</span>
        <h1 id="balance-heading">{totalBalance ?? "-- ETH"}</h1>
        <div className="network-pill">
          <span>{fiatValue ?? "not synced"}</span>
          <strong>{networkLabel}</strong>
        </div>
      </div>

      <div className="balance-meta">
        <span>Shielded with RAILGUN</span>
        <strong>{shieldedBalance ?? "not synced"}</strong>
      </div>

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
