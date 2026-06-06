import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { isValidEthAmount } from "../intents/validation";
import type { EndpointDisclosure } from "../privacy/preflightDisclosure";

type UnshieldedBalanceBannerProps = {
  balance: string | null;
  balanceWei: bigint | null;
  canShield: boolean;
  canSync: boolean;
  isSyncing: boolean;
  isShielding: boolean;
  railgunAddress: string | null;
  syncDisclosure: string | null;
  shieldDisclosure: string | null;
  shieldEndpointDisclosures: EndpointDisclosure[];
  shieldStatus: string;
  onSync: () => void;
  onShield: (request: ShieldRequest) => void;
};

export type ShieldRequest =
  | { kind: "sweep-all" }
  | { kind: "custom-amount"; amount: string };

const shortRailgunAddress = (address: string): string =>
  `${address.slice(0, 10)}...${address.slice(-8)}`;

export function UnshieldedBalanceBanner({
  balance,
  balanceWei,
  canShield,
  canSync,
  isSyncing,
  isShielding,
  railgunAddress,
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
  const canSweepAll = canShield && balanceWei !== null && balanceWei > 0n;
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
          <div className="preflight-card" aria-label="Shield sweep summary">
            <span>Public funding sweep</span>
            <div className="preflight-row">
              <strong>Amount</strong>
              <span>{balance ?? "not synced"}</span>
            </div>
            <div className="preflight-row">
              <strong>Destination</strong>
              <span>
                {railgunAddress
                  ? `RAILGUN 0zk ${shortRailgunAddress(railgunAddress)}`
                  : "0zk pending"}
              </span>
            </div>
          </div>
          <button
            className="primary-action wide"
            type="button"
            disabled={!canSweepAll || isShielding}
            onClick={() => onShield({ kind: "sweep-all" })}
          >
            {isShielding ? "Shielding" : "Sweep public funding address"}
          </button>
          <small className="shield-review-note">
            Sweep uses the exact synced public ETH balance and does not reserve
            ETH for EOA gas. ERC-4337 bundler and paymaster policy are shown
            below; if sponsorship is unavailable, the sweep may fail instead of
            leaving a gas reserve.
          </small>
          <label className="field">
            <span>Custom amount to shield</span>
            <input
              aria-label="Custom amount to shield"
              inputMode="decimal"
              value={shieldAmount}
              placeholder="0.00"
              onChange={(event) => setShieldAmount(event.currentTarget.value)}
            />
          </label>
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
            className="secondary-action wide"
            type="button"
            disabled={!validShieldAmount || isShielding}
            onClick={() =>
              onShield({ kind: "custom-amount", amount: shieldAmount })
            }
          >
            {isShielding ? "Shielding" : "Submit shield"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
