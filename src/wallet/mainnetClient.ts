import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";

export const createVisibleMainnetClient = async (policy: ConnectionPolicy) => {
  if (policy.providerMode === "helios") {
    throw new Error(
      "Helios provider mode is visible in Connections but balance and smart-wallet RPC calls are not wired through Helios yet."
    );
  }

  const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

  if (!ethereumRpcUrl) {
    throw new Error("Configure an Ethereum mainnet RPC first.");
  }

  const client = createPublicClient({
    chain: mainnet,
    transport: http(ethereumRpcUrl)
  });
  const chainId = await client.getChainId();

  if (chainId !== mainnet.id) {
    throw new Error(
      `Configured RPC is chain ${chainId}; Bindle expects Ethereum mainnet.`
    );
  }

  return client;
};
