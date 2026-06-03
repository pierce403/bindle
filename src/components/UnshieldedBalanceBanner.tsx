import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { isValidEthAmount } from "../intents/validation";
import type { EndpointDisclosure } from "../privacy/preflightDisclosure";

type UnshieldedBalanceBannerProps = {
  balance: string | null;
  canShield: boolean;
  canSync: boolean;
  isSyncing: boolean;
  isShielding: boolean;
  syncDisclosure: string | null;
  shieldDisclosure: string | null;
  shieldEndpointDisclosures: EndpointDisclosure[];
  shieldStatus: string;
  onSync: () => void;
  onShield: (amount: string) => void;
};

export function UnshieldedBalanceBanner({
  balance,
  canShield,
  canSync,
  isSyncing,
  isShielding,
  syncDisclosure,
  shieldDisclosure,
  shieldEndpointDisclosures,
  shieldStatus,
  onSync,
  onShield
}: UnshieldedBalanceBannerProps) {
  const [reviewingShield, setReviewingShield] = useState(false);
  const [shieldAmount, setShieldAmount] = useState("");
  const validShieldAmount = isValidEthAmount(shieldAmount);
  const showShieldAction =
    canShield || reviewingShield || isShielding || shieldStatus.length > 0;
  const buttonLabel = showShieldAction
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
          {shieldDisclosure ? <small>{shieldDisclosure}</small> : null}
          {shieldStatus ? <small>{shieldStatus}</small> : null}
        </div>
      </div>
      <button
        className="shield-button"
        type="button"
        disabled={showShieldAction ? !canShield || isShielding : !canSync || isSyncing}
        onClick={() => {
          if (canShield) {
            setReviewingShield((current) => !current);
            return;
          }

          onSync();
        }}
      >
        {buttonLabel}
      </button>
      {reviewingShield ? (
        <div className="shield-review" aria-label="Review shield">
          <label className="field">
            <span>Amount to shield</span>
            <input
              aria-label="Amount to shield"
              inputMode="decimal"
              value={shieldAmount}
              placeholder="0.00"
              onChange={(event) => setShieldAmount(event.currentTarget.value)}
            />
          </label>
          <small className="shield-review-note">
            Leave ETH for ERC-4337 fees unless a paymaster is configured.
          </small>
          <div className="preflight-card" aria-label="Shield preflight">
            <span>Shield may contact</span>
            {shieldEndpointDisclosures.map((endpoint) => (
              <div className="preflight-row" key={endpoint.id}>
                <strong>{endpoint.label}</strong>
                <span>
                  {endpoint.configured
                    ? `${endpoint.source}: ${endpoint.value}`
                    : endpoint.required
                      ? "required, off"
                      : "off"}
                </span>
              </div>
            ))}
          </div>
          <button
            className="primary-action wide"
            type="button"
            disabled={!validShieldAmount || isShielding}
            onClick={() => onShield(shieldAmount)}
          >
            {isShielding ? "Shielding" : "Submit shield"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
