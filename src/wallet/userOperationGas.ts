import type { EstimateFeesPerGasReturnType } from "viem";

export type UserOperationFeeEstimate =
  EstimateFeesPerGasReturnType<"eip1559">;

type FeeEstimator = {
  estimateFeesPerGas: (args: {
    type: "eip1559";
  }) => Promise<UserOperationFeeEstimate>;
};

const pimlicoTierPreference = ["fast", "standard", "slow"] as const;
let rpcRequestId = 1;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const parseBigIntLike = (value: unknown): bigint | null => {
  if (typeof value === "bigint") {
    return value >= 0n ? value : null;
  }

  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? BigInt(value) : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed.startsWith("-")) {
    return null;
  }

  try {
    const parsed = BigInt(trimmed);
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
};

export const isPimlicoBundlerUrl = (bundlerUrl: string): boolean => {
  try {
    const host = new URL(bundlerUrl).hostname.toLowerCase();
    return host === "pimlico.io" || host.endsWith(".pimlico.io");
  } catch {
    return false;
  }
};

export const parsePimlicoUserOperationGasPrice = (
  response: unknown
): UserOperationFeeEstimate | null => {
  if (!isRecord(response)) {
    return null;
  }

  for (const tierName of pimlicoTierPreference) {
    const tier = response[tierName];

    if (!isRecord(tier)) {
      continue;
    }

    const maxFeePerGas = parseBigIntLike(tier.maxFeePerGas);
    const maxPriorityFeePerGas = parseBigIntLike(tier.maxPriorityFeePerGas);

    if (maxFeePerGas !== null && maxPriorityFeePerGas !== null) {
      return {
        maxFeePerGas,
        maxPriorityFeePerGas
      };
    }
  }

  return null;
};

const requestBundlerRpc = async <Result>(
  bundlerUrl: string,
  method: string
): Promise<Result> => {
  const response = await fetch(bundlerUrl, {
    body: JSON.stringify({
      id: rpcRequestId++,
      jsonrpc: "2.0",
      method,
      params: []
    }),
    headers: {
      "content-type": "application/json"
    },
    method: "POST"
  });
  const responseText = await response.text();

  let payload: unknown;

  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    throw new Error(
      `ERC-4337 bundler returned non-JSON ${method} response: ${responseText.slice(0, 160)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `ERC-4337 bundler ${method} failed with HTTP ${response.status}: ${responseText.slice(0, 160)}`
    );
  }

  if (!isRecord(payload)) {
    throw new Error(`ERC-4337 bundler ${method} returned an empty response.`);
  }

  const { error, result } = payload;

  if (isRecord(error)) {
    const code = typeof error.code === "number" ? ` ${error.code}` : "";
    const message =
      typeof error.message === "string" ? error.message : "unknown RPC error";

    throw new Error(`ERC-4337 bundler ${method} error${code}: ${message}`);
  }

  if (!("result" in payload)) {
    throw new Error(`ERC-4337 bundler ${method} returned no result.`);
  }

  return result as Result;
};

const estimateFallbackFees = async (
  fallbackEstimator: FeeEstimator
): Promise<UserOperationFeeEstimate> => {
  const fees = await fallbackEstimator.estimateFeesPerGas({ type: "eip1559" });

  return {
    maxFeePerGas: fees.maxFeePerGas,
    maxPriorityFeePerGas: fees.maxPriorityFeePerGas
  };
};

export const estimateVisibleUserOperationFees = async ({
  bundlerUrl,
  fallbackEstimator
}: {
  bundlerUrl: string;
  fallbackEstimator: FeeEstimator;
}): Promise<UserOperationFeeEstimate> => {
  const trimmedBundlerUrl = bundlerUrl.trim();

  // This only calls the configured ERC-4337 bundler endpoint that is visible in
  // ConnectionPolicy and the shield/payment preflight disclosure.
  if (isPimlicoBundlerUrl(trimmedBundlerUrl)) {
    const gasPriceResponse = await requestBundlerRpc<unknown>(
      trimmedBundlerUrl,
      "pimlico_getUserOperationGasPrice"
    );
    const pimlicoFees = parsePimlicoUserOperationGasPrice(gasPriceResponse);

    if (!pimlicoFees) {
      throw new Error(
        "ERC-4337 bundler did not return usable Pimlico User Operation gas prices."
      );
    }

    return pimlicoFees;
  }

  return estimateFallbackFees(fallbackEstimator);
};
