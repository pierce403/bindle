import { Download, RefreshCw } from "lucide-react";
import { useSyncExternalStore } from "react";
import { bindleBuildInfo } from "../buildInfo";
import {
  checkForUpdates, dismissUpdate, getUpdateState, installUpdate,
  setUpdatePreference, subscribeToUpdates, type ReleaseInfo
} from "../pwa/registerServiceWorker";

function ReleaseDetails({ release }: { release: ReleaseInfo }) {
  return (
    <dl className="release-details">
      <div><dt>Version</dt><dd>{release.version}</dd></div>
      <div><dt>Commit</dt><dd><code>{release.commit}</code></dd></div>
      <div><dt>Build time</dt><dd><time dateTime={release.time}>{release.time}</time></dd></div>
    </dl>
  );
}

export function AppUpdatePrompt({ busy }: { busy: boolean }) {
  const updates = useSyncExternalStore(subscribeToUpdates, getUpdateState);
  if (!updates.pending || updates.preference !== "ask" || updates.dismissed === updates.pending.id) return null;
  return (
    <section className="app-update-card" aria-label="App update available" aria-live="polite">
      <h2>New version available</h2>
      <p>Install this update? Bindle will reload. Your saved wallet stays on this device.</p>
      <ReleaseDetails release={updates.pending} />
      {busy ? <p>Finish your current wallet action before installing.</p> : null}
      {updates.error ? <p role="alert">{updates.error}</p> : null}
      <div className="settings-actions">
        <button className="primary-action" type="button" disabled={busy || updates.installing}
          onClick={() => void installUpdate()}>
          <Download size={17} aria-hidden="true" />{updates.installing ? "Installing…" : "Install update"}
        </button>
        <button className="secondary-action" type="button" disabled={updates.installing} onClick={dismissUpdate}>Not now</button>
      </div>
    </section>
  );
}

export function VersionMenu({ busy }: { busy: boolean }) {
  const updates = useSyncExternalStore(subscribeToUpdates, getUpdateState);
  const descriptions = {
    approve: "Automatically install updates and reload when no wallet action is open or running.",
    ask: "Ask before installing each new version. This is the default.",
    reject: "Keep this version and hide update prompts. Change this choice to install an update."
  };
  return (
    <details className="settings-row version-menu" id="version-menu" open>
      <summary>Version</summary>
      <span>Installed on this device</span>
      <ReleaseDetails release={bindleBuildInfo} />
      <fieldset className="update-preferences">
        <legend>App updates</legend>
        {(["approve", "ask", "reject"] as const).map((preference) => (
          <label key={preference}>
            <input type="radio" name="update-preference" value={preference}
              disabled={updates.installing}
              checked={updates.preference === preference}
              onChange={() => setUpdatePreference(preference)} />
            {preference[0].toUpperCase() + preference.slice(1)}
          </label>
        ))}
      </fieldset>
      <p>{descriptions[updates.preference]}</p>
      <p className="update-footnote">Checks and update downloads use bindle.cash only. This choice is saved on this device. Clearing site data or browser storage eviction removes the saved version.</p>
      {updates.pending ? (
        <div className="available-release">
          <strong>Available update</strong>
          <ReleaseDetails release={updates.pending} />
          {busy ? <p>Installation waits until your wallet action is finished.</p> : null}
          {updates.preference !== "reject" ? (
            <button className="primary-action" type="button" disabled={busy || updates.installing}
              onClick={() => void installUpdate()}>
              <Download size={17} aria-hidden="true" />{updates.installing ? "Installing…" : "Install update"}
            </button>
          ) : null}
        </div>
      ) : updates.checked && !updates.error ? <p role="status">You’re using the latest version checked.</p> : null}
      {updates.error ? <p role="alert">{updates.error}</p> : null}
      <button className="secondary-action" type="button" disabled={updates.checking || updates.installing}
        onClick={() => void checkForUpdates()}>
        <RefreshCw size={17} aria-hidden="true" />{updates.checking ? "Checking…" : "Check for updates"}
      </button>
    </details>
  );
}
