import { getAddress, type Address } from "viem";

export const RAILGUN_MAINNET_WAKU_FEES_TOPIC = "/railgun/v2/0-1-fees/json";
export const RAILGUN_MAINNET_WAKU_TRANSACT_TOPIC =
  "/railgun/v2/0-1-transact/json";
export const RAILGUN_MAINNET_WAKU_TRANSACT_RESPONSE_TOPIC =
  "/railgun/v2/0-1-transact-response/json";

export const RAILGUN_BROADCASTER_MIN_VERSION = "8.0.0";
export const RAILGUN_BROADCASTER_MAX_VERSION = "8.999.0";
export const RAILGUN_BROADCASTER_FEE_EXPIRATION_BUFFER_MS = 40_000;

// Kohaku alpha currently hardcodes this active POI list key in its Waku plugin.
// Keep it explicit here so current broadcaster fee ads can be diagnosed without
// importing the removed RAILGUN Wallet SDK.
export const KOHAKU_RAILGUN_ACTIVE_POI_LIST_KEYS = [
  "efc6ddb59c098a13fb2b618fdae94c1c3a807abc8fb1837c93620c9143ee9e88"
] as const;

export type RawRailgunWakuMessage = {
  payload: number[] | Uint8Array;
  contentTopic: string;
  timestamp?: number;
};

export type RailgunBroadcasterFeeAd = {
  railgunAddress: `0zk${string}`;
  fees: Record<`0x${string}`, string>;
  feeExpiration: number;
  feesID: string;
  availableWallets: number;
  relayAdapt: `0x${string}`;
  relayAdapt7702?: `0x${string}`;
  requiredPOIListKeys: string[];
  reliability: number;
  version: string;
  identifier?: string;
  signature: string;
  signatureStatus: "unverified-no-wallet-sdk";
  receivedAt: number | null;
};

export type RailgunBroadcasterTokenAd = {
  railgunAddress: `0zk${string}`;
  tokenAddress: Address;
  feePerUnitGas: string;
  feeExpiration: number;
  feesID: string;
  availableWallets: number;
  relayAdapt: `0x${string}`;
  relayAdapt7702?: `0x${string}`;
  requiredPOIListKeys: string[];
  reliability: number;
  version: string;
  identifier?: string;
  signatureStatus: RailgunBroadcasterFeeAd["signatureStatus"];
  receivedAt: number | null;
};

export type RailgunFeeAdParseResult =
  | {
      ok: true;
      ad: RailgunBroadcasterFeeAd;
    }
  | {
      ok: false;
      error: string;
    };

const textDecoder = new TextDecoder();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const bytesToUtf8 = (bytes: number[] | Uint8Array): string =>
  textDecoder.decode(bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes));

const hexToUtf8 = (hex: string): string => {
  const normalized = hex.startsWith("0x") ? hex.slice(2) : hex;

  if (normalized.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(normalized)) {
    throw new Error("fee ad data is not valid hex");
  }

  const bytes = new Uint8Array(normalized.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }

  return textDecoder.decode(bytes);
};

const asString = (value: unknown, field: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`fee ad ${field} must be a non-empty string`);
  }

  return value;
};

const asNumber = (value: unknown, field: string): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`fee ad ${field} must be a finite number`);
  }

  return value;
};

const asOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const normalizeRailgunAddress = (value: unknown): `0zk${string}` => {
  const address = asString(value, "railgunAddress");

  if (!address.startsWith("0zk")) {
    throw new Error("fee ad railgunAddress must be a 0zk address");
  }

  return address as `0zk${string}`;
};

const normalizeHexAddress = (value: unknown, field: string): `0x${string}` =>
  getAddress(asString(value, field)) as `0x${string}`;

const normalizeFeeMap = (value: unknown): Record<`0x${string}`, string> => {
  if (!isRecord(value)) {
    throw new Error("fee ad fees must be an object");
  }

  const fees: Record<`0x${string}`, string> = {};

  for (const [tokenAddress, feePerUnitGas] of Object.entries(value)) {
    const normalizedToken = getAddress(tokenAddress) as `0x${string}`;
    fees[normalizedToken] = asString(feePerUnitGas, `fees.${tokenAddress}`);
  }

  return fees;
};

const normalizeListKeys = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((entry): entry is string => typeof entry === "string");
};

const compareSemver = (left: string, right: string): number => {
  const leftParts = left.split(".").map((part) => Number.parseInt(part, 10));
  const rightParts = right.split(".").map((part) => Number.parseInt(part, 10));

  for (let index = 0; index < 3; index += 1) {
    const leftPart = Number.isFinite(leftParts[index]) ? leftParts[index] : 0;
    const rightPart = Number.isFinite(rightParts[index]) ? rightParts[index] : 0;

    if (leftPart !== rightPart) {
      return leftPart > rightPart ? 1 : -1;
    }
  }

  return 0;
};

export const railgunBroadcasterVersionAllowed = (version: string): boolean =>
  compareSemver(version, RAILGUN_BROADCASTER_MIN_VERSION) >= 0 &&
  compareSemver(version, RAILGUN_BROADCASTER_MAX_VERSION) <= 0;

export const railgunBroadcasterFeeUsable = (
  ad: Pick<
    RailgunBroadcasterFeeAd,
    "availableWallets" | "feeExpiration" | "requiredPOIListKeys" | "version"
  >,
  nowMs = Date.now()
): boolean => {
  if (!railgunBroadcasterVersionAllowed(ad.version)) {
    return false;
  }

  if (ad.availableWallets <= 0) {
    return false;
  }

  if (ad.feeExpiration < nowMs + RAILGUN_BROADCASTER_FEE_EXPIRATION_BUFFER_MS) {
    return false;
  }

  return ad.requiredPOIListKeys.every((listKey) =>
    KOHAKU_RAILGUN_ACTIVE_POI_LIST_KEYS.includes(
      listKey as (typeof KOHAKU_RAILGUN_ACTIVE_POI_LIST_KEYS)[number]
    )
  );
};

export const parseRailgunWakuFeeMessage = (
  message: RawRailgunWakuMessage
): RailgunFeeAdParseResult => {
  try {
    if (message.contentTopic !== RAILGUN_MAINNET_WAKU_FEES_TOPIC) {
      return {
        ok: false,
        error: `wrong content topic ${message.contentTopic}`
      };
    }

    const outer = JSON.parse(bytesToUtf8(message.payload)) as unknown;

    if (!isRecord(outer)) {
      throw new Error("fee ad payload must be an object");
    }

    const data = asString(outer.data, "data");
    const signature = asString(outer.signature, "signature");
    const decoded = JSON.parse(hexToUtf8(data)) as unknown;

    if (!isRecord(decoded)) {
      throw new Error("decoded fee ad data must be an object");
    }

    const relayAdapt7702 = asOptionalString(decoded.relayAdapt7702);

    return {
      ok: true,
      ad: {
        railgunAddress: normalizeRailgunAddress(decoded.railgunAddress),
        fees: normalizeFeeMap(decoded.fees),
        feeExpiration: asNumber(decoded.feeExpiration, "feeExpiration"),
        feesID: asString(decoded.feesID, "feesID"),
        availableWallets: asNumber(decoded.availableWallets, "availableWallets"),
        relayAdapt: normalizeHexAddress(decoded.relayAdapt, "relayAdapt"),
        relayAdapt7702: relayAdapt7702
          ? normalizeHexAddress(relayAdapt7702, "relayAdapt7702")
          : undefined,
        requiredPOIListKeys: normalizeListKeys(decoded.requiredPOIListKeys),
        reliability: asNumber(decoded.reliability, "reliability"),
        version: asString(decoded.version, "version"),
        identifier: asOptionalString(decoded.identifier),
        signature,
        signatureStatus: "unverified-no-wallet-sdk",
        receivedAt: message.timestamp ?? null
      }
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

export const tokenAdsForFeeAds = ({
  ads,
  tokenAddress,
  nowMs = Date.now()
}: {
  ads: RailgunBroadcasterFeeAd[];
  tokenAddress: Address;
  nowMs?: number;
}): RailgunBroadcasterTokenAd[] => {
  const normalizedTokenAddress = getAddress(tokenAddress);

  return ads
    .filter((ad) => railgunBroadcasterFeeUsable(ad, nowMs))
    .flatMap((ad): RailgunBroadcasterTokenAd[] => {
      const feePerUnitGas = Object.entries(ad.fees).find(
        ([candidate]) => getAddress(candidate) === normalizedTokenAddress
      )?.[1];

      if (!feePerUnitGas) {
        return [];
      }

      return [
        {
          railgunAddress: ad.railgunAddress,
          tokenAddress: normalizedTokenAddress as Address,
          feePerUnitGas,
          feeExpiration: ad.feeExpiration,
          feesID: ad.feesID,
          availableWallets: ad.availableWallets,
          relayAdapt: ad.relayAdapt,
          relayAdapt7702: ad.relayAdapt7702,
          requiredPOIListKeys: ad.requiredPOIListKeys,
          reliability: ad.reliability,
          version: ad.version,
          identifier: ad.identifier,
          signatureStatus: ad.signatureStatus,
          receivedAt: ad.receivedAt
        }
      ];
    })
    .sort((left, right) => {
      const feeDelta = BigInt(left.feePerUnitGas) - BigInt(right.feePerUnitGas);

      if (feeDelta !== 0n) {
        return feeDelta > 0n ? 1 : -1;
      }

      return right.reliability - left.reliability;
    });
};

export const selectBestRawRailgunBroadcasterTokenAd = ({
  ads,
  tokenAddress,
  nowMs = Date.now()
}: {
  ads: RailgunBroadcasterFeeAd[];
  tokenAddress: Address;
  nowMs?: number;
}): RailgunBroadcasterTokenAd | null =>
  tokenAdsForFeeAds({ ads, tokenAddress, nowMs })[0] ?? null;
