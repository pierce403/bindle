import type { ConnectionPolicy, PrivacyToolkitId } from "./connectionPolicy";
import { startKohakuRailgunAdapter } from "./adapters/kohakuRailgun";

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
    description: "Canonical RPC-only Kohaku adapter"
  }
];

const adapters: Record<"kohaku-railgun", PrivacyToolkitAdapter> = {
  "kohaku-railgun": {
    id: "kohaku-railgun",
    label: "Kohaku RAILGUN",
    start: startKohakuRailgunAdapter
  }
};

export const startPrivacyToolkit = (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<PrivacyToolkitHandle> =>
  adapters["kohaku-railgun"].start(
    { ...policy, privacyToolkit: "kohaku-railgun" },
    onStatus
  );
