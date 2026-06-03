import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import {
  isRunningAsPwa,
  type BeforeInstallPromptEvent
} from "../pwa/installPrompt";

type InstallState = "checking" | "hidden" | "ready" | "manual";

const isAppleMobile = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export function PwaInstallPrompt() {
  const [installState, setInstallState] = useState<InstallState>("checking");
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isRunningAsPwa()) {
      setInstallState("hidden");
      return;
    }

    const manualPromptTimer = window.setTimeout(() => {
      setInstallState((currentState) =>
        currentState === "checking" ? "manual" : currentState
      );
    }, 800);

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      window.clearTimeout(manualPromptTimer);
      setInstallEvent(event as BeforeInstallPromptEvent);
      setInstallState("ready");
    };

    const handleInstalled = () => {
      setInstallEvent(null);
      setInstallState("hidden");
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.clearTimeout(manualPromptTimer);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const install = async () => {
    if (!installEvent) {
      return;
    }

    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    setInstallEvent(null);

    if (choice.outcome === "accepted" || isRunningAsPwa()) {
      setInstallState("hidden");
    } else {
      setInstallState("manual");
    }
  };

  if (installState === "hidden" || installState === "checking") {
    return null;
  }

  const manualCopy = isAppleMobile()
    ? "Open Share, then Add to Home Screen."
    : "Use your browser menu to install this app.";

  return (
    <section className="pwa-prompt" aria-label="Install Bindle">
      <div className="pwa-prompt-copy">
        <Download size={19} aria-hidden="true" />
        <div>
          <strong>Install Bindle</strong>
          <span>
            {installState === "ready"
              ? "Keep Bindle in its own app window."
              : manualCopy}
          </span>
        </div>
      </div>

      <div className="pwa-prompt-actions">
        {installState === "ready" ? (
          <button className="primary-action" type="button" onClick={install}>
            Install
          </button>
        ) : null}
        <button
          className="icon-button"
          type="button"
          title="Dismiss install prompt"
          onClick={() => setInstallState("hidden")}
        >
          <X size={17} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
