import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  Repeat2
} from "lucide-react";

export type WalletAction = "receive" | "send" | "pay" | "swap";

type BalancePanelProps = {
  totalBalance: string | null;
  fiatValue: string | null;
  shieldedBalance: string | null;
  networkLabel: string;
  smartWalletAddress: string | null;
  smartWalletStatus: string;
  railgunAddress: string | null;
  railgunStatus: string;
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
  smartWalletAddress,
  smartWalletStatus,
  railgunAddress,
  railgunStatus,
  activeAction,
  onActionChange
}: BalancePanelProps) {
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
  };

  return (
    <section className="balance-panel" aria-labelledby="balance-heading">
      <div className="wallet-topline">
        <div className="wallet-address">
          <span>Public 4337</span>
          <strong>{smartWalletAddress ?? smartWalletStatus}</strong>
          {smartWalletAddress ? (
            <button
              className="mini-copy"
              type="button"
              title="Copy public smart-wallet address"
              onClick={() => void copyAddress(smartWalletAddress)}
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        <div className="wallet-address">
          <span>0zk</span>
          <strong>{railgunAddress ?? railgunStatus}</strong>
          {railgunAddress ? (
            <button
              className="mini-copy"
              type="button"
              title="Copy shielded 0zk address"
              onClick={() => void copyAddress(railgunAddress)}
            >
              <Copy size={13} aria-hidden="true" />
            </button>
          ) : null}
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
