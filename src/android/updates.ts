import { Browser } from "@capacitor/browser";
import { CapacitorHttp } from "@capacitor/core";
import { bindleBuildInfo } from "../buildInfo";
import { androidVersionCode } from "./version";
import { isAndroidApp } from "../platform/runtime";

export type AndroidRelease = {
  schema: 1;
  versionCode: number;
  versionName: string;
  commit: string;
  publishedAt: string;
  apk: { url: string; sha256: string; bytes: number };
};

type AndroidUpdateState = {
  checking: boolean;
  checked: boolean;
  release: AndroidRelease | null;
  available: boolean;
  error: string | null;
};

let state: AndroidUpdateState = {
  checking: false,
  checked: false,
  release: null,
  available: false,
  error: null
};
const listeners = new Set<() => void>();
const publish = (change: Partial<AndroidUpdateState>) => {
  state = { ...state, ...change };
  listeners.forEach((listener) => listener());
};

export const getAndroidUpdateState = () => state;
export const subscribeToAndroidUpdates = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const isAndroidRelease = (value: unknown): value is AndroidRelease => {
  if (!value || typeof value !== "object") return false;
  const release = value as Partial<AndroidRelease>;
  const apk = release.apk as Partial<AndroidRelease["apk"]> | undefined;
  if (release.schema !== 1 || !Number.isSafeInteger(release.versionCode) ||
      (release.versionCode ?? 0) < 1 || typeof release.versionName !== "string" ||
      !/^\d+\.\d+\.\d+$/.test(release.versionName) ||
      typeof release.commit !== "string" || !/^[0-9a-f]{40}$/.test(release.commit) ||
      typeof release.publishedAt !== "string" || Number.isNaN(Date.parse(release.publishedAt)) ||
      !apk || typeof apk.url !== "string" || typeof apk.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(apk.sha256) || !Number.isSafeInteger(apk.bytes) || (apk.bytes ?? 0) < 1) return false;
  if (androidVersionCode(release.versionName) !== release.versionCode) return false;
  try {
    const url = new URL(apk.url);
    return url.protocol === "https:" && url.hostname === "github.com" &&
      url.pathname.startsWith("/pierce403/bindle/releases/download/") &&
      url.pathname.endsWith(".apk");
  } catch {
    return false;
  }
};

export const checkForAndroidUpdate = async (): Promise<void> => {
  if (state.checking) return;
  publish({ checking: true, error: null });
  try {
    let release: unknown;
    if (isAndroidApp()) {
      const response = await CapacitorHttp.get({
        url: "https://bindle.cash/android-release.json",
        headers: { "cache-control": "no-cache" }
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`Update manifest returned ${response.status}.`);
      }
      release = response.data;
    } else {
      const response = await fetch("/android-release.json", {
        cache: "no-store",
        credentials: "omit"
      });
      if (!response.ok) throw new Error(`Update manifest returned ${response.status}.`);
      release = await response.json();
    }
    if (!isAndroidRelease(release)) throw new Error("The Android release manifest is invalid.");
    const installedCode = androidVersionCode(bindleBuildInfo.version);
    if (installedCode === null) throw new Error("The installed Android version is invalid.");
    publish({ release, available: release.versionCode > installedCode, checked: true });
  } catch (error) {
    publish({
      checked: true,
      release: null,
      available: false,
      error: error instanceof Error ? error.message : "Unable to check for an Android update."
    });
  } finally {
    publish({ checking: false });
  }
};

export const downloadAndroidRelease = async (release: AndroidRelease): Promise<void> => {
  await Browser.open({ url: release.apk.url });
};
