import { PlugZap, ShieldCheck, WifiOff } from "lucide-react";
import {
  applyEndpointPreset,
  endpointPresets,
  markConnectionPolicyCustom,
  summarizeOutbound,
  type ConnectionPolicy,
  type EndpointPresetId,
  type HeliosNetwork,
  type PrivacyToolkitId,
  type ProviderMode
} from "../privacy/connectionPolicy";
import { buildEndpointDisclosure } from "../privacy/preflightDisclosure";
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
  const startToolkitDisclosure = buildEndpointDisclosure(policy, "start-toolkit");

  const updateCustom = (nextPolicy: ConnectionPolicy) => {
    onChange(markConnectionPolicyCustom(nextPolicy));
  };

  return (
    <section className="panel privacy-panel" aria-labelledby="privacy-heading">
      <div className="section-heading">
        <div>
          <h2 id="privacy-heading">Connections</h2>
          <span>
            {endpointPresets[policy.endpointPreset].label} / {toolkitState}
          </span>
        </div>
        <ShieldCheck size={21} aria-hidden="true" />
      </div>

      <label className="field">
        <span>Active preset</span>
        <select
          value={policy.endpointPreset}
          onChange={(event) =>
            onChange(
              applyEndpointPreset(
                policy,
                event.currentTarget.value as EndpointPresetId
              )
            )
          }
        >
          {Object.values(endpointPresets).map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>

      <p className="status-message">
        {endpointPresets[policy.endpointPreset].description}
      </p>

      <label className="field">
        <span>Privacy toolkit</span>
        <select
          value={policy.privacyToolkit}
          onChange={(event) =>
            updateCustom({
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
        <span>Provider mode</span>
        <select
          value={policy.providerMode}
          onChange={(event) =>
            updateCustom({
              ...policy,
              providerMode: event.currentTarget.value as ProviderMode
            })
          }
        >
          <option value="direct-rpc">Direct RPC</option>
          <option value="helios">Helios verified RPC</option>
        </select>
      </label>

      <label className="field">
        <span>Ethereum execution RPC</span>
        <input
          value={policy.ethereumRpcUrl}
          placeholder="https://ethereum-rpc.publicnode.com"
          onChange={(event) =>
            updateCustom({ ...policy, ethereumRpcUrl: event.currentTarget.value })
          }
        />
      </label>

      {policy.providerMode === "helios" ? (
        <>
          <label className="field">
            <span>Helios network</span>
            <select
              value={policy.heliosNetwork}
              onChange={(event) =>
                updateCustom({
                  ...policy,
                  heliosNetwork: event.currentTarget.value as HeliosNetwork
                })
              }
            >
              <option value="mainnet">Mainnet</option>
              <option value="sepolia">Sepolia</option>
              <option value="holesky">Holesky</option>
            </select>
          </label>

          <label className="field">
            <span>Helios consensus RPC</span>
            <input
              value={policy.heliosConsensusRpcUrl}
              placeholder="explicit beacon API endpoint"
              onChange={(event) =>
                updateCustom({
                  ...policy,
                  heliosConsensusRpcUrl: event.currentTarget.value
                })
              }
            />
          </label>

          <label className="field">
            <span>Helios checkpoint</span>
            <input
              value={policy.heliosCheckpoint}
              placeholder="explicit trusted checkpoint"
              onChange={(event) =>
                updateCustom({
                  ...policy,
                  heliosCheckpoint: event.currentTarget.value
                })
              }
            />
          </label>
        </>
      ) : null}

      <label className="field">
        <span>ERC-4337 bundler</span>
        <input
          value={policy.bundlerUrl}
          placeholder="https://public.pimlico.io/v2/1/rpc"
          onChange={(event) =>
            updateCustom({ ...policy, bundlerUrl: event.currentTarget.value })
          }
        />
      </label>

      <label className="field">
        <span>ERC-4337 paymaster</span>
        <input
          value={policy.paymasterUrl}
          placeholder="optional"
          onChange={(event) =>
            updateCustom({ ...policy, paymasterUrl: event.currentTarget.value })
          }
        />
      </label>

      <label className="field">
        <span>RAILGUN broadcaster</span>
        <input
          value={policy.broadcasterUrl}
          placeholder="optional"
          onChange={(event) =>
            updateCustom({ ...policy, broadcasterUrl: event.currentTarget.value })
          }
        />
      </label>

      <label className="field">
        <span>POI / sync endpoint</span>
        <input
          value={policy.poiAggregatorUrls[0] ?? ""}
          placeholder="optional"
          onChange={(event) =>
            updateCustom({
              ...policy,
              poiAggregatorUrls: event.currentTarget.value
                ? [event.currentTarget.value]
                : []
            })
          }
        />
      </label>

      <label className="field">
        <span>Provider resolver</span>
        <input
          value={policy.providerResolverUrl}
          placeholder="local table"
          onChange={(event) =>
            updateCustom({
              ...policy,
              providerResolverUrl: event.currentTarget.value
            })
          }
        />
      </label>

      <label className="field">
        <span>Quote source</span>
        <input
          value={policy.priceQuoteUrl}
          placeholder="manual"
          onChange={(event) =>
            updateCustom({ ...policy, priceQuoteUrl: event.currentTarget.value })
          }
        />
      </label>

      <label className="field">
        <span>Passkey attestation</span>
        <input
          value={policy.passkeyAttestationUrl}
          placeholder="none"
          onChange={(event) =>
            updateCustom({
              ...policy,
              passkeyAttestationUrl: event.currentTarget.value
            })
          }
        />
      </label>

      <label className="field">
        <span>Wallet recovery</span>
        <input
          value={policy.recoveryServiceUrl}
          placeholder="none"
          onChange={(event) =>
            updateCustom({
              ...policy,
              recoveryServiceUrl: event.currentTarget.value
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
            updateCustom({ ...policy, wakuEnabled: event.currentTarget.checked })
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
            <span className={`source-badge ${control.source}`}>
              {control.source}
            </span>
          </div>
        ))}
      </div>

      <div className="preflight-card" aria-label="Start toolkit preflight">
        <span>Start toolkit may contact</span>
        {startToolkitDisclosure.map((endpoint) => (
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
