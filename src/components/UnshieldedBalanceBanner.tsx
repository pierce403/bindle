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
  const shieldEndpointSummary = shieldEndpointDisclosures
    .filter((endpoint) => endpoint.configured || endpoint.required)
    .map((endpoint) =>
      endpoint.configured
        ? `${endpoint.label} (${endpoint.source}: ${endpoint.value})`
        : `${endpoint.label} (${endpoint.required ? "required, off" : "off"})`
    )
    .join(", ");
  const buttonLabel = showShieldAction
    ? isShielding
      ? "Shielding"
      : "Shield"
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
          {canSweepAll && railgunAddress ? (
            <small>
              Destination: RAILGUN 0zk {shortRailgunAddress(railgunAddress)}
            </small>
          ) : null}
          {canSweepAll && shieldEndpointSummary ? (
            <small>Shield may contact {shieldEndpointSummary}</small>
          ) : null}
          {shieldStatus ? <small>{shieldStatus}</small> : null}
        </div>
      </div>
      <div className="shield-actions">
        <button
          className="shield-button"
          type="button"
          disabled={
            showShieldAction ? !canSweepAll || isShielding : !canSync || isSyncing
          }
          onClick={() => {
            if (canSweepAll) {
              onShield({ kind: "sweep-all" });
              return;
            }

            onSync();
          }}
        >
          {buttonLabel}
        </button>
        {canShield ? (
          <button
            className="secondary-action shield-custom-button"
            type="button"
            disabled={isShielding}
            onClick={() => setReviewingShield((current) => !current)}
          >
            Custom
          </button>
        ) : null}
      </div>
      {reviewingShield ? (
        <div className="shield-review" aria-label="Review shield">
          <div className="preflight-card" aria-label="Shield sweep summary">
            <span>Custom shield review</span>
            <div className="preflight-row">
              <strong>Available</strong>
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
          <small className="shield-review-note">
            The main Shield button sweeps the exact synced public ETH balance.
            Use a custom amount only when you intentionally want to leave public
            ETH in the funding address.
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
