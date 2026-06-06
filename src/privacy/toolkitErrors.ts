import type { PrivacyToolkitId } from "./connectionPolicy";

export type ToolkitRecoveryAction = {
  kind: "switch-privacy-toolkit";
  toolkit: PrivacyToolkitId;
  label: string;
};

export type ToolkitFailure = {
  message: string;
  action?: ToolkitRecoveryAction;
};

export class PrivacyToolkitStartupError extends Error {
  readonly action?: ToolkitRecoveryAction;
  readonly rawCause: unknown;

  constructor(
    message: string,
    options: {
      action?: ToolkitRecoveryAction;
      rawCause?: unknown;
    } = {}
  ) {
    super(message);
    this.name = "PrivacyToolkitStartupError";
    this.action = options.action;
    this.rawCause = options.rawCause;
  }
}

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unable to start";

export const isWasmUnreachableTrap = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === "RuntimeError" &&
  /\bunreachable\b/i.test(error.message);

export const isKohakuRpcFetchFailure = (error: unknown): boolean => {
  const message = errorMessage(error);

  return (
    /utxo indexer error/i.test(message) &&
    (/failed to fetch/i.test(message) ||
      /eth_getLogs/i.test(message) ||
      /could not be reached from this browser/i.test(message))
  );
};

export const isKohakuArtifactLoaderFailure = (error: unknown): boolean => {
  const message = errorMessage(error);

  return /artifact loader error/i.test(message) && /http error/i.test(message);
};

export const createKohakuWasmTrapError = (
  operation: string,
  error: unknown
): PrivacyToolkitStartupError => {
  const rawMessage = errorMessage(error);

  if (isKohakuRpcFetchFailure(error)) {
    return new PrivacyToolkitStartupError(
      `Configured Ethereum RPC failed during ${operation}. RAILGUN note sync needs browser-accessible eth_getLogs. This usually means the visible RPC endpoint is blocking CORS, rate-limiting browser log scans, offline, or not suitable for RAILGUN RPC-only sync. Change the Ethereum RPC in Connections to an endpoint that supports browser eth_getLogs for mainnet RAILGUN sync. This is not caused by the shielded wallet password repair flow.`,
      {
        rawCause: error
      }
    );
  }

  const trapDetail = isWasmUnreachableTrap(error)
    ? "The Kohaku RAILGUN WASM module trapped with `unreachable`."
    : `Kohaku RAILGUN WASM failed with ${rawMessage}.`;

  return new PrivacyToolkitStartupError(
    `${trapDetail} This happened while ${operation}. It is not caused by the shielded wallet password repair flow. Bindle keeps Kohaku as the canonical RAILGUN backend, so private actions remain disabled until the Kohaku adapter path is fixed.`,
    {
      rawCause: error
    }
  );
};

export const describeToolkitStartFailure = (
  step: string,
  error: unknown
): ToolkitFailure => {
  const message = errorMessage(error);
  const action =
    error instanceof PrivacyToolkitStartupError ? error.action : undefined;
  const normalizedStep = step.trim();

  return {
    message: normalizedStep ? `${normalizedStep}: ${message}` : message,
    action
  };
};
