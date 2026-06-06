import { Bug, Clipboard, Map, RadioTower, Server, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatDebugLog,
  formatDebugLogEntry,
  type DebugLogEntry
} from "../debug/debugLog";
import {
  formatDebugMapSnapshot,
  scanPublicEndpointMap,
  scanWakuBroadcasterMap,
  type PublicEndpointMapSnapshot,
  type WakuBroadcasterMapSnapshot
} from "../debug/relayMap";
import {
  collectLocalDiagnostics,
  formatLocalDiagnostics,
  type LocalDiagnostics
} from "../debug/localDiagnostics";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

type DebugPanelProps = {
  entries: DebugLogEntry[];
  policy: ConnectionPolicy;
  onClear: () => void;
};

export function DebugPanel({ entries, policy, onClear }: DebugPanelProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("");
  const [wakuMap, setWakuMap] =
    useState<WakuBroadcasterMapSnapshot | null>(null);
  const [publicMap, setPublicMap] =
    useState<PublicEndpointMapSnapshot | null>(null);
  const [mapStatus, setMapStatus] = useState("idle");
  const newestFirst = entries.slice().reverse();

  const copyLog = async () => {
    await navigator.clipboard.writeText(formatDebugLog(entries));
    setCopyStatus("Copied debug log");
    window.setTimeout(() => setCopyStatus(""), 1600);
  };

  const copyEntry = async (entry: DebugLogEntry) => {
    await navigator.clipboard.writeText(formatDebugLogEntry(entry));
    setCopyStatus(entry.level === "error" ? "Copied error" : "Copied entry");
    window.setTimeout(() => setCopyStatus(""), 1600);
  };

  const refreshDiagnostics = async () => {
    setDiagnosticsStatus("Reading local diagnostics");

    try {
      const nextDiagnostics = await collectLocalDiagnostics();
      setDiagnostics(nextDiagnostics);
      setDiagnosticsStatus("Local diagnostics refreshed");
    } catch (error) {
      setDiagnosticsStatus(
        error instanceof Error ? error.message : "Unable to read diagnostics"
      );
    }
  };

  const copyDiagnostics = async () => {
    if (!diagnostics) {
      return;
    }

    await navigator.clipboard.writeText(formatLocalDiagnostics(diagnostics));
    setDiagnosticsStatus("Copied local diagnostics");
  };

  const scanWakuMap = async () => {
    setMapStatus("Scanning Waku broadcasters");

    try {
      const snapshot = await scanWakuBroadcasterMap(policy);
      setWakuMap(snapshot);
      setMapStatus(
        snapshot.status === "connected"
          ? "Waku broadcaster map connected"
          : `Waku broadcaster map ${snapshot.status}`
      );
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Waku broadcaster scan failed"
      );
    }
  };

  const scanPublicMap = async () => {
    setMapStatus("Checking public endpoints");

    try {
      const snapshot = await scanPublicEndpointMap(policy);
      setPublicMap(snapshot);
      setMapStatus("Public edge map refreshed");
    } catch (error) {
      setMapStatus(
        error instanceof Error ? error.message : "Public endpoint check failed"
      );
    }
  };

  const copyMap = async () => {
    const snapshot = {
      createdAt: new Date().toISOString(),
      endpointPreset: policy.endpointPreset,
      providerMode: policy.providerMode,
      wakuBroadcaster: wakuMap,
      publicEndpoints: publicMap
    };

    await navigator.clipboard.writeText(formatDebugMapSnapshot(snapshot));
    setMapStatus("Copied map");
  };

  return (
    <section className="panel debug-panel" aria-labelledby="debug-heading">
      <div className="section-heading">
        <div>
          <h2 id="debug-heading">Debug</h2>
          <span>Local event and error log</span>
        </div>
        <Bug size={21} aria-hidden="true" />
      </div>

      <p className="status-message">
        This stays in this browser. It can include endpoint URLs, public wallet
        addresses, error messages, and stack traces. Copy it only when you want
        to share diagnostics.
      </p>

      <section className="debug-map" aria-labelledby="debug-map-heading">
        <div className="section-heading compact-heading">
          <div>
            <h3 id="debug-map-heading">Map</h3>
            <span>Relay and public-edge diagnostics</span>
          </div>
          <Map size={19} aria-hidden="true" />
        </div>

        <p className="status-message">
          Scanning Waku may reveal that this browser is interested in RAILGUN
          broadcaster discovery. It does not reveal a 0zk address or submit a
          transaction.
        </p>
        <p className="status-message">
          Public endpoint checks may reveal your IP/browser session to the
          configured RPC, ERC-4337 bundler, paymaster, or sync endpoint.
        </p>

        <div className="debug-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => void scanWakuMap()}
          >
            <RadioTower size={17} aria-hidden="true" />
            Scan Waku broadcasters
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => void scanPublicMap()}
          >
            <Server size={17} aria-hidden="true" />
            Check public endpoints
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={!wakuMap && !publicMap}
            onClick={() => void copyMap()}
          >
            <Clipboard size={17} aria-hidden="true" />
            Copy map
          </button>
        </div>

        <p className="status-message">Map status: {mapStatus}</p>

        <div className="debug-map-grid">
          <article className="debug-map-card">
            <div className="debug-map-card-heading">
              <strong>Waku broadcaster map</strong>
              <span className={`source-badge ${wakuMap ? "info" : "off"}`}>
                {wakuMap?.status ?? "idle"}
              </span>
            </div>
            <p>
              Discovers RAILGUN broadcasters over Waku. No transaction is
              created or submitted.
            </p>
            {wakuMap ? (
              <div className="debug-map-details">
                <div className="preflight-row">
                  <strong>Transport</strong>
                  <span>{wakuMap.transport}</span>
                </div>
                <div className="preflight-row">
                  <strong>Pubsub topic</strong>
                  <span>{wakuMap.pubsubTopic ?? "not configured"}</span>
                </div>
                <div className="preflight-row">
                  <strong>Peers</strong>
                  <span>{wakuMap.wakuPeerCount ?? "unknown"}</span>
                </div>
                <div className="preflight-row">
                  <strong>Protocols</strong>
                  <span>
                    filter {wakuMap.requiredProtocols.filter}; lightPush{" "}
                    {wakuMap.requiredProtocols.lightPush}; store{" "}
                    {wakuMap.requiredProtocols.store}
                  </span>
                </div>
                <div className="preflight-row">
                  <strong>Raw fee ads</strong>
                  <span>
                    {wakuMap.rawFeeAdsParsed} parsed /{" "}
                    {wakuMap.rawFeeMessagesObserved} observed
                  </span>
                </div>
                <div className="preflight-row">
                  <strong>Kohaku selected</strong>
                  <span>{wakuMap.kohakuManagerSelections}</span>
                </div>
                {wakuMap.feeTokens.map((feeToken) => (
                  <div
                    className="preflight-row"
                    key={`${feeToken.symbol}-${feeToken.tokenAddress}`}
                  >
                    <strong>{feeToken.symbol}</strong>
                    <span>
                      {feeToken.broadcasterFound
                        ? `Kohaku selected ${feeToken.selectedBroadcasterRailgunAddress} / fee ${feeToken.feePerUnitGas}`
                        : feeToken.rawAdFound
                          ? `raw ad ${feeToken.selectedBroadcasterRailgunAddress} / fee ${feeToken.feePerUnitGas} / ${feeToken.signatureStatus}`
                        : feeToken.error || "no broadcaster found"}
                    </span>
                  </div>
                ))}
                {wakuMap.notes.map((note) => (
                  <p className="status-message" key={note}>
                    {note}
                  </p>
                ))}
                {wakuMap.error ? (
                  <p className="status-message error-text">{wakuMap.error}</p>
                ) : null}
              </div>
            ) : (
              <span className="status-message">
                Idle. Use Scan Waku broadcasters to start discovery.
              </span>
            )}
          </article>

          <article className="debug-map-card">
            <div className="debug-map-card-heading">
              <strong>Public edge map</strong>
              <span className={`source-badge ${publicMap ? "info" : "off"}`}>
                {publicMap ? "checked" : "idle"}
              </span>
            </div>
            <p>
              Checks configured RPC, ERC-4337 bundler, paymaster, and sync
              endpoints. These are not private relays.
            </p>
            {publicMap ? (
              <div className="debug-map-details">
                <div className="preflight-row">
                  <strong>Ethereum RPC</strong>
                  <span>
                    {publicMap.ethereumRpc.configured
                      ? `chain ${publicMap.ethereumRpc.chainId ?? "unknown"} / block ${publicMap.ethereumRpc.blockNumber ?? "unknown"}`
                      : "not configured"}
                    {publicMap.ethereumRpc.error
                      ? ` / ${publicMap.ethereumRpc.error}`
                      : ""}
                  </span>
                </div>
                <div className="preflight-row">
                  <strong>ERC-4337 bundler</strong>
                  <span>
                    {publicMap.bundler.configured
                      ? `${publicMap.bundler.supportedEntryPoints?.length ?? 0} entry point(s)`
                      : "not configured"}
                    {publicMap.bundler.pimlicoGasPriceSupported !== undefined
                      ? ` / Pimlico gas ${
                          publicMap.bundler.pimlicoGasPriceSupported
                            ? "ready"
                            : "unavailable"
                        }`
                      : ""}
                    {publicMap.bundler.error
                      ? ` / ${publicMap.bundler.error}`
                      : ""}
                  </span>
                </div>
                <div className="preflight-row">
                  <strong>Paymaster</strong>
                  <span>{publicMap.paymaster.error ?? "ready"}</span>
                </div>
                <div className="preflight-row">
                  <strong>RAILGUN sync indexer</strong>
                  <span>
                    {publicMap.railgunSyncIndexer.configured
                      ? "configured"
                      : "not configured"}
                    {publicMap.railgunSyncIndexer.error
                      ? ` / ${publicMap.railgunSyncIndexer.error}`
                      : ""}
                  </span>
                </div>
              </div>
            ) : (
              <span className="status-message">
                Idle. Use Check public endpoints to probe configured public
                edges.
              </span>
            )}
          </article>
        </div>
      </section>

      <div className="debug-actions">
        <button
          className="secondary-action"
          type="button"
          disabled={entries.length === 0}
          onClick={() => void copyLog()}
        >
          <Clipboard size={17} aria-hidden="true" />
          Copy
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={entries.length === 0}
          onClick={onClear}
        >
          <Trash2 size={17} aria-hidden="true" />
          Clear
        </button>
        <button
          className="secondary-action"
          type="button"
          onClick={() => void refreshDiagnostics()}
        >
          Refresh storage
        </button>
        <button
          className="secondary-action"
          type="button"
          disabled={!diagnostics}
          onClick={() => void copyDiagnostics()}
        >
          Copy storage
        </button>
      </div>

      {copyStatus ? <p className="status-message">{copyStatus}</p> : null}
      {diagnosticsStatus ? (
        <p className="status-message">{diagnosticsStatus}</p>
      ) : null}

      {diagnostics ? (
        <details className="debug-entry info" open>
          <summary>
            <span className="source-badge info">info</span>
            <strong>local storage</strong>
            <span>{new Date(diagnostics.createdAt).toLocaleTimeString()}</span>
          </summary>
          <p>
            IndexedDB databases and localStorage keys. Counts are shown without
            dumping stored values.
          </p>
          <pre>{formatLocalDiagnostics(diagnostics)}</pre>
        </details>
      ) : null}

      {newestFirst.length === 0 ? (
        <div className="empty-state compact">
          <Bug size={28} aria-hidden="true" />
          <strong>No debug entries</strong>
          <span>Errors and wallet progress checkpoints will appear here.</span>
        </div>
      ) : (
        <div className="debug-list" aria-label="Debug log entries">
          {newestFirst.map((entry, index) => (
            <details
              className={`debug-entry ${entry.level}`}
              key={entry.id}
              open={index === 0}
            >
              <summary>
                <span className={`source-badge ${entry.level}`}>
                  {entry.level}
                </span>
                <strong>{entry.source}</strong>
                <span>{new Date(entry.at).toLocaleTimeString()}</span>
              </summary>
              <p>{entry.message}</p>
              <button
                className="secondary-action debug-entry-copy"
                type="button"
                onClick={() => void copyEntry(entry)}
              >
                <Clipboard size={15} aria-hidden="true" />
                {entry.level === "error" ? "Copy error" : "Copy entry"}
              </button>
              <pre>{formatDebugLogEntry(entry)}</pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
