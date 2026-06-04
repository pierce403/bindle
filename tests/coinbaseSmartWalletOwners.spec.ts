import { expect, test } from "@playwright/test";
import { decodeAbiParameters, encodeAbiParameters } from "viem";
import {
  findCoinbaseOwnerIndex,
  publicKeyToCoinbaseOwnerBytes,
  splitP256OwnerPublicKey,
  withCoinbaseSignatureOwnerIndex
} from "../src/wallet/coinbaseSmartWalletOwners";

const owner0 =
  "0xc18dd9496b23664467e10015e26c0d2d39a1fca1adacfa995641a820f39c5b0ea47207155abb2204701fd125829b76659fd6d48915890c5cc9c296a07c543310" as const;
const owner1 =
  "0xdb1597da88b9ef82d7005995eb3b08d9a5852348f375cafcdf6a09cabf7fbc31a8d3d1358e0af4a227da67089cfa0880b46333715407e3a22f83c02838d552a0" as const;
const owner2 =
  "0x73ba277443a7e034a6d37a42dc0ec9406204a155e329143d9a91a682dd027f8ba8823afde054fe6cf54668f653c05a410bbee1eabd0674d668cd86d1ed81cdaf" as const;

const wrappedSignatureAbi = [
  {
    components: [
      { name: "ownerIndex", type: "uint8" },
      { name: "signatureData", type: "bytes" }
    ],
    type: "tuple"
  }
] as const;

test("normalizes raw and uncompressed P-256 public keys to Coinbase owner bytes", () => {
  expect(publicKeyToCoinbaseOwnerBytes(owner2)).toBe(owner2);
  expect(publicKeyToCoinbaseOwnerBytes(`0x04${owner2.slice(2)}`)).toBe(owner2);

  const [x, y] = splitP256OwnerPublicKey(owner2);

  expect(x).toBe(`0x${owner2.slice(2, 66)}`);
  expect(y).toBe(`0x${owner2.slice(66)}`);
});

test("finds the matching Coinbase owner index for migrated passkeys", () => {
  expect(
    findCoinbaseOwnerIndex({
      owners: [owner0, owner1, owner2],
      publicKey: owner2
    })
  ).toBe(2);
  expect(
    findCoinbaseOwnerIndex({
      owners: [owner0, owner1],
      publicKey: owner2
    })
  ).toBeNull();
});

test("rewrites wrapped Coinbase Smart Wallet signatures to the selected owner index", () => {
  const signature = encodeAbiParameters(wrappedSignatureAbi, [
    {
      ownerIndex: 0,
      signatureData: "0x1234"
    }
  ]);
  const rewritten = withCoinbaseSignatureOwnerIndex({
    ownerIndex: 2,
    signature
  });
  const [decoded] = decodeAbiParameters(wrappedSignatureAbi, rewritten);

  expect(decoded.ownerIndex).toBe(2);
  expect(decoded.signatureData).toBe("0x1234");
});
