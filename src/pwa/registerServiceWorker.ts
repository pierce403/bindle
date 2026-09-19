import { bindleBuildInfo } from "../buildInfo";

export type UpdatePreference = "approve" | "ask" | "reject";
export type ReleaseInfo = { id: string; version: string; commit: string; time: string };
const preferenceKey = "bindle.update-preference.v1";
const dismissedKey = "bindle.dismissed-update.v1";
const readLocal = (key: string) => {
  try { return localStorage.getItem(key); } catch { return null; }
};
const parsePreference = (value: string | null): UpdatePreference =>
  value === "approve" || value === "reject" ? value : "ask";

type UpdateState = {
  preference: UpdatePreference;
  dismissed: string | null;
  pending: ReleaseInfo | null;
  checking: boolean;
  installing: boolean;
  checked: boolean;
  readyToReload: boolean;
  error: string | null;
};
let state: UpdateState = {
  preference: parsePreference(readLocal(preferenceKey)), dismissed: readLocal(dismissedKey),
  pending: null, checking: false, installing: false, checked: false,
  readyToReload: false, error: null
};
const listeners = new Set<() => void>();
const publish = (change: Partial<UpdateState>) => {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
};
export const getUpdateState = () => state;
export const subscribeToUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const setUpdatePreference = (preference: UpdatePreference) => {
  try {
    localStorage.setItem(preferenceKey, preference);
    localStorage.removeItem(dismissedKey);
    publish({ preference, dismissed: null, error: null });
  } catch {
    publish({ error: "Your update preference could not be saved on this device." });
  }
};
export const dismissUpdate = () => {
  const id = state.pending?.id ?? null;
  try { if (id) localStorage.setItem(dismissedKey, id); } catch { /* Session-only dismissal. */ }
  publish({ dismissed: id });
};

const isRelease = (value: unknown): value is ReleaseInfo => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return ["id", "version", "commit", "time"].every((key) => typeof candidate[key] === "string" && candidate[key]);
};
const messageWorker = <T>(worker: ServiceWorker, data: object, timeoutMs = 10_000): Promise<T> =>
  new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("The update worker did not respond. Please try again."));
    }, timeoutMs);
    channel.port1.onmessage = (event: MessageEvent<T>) => {
      clearTimeout(timeout);
      channel.port1.close();
      resolve(event.data);
    };
    try { worker.postMessage(data, [channel.port2]); }
    catch (error) { clearTimeout(timeout); channel.port1.close(); reject(error); }
  });

let registrationPromise: Promise<ServiceWorkerRegistration> | null = null;
let candidateWorker: ServiceWorker | null = null;
let inspection = 0;
const inspectRegistration = async (registration: ServiceWorkerRegistration) => {
  const sequence = ++inspection;
  const worker = registration.waiting ?? registration.active;
  if (!worker) return;
  const response = await messageWorker<{ build: unknown; approved: unknown }>(worker, { type: "BINDLE_GET_RELEASE" });
  if (sequence !== inspection) return;
  candidateWorker = worker;
  publish({
    pending: isRelease(response.build) && response.build.id !== bindleBuildInfo.id ? response.build : null,
    readyToReload: isRelease(response.approved) && response.approved.id !== bindleBuildInfo.id
  });
};

const getRegistration = () => {
  if (!registrationPromise) {
    registrationPromise = navigator.serviceWorker.register("/service-worker.js", {
      scope: "/", updateViaCache: "none"
    }).then((registration) => {
      const inspect = () => { void inspectRegistration(registration).catch(() => {}); };
      const watchInstalling = () => {
        const worker = registration.installing;
        if (!worker) return;
        let installed = false;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" || worker.state === "activated") {
            installed = true;
            inspect();
          }
          if (worker.state === "redundant" && !installed) publish({ error: "The new version could not be downloaded completely. Your current version is unchanged." });
        });
      };
      registration.addEventListener("updatefound", watchInstalling);
      navigator.serviceWorker.addEventListener("controllerchange", inspect);
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "BINDLE_RELEASE_APPROVED" ||
            event.data?.type === "BINDLE_RELEASE_STAGED") inspect();
      });
      watchInstalling();
      inspect();
      return registration;
    }).catch((error) => { registrationPromise = null; throw error; });
  }
  return registrationPromise;
};

let lastCheck = 0;
export const checkForUpdates = async () => {
  if (state.checking || state.installing) return;
  if (!("serviceWorker" in navigator)) {
    publish({ error: "App updates are unavailable in this browser." });
    return;
  }
  lastCheck = Date.now();
  publish({ checking: true, error: null });
  try {
    const registration = await getRegistration();
    const worker = registration.waiting ?? registration.active;
    if (!worker) throw new Error("The update controller is not ready. Reload Bindle and try again.");
    const response = await messageWorker<{ error?: string }>(
      worker, { type: "BINDLE_CHECK_FOR_UPDATE" }, 60_000
    );
    if (response.error) throw new Error(response.error);
    await inspectRegistration(registration);
    publish({ checked: true });
  } catch (error) {
    publish({ error: error instanceof Error ? error.message : "Unable to check for updates. Try again when online." });
  } finally { publish({ checking: false }); }
};

export const installUpdate = async () => {
  const pending = state.pending;
  const worker = candidateWorker;
  if (!pending || !worker || state.installing) return;
  publish({ installing: true, error: null });
  try {
    const response = await messageWorker<{ approved?: ReleaseInfo; error?: string }>(
      worker, { type: "BINDLE_APPROVE_UPDATE", id: pending.id }, 60_000
    );
    if (response.error || response.approved?.id !== pending.id) throw new Error(response.error ?? "Update approval failed.");
    publish({ readyToReload: true });
  } catch (error) {
    publish({ error: error instanceof Error ? error.message : "Unable to install this update." });
  } finally { publish({ installing: false }); }
};

export const registerServiceWorker = () => {
  if (!("serviceWorker" in navigator)) return;
  window.addEventListener("storage", (event) => {
    if (event.key === preferenceKey || event.key === null) publish({ preference: parsePreference(readLocal(preferenceKey)) });
    if (event.key === dismissedKey || event.key === null) publish({ dismissed: readLocal(dismissedKey) });
  });
  const check = () => { if (document.visibilityState === "visible" && Date.now() - lastCheck > 60_000) void checkForUpdates(); };
  document.addEventListener("visibilitychange", check);
  window.addEventListener("online", check);
  window.setInterval(check, 30 * 60_000);
  if (document.readyState === "complete") void checkForUpdates();
  else window.addEventListener("load", () => { void checkForUpdates(); }, { once: true });
};
