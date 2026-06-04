import {
  decodeAbiParameters,
  encodeAbiParameters,
  getAddress,
  isAddress,
  parseAbi,
  type Address,
  type Hex
} from "viem";
import type { createVisibleMainnetClient } from "./mainnetClient";
import type { WalletState } from "./walletState";

type VisibleMainnetClient = Awaited<ReturnType<typeof createVisibleMainnetClient>>;

const coinbaseSmartAccountOwnerAbi = parseAbi([
  "function isOwnerPublicKey(bytes32 x, bytes32 y) view returns (bool)",
  "function nextOwnerIndex() view returns (uint256)",
  "function ownerAtIndex(uint256 index) view returns (bytes)"
]);

const wrappedSignatureAbi = [
  {
    components: [
      { name: "ownerIndex", type: "uint8" },
      { name: "signatureData", type: "bytes" }
    ],
    type: "tuple"
  }
] as const;

const normalizeHex = (value: string): string => value.toLowerCase();

export const publicKeyToCoinbaseOwnerBytes = (
  publicKey: `0x${string}`
): Hex => {
  const hex = publicKey.slice(2);
  const withoutUncompressedPrefix =
    hex.length === 130 && hex.startsWith("04") ? hex.slice(2) : hex;

  if (withoutUncompressedPrefix.length !== 128) {
    throw new Error(
      "Passkey public key is not a 64-byte P-256 owner key."
    );
  }

  return `0x${withoutUncompressedPrefix}` as Hex;
};

export const splitP256OwnerPublicKey = (
  publicKey: `0x${string}`
): readonly [Hex, Hex] => {
  const ownerBytes = publicKeyToCoinbaseOwnerBytes(publicKey).slice(2);

  return [
    `0x${ownerBytes.slice(0, 64)}` as Hex,
    `0x${ownerBytes.slice(64, 128)}` as Hex
  ];
};

export const findCoinbaseOwnerIndex = ({
  owners,
  publicKey
}: {
  owners: readonly Hex[];
  publicKey: `0x${string}`;
}): number | null => {
  const ownerBytes = normalizeHex(publicKeyToCoinbaseOwnerBytes(publicKey));
  const index = owners.findIndex((owner) => normalizeHex(owner) === ownerBytes);

  return index === -1 ? null : index;
};

export const withCoinbaseSignatureOwnerIndex = ({
  ownerIndex,
  signature
}: {
  ownerIndex: number;
  signature: Hex;
}): Hex => {
  const [decoded] = decodeAbiParameters(wrappedSignatureAbi, signature);

  return encodeAbiParameters(wrappedSignatureAbi, [
    {
      ownerIndex,
      signatureData: decoded.signatureData
    }
  ]);
};

export const resolveCoinbaseSmartAccountOwnerIndex = async (
  client: VisibleMainnetClient,
  walletState: WalletState
): Promise<number> => {
  if (!walletState.passkeyPublicKey || !walletState.smartWalletAddress) {
    return 0;
  }

  if (!isAddress(walletState.smartWalletAddress)) {
    return 0;
  }

  const address = getAddress(walletState.smartWalletAddress) as Address;
  const code = await client.getCode({ address });

  if (!code || code === "0x") {
    return 0;
  }

  const [x, y] = splitP256OwnerPublicKey(walletState.passkeyPublicKey);
  const isOwner = await client.readContract({
    address,
    abi: coinbaseSmartAccountOwnerAbi,
    functionName: "isOwnerPublicKey",
    args: [x, y]
  });

  if (!isOwner) {
    throw new Error(
      "The imported passkey public key is not an owner of the deployed smart account. Re-run migration or import the migrated account JSON from the device that added the passkey."
    );
  }

  const nextOwnerIndex = await client.readContract({
    address,
    abi: coinbaseSmartAccountOwnerAbi,
    functionName: "nextOwnerIndex"
  });

  if (nextOwnerIndex > 255n) {
    throw new Error(
      "Smart account has more owner slots than the current Coinbase Smart Wallet signature format can select."
    );
  }

  const owners: Hex[] = [];

  for (let index = 0n; index < nextOwnerIndex; index += 1n) {
    try {
      owners.push(
        await client.readContract({
          address,
          abi: coinbaseSmartAccountOwnerAbi,
          functionName: "ownerAtIndex",
          args: [index]
        })
      );
    } catch {
      owners.push("0x");
    }
  }

  const ownerIndex = findCoinbaseOwnerIndex({
    owners,
    publicKey: walletState.passkeyPublicKey
  });

  if (ownerIndex === null) {
    throw new Error(
      "The passkey is registered as a smart-account owner, but Bindle could not resolve its owner index."
    );
  }

  return ownerIndex;
};
