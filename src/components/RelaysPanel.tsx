import {
  Clipboard,
  Filter,
  RadioTower,
  Search,
  Server,
  Waypoints
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  formatDebugMapSnapshot,
  scanPublicEndpointMap,
  scanWakuBroadcasterMap,
  type PublicEndpointMapSnapshot,
  type WakuBroadcasterMapSnapshot
} from "../debug/relayMap";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

type RelaysPanelProps = {
  policy: ConnectionPolicy;
};

type RelaySourceFilter = "all" | "kohaku-manager" | "raw-fee-ad";
type SignatureFilter = "all" | "verified" | "unverified";

const shortAddress = (value: string): string =>
  `${value.slice(0, 8)}...${value.slice(-6)}`;

const formatTimestamp = (value: number | null | undefined): string => {
  if (!value) {
    return "unknown";
  }

  return new Date(value).toLocaleString();
};

const relaySearchText = (
  relay: WakuBroadcasterMapSnapshot["discoveredBroadcasters"][number]
): string =>
  [
    relay.railgunAddress,
    relay.identifier,
    relay.version,
    relay.feesId,
    relay.selectionSource,
    relay.signatureStatus,
    relay.relayAdapt,
    relay.relayAdapt7702,
    relay.supportedFeeTokens.join(" "),
    relay.requiredPoiListKeys?.join(" "),
    relay.feeTokenQuotes
      ?.map((quote) =>
        [quote.symbol, quote.tokenAddress, quote.feePerUnitGas].join(" ")
      )
      .join(" ")
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

export function RelaysPanel({ policy }: RelaysPanelProps) {
  const [wakuMap, setWakuMap] =
    useState<WakuBroadcasterMapSnapshot | null>(null);
  const [publicMap, setPublicMap] =
    useState<PublicEndpointMapSnapshot | null>(null);
  const [mapStatus, setMapStatus] = useState("idle");
  const [query, setQuery] = useState("");
  const [tokenFilter, setTokenFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState<RelaySourceFilter>("all");
  const [signatureFilter, setSignatureFilter] =
    useState<SignatureFilter>("all");
  const [availableOnly, setAvailableOnly] = useState(true);

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
    setMapStatus("Copied relay map");
  };

  const tokenOptions = useMemo(() => {
    const tokens = new Set<string>();

    for (const relay of wakuMap?.discoveredBroadcasters ?? []) {
      for (const token of relay.supportedFeeTokens) {
        tokens.add(token);
      }
    }

    return Array.from(tokens).sort();
  }, [wakuMap]);

  const filteredRelays = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (wakuMap?.discoveredBroadcasters ?? []).filter((relay) => {
      if (
        tokenFilter !== "all" &&
        !relay.supportedFeeTokens.includes(tokenFilter)
      ) {
        return false;
      }

      if (
        sourceFilter !== "all" &&
        relay.selectionSource !== sourceFilter
      ) {
        return false;
      }

      if (
        signatureFilter === "verified" &&
        relay.signatureStatus !== "kohaku-manager"
      ) {
        return false;
      }

      if (
        signatureFilter === "unverified" &&
        relay.signatureStatus !== "unverified-no-wallet-sdk"
      ) {
        return false;
      }

      if (availableOnly && (relay.availableWallets ?? 0) <= 0) {
        return false;
      }

      if (normalizedQuery && !relaySearchText(relay).includes(normalizedQuery)) {
        return false;
      }

      return true;
    });
  }, [availableOnly, query, signatureFilter, sourceFilter, tokenFilter, wakuMap]);

  return (
    <section className="panel relays-panel" aria-labelledby="relays-heading">
      <div className="section-heading">
        <div>
          <h2 id="relays-heading">Relays</h2>
          <span>RAILGUN broadcaster and public-edge map</span>
        </div>
        <Waypoints size={21} aria-hidden="true" />
      </div>

      <p className="status-message">
        Scanning Waku may reveal that this browser is interested in RAILGUN
        broadcaster discovery. It does not reveal a 0zk address, create a
        proof, submit a transaction, or contact your public smart wallet.
      </p>
      <p className="status-message">
        Public endpoint checks may reveal your IP/browser session to the
        configured RPC, ERC-4337 bundler, paymaster, or sync endpoint.
      </p>

      <div className="debug-actions relay-actions">
        <button
          className="secondary-action"
          type="button"
          onClick={() => void scanWakuMap()}
        >
          <RadioTower size={17} aria-hidden="true" />
          Scan Waku relays
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

      <section className="relay-card" aria-labelledby="waku-relays-heading">
        <div className="debug-map-card-heading">
          <strong id="waku-relays-heading">Waku RAILGUN relays</strong>
          <span className={`source-badge ${wakuMap ? "info" : "off"}`}>
            {wakuMap?.status ?? "idle"}
          </span>
        </div>

        {wakuMap ? (
          <>
            <div className="relay-summary-grid">
              <div>
                <strong>{wakuMap.wakuPeerCount ?? "unknown"}</strong>
                <span>Waku peers</span>
              </div>
              <div>
                <strong>{wakuMap.rawFeeAdsParsed}</strong>
                <span>fee ads parsed</span>
              </div>
              <div>
                <strong>{wakuMap.discoveredBroadcasters.length}</strong>
                <span>relay candidates</span>
              </div>
              <div>
                <strong>{wakuMap.kohakuManagerSelections}</strong>
                <span>Kohaku selected</span>
              </div>
            </div>

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
                <strong>Protocols</strong>
                <span>
                  filter {wakuMap.requiredProtocols.filter}; lightPush{" "}
                  {wakuMap.requiredProtocols.lightPush}; store{" "}
                  {wakuMap.requiredProtocols.store}
                </span>
              </div>
            </div>

            <div className="relay-filters" aria-label="Relay filters">
              <label className="relay-search">
                <Search size={16} aria-hidden="true" />
                <span>Search relays</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="address, token, version, relayAdapt"
                />
              </label>

              <label>
                <Filter size={16} aria-hidden="true" />
                <span>Fee token</span>
                <select
                  value={tokenFilter}
                  onChange={(event) => setTokenFilter(event.target.value)}
                >
                  <option value="all">All tokens</option>
                  {tokenOptions.map((token) => (
                    <option key={token} value={token}>
                      {token}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Source</span>
                <select
                  value={sourceFilter}
                  onChange={(event) =>
                    setSourceFilter(event.target.value as RelaySourceFilter)
                  }
                >
                  <option value="all">All sources</option>
                  <option value="raw-fee-ad">Raw fee ads</option>
                  <option value="kohaku-manager">Kohaku selected</option>
                </select>
              </label>

              <label>
                <span>Signature</span>
                <select
                  value={signatureFilter}
                  onChange={(event) =>
                    setSignatureFilter(event.target.value as SignatureFilter)
                  }
                >
                  <option value="all">All signatures</option>
                  <option value="verified">Verified</option>
                  <option value="unverified">Unverified</option>
                </select>
              </label>

              <label className="relay-checkbox">
                <input
                  type="checkbox"
                  checked={availableOnly}
                  onChange={(event) => setAvailableOnly(event.target.checked)}
                />
                <span>Available wallets only</span>
              </label>
            </div>

            <p className="status-message">
              Showing {filteredRelays.length} of{" "}
              {wakuMap.discoveredBroadcasters.length} relay candidates.
            </p>

            {filteredRelays.length === 0 ? (
              <div className="empty-state compact">
                <RadioTower size={28} aria-hidden="true" />
                <strong>No matching relays</strong>
                <span>Adjust filters or scan again.</span>
              </div>
            ) : (
              <div className="relay-list" aria-label="Relay candidates">
                {filteredRelays.map((relay) => (
                  <article className="relay-row" key={relay.railgunAddress}>
                    <div className="relay-row-heading">
                      <div>
                        <strong>
                          {relay.identifier ?? shortAddress(relay.railgunAddress)}
                        </strong>
                        <span>{shortAddress(relay.railgunAddress)}</span>
                      </div>
                      <span
                        className={`source-badge ${
                          relay.signatureStatus === "kohaku-manager"
                            ? "info"
                            : "warning"
                        }`}
                      >
                        {relay.signatureStatus === "kohaku-manager"
                          ? "verified"
                          : "unverified"}
                      </span>
                    </div>

                    <div className="relay-token-list">
                      {(relay.feeTokenQuotes ?? []).map((quote) => (
                        <span key={`${relay.railgunAddress}-${quote.tokenAddress}`}>
                          {quote.symbol}: {quote.feePerUnitGas}
                        </span>
                      ))}
                    </div>

                    <div className="relay-detail-grid">
                      <div>
                        <span>Version</span>
                        <strong>{relay.version ?? "unknown"}</strong>
                      </div>
                      <div>
                        <span>Wallets</span>
                        <strong>{relay.availableWallets ?? "unknown"}</strong>
                      </div>
                      <div>
                        <span>Reliability</span>
                        <strong>
                          {relay.reliability !== undefined
                            ? relay.reliability.toFixed(2)
                            : "unknown"}
                        </strong>
                      </div>
                      <div>
                        <span>Source</span>
                        <strong>{relay.selectionSource ?? "unknown"}</strong>
                      </div>
                    </div>

                    <details className="relay-details">
                      <summary>Capability details</summary>
                      <div className="debug-map-details">
                        <div className="preflight-row">
                          <strong>Fee quote expires</strong>
                          <span>{formatTimestamp(relay.feeExpiration)}</span>
                        </div>
                        <div className="preflight-row">
                          <strong>Fees ID</strong>
                          <span>{relay.feesId ?? "unknown"}</span>
                        </div>
                        <div className="preflight-row">
                          <strong>RelayAdapt</strong>
                          <span>{relay.relayAdapt ?? "unknown"}</span>
                        </div>
                        <div className="preflight-row">
                          <strong>RelayAdapt7702</strong>
                          <span>{relay.relayAdapt7702 ?? "not advertised"}</span>
                        </div>
                        <div className="preflight-row">
                          <strong>POI lists</strong>
                          <span>
                            {relay.requiredPoiListKeys?.join(", ") ||
                              "not advertised"}
                          </span>
                        </div>
                      </div>
                    </details>
                  </article>
                ))}
              </div>
            )}

            {wakuMap.notes.map((note) => (
              <p className="status-message" key={note}>
                {note}
              </p>
            ))}
            {wakuMap.error ? (
              <p className="status-message error-text">{wakuMap.error}</p>
            ) : null}
          </>
        ) : (
          <span className="status-message">
            Idle. Use Scan Waku relays to start broadcaster discovery.
          </span>
        )}
      </section>

      <section className="relay-card" aria-labelledby="public-edges-heading">
        <div className="debug-map-card-heading">
          <strong id="public-edges-heading">Public edge map</strong>
          <span className={`source-badge ${publicMap ? "info" : "off"}`}>
            {publicMap ? "checked" : "idle"}
          </span>
        </div>
        <p>
          Checks configured RPC, ERC-4337 bundler, paymaster, and sync
          endpoints. These are public infrastructure, not private relays.
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
                {publicMap.bundler.error ? ` / ${publicMap.bundler.error}` : ""}
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
            Idle. Use Check public endpoints to probe configured public edges.
          </span>
        )}
      </section>
    </section>
  );
}
