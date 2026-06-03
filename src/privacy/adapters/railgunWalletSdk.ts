import type { ConnectionPolicy } from "../connectionPolicy";
import type { PrivacyToolkitHandle } from "../toolkit";
import { startRailgunBrowserEngine } from "../../railgun/client";

export const startRailgunWalletSdkAdapter = async (
  policy: ConnectionPolicy,
  onStatus: (message: string) => void
): Promise<PrivacyToolkitHandle> => {
  onStatus("Loading explicit RAILGUN Wallet SDK fallback");
  const handle = await startRailgunBrowserEngine(policy, onStatus);

  return {
    id: "railgun-wallet-sdk",
    label: "RAILGUN Wallet SDK",
    state: handle.state,
    stop: handle.stop
  };
};
