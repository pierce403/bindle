import { ShieldAlert } from "lucide-react";

type UnshieldedBalanceBannerProps = {
  balance: string | null;
  canShield: boolean;
};

export function UnshieldedBalanceBanner({
  balance,
  canShield
}: UnshieldedBalanceBannerProps) {
  return (
    <section className="unshielded-banner" aria-label="Unshielded ETH balance">
      <div className="unshielded-copy">
        <ShieldAlert size={27} aria-hidden="true" />
        <div>
          <strong>Unshielded ETH</strong>
          <span>{balance ?? "not synced"}</span>
        </div>
      </div>
      <button className="shield-button" type="button" disabled={!canShield}>
        Shield
      </button>
    </section>
  );
}
