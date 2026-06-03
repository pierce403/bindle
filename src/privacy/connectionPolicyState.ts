import {
  defaultConnectionPolicy,
  type ConnectionPolicy,
  type PrivacyToolkitId
} from "./connectionPolicy";

const storageKey = "bindle.connectionPolicy.v1";

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const stringArrayValue = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const booleanValue = (value: unknown): boolean => value === true;

const privacyToolkitValue = (value: unknown): PrivacyToolkitId =>
  value === "railgun-wallet-sdk" ? "railgun-wallet-sdk" : "kohaku-railgun";

const normalizeConnectionPolicy = (value: unknown): ConnectionPolicy => {
  if (!value || typeof value !== "object") {
    return defaultConnectionPolicy;
  }

  const parsed = value as Record<string, unknown>;

  return {
    privacyToolkit: privacyToolkitValue(parsed.privacyToolkit),
    ethereumRpcUrl: stringValue(parsed.ethereumRpcUrl),
    poiAggregatorUrls: stringArrayValue(parsed.poiAggregatorUrls),
    broadcasterUrl: stringValue(parsed.broadcasterUrl),
    providerResolverUrl: stringValue(parsed.providerResolverUrl),
    priceQuoteUrl: stringValue(parsed.priceQuoteUrl),
    bundlerUrl: stringValue(parsed.bundlerUrl),
    paymasterUrl: stringValue(parsed.paymasterUrl),
    passkeyAttestationUrl: stringValue(parsed.passkeyAttestationUrl),
    recoveryServiceUrl: stringValue(parsed.recoveryServiceUrl),
    wakuEnabled: booleanValue(parsed.wakuEnabled),
    debugLogging: booleanValue(parsed.debugLogging)
  };
};

const canUseStorage = () => typeof window !== "undefined" && "localStorage" in window;

export const loadConnectionPolicy = (): ConnectionPolicy => {
  if (!canUseStorage()) {
    return defaultConnectionPolicy;
  }

  const stored = window.localStorage.getItem(storageKey);

  if (!stored) {
    return defaultConnectionPolicy;
  }

  try {
    return normalizeConnectionPolicy(JSON.parse(stored));
  } catch {
    return defaultConnectionPolicy;
  }
};

export const saveConnectionPolicy = (
  policy: ConnectionPolicy
): ConnectionPolicy => {
  const normalized = normalizeConnectionPolicy(policy);

  if (canUseStorage()) {
    // Storage boundary: this stores explicit user/operator endpoint settings
    // only. It does not add defaults or contact endpoints by itself. RPC URLs
    // may contain provider tokens, so they remain local to this browser profile.
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  }

  return normalized;
};
