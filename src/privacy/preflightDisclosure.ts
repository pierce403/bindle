import {
  summarizeOutbound,
  type ConnectionPolicy,
  type EndpointSource,
  type OutboundClass
} from "./connectionPolicy";

export type IntendedWalletAction =
  | "start-toolkit"
  | "passkey-enroll"
  | "create-smart-wallet"
  | "public-balance-sync"
  | "shielded-balance-sync"
  | "send-review"
  | "pay-review"
  | "public-smart-payment"
  | "private-send"
  | "unshield-review"
  | "shield-sweep";

export type EndpointDisclosure = {
  id: OutboundClass;
  label: string;
  source: EndpointSource;
  value: string;
  configured: boolean;
  required: boolean;
};

const actionEndpointRequirements: Record<
  IntendedWalletAction,
  Partial<Record<OutboundClass, "required" | "possible">>
> = {
  "start-toolkit": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible",
    "railgun-sync": "possible",
    "railgun-poi": "possible",
    "waku": "possible"
  },
  "passkey-enroll": {
    "passkey-attestation": "possible",
    "wallet-recovery": "possible"
  },
  "create-smart-wallet": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible",
    "erc4337-bundler": "possible",
    "erc4337-paymaster": "possible",
    "passkey-attestation": "possible"
  },
  "public-balance-sync": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible"
  },
  "shielded-balance-sync": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible",
    "railgun-sync": "possible",
    "railgun-poi": "possible"
  },
  "send-review": {
    "ethereum-rpc": "required",
    "railgun-sync": "possible",
    "railgun-poi": "possible",
    "railgun-broadcaster": "possible",
    "provider-resolution": "possible",
    "erc4337-bundler": "possible",
    "erc4337-paymaster": "possible"
  },
  "pay-review": {
    "ethereum-rpc": "required",
    "railgun-sync": "possible",
    "railgun-poi": "possible",
    "railgun-broadcaster": "required",
    "provider-resolution": "possible",
    "price-quotes": "required"
  },
  "public-smart-payment": {
    "ethereum-rpc": "required",
    "provider-resolution": "possible",
    "erc4337-bundler": "required",
    "erc4337-paymaster": "possible"
  },
  "private-send": {
    "ethereum-rpc": "required",
    "railgun-sync": "possible",
    "railgun-poi": "possible",
    "railgun-broadcaster": "possible",
    "provider-resolution": "possible"
  },
  "unshield-review": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible",
    "railgun-sync": "possible",
    "railgun-poi": "possible",
    "railgun-broadcaster": "required"
  },
  "shield-sweep": {
    "ethereum-rpc": "required",
    "helios-consensus-rpc": "possible",
    "helios-checkpoint": "possible",
    "railgun-sync": "possible",
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
      source: control.source,
      value: control.value,
      configured: control.mode !== "off",
      required: requirements[control.id] === "required"
    }));
};
