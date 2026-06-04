import {
  KOHAKU_RAILGUN_ARTIFACT_BASE_URL,
  defaultConnectionPolicy,
  endpointPresets,
  type ConnectionPolicy,
  type EndpointPresetId,
  type HeliosNetwork,
  type PrivacyToolkitId,
  type ProviderMode
} from "./connectionPolicy";

const storageKey = "bindle.connectionPolicy.v1";

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const stringArrayValue = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

const booleanValue = (value: unknown): boolean => value === true;

const normalizeUrlLike = (value: string): string => {
  const trimmed = value.trim();

  return trimmed ? `${trimmed.replace(/\/+$/, "")}/` : "";
};

const endpointPresetValue = (value: unknown): EndpointPresetId =>
  value === "privacy-max" || value === "custom" || value === "local-dev"
    ? value
    : "bindle-default";

const providerModeValue = (value: unknown): ProviderMode =>
  value === "helios" ? "helios" : "direct-rpc";

const heliosNetworkValue = (value: unknown): HeliosNetwork =>
  value === "sepolia" || value === "holesky" ? value : "mainnet";

const privacyToolkitValue = (value: unknown): PrivacyToolkitId =>
  value === "railgun-wallet-sdk" ? "railgun-wallet-sdk" : "kohaku-railgun";

const hasLegacyCustomEndpoint = (parsed: Record<string, unknown>): boolean =>
  stringValue(parsed.ethereumRpcUrl).length > 0 ||
  stringValue(parsed.bundlerUrl).length > 0 ||
  stringValue(parsed.paymasterUrl).length > 0 ||
  stringValue(parsed.broadcasterUrl).length > 0 ||
  stringValue(parsed.providerResolverUrl).length > 0 ||
  stringValue(parsed.priceQuoteUrl).length > 0 ||
  stringValue(parsed.railgunSyncUrl).length > 0 ||
  stringValue(parsed.railgunArtifactUrl).length > 0 ||
  stringValue(parsed.heliosConsensusRpcUrl).length > 0 ||
  stringValue(parsed.heliosCheckpoint).length > 0 ||
  stringValue(parsed.passkeyAttestationUrl).length > 0 ||
  stringValue(parsed.recoveryServiceUrl).length > 0 ||
  stringArrayValue(parsed.poiAggregatorUrls).length > 0 ||
  booleanValue(parsed.wakuEnabled);

const normalizeConnectionPolicy = (value: unknown): ConnectionPolicy => {
  if (!value || typeof value !== "object") {
    return defaultConnectionPolicy;
  }

  const parsed = value as Record<string, unknown>;
  const endpointPreset =
    typeof parsed.endpointPreset === "string"
      ? endpointPresetValue(parsed.endpointPreset)
      : hasLegacyCustomEndpoint(parsed)
        ? "custom"
        : "bindle-default";

  if (endpointPreset === "bindle-default" && !hasLegacyCustomEndpoint(parsed)) {
    return defaultConnectionPolicy;
  }

  const presetPolicy = endpointPresets[endpointPreset].policy;
  const railgunSyncUrl =
    endpointPreset === "bindle-default" && !stringValue(parsed.railgunSyncUrl)
      ? presetPolicy.railgunSyncUrl
      : stringValue(parsed.railgunSyncUrl);
  const priceQuoteUrl =
    endpointPreset === "bindle-default" && !stringValue(parsed.priceQuoteUrl)
      ? presetPolicy.priceQuoteUrl
      : stringValue(parsed.priceQuoteUrl);
  const parsedRailgunArtifactUrl = stringValue(parsed.railgunArtifactUrl);
  const railgunArtifactUrl =
    endpointPreset === "bindle-default" &&
    (!parsedRailgunArtifactUrl ||
      normalizeUrlLike(parsedRailgunArtifactUrl) ===
        normalizeUrlLike(KOHAKU_RAILGUN_ARTIFACT_BASE_URL))
      ? presetPolicy.railgunArtifactUrl
      : parsedRailgunArtifactUrl;

  return {
    endpointPreset,
    providerMode: providerModeValue(parsed.providerMode),
    privacyToolkit: privacyToolkitValue(parsed.privacyToolkit),
    ethereumRpcUrl: stringValue(parsed.ethereumRpcUrl),
    heliosConsensusRpcUrl: stringValue(parsed.heliosConsensusRpcUrl),
    heliosCheckpoint: stringValue(parsed.heliosCheckpoint),
    heliosNetwork: heliosNetworkValue(parsed.heliosNetwork),
    railgunSyncUrl,
    railgunArtifactUrl,
    poiAggregatorUrls: stringArrayValue(parsed.poiAggregatorUrls),
    broadcasterUrl: stringValue(parsed.broadcasterUrl),
    providerResolverUrl: stringValue(parsed.providerResolverUrl),
    priceQuoteUrl,
    bundlerUrl: stringValue(parsed.bundlerUrl),
    paymasterUrl: stringValue(parsed.paymasterUrl),
    passkeyAttestationUrl: stringValue(parsed.passkeyAttestationUrl),
    recoveryServiceUrl: stringValue(parsed.recoveryServiceUrl),
    autoStartToolkit:
      typeof parsed.autoStartToolkit === "boolean"
        ? parsed.autoStartToolkit
        : presetPolicy.autoStartToolkit,
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
    // Storage boundary: this stores the selected preset plus endpoint edits.
    // It does not contact endpoints by itself. RPC URLs may contain provider
    // tokens, so they remain local to this browser profile.
    window.localStorage.setItem(storageKey, JSON.stringify(normalized));
  }

  return normalized;
};
