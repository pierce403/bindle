import { http, isAddress, parseEther, type Address } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
  toCoinbaseSmartAccount,
  toWebAuthnAccount
} from "viem/account-abstraction";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "./mainnetClient";
import type { WalletState } from "./walletState";

export type SmartAccountAdapterStatus = {
  usable: boolean;
  label: string;
  reason: string;
};

export type SmartWalletAddressResult =
  | {
      status: "ready";
      address: Address;
    }
  | {
      status: "pending";
      reason: string;
    };

export type SmartWalletPaymentResult = {
  userOperationHash: `0x${string}`;
  transactionHash: `0x${string}` | null;
};

export type SmartWalletCall = {
  to: Address;
  data?: `0x${string}`;
  value?: bigint;
};

export const kohakuSmartAccountSupport: SmartAccountAdapterStatus = {
  usable: false,
  label: "Kohaku passkey smart account",
  reason:
    "Kohaku pq-account exists upstream, but it is not published on npm and its example is not a browser-ready Ethereum-mainnet passkey funding path."
};

export const viemCoinbaseSmartAccountSupport: SmartAccountAdapterStatus = {
  usable: true,
  label: "Viem Coinbase Smart Wallet",
  reason:
    "Viem supports WebAuthn owners for Coinbase Smart Wallet accounts and can derive a counterfactual ERC-4337 funding address from explicit RPC configuration."
};

const getFundingCredential = (walletState: WalletState) => {
  if (!walletState.passkeyCredentialId || !walletState.passkeyPublicKey) {
    throw new Error(
      "Create a funding passkey first. Existing legacy passkey metadata cannot derive a smart-wallet address."
    );
  }

  return {
    id: walletState.passkeyCredentialId,
    publicKey: walletState.passkeyPublicKey
  };
};

const createSmartAccount = async (
  policy: ConnectionPolicy,
  walletState: WalletState
) => {
  const client = await createVisibleMainnetClient(policy);
  const owner = toWebAuthnAccount({
    credential: getFundingCredential(walletState)
  });
  const account = await toCoinbaseSmartAccount({
    client,
    owners: [owner],
    version: "1.1"
  });

  return { account, client };
};

export const deriveSmartWalletAddressFromPasskey = async (
  policy: ConnectionPolicy,
  walletState: WalletState
): Promise<SmartWalletAddressResult> => {
  try {
    const { account } = await createSmartAccount(policy, walletState);

    return {
      status: "ready",
      address: account.address
    };
  } catch (error) {
    return {
      status: "pending",
      reason:
        error instanceof Error
          ? error.message
          : "Unable to derive smart-wallet address."
    };
  }
};

const resolveRecipient = async (
  policy: ConnectionPolicy,
  recipient: string
): Promise<Address> => {
  const normalized = recipient.trim();

  if (isAddress(normalized)) {
    return normalized;
  }

  if (normalized.toLowerCase().endsWith(".eth")) {
    const client = await createVisibleMainnetClient(policy);
    const address = await client.getEnsAddress({ name: normalized });

    if (!address) {
      throw new Error("ENS name did not resolve on the configured RPC.");
    }

    return address;
  }

  throw new Error(
    "Public smart-wallet payments currently require a 0x address or .eth name."
  );
};

export const sendSmartWalletEthPayment = async ({
  amount,
  policy,
  recipient,
  walletState
}: {
  amount: string;
  policy: ConnectionPolicy;
  recipient: string;
  walletState: WalletState;
}): Promise<SmartWalletPaymentResult> => {
  if (!policy.bundlerUrl.trim()) {
    throw new Error("Configure an ERC-4337 bundler before sending.");
  }

  const { account, client } = await createSmartAccount(policy, walletState);
  const paymasterClient = policy.paymasterUrl.trim()
    ? createPaymasterClient({
        transport: http(policy.paymasterUrl.trim())
      })
    : null;
  const bundlerClient = createBundlerClient({
    account,
    client,
    paymaster: paymasterClient ?? undefined,
    transport: http(policy.bundlerUrl.trim())
  });
  const to = await resolveRecipient(policy, recipient);
  const userOperationHash = await bundlerClient.sendUserOperation({
    account,
    calls: [
      {
        to,
        value: parseEther(amount.trim())
      }
    ]
  });
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOperationHash
  });

  return {
    userOperationHash,
    transactionHash: receipt.receipt.transactionHash
  };
};

export const sendSmartWalletCalls = async ({
  calls,
  policy,
  walletState
}: {
  calls: SmartWalletCall[];
  policy: ConnectionPolicy;
  walletState: WalletState;
}): Promise<SmartWalletPaymentResult> => {
  if (!policy.bundlerUrl.trim()) {
    throw new Error("Configure an ERC-4337 bundler before sending.");
  }

  if (calls.length === 0) {
    throw new Error("No smart-wallet calls were prepared.");
  }

  const { account, client } = await createSmartAccount(policy, walletState);
  const paymasterClient = policy.paymasterUrl.trim()
    ? createPaymasterClient({
        transport: http(policy.paymasterUrl.trim())
      })
    : null;
  const bundlerClient = createBundlerClient({
    account,
    client,
    paymaster: paymasterClient ?? undefined,
    transport: http(policy.bundlerUrl.trim())
  });
  const userOperationHash = await bundlerClient.sendUserOperation({
    account,
    calls
  });
  const receipt = await bundlerClient.waitForUserOperationReceipt({
    hash: userOperationHash
  });

  return {
    userOperationHash,
    transactionHash: receipt.receipt.transactionHash
  };
};
