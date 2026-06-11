import { getAddress, http, isAddress, parseEther, formatEther, type Address } from "viem";
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
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";
import {
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

const smartAccountDeploymentProbeAddress = getAddress(
  "0x000000000000000000000000000000000000dEaD"
) as Address;

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
    "Recipient must be a valid 0x address or .eth name."
  );
};

const simulateAndSendUserOperation = async ({
  bundlerClient,
  account,
  client,
  calls,
  origin
}: {
  bundlerClient: any;
  account: any;
  client: any;
  calls: any[];
  origin: TxOrigin;
}): Promise<`0x${string}`> => {
  const decodedList = calls.map((c, i) => {
    const selector = c.data && c.data.length >= 10 ? c.data.slice(0, 10) : "0x";
    return `[Call ${i}: target=${c.to}, selector=${selector}]`;
  }).join(", ");

  if (origin === "railgun-private") {
    console.error("Preflight decoder: railgun-private flow produced smart-account calldata!");
    console.error("- tx origin:", origin);
    console.error("- submitter: waku-railgun-broadcaster (attempted to wrap into public smart wallet)");
    console.error("- submission mode: railgun-waku-broadcaster (attempted to wrap into public smart wallet)");
    console.error("- smart account sender:", account.address);
    const targetsCoinbase = calls.some(c => c.to.toLowerCase() === account.address.toLowerCase());
    console.error("- whether calldata targets Coinbase Smart Wallet:", targetsCoinbase);
    
    const decodedCalls = await Promise.all(calls.map(async (c, i) => {
      const selector = c.data && c.data.length >= 10 ? c.data.slice(0, 10) : "0x";
      let detail = `call ${i}: target=${c.to}, selector=${selector}, dataLength=${(c.data || "").length} bytes`;
      if (c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && selector === "0x2e1a7d4d") {
        const wad = BigInt("0x" + ((c.data || "").slice(10, 74) || "0"));
        detail += ` (WETH.withdraw: amount=${formatEther(wad)} ETH)`;
      }
      return detail;
    }));
    console.error("- decoded call targets/selectors:\n", decodedCalls.join("\n"));
    
    const wethWithdraws = calls.filter(c => c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && c.data.startsWith("0x2e1a7d4d"));
    console.error("- any WETH.withdraw tail-calls:", wethWithdraws.length > 0);
    if (wethWithdraws.length > 0) {
      const firstWethAmount = BigInt("0x" + (wethWithdraws[0].data.slice(10, 74) || "0"));
      console.error("- amount of any WETH.withdraw:", formatEther(firstWethAmount), "ETH");
      
      const wethBalance = await client.readContract({
        address: UNISWAP_V4_WETH_ADDRESS,
        abi: [{
          name: "balanceOf",
          type: "function",
          inputs: [{ name: "owner", type: "address" }],
          outputs: [{ name: "balance", type: "uint256" }]
        }],
        functionName: "balanceOf",
        args: [account.address]
      }).catch(() => 0n);
      console.error("- whether public smart wallet has enough WETH:", wethBalance >= firstWethAmount, `(balance=${formatEther(wethBalance)} ETH, required=${formatEther(firstWethAmount)} ETH)`);
    } else {
      console.error("- amount of any WETH.withdraw: N/A");
      console.error("- whether public smart wallet has enough WETH: N/A");
    }
    
    throw new Error("Private Pay cannot be submitted through the public smart wallet.");
  }

  let preparedUserOp: any;
  try {
    preparedUserOp = await bundlerClient.prepareUserOperation({
      account,
      calls
    });
  } catch (simError: any) {
    const errStr = String(simError.message || simError);
    if (errStr.toLowerCase().includes("revert")) {
      const wethWithdraws = calls.filter(c => c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && c.data.startsWith("0x2e1a7d4d"));
      if (wethWithdraws.length > 0) {
        const firstWethAmount = BigInt("0x" + (wethWithdraws[0].data.slice(10, 74) || "0"));
        throw new Error(`The public smart-wallet batch reverted without a reason. Decoded calls: ${decodedList}. The likely failing call is WETH.withdraw(${firstWethAmount.toString()}) from the smart wallet, which requires the smart wallet to already hold WETH.`);
      }
      throw new Error(`The public smart-wallet batch reverted without a reason. Decoded calls: ${decodedList}.`);
    }
    throw new Error(`UserOperation gas estimation/simulation failed: ${simError.message}. Decoded calls: ${decodedList}`);
  }

  const callGasLimit = BigInt(preparedUserOp.callGasLimit || 0n);
  const verificationGasLimit = BigInt(preparedUserOp.verificationGasLimit || 0n);
  const preVerificationGas = BigInt(preparedUserOp.preVerificationGas || 0n);
  
  console.log(`[Simulation] Estimated UserOperation limits: callGasLimit=${callGasLimit.toString()}, verificationGasLimit=${verificationGasLimit.toString()}, preVerificationGas=${preVerificationGas.toString()}`);
  
  if (callGasLimit === 0n || preVerificationGas === 0n) {
    throw new Error(`Estimated gas limit is zero: callGasLimit=${callGasLimit.toString()}, preVerificationGas=${preVerificationGas.toString()}`);
  }

  try {
    return await bundlerClient.sendUserOperation({
      account,
      calls,
      callGasLimit: preparedUserOp.callGasLimit,
      verificationGasLimit: preparedUserOp.verificationGasLimit,
      preVerificationGas: preparedUserOp.preVerificationGas,
      maxFeePerGas: preparedUserOp.maxFeePerGas,
      maxPriorityFeePerGas: preparedUserOp.maxPriorityFeePerGas,
      nonce: preparedUserOp.nonce,
      initCode: preparedUserOp.initCode,
      paymasterAndData: preparedUserOp.paymasterAndData
    });
  } catch (error: any) {
    const errStr = String(error.message || error);
    if (errStr.includes("0x") || errStr.toLowerCase().includes("revert")) {
      const wethWithdraws = calls.filter(c => c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && c.data.startsWith("0x2e1a7d4d"));
      if (wethWithdraws.length > 0) {
        const firstWethAmount = BigInt("0x" + (wethWithdraws[0].data.slice(10, 74) || "0"));
        throw new Error(`The public smart-wallet batch reverted without a reason. Decoded calls: ${decodedList}. The likely failing call is WETH.withdraw(${firstWethAmount.toString()}) from the smart wallet, which requires the smart wallet to already hold WETH.`);
      }
      throw new Error(`The public smart-wallet batch reverted without a reason. Decoded calls: ${decodedList}.`);
    }
    throw error;
  }
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
        const value = parseEther(amount.trim());
        const balance = await client.getBalance({ address: account.address });

        if (balance < value) {
          throw new Error(
            `Insufficient smart wallet balance. Your smart wallet has ${formatEther(balance)} ETH, but you tried to send ${amount} ETH (and additional ETH is required for gas).`
          );
        }

        if (balance === 0n && !policy.paymasterUrl.trim()) {
          throw new Error(
            `Your smart wallet has 0 ETH. You must deposit some ETH to cover transaction gas fees, or configure a sponsored paymaster.`
          );
        }

        const userOperationHash = await simulateAndSendUserOperation({
          bundlerClient,
          account,
          client,
          calls: [
            {
              to,
              value,
              data: "0x"
            }
          ],
          origin: "public-smart-wallet"
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

export const deploySmartWalletAccount = async ({
  policy,
  walletState
}: {
  policy: ConnectionPolicy;
  walletState: WalletState;
}): Promise<SmartWalletPaymentResult> => {
  try {
    if (!policy.bundlerUrl.trim()) {
      throw new Error("Configure an ERC-4337 bundler before deployment.");
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
        const balance = await client.getBalance({ address: account.address });

        if (balance === 0n && !policy.paymasterUrl.trim()) {
          throw new Error(
            `Your smart wallet has 0 ETH. You must deposit some ETH to cover transaction gas fees, or configure a sponsored paymaster.`
          );
        }

        const userOperationHash = await simulateAndSendUserOperation({
          bundlerClient,
          account,
          client,
          calls: [
            {
              to: smartAccountDeploymentProbeAddress,
              value: 0n,
              data: "0x"
            }
          ],
          origin: "public-smart-wallet"
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
    void origin;
    if (!policy.bundlerUrl.trim()) {
      throw new Error("Configure an ERC-4337 bundler before sending.");
    }

    if (origin === "railgun-private") {
      const accounts = await createSmartAccountCandidates(policy, walletState).catch(() => []);
      const senderAddress = accounts[0]?.account?.address ?? "unknown-sender";
      const client = accounts[0]?.client;

      console.error("Preflight decoder: railgun-private flow produced smart-account calldata!");
      console.error("- tx origin:", origin);
      console.error("- submitter: waku-railgun-broadcaster (attempted to wrap into public smart wallet)");
      console.error("- submission mode: railgun-waku-broadcaster (attempted to wrap into public smart wallet)");
      console.error("- smart account sender:", senderAddress);
      const targetsCoinbase = calls.some(c => c.to.toLowerCase() === senderAddress.toLowerCase());
      console.error("- whether calldata targets Coinbase Smart Wallet:", targetsCoinbase);
      
      const decodedCalls = await Promise.all(calls.map(async (c, i) => {
        const selector = c.data && c.data.length >= 10 ? c.data.slice(0, 10) : "0x";
        let detail = `call ${i}: target=${c.to}, selector=${selector}, dataLength=${(c.data || "").length} bytes`;
        if (c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && selector === "0x2e1a7d4d") {
          const wad = BigInt("0x" + ((c.data || "").slice(10, 74) || "0"));
          detail += ` (WETH.withdraw: amount=${formatEther(wad)} ETH)`;
        }
        return detail;
      }));
      console.error("- decoded call targets/selectors:\n", decodedCalls.join("\n"));
      
      const wethWithdraws = calls.filter(c => c.to.toLowerCase() === UNISWAP_V4_WETH_ADDRESS.toLowerCase() && c.data && c.data.startsWith("0x2e1a7d4d"));
      console.error("- any WETH.withdraw tail-calls:", wethWithdraws.length > 0);
      if (wethWithdraws.length > 0) {
        const firstWethAmount = BigInt("0x" + ((wethWithdraws[0]?.data || "").slice(10, 74) || "0"));
        console.error("- amount of any WETH.withdraw:", formatEther(firstWethAmount), "ETH");
        
        let wethBalance = 0n;
        if (client && senderAddress.startsWith("0x")) {
          wethBalance = (await client.readContract({
            address: UNISWAP_V4_WETH_ADDRESS,
            abi: [{
              name: "balanceOf",
              type: "function",
              inputs: [{ name: "owner", type: "address" }],
              outputs: [{ name: "balance", type: "uint256" }]
            }],
            functionName: "balanceOf",
            args: [senderAddress as Address]
          }).catch(() => 0n)) as bigint;
        }
        console.error("- whether public smart wallet has enough WETH:", wethBalance >= firstWethAmount, `(balance=${formatEther(wethBalance)} ETH, required=${formatEther(firstWethAmount)} ETH)`);
      } else {
        console.error("- amount of any WETH.withdraw: N/A");
        console.error("- whether public smart wallet has enough WETH: N/A");
      }
      
      throw new Error("Private Pay cannot be submitted through the public smart wallet.");
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
        const totalValue = calls.reduce((acc, call) => acc + BigInt(call.value || 0n), 0n);
        const balance = await client.getBalance({ address: account.address });

        if (balance < totalValue) {
          throw new Error(
            `Insufficient smart wallet balance. Your smart wallet has ${formatEther(balance)} ETH, but the transaction requires at least ${formatEther(totalValue)} ETH.`
          );
        }

        if (balance === 0n && !policy.paymasterUrl.trim()) {
          throw new Error(
            `Your smart wallet has 0 ETH. You must deposit some ETH to cover transaction gas fees, or configure a sponsored paymaster.`
          );
        }

        const userOperationHash = await simulateAndSendUserOperation({
          bundlerClient,
          account,
          client,
          calls,
          origin
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
