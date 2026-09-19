import { HDNodeWallet, Mnemonic, computeHmac, concat, getBytes, toBeHex, toUtf8Bytes } from "ethers";

export type RailgunDerivationVersion =
  | "bindle-ethers-bip32-v1"
  | "railgun-babyjubjub-v1";

export const historicalRailgunDerivation: RailgunDerivationVersion = "bindle-ethers-bip32-v1";
export const canonicalRailgunDerivation: RailgunDerivationVersion = "railgun-babyjubjub-v1";

/** Missing metadata is historical Bindle, never permission to change accounts. */
export const parseRailgunDerivationVersion = (value: unknown): RailgunDerivationVersion => {
  if (value === undefined || value === historicalRailgunDerivation) {
    return historicalRailgunDerivation;
  }
  if (value === canonicalRailgunDerivation) {
    return canonicalRailgunDerivation;
  }
  throw new Error("Unsupported RAILGUN wallet derivation version. This wallet was not changed.");
};

const canonicalKeyAtPath = (recoveryPhrase: string, path: string): `0x${string}` => {
  // Reference: Railgun-Community/engine src/key-derivation/bip32.ts. Both
  // spending and viewing use the same BabyJubJub seed domain and hardened
  // hash chaining; ordinary secp256k1 BIP32 derives a DIFFERENT account.
  let node = getBytes(computeHmac("sha512", toUtf8Bytes("babyjubjub seed"), Mnemonic.fromPhrase(recoveryPhrase).computeSeed()));
  if (!/^m(\/[0-9]+')+$/.test(path)) {
    throw new Error("RAILGUN requires a fully hardened derivation path.");
  }
  for (const segment of path.split("/").slice(1)) {
    const index = Number(segment.slice(0, -1));
    if (!Number.isSafeInteger(index) || index < 0 || index >= 0x80000000) {
      throw new Error("RAILGUN derivation index is outside the hardened key range.");
    }
    node = getBytes(computeHmac("sha512", node.subarray(32), concat([
      "0x00", node.subarray(0, 32), toBeHex(index + 0x80000000, 4)
    ])));
  }
  return concat([node.subarray(0, 32)]) as `0x${string}`;
};

export const deriveRailgunKeys = ({
  recoveryPhrase,
  keyIndex,
  derivationVersion
}: {
  recoveryPhrase: string;
  keyIndex: number;
  derivationVersion: RailgunDerivationVersion;
}): { spendingKey: `0x${string}`; viewingKey: `0x${string}` } => {
  if (!Number.isSafeInteger(keyIndex) || keyIndex < 0 || keyIndex >= 0x80000000) {
    throw new Error("RAILGUN key index must be an integer from 0 to 2147483647.");
  }
  const version = parseRailgunDerivationVersion(derivationVersion);
  const derive = (path: string): `0x${string}` => version === canonicalRailgunDerivation
    ? canonicalKeyAtPath(recoveryPhrase, path)
    : HDNodeWallet.fromPhrase(recoveryPhrase, undefined, path).privateKey as `0x${string}`;
  return {
    spendingKey: derive(`m/44'/1984'/0'/0'/${keyIndex}'`),
    viewingKey: derive(`m/420'/1984'/0'/0'/${keyIndex}'`)
  };
};
