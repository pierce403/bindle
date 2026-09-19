import { Download, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useSyncExternalStore } from "react";
import { bindleBuildInfo } from "../buildInfo";
import {
  checkForAndroidUpdate,
  downloadAndroidRelease,
  getAndroidUpdateState,
  subscribeToAndroidUpdates
} from "../android/updates";

const useAndroidUpdates = () => {
  const updates = useSyncExternalStore(subscribeToAndroidUpdates, getAndroidUpdateState);
  useEffect(() => { if (!updates.checked && !updates.checking) void checkForAndroidUpdate(); }, [updates.checked, updates.checking]);
  return updates;
};

const DownloadButton = () => {
  const updates = useAndroidUpdates();
  if (!updates.release) return null;
  return (
    <button className="primary-action" type="button"
      onClick={() => void downloadAndroidRelease(updates.release!)}>
      <Download size={17} aria-hidden="true" />Download APK
    </button>
  );
};

export function AndroidUpdatePrompt() {
  const updates = useAndroidUpdates();
  if (!updates.available || !updates.release) return null;
  return (
    <section className="app-update-card" aria-label="Android update available" aria-live="polite">
      <h2>New Android version available</h2>
      <p>Bindle will only download the APK. Android will ask before replacing this installed version.</p>
      <strong>v{updates.release.versionName}</strong>
      <DownloadButton />
    </section>
  );
}

export function AndroidVersionMenu() {
  const updates = useAndroidUpdates();
  return (
    <details className="settings-row version-menu" id="version-menu" open>
      <summary>Version</summary>
      <span>Signed Android APK installed on this device</span>
      <dl className="release-details">
        <div><dt>Version</dt><dd>{bindleBuildInfo.version}</dd></div>
        <div><dt>Commit</dt><dd><code>{bindleBuildInfo.commit}</code></dd></div>
        <div><dt>Build time</dt><dd>{bindleBuildInfo.time}</dd></div>
      </dl>
      <p>APK updates are never installed automatically. Checking contacts bindle.cash for release metadata only; downloading opens the signed APK on GitHub.</p>
      {updates.available && updates.release ? (
        <div className="available-release">
          <strong>Android v{updates.release.versionName} available</strong>
          <DownloadButton />
        </div>
      ) : updates.checked && !updates.error ? <p role="status">You’re using the latest Android version checked.</p> : null}
      {updates.error ? <p role="alert">{updates.error}</p> : null}
      <button className="secondary-action" type="button" disabled={updates.checking}
        onClick={() => void checkForAndroidUpdate()}>
        <RefreshCw size={17} aria-hidden="true" />{updates.checking ? "Checking…" : "Check for updates"}
      </button>
    </details>
  );
}

export function AndroidDownloadCard() {
  const updates = useAndroidUpdates();
  if (!updates.release) return null;
  const size = `${(updates.release.apk.bytes / 1024 / 1024).toFixed(1)} MB`;
  return (
    <section className="landing-install android-install" aria-label="Download Bindle for Android">
      <Smartphone size={28} aria-hidden="true" />
      <div>
        <strong>Download the signed Android APK</strong>
        <span>v{updates.release.versionName} · {size}. Android updates remain manual.</span>
      </div>
      <DownloadButton />
    </section>
  );
}
