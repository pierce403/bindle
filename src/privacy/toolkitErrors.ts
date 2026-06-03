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

const railgunSdkFallbackAction: ToolkitRecoveryAction = {
  kind: "switch-privacy-toolkit",
  toolkit: "railgun-wallet-sdk",
  label: "Use RAILGUN Wallet SDK fallback"
};

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unable to start";

export const isWasmUnreachableTrap = (error: unknown): boolean =>
  error instanceof Error &&
  error.name === "RuntimeError" &&
  /\bunreachable\b/i.test(error.message);

export const createKohakuWasmTrapError = (
  operation: string,
  error: unknown
): PrivacyToolkitStartupError => {
  const rawMessage = errorMessage(error);
  const trapDetail = isWasmUnreachableTrap(error)
    ? "The Kohaku RAILGUN WASM module trapped with `unreachable`."
    : `Kohaku RAILGUN WASM failed with ${rawMessage}.`;

  return new PrivacyToolkitStartupError(
    `${trapDetail} This happened while ${operation}. It is not caused by the shielded wallet password repair flow. Switch to the explicit RAILGUN Wallet SDK fallback to keep using the wallet while the Kohaku adapter is fixed.`,
    {
      action: railgunSdkFallbackAction,
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
