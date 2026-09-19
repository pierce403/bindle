import { isAndroidApp } from "../platform/runtime";

const artifactProxyWorkerUrl = (): string =>
  isAndroidApp() ? "/android-service-worker.js" : "/service-worker.js";

export type ServiceWorkerArtifactProxyStatus = {
  ok: boolean;
  expectedVersion: string;
  controllerVersion: string | null;
  controllerState: string | null;
  controllerScriptURL: string | null;
  registrationActiveScriptURL: string | null;
  registrationWaitingScriptURL: string | null;
  registrationInstallingScriptURL: string | null;
  registrationScope: string | null;
  caches: string[];
  repairAttempted: boolean;
  repairActions: string[];
  error: string | null;
};

export class ArtifactProxyReloadRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArtifactProxyReloadRequiredError";
  }
}

async function getCacheKeys(): Promise<string[]> {
  if (typeof window === "undefined" || !("caches" in window)) return [];
  try {
    return await caches.keys();
  } catch {
    return [];
  }
}

const queryWorkerVersion = (
  worker: ServiceWorker,
  timeoutMs: number = 3000
): Promise<{ version: string | null; error: string | null }> => {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timeout = setTimeout(() => {
      resolve({ version: null, error: "Timeout waiting for controller version response" });
    }, timeoutMs);

    channel.port1.onmessage = (event) => {
      clearTimeout(timeout);
      if (event.data?.type === "BINDLE_ARTIFACT_PROXY_READY" && event.data?.version) {
        resolve({ version: event.data.version, error: null });
      } else {
        resolve({ version: null, error: "Invalid response from worker query" });
      }
    };

    worker.postMessage({ type: "BINDLE_ARTIFACT_PROXY_READY" }, [channel.port2]);
  });
};

export async function ensureExpectedArtifactProxyServiceWorker({
  expectedVersion,
  timeoutMs = 10000,
  onStatus
}: {
  expectedVersion: string;
  timeoutMs?: number;
  onStatus: (message: string) => void;
}): Promise<ServiceWorkerArtifactProxyStatus> {
  const status: ServiceWorkerArtifactProxyStatus = {
    ok: false,
    expectedVersion,
    controllerVersion: null,
    controllerState: null,
    controllerScriptURL: null,
    registrationActiveScriptURL: null,
    registrationWaitingScriptURL: null,
    registrationInstallingScriptURL: null,
    registrationScope: null,
    caches: [],
    repairAttempted: false,
    repairActions: [],
    error: null
  };

  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    status.error = "Service Worker not supported in this browser environment.";
    return status;
  }

  status.caches = await getCacheKeys();

  onStatus("Retrieving Service Worker registration");
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.getRegistration("/");
    if (!registration) {
      const regs = await navigator.serviceWorker.getRegistrations();
      registration = regs[0];
    }
  } catch (err: any) {
    status.error = `Failed to get registration: ${err.message}`;
  }

  if (!registration) {
    onStatus("No Service Worker registration found. Registering service worker...");
    status.repairActions.push("register_new_worker");
    try {
      registration = await navigator.serviceWorker.register(artifactProxyWorkerUrl(), {
        scope: "/",
        updateViaCache: "none"
      });
      status.repairAttempted = true;
    } catch (err: any) {
      status.error = `Registration failed: ${err.message}`;
      return status;
    }
  }

  const updateStatusFromRegistration = () => {
    status.registrationScope = registration?.scope ?? null;
    status.registrationActiveScriptURL = registration?.active?.scriptURL ?? null;
    status.registrationWaitingScriptURL = registration?.waiting?.scriptURL ?? null;
    status.registrationInstallingScriptURL = registration?.installing?.scriptURL ?? null;
    if (navigator.serviceWorker.controller) {
      status.controllerState = navigator.serviceWorker.controller.state;
      status.controllerScriptURL = navigator.serviceWorker.controller.scriptURL;
    }
  };
  updateStatusFromRegistration();

  const checkControllerVersion = async (): Promise<string | null> => {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return null;
    const res = await queryWorkerVersion(controller, 2000);
    return res.version;
  };

  let currentVersion = await checkControllerVersion();
  status.controllerVersion = currentVersion;

  if (currentVersion === expectedVersion) {
    status.ok = true;
    return status;
  }

  // A repair must never unregister the worker, purge an approved shell, or
  // activate a release behind the user's update preference.
  onStatus("Checking the artifact proxy without changing the approved app version.");
  try {
    await registration.update();
    const deadline = Date.now() + timeoutMs;
    while (!navigator.serviceWorker.controller && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    currentVersion = await checkControllerVersion();
  } catch {
    // Return an actionable readiness failure while offline.
  }
  updateStatusFromRegistration();
  status.controllerVersion = currentVersion;
  status.ok = currentVersion === expectedVersion;
  status.caches = await getCacheKeys();
  if (!status.ok) {
    status.error = isAndroidApp()
      ? "The bundled artifact proxy is unavailable. Close and reopen the Android app, then retry."
      : "The required artifact proxy is unavailable. Open Settings > Version to review app updates, then retry.";
    onStatus(status.error);
  }
  return status;
}
