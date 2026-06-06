import { Bug, Clipboard, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  formatDebugLog,
  formatDebugLogEntry,
  type DebugLogEntry
} from "../debug/debugLog";
import {
  collectLocalDiagnostics,
  formatLocalDiagnostics,
  type LocalDiagnostics
} from "../debug/localDiagnostics";

type DebugPanelProps = {
  entries: DebugLogEntry[];
  onClear: () => void;
};

export function DebugPanel({ entries, onClear }: DebugPanelProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const [diagnostics, setDiagnostics] = useState<LocalDiagnostics | null>(null);
  const [diagnosticsStatus, setDiagnosticsStatus] = useState("");
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
