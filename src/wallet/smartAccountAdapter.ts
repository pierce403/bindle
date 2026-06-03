export type SmartAccountAdapterStatus = {
  usable: boolean;
  label: string;
  reason: string;
};

export type SmartWalletAddressResult =
  | {
      status: "ready";
      address: string;
    }
  | {
      status: "pending";
      reason: string;
    };

export const kohakuSmartAccountSupport: SmartAccountAdapterStatus = {
  usable: false,
  label: "Kohaku passkey smart account",
  reason:
    "Pinned Kohaku packages in this repo expose RAILGUN/provider primitives, but no browser-ready pq-account or passkey ERC-4337 account address derivation API."
};

export const deriveSmartWalletAddressFromPasskey =
  async (): Promise<SmartWalletAddressResult> => ({
    status: "pending",
    reason: kohakuSmartAccountSupport.reason
  });
