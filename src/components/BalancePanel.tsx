import { Eye, Plus, RefreshCcw } from "lucide-react";

type BalancePanelProps = {
  shieldedBalance: string;
  publicBalance: string;
  railgunAddress?: string;
  canShield: boolean;
};

export function BalancePanel({
  shieldedBalance,
  publicBalance,
  railgunAddress,
  canShield
}: BalancePanelProps) {
  return (
    <section className="balance-panel" aria-labelledby="balance-heading">
      <div className="wallet-address">
        <span>0zk</span>
        <strong>{railgunAddress ?? "not created"}</strong>
      </div>

      <div className="balance-row">
        <div>
          <span>Shielded</span>
          <h1 id="balance-heading">{shieldedBalance}</h1>
        </div>
        <button className="icon-button glass" type="button" title="Hide balance">
          <Eye size={20} aria-hidden="true" />
        </button>
      </div>

      <div className="balance-meta">
        <span>Public float</span>
        <strong>{publicBalance}</strong>
      </div>

      <div className="balance-actions">
        <button type="button" className="primary-action" disabled={!canShield}>
          <Plus size={18} aria-hidden="true" />
          Shield ETH
        </button>
        <button type="button" className="secondary-action">
          <RefreshCcw size={18} aria-hidden="true" />
          Sync
        </button>
      </div>
    </section>
  );
}
