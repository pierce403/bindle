import { isAddress, type Address } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "./mainnetClient";

export type SmartAccountDeploymentStatus =
  | { status: "missing-wallet" | "missing-rpc" | "idle" | "checking" }
  | { status: "counterfactual"; blockNumber: bigint }
  | { status: "deployed"; blockNumber: bigint; codeSize: number }
  | { status: "error"; message: string };

export const initialSmartAccountDeploymentStatus = (
  smartWalletAddress: string | null
): SmartAccountDeploymentStatus =>
  smartWalletAddress ? { status: "idle" } : { status: "missing-wallet" };

export const fetchSmartAccountDeploymentStatus = async (
  policy: ConnectionPolicy,
  smartWalletAddress: string
): Promise<SmartAccountDeploymentStatus> => {
  const normalizedAddress = smartWalletAddress.trim();

  if (!normalizedAddress) {
    return { status: "missing-wallet" };
  }

  if (!policy.ethereumRpcUrl.trim()) {
    return { status: "missing-rpc" };
  }

  if (!isAddress(normalizedAddress)) {
    throw new Error("Smart-account address is not a valid EVM address.");
  }

  const client = await createVisibleMainnetClient(policy);
  const [code, blockNumber] = await Promise.all([
    client.getCode({ address: normalizedAddress as Address }),
    client.getBlockNumber()
  ]);
  const codeSize = code && code !== "0x" ? (code.length - 2) / 2 : 0;

  return codeSize > 0
    ? { status: "deployed", blockNumber, codeSize }
    : { status: "counterfactual", blockNumber };
};

export const smartAccountDeploymentLabel = (
  status: SmartAccountDeploymentStatus
): string | null => {
  switch (status.status) {
    case "deployed":
      return "deployed on-chain";
    case "counterfactual":
      return "counterfactual; deploys on first 4337 tx";
    case "checking":
      return "checking on-chain status";
    case "missing-rpc":
      return "RPC required to check deployment";
    case "error":
      return "deployment check failed";
    case "idle":
    case "missing-wallet":
      return null;
  }
};
