import { PlugZap, ShieldCheck, WifiOff } from "lucide-react";
import {
  type PrivacyToolkitId,
  summarizeOutbound,
  type ConnectionPolicy
} from "../privacy/connectionPolicy";
import { privacyToolkitOptions } from "../privacy/toolkit";

type PrivacySwitchboardProps = {
  policy: ConnectionPolicy;
  toolkitState: string;
  statusMessage: string;
  isStarting: boolean;
  onConnect: () => void;
  onChange: (policy: ConnectionPolicy) => void;
};

export function PrivacySwitchboard({
  policy,
  toolkitState,
  statusMessage,
  isStarting,
  onConnect,
  onChange
}: PrivacySwitchboardProps) {
  const controls = summarizeOutbound(policy);

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-heading">
      <div className="section-heading">
        <div>
          <h2 id="privacy-heading">Connections</h2>
          <span>{toolkitState}</span>
        </div>
        <ShieldCheck size={21} aria-hidden="true" />
      </div>

      <label className="field">
        <span>Privacy toolkit</span>
        <select
          value={policy.privacyToolkit}
          onChange={(event) =>
            onChange({
              ...policy,
              privacyToolkit: event.currentTarget.value as PrivacyToolkitId
            })
          }
        >
          {privacyToolkitOptions.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span>Ethereum RPC</span>
        <input
          value={policy.ethereumRpcUrl}
          placeholder="http://127.0.0.1:8545"
          onChange={(event) =>
            onChange({ ...policy, ethereumRpcUrl: event.currentTarget.value })
          }
        />
      </label>

      <label className="field">
        <span>POI aggregator</span>
        <input
          value={policy.poiAggregatorUrls[0] ?? ""}
          placeholder="optional"
          onChange={(event) =>
            onChange({
              ...policy,
              poiAggregatorUrls: event.currentTarget.value
                ? [event.currentTarget.value]
                : []
            })
          }
        />
      </label>

      <label className="toggle-row">
        <span>Waku</span>
        <input
          type="checkbox"
          checked={policy.wakuEnabled}
          onChange={(event) =>
            onChange({ ...policy, wakuEnabled: event.currentTarget.checked })
          }
        />
      </label>

      <div className="connection-list">
        {controls.map((control) => (
          <div className="connection-item" key={control.id}>
            <div className={`status-dot ${control.mode}`} />
            <div>
              <strong>{control.label}</strong>
              <span>{control.value}</span>
            </div>
          </div>
        ))}
      </div>

      <button
        className="secondary-action wide"
        type="button"
        disabled={isStarting}
        onClick={onConnect}
      >
        {policy.ethereumRpcUrl ? (
          <PlugZap size={18} aria-hidden="true" />
        ) : (
          <WifiOff size={18} aria-hidden="true" />
        )}
        {isStarting ? "Starting" : "Start toolkit"}
      </button>

      {statusMessage ? <p className="status-message">{statusMessage}</p> : null}
    </section>
  );
}
