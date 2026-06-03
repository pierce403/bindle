import { ShieldAlert } from "lucide-react";

type UnshieldedBalanceBannerProps = {
  balance: string | null;
  canShield: boolean;
  canSync: boolean;
  isSyncing: boolean;
  syncDisclosure: string | null;
  onSync: () => void;
};

export function UnshieldedBalanceBanner({
  balance,
  canShield,
  canSync,
  isSyncing,
  syncDisclosure,
  onSync
}: UnshieldedBalanceBannerProps) {
  const buttonLabel = canShield
    ? "Shield"
    : canSync || isSyncing
      ? isSyncing
        ? "Syncing"
        : "Sync"
      : "Shield";

  return (
    <section className="unshielded-banner" aria-label="Unshielded ETH balance">
      <div className="unshielded-copy">
        <ShieldAlert size={27} aria-hidden="true" />
        <div>
          <strong>Unshielded ETH</strong>
          <span>{balance ?? "not synced"}</span>
          {syncDisclosure ? (
            <small>Sync may contact {syncDisclosure}</small>
          ) : null}
        </div>
      </div>
      <button
        className="shield-button"
        type="button"
        disabled={canShield ? false : !canSync || isSyncing}
        onClick={canShield ? undefined : onSync}
      >
        {buttonLabel}
      </button>
    </section>
  );
}
