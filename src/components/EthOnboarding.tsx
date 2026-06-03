import { ArrowDownToLine, LockKeyhole, PlugZap } from "lucide-react";

type EthOnboardingProps = {
  amount: string;
  hasRailgunAddress: boolean;
  rpcReady: boolean;
  onAmountChange: (amount: string) => void;
};

export function EthOnboarding({
  amount,
  hasRailgunAddress,
  rpcReady,
  onAmountChange
}: EthOnboardingProps) {
  const canPrepare = rpcReady && hasRailgunAddress && Number(amount) > 0;

  return (
    <section className="panel onboarding-panel" aria-labelledby="eth-heading">
      <div className="section-heading">
        <h2 id="eth-heading">Start with ETH</h2>
        <ArrowDownToLine size={21} aria-hidden="true" />
      </div>

      <div className="onboarding-status">
        <div className={rpcReady ? "step ready" : "step"}>
          <PlugZap size={18} aria-hidden="true" />
          <strong>RPC</strong>
          <span>{rpcReady ? "ready" : "needed"}</span>
        </div>
        <div className={hasRailgunAddress ? "step ready" : "step"}>
          <LockKeyhole size={18} aria-hidden="true" />
          <strong>0zk</strong>
          <span>{hasRailgunAddress ? "ready" : "needed"}</span>
        </div>
      </div>

      <label className="field">
        <span>ETH to shield</span>
        <input
          value={amount}
          inputMode="decimal"
          placeholder="0.00"
          onChange={(event) => onAmountChange(event.currentTarget.value)}
        />
      </label>

      <button className="primary-action wide" type="button" disabled={!canPrepare}>
        <LockKeyhole size={18} aria-hidden="true" />
        Prepare shield
      </button>
    </section>
  );
}
