import { getAddress, http, isAddress, parseEther, type Address } from "viem";
import {
  createBundlerClient,
  createPaymasterClient,
  toCoinbaseSmartAccount,
  toWebAuthnAccount
} from "viem/account-abstraction";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import {
  resolveCoinbaseSmartAccountOwnerIndexForPublicKey,
  withCoinbaseSignatureOwnerIndex
} from "./coinbaseSmartWalletOwners";
import { createVisibleMainnetClient } from "./mainnetClient";
import {
  createPasskeyRequestFn,
  explainPasskeyLookupError,
  getCurrentPasskeyHostname,
  isPasskeyLookupError
} from "./passkeys";
import { estimateVisibleUserOperationFees } from "./userOperationGas";
import {
  assertPublicSmartWalletOrigin,
  type TxOrigin
} from "./transactionOrigin";
import type { WalletState } from "./walletState";
import type { StoredPasskeyCredential } from "./walletState";

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
  origin?: TxOrigin;
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

type SmartAccountCredentialCandidate = StoredPasskeyCredential;

const candidateKey = ({
  id,
  publicKey,
  rpId
}: {
  id: string;
  publicKey: `0x${string}`;
  rpId: string | null;
}): string => `${id}:${publicKey.toLowerCase()}:${rpId ?? ""}`;

export const getFundingCredentialCandidates = (
  walletState: WalletState
): SmartAccountCredentialCandidate[] => {
  if (
    (!walletState.passkeyCredentialId || !walletState.passkeyPublicKey) &&
    walletState.passkeyCredentials.length === 0
  ) {
    throw new Error(
      "Create a funding passkey first. Existing legacy passkey metadata cannot derive a smart-wallet address."
    );
  }

  const activeCredential: SmartAccountCredentialCandidate | null =
    walletState.passkeyCredentialId && walletState.passkeyPublicKey
      ? {
          id: walletState.passkeyCredentialId,
          publicKey: walletState.passkeyPublicKey,
          rpId: walletState.passkeyRpId,
          authenticatorAttachment:
            walletState.passkeyAuthenticatorAttachment ?? null,
          userVerification: walletState.passkeyUserVerification ?? null,
          createdAt: walletState.createdAt,
          lastUsedAt: null
        }
      : null;
  const candidates = activeCredential
    ? [activeCredential, ...walletState.passkeyCredentials]
    : walletState.passkeyCredentials;
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = candidateKey(candidate);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
  const currentHostname = getCurrentPasskeyHostname();

  return uniqueCandidates
    .map((candidate, index) => ({ candidate, index }))
    .sort((left, right) => {
      const leftCurrent =
        currentHostname !== null && left.candidate.rpId === currentHostname;
      const rightCurrent =
        currentHostname !== null && right.candidate.rpId === currentHostname;

      if (leftCurrent !== rightCurrent) {
        return leftCurrent ? -1 : 1;
      }

      return left.index - right.index;
    })
    .map(({ candidate }) => candidate);
};

const createSmartAccount = async (
  policy: ConnectionPolicy,
  walletState: WalletState,
  credentialCandidate = getFundingCredentialCandidates(walletState)[0]
) => {
  if (!credentialCandidate) {
    throw new Error("No passkey credential metadata is available.");
  }

  const client = await createVisibleMainnetClient(policy);
  const accountAddress =
    walletState.smartWalletAddress && isAddress(walletState.smartWalletAddress)
      ? (getAddress(walletState.smartWalletAddress) as Address)
      : undefined;
  const ownerIndex = await resolveCoinbaseSmartAccountOwnerIndexForPublicKey({
    client,
    publicKey: credentialCandidate.publicKey,
    smartWalletAddress: walletState.smartWalletAddress
  });
  const owner = toWebAuthnAccount({
    credential: {
      id: credentialCandidate.id,
      publicKey: credentialCandidate.publicKey
    },
    getFn: createPasskeyRequestFn(
      credentialCandidate.authenticatorAttachment,
      credentialCandidate.userVerification
    ),
    rpId: credentialCandidate.rpId ?? undefined
  });
  const account = await toCoinbaseSmartAccount({
    address: accountAddress,
    client,
    ownerIndex,
    owners: [owner],
    version: "1.1"
  });
  const indexedAccount =
    ownerIndex === 0
      ? account
      : {
          ...account,
          getStubSignature: async () =>
            withCoinbaseSignatureOwnerIndex({
              ownerIndex,
              signature: await account.getStubSignature()
            })
        };

  return { account: indexedAccount, client, credentialCandidate, ownerIndex };
};

const createSmartAccountCandidates = async (
  policy: ConnectionPolicy,
  walletState: WalletState
) => {
  const candidates = getFundingCredentialCandidates(walletState);
  const accounts = [];
  const rejectedReasons: string[] = [];

  for (const candidate of candidates) {
    try {
      accounts.push(await createSmartAccount(policy, walletState, candidate));
    } catch (error) {
      rejectedReasons.push(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  if (accounts.length === 0) {
    throw new Error(
      rejectedReasons[0] ??
        "No saved passkey owner is usable for this smart account."
    );
  }

  return accounts;
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

export const resolvePublicRecipient = async (
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
  try {
    if (!policy.bundlerUrl.trim()) {
      throw new Error("Configure an ERC-4337 bundler before sending.");
    }

    const to = await resolvePublicRecipient(policy, recipient);
    const accounts = await createSmartAccountCandidates(policy, walletState);
    const passkeyLookupErrors: unknown[] = [];

    for (const { account, client } of accounts) {
      try {
        const paymasterClient = policy.paymasterUrl.trim()
          ? createPaymasterClient({
              transport: http(policy.paymasterUrl.trim())
            })
          : null;
        const bundlerClient = createBundlerClient({
          account,
          client,
          paymaster: paymasterClient ?? undefined,
          transport: http(policy.bundlerUrl.trim()),
          userOperation: {
            estimateFeesPerGas: () =>
              estimateVisibleUserOperationFees({
                bundlerUrl: policy.bundlerUrl,
                fallbackEstimator: client
              })
          }
        });
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
      } catch (error) {
        if (!isPasskeyLookupError(error)) {
          throw error;
        }

        passkeyLookupErrors.push(error);
      }
    }

    throw (
      passkeyLookupErrors.at(-1) ??
      new Error("No saved passkey was available for signing.")
    );
  } catch (error) {
    throw explainPasskeyLookupError(error, walletState);
  }
};

export const sendSmartWalletCalls = async ({
  calls,
  origin,
  policy,
  walletState
}: {
  calls: SmartWalletCall[];
  origin: TxOrigin;
  policy: ConnectionPolicy;
  walletState: WalletState;
}): Promise<SmartWalletPaymentResult> => {
  try {
    assertPublicSmartWalletOrigin(origin);

    if (calls.some((call) => call.origin === "railgun-private")) {
      throw new Error("Private RAILGUN calls cannot be submitted by 4337.");
    }

    if (!policy.bundlerUrl.trim()) {
      throw new Error("Configure an ERC-4337 bundler before sending.");
    }

    if (calls.length === 0) {
      throw new Error("No smart-wallet calls were prepared.");
    }

    const accounts = await createSmartAccountCandidates(policy, walletState);
    const passkeyLookupErrors: unknown[] = [];

    for (const { account, client } of accounts) {
      try {
        const paymasterClient = policy.paymasterUrl.trim()
          ? createPaymasterClient({
              transport: http(policy.paymasterUrl.trim())
            })
          : null;
        const bundlerClient = createBundlerClient({
          account,
          client,
          paymaster: paymasterClient ?? undefined,
          transport: http(policy.bundlerUrl.trim()),
          userOperation: {
            estimateFeesPerGas: () =>
              estimateVisibleUserOperationFees({
                bundlerUrl: policy.bundlerUrl,
                fallbackEstimator: client
              })
          }
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
      } catch (error) {
        if (!isPasskeyLookupError(error)) {
          throw error;
        }

        passkeyLookupErrors.push(error);
      }
    }

    throw (
      passkeyLookupErrors.at(-1) ??
      new Error("No saved passkey was available for signing.")
    );
  } catch (error) {
    throw explainPasskeyLookupError(error, walletState);
  }
};
