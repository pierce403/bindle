import {
  summarizeOutbound,
  type ConnectionPolicy,
  type OutboundClass
} from "./connectionPolicy";

export type IntendedWalletAction = "passkey-enroll" | "send-review" | "shield-sweep";

export type EndpointDisclosure = {
  id: OutboundClass;
  label: string;
  value: string;
  configured: boolean;
  required: boolean;
};

const actionEndpointRequirements: Record<
  IntendedWalletAction,
  Partial<Record<OutboundClass, "required" | "possible">>
> = {
  "passkey-enroll": {
    "passkey-attestation": "possible",
    "wallet-recovery": "possible"
  },
  "send-review": {
    "ethereum-rpc": "required",
    "railgun-poi": "possible",
    "railgun-broadcaster": "possible",
    "provider-resolution": "possible",
    "erc4337-bundler": "possible",
    "erc4337-paymaster": "possible"
  },
  "shield-sweep": {
    "ethereum-rpc": "required",
    "railgun-poi": "possible",
    "erc4337-bundler": "required",
    "erc4337-paymaster": "possible"
  }
};

export const buildEndpointDisclosure = (
  policy: ConnectionPolicy,
  action: IntendedWalletAction
): EndpointDisclosure[] => {
  const controls = summarizeOutbound(policy);
  const requirements = actionEndpointRequirements[action];

  return controls
    .filter((control) => control.id in requirements)
    .map((control) => ({
      id: control.id,
      label: control.label,
      value: control.value,
      configured: control.mode !== "off",
      required: requirements[control.id] === "required"
    }));
};
