import type { ConnectionPolicy, PrivacyToolkitId } from "./connectionPolicy";
import { startKohakuRailgunAdapter } from "./adapters/kohakuRailgun";
import { startRailgunWalletSdkAdapter } from "./adapters/railgunWalletSdk";

export type PrivacyToolkitState =
  | "idle"
  | "starting"
  | "ready"
  | "error"
  | "stopped";

export type PrivacyToolkitHandle = {
  id: PrivacyToolkitId;
  label: string;
  state: PrivacyToolkitState;
  chainId?: number;
  stop: () => Promise<void>;
};

export type PrivacyToolkitAdapter = {
  id: PrivacyToolkitId;
  label: string;
  start: (
    policy: ConnectionPolicy,
    onStatus: (message: string) => void
  ) => Promise<PrivacyToolkitHandle>;
};

export const privacyToolkitOptions: Array<{
  id: PrivacyToolkitId;
  label: string;
  description: string;
}> = [
  {
    id: "kohaku-railgun",
    label: "Kohaku RAILGUN",
    description: "Default RPC-only Kohaku adapter"
  },
  {
    id: "railgun-wallet-sdk",
    label: "RAILGUN Wallet SDK",
    description: "Explicit fallback for SDK-only paths"
  }
];

const adapters: Record<PrivacyToolkitId, PrivacyToolkitAdapter> = {
  "kohaku-railgun": {
    id: "kohaku-railgun",
    label: "Kohaku RAILGUN",
    start: startKohakuRailgunAdapter
  },
  "railgun-wallet-sdk": {
    id: "railgun-wallet-sdk",
    label: "RAILGUN Wallet SDK",
    start: startRailgunWalletSdkAdapter
  }
};

export const startPrivacyToolkit = (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<PrivacyToolkitHandle> => adapters[policy.privacyToolkit].start(policy, onStatus);
