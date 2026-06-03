import { PrivacyToolkitStartupError } from "../privacy/toolkitErrors";

export type DebugLogLevel = "info" | "warning" | "error";

export type DebugLogEntry = {
  id: string;
  at: string;
  level: DebugLogLevel;
  source: string;
  message: string;
  detail?: string;
  stack?: string;
};

export type CreateDebugLogEntryInput = {
  level: DebugLogLevel;
  source: string;
  message: string;
  detail?: string;
  error?: unknown;
};

const storageKey = "bindle.debugLog.v1";
const maxEntries = 120;

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim().length > 0 ? value : undefined;

const entryValue = (value: unknown): DebugLogEntry | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const parsed = value as Record<string, unknown>;
  const level = parsed.level;

  if (level !== "info" && level !== "warning" && level !== "error") {
    return null;
  }

  const id = stringValue(parsed.id);
  const at = stringValue(parsed.at);
  const source = stringValue(parsed.source);
  const message = stringValue(parsed.message);

  if (!id || !at || !source || !message) {
    return null;
  }

  return {
    id,
    at,
    level,
    source,
    message,
    detail: stringValue(parsed.detail),
    stack: stringValue(parsed.stack)
  };
};

const errorDetail = (error: unknown): string | undefined => {
  if (error instanceof PrivacyToolkitStartupError && error.rawCause) {
    return [
      `Adapter error: ${error.name}: ${error.message}`,
      `Raw cause: ${error.rawCause instanceof Error ? `${error.rawCause.name}: ${error.rawCause.message}` : String(error.rawCause)}`
    ].join("\n");
  }

  if (error instanceof Error && "cause" in error && error.cause) {
    const cause = error.cause;
    return `Cause: ${cause instanceof Error ? `${cause.name}: ${cause.message}` : String(cause)}`;
  }

  return undefined;
};

const errorStack = (error: unknown): string | undefined => {
  if (error instanceof PrivacyToolkitStartupError && error.rawCause instanceof Error) {
    return [error.stack, "Raw cause stack:", error.rawCause.stack]
      .filter(Boolean)
      .join("\n\n");
  }

  return error instanceof Error ? error.stack : undefined;
};

export const createDebugLogEntry = ({
  level,
  source,
  message,
  detail,
  error
}: CreateDebugLogEntryInput): DebugLogEntry => {
  const errorGeneratedDetail = error === undefined ? undefined : errorDetail(error);
  const combinedDetail = [detail, errorGeneratedDetail].filter(Boolean).join("\n\n");

  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    level,
    source,
    message,
    detail: combinedDetail || undefined,
    stack: error === undefined ? undefined : errorStack(error)
  };
};

export const trimDebugLog = (entries: DebugLogEntry[]): DebugLogEntry[] =>
  entries.slice(-maxEntries);

export const loadDebugLog = (): DebugLogEntry[] => {
  if (!canUseStorage()) {
    return [];
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);

    return Array.isArray(parsed)
      ? trimDebugLog(parsed.map(entryValue).filter((entry): entry is DebugLogEntry => entry !== null))
      : [];
  } catch {
    return [];
  }
};

export const saveDebugLog = (entries: DebugLogEntry[]) => {
  if (canUseStorage()) {
    window.localStorage.setItem(storageKey, JSON.stringify(trimDebugLog(entries)));
  }
};

export const clearDebugLog = () => {
  if (canUseStorage()) {
    window.localStorage.removeItem(storageKey);
  }
};

export const formatDebugLogEntry = (entry: DebugLogEntry): string =>
  [
    `[${entry.at}] ${entry.level.toUpperCase()} ${entry.source}`,
    entry.message,
    entry.detail,
    entry.stack
  ]
    .filter(Boolean)
    .join("\n\n");

export const formatDebugLog = (entries: DebugLogEntry[]): string =>
  entries.length > 0
    ? entries.map(formatDebugLogEntry).join("\n\n---\n\n")
    : "Bindle debug log is empty.";
