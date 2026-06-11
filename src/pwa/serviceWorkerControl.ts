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
      registration = await navigator.serviceWorker.register("/service-worker.js", {
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

  onStatus(
    `Service Worker version is ${
      currentVersion ?? "unknown"
    } (expected ${expectedVersion}). Checking for updates...`
  );

  onStatus("Triggering Service Worker update check");
  status.repairActions.push("registration_update");
  try {
    await registration.update();
  } catch (err: any) {
    console.warn("SW update call failed:", err);
  }
  updateStatusFromRegistration();

  if (registration.waiting) {
    onStatus("Found waiting Service Worker. Sending skip waiting command.");
    status.repairActions.push("send_skip_waiting");
    status.repairAttempted = true;

    const skipAckPromise = new Promise<void>((resolve) => {
      const channel = new MessageChannel();
      const waitingWorker = registration!.waiting!;
      const timeout = setTimeout(resolve, 2000);

      channel.port1.onmessage = () => {
        clearTimeout(timeout);
        resolve();
      };
      waitingWorker.postMessage({ type: "BINDLE_SKIP_WAITING" }, [channel.port2]);
    });

    await skipAckPromise;
  }

  const onControllerChangePromise = new Promise<void>((resolve) => {
    const handler = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handler);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", handler);
    setTimeout(() => {
      navigator.serviceWorker.removeEventListener("controllerchange", handler);
      resolve();
    }, timeoutMs);
  });

  if (registration.installing) {
    onStatus("Service Worker is currently installing. Waiting for completion...");
    const installingWorker = registration.installing;
    await new Promise<void>((resolve) => {
      const stateHandler = () => {
        if (installingWorker.state === "installed" || installingWorker.state === "redundant") {
          installingWorker.removeEventListener("statechange", stateHandler);
          resolve();
        }
      };
      installingWorker.addEventListener("statechange", stateHandler);
      setTimeout(resolve, 8000);
    });
    updateStatusFromRegistration();

    if (registration.waiting) {
      onStatus("Service Worker installed and waiting. Skipping waiting state.");
      status.repairActions.push("send_skip_waiting_after_install");
      status.repairAttempted = true;
      registration.waiting.postMessage({ type: "BINDLE_SKIP_WAITING" });
    }
  }

  if (status.repairAttempted || registration.waiting) {
    onStatus("Waiting for new Service Worker controller to activate...");
    await onControllerChangePromise;
    updateStatusFromRegistration();

    currentVersion = await checkControllerVersion();
    status.controllerVersion = currentVersion;
    if (currentVersion === expectedVersion) {
      status.ok = true;
      return status;
    }
  }

  if (navigator.serviceWorker.controller) {
    onStatus("Sending cache purge command to the current active controller...");
    status.repairActions.push("send_clear_caches");
    status.repairAttempted = true;

    try {
      const channel = new MessageChannel();
      const controller = navigator.serviceWorker.controller;
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 2000);
        channel.port1.onmessage = () => {
          clearTimeout(timeout);
          resolve();
        };
        controller.postMessage({ type: "BINDLE_CLEAR_BINDLE_CACHES" }, [channel.port2]);
      });
    } catch (err) {
      console.warn("Failed to clear caches via controller:", err);
    }
  }

  if (currentVersion !== expectedVersion) {
    onStatus("Service Worker upgrade failed. Performing safe unregistration and local cache purge...");
    status.repairActions.push("hard_reset");
    status.repairAttempted = true;

    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        await reg.unregister();
      }

      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          if (key.startsWith("bindle-shell-") || key.startsWith("bindle-railgun-artifacts-")) {
            await caches.delete(key);
          }
        }
      }
    } catch (err: any) {
      console.error("Hard reset cleanup failed:", err);
    }

    status.caches = await getCacheKeys();

    throw new ArtifactProxyReloadRequiredError(
      `Service Worker hard reset performed. The page must be reloaded to register and activate artifact proxy version ${expectedVersion}.`
    );
  }

  status.ok = true;
  return status;
}
