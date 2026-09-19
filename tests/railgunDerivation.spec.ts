import { expect, test } from "@playwright/test";
import { createHash, createHmac, createPrivateKey, createPublicKey } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { HDNodeWallet, Mnemonic } from "ethers";
import * as kohaku from "../node_modules/@kohaku-eth/railgun/dist/pkg/index.js";
import { publicTestMnemonic, railgunDerivationFixtures } from "./fixtures/railgunDerivation";
import { deriveRailgunKeys, parseRailgunDerivationVersion } from "../src/railgun/railgunDerivation";

// Test-only reference projection. Engine is transitive to the broadcaster's
// protocol wallet dependency, never imported by Bindle's wallet implementation.
// The utility has no public package subpath, so keep this exception here.
const require = createRequire(import.meta.url);
const referenceWalletRequire = createRequire(require.resolve("@railgun-community/wallet"));
const referenceEngineRoot = dirname(referenceWalletRequire.resolve("@railgun-community/engine"));
const { getPublicSpendingKey } = require(join(referenceEngineRoot, "utils/keys-utils.js")) as {
  getPublicSpendingKey: (privateKey: Uint8Array) => [bigint, bigint];
};

// An independent test-only transcription of the reference engine's hardened
// hash tree. Frozen expected values above came from the actual reference engine,
// not this helper or the Bindle implementation being tested.
const canonicalReferenceKey = (phrase: string, path: string): Buffer => {
  let node = createHmac("sha512", "babyjubjub seed")
    .update(Buffer.from(Mnemonic.fromPhrase(phrase).computeSeed().slice(2), "hex"))
    .digest();
  for (const segment of path.split("/").slice(1)) {
    const childIndex = Buffer.alloc(4);
    childIndex.writeUInt32BE(Number(segment.slice(0, -1)) + 0x80000000);
    node = createHmac("sha512", node.subarray(32))
      .update(Buffer.concat([Buffer.from([0]), node.subarray(0, 32), childIndex]))
      .digest();
  }
  return node.subarray(0, 32);
};

const publicViewingKey = (key: Buffer): string => {
  // RFC 8410 PKCS#8 wrapper for a raw Ed25519 seed; only return public material.
  const privateKey = createPrivateKey({
    key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), key]),
    type: "pkcs8",
    format: "der"
  });
  return createPublicKey(privateKey).export({ type: "spki", format: "der" })
    .subarray(-32).toString("hex");
};

test.beforeAll(async () => {
  await kohaku.default({
    module_or_path: await readFile(new URL("../node_modules/@kohaku-eth/railgun/dist/pkg/index_bg.wasm", import.meta.url))
  });
});

for (const fixture of railgunDerivationFixtures) {
  test(`pins ${fixture.derivationVersion} public wallet at index ${fixture.keyIndex}`, () => {
    const spendingPath = kohaku.RailgunSigner.spendingKeyPath(fixture.keyIndex);
    const viewingPath = kohaku.RailgunSigner.viewingKeyPath(fixture.keyIndex);
    expect(spendingPath).toBe(`m/44'/1984'/0'/0'/${fixture.keyIndex}'`);
    expect(viewingPath).toBe(`m/420'/1984'/0'/0'/${fixture.keyIndex}'`);
    const derive = (path: string) => fixture.derivationVersion === "bindle-ethers-bip32-v1"
      ? Buffer.from(HDNodeWallet.fromPhrase(publicTestMnemonic, undefined, path).privateKey.slice(2), "hex")
      : canonicalReferenceKey(publicTestMnemonic, path);
    const spendingKey = derive(spendingPath);
    const viewingKey = derive(viewingPath);
    const bindleKeys = deriveRailgunKeys({
      recoveryPhrase: publicTestMnemonic,
      keyIndex: fixture.keyIndex,
      derivationVersion: fixture.derivationVersion
    });
    expect(Buffer.from(bindleKeys.spendingKey.slice(2), "hex").equals(spendingKey)).toBe(true);
    expect(Buffer.from(bindleKeys.viewingKey.slice(2), "hex").equals(viewingKey)).toBe(true);
    // SHA-256 commitments pin each test key without serializing private keys.
    expect(createHash("sha256").update(spendingKey).digest("hex")).toBe(fixture.spendingKeySha256);
    expect(createHash("sha256").update(viewingKey).digest("hex")).toBe(fixture.viewingKeySha256);
    expect(publicViewingKey(viewingKey)).toBe(fixture.viewingPublicKey);
    expect(getPublicSpendingKey(spendingKey).map(String)).toEqual(fixture.spendingPublicKey);
    const signer = kohaku.RailgunSigner.privateKey(
      `0x${spendingKey.toString("hex")}`,
      `0x${viewingKey.toString("hex")}`,
      1n
    );
    try {
      expect(signer.address).toBe(fixture.railgunAddress);
      expect(signer.chainId).toBe(1n);
    } finally {
      signer.free();
    }
  });
}

test("historical Bindle and canonical RAILGUN accounts are never interchangeable", () => {
  for (const keyIndex of [0, 1]) {
    const historical = railgunDerivationFixtures.find(f => f.keyIndex === keyIndex && f.derivationVersion === "bindle-ethers-bip32-v1")!;
    const canonical = railgunDerivationFixtures.find(f => f.keyIndex === keyIndex && f.derivationVersion === "railgun-babyjubjub-v1")!;
    expect(historical.railgunAddress).not.toBe(canonical.railgunAddress);
    expect(historical.viewingPublicKey).not.toBe(canonical.viewingPublicKey);
    expect(historical.spendingPublicKey).not.toEqual(canonical.spendingPublicKey);
  }
});

test("only missing historical versions default and invalid indices fail closed", () => {
  expect(parseRailgunDerivationVersion(undefined)).toBe("bindle-ethers-bip32-v1");
  for (const invalidVersion of [null, "", "future-version", 1]) {
    expect(() => parseRailgunDerivationVersion(invalidVersion)).toThrow("Unsupported RAILGUN");
  }
  for (const keyIndex of [-1, 0.5, 2147483648, NaN]) {
    expect(() => deriveRailgunKeys({
      recoveryPhrase: publicTestMnemonic,
      keyIndex,
      derivationVersion: "railgun-babyjubjub-v1"
    })).toThrow("RAILGUN key index");
  }
});
