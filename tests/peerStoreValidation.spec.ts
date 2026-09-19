import { expect, test } from "@playwright/test";
import { readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const installedPeerStorePath = () => {
  const broadcaster = realpathSync("node_modules/@railgun-community/waku-broadcaster-client-web");
  const sdk = realpathSync(resolve(broadcaster, "../../@waku/sdk"));
  const libp2p = realpathSync(resolve(sdk, "../../libp2p"));
  return realpathSync(resolve(libp2p, "../@libp2p/peer-store"));
};

// Defensive branch tests against the installed implementation. Decoding and
// certification return local stubs; no signed wire records are constructed.
const withDecodedRecords = async (
  check: (fixture: {
    store: { consumePeerRecord(bytes: Uint8Array, options?: unknown): Promise<boolean> };
    signer: unknown;
    chooseSubject: (matches: boolean) => void;
    reads: unknown[];
    writes: unknown[];
  }) => Promise<void>
) => {
  const packagePath = installedPeerStorePath();
  const installedSource = readFileSync(resolve(packagePath, "dist/src/index.js"), "utf8");
  expect(installedSource).toContain("if (!peerRecord.peerId.equals(peerId))");
  const { persistentPeerStore } = await import(pathToFileURL(resolve(packagePath, "dist/src/index.js")).href);
  const { RecordEnvelope, PeerRecord } = await import(pathToFileURL(resolve(packagePath, "../peer-record/dist/src/index.js")).href);
  const { peerIdFromString } = await import(pathToFileURL(resolve(packagePath, "../peer-id/dist/src/index.js")).href);
  const signer = peerIdFromString("16Uiu2HAmMkCL9Y4R6V8eyTfHRfPA9JUBSnsJXwiUvgUJHU7N9AsR");
  const differentSubject = peerIdFromString("16Uiu2HAmS8YbNhE1rJGBQ3VaubZjM1iAR7zVvtLf6CrEB3Hc9Krr");
  let subject = signer;
  const originalCertify = RecordEnvelope.openAndCertify;
  const originalDecode = PeerRecord.createFromProtobuf;
  const reads: unknown[] = [];
  const writes: unknown[] = [];
  const store = persistentPeerStore({
    peerId: signer, datastore: {}, events: {},
    logger: { forComponent: () => () => undefined }
  });
  store.get = async (peer: unknown) => { reads.push(peer); return undefined; };
  store.patch = async (peer: unknown) => { writes.push(peer); };
  RecordEnvelope.openAndCertify = async () => ({ publicKey: { toCID: () => signer.toCID() }, payload: new Uint8Array() });
  PeerRecord.createFromProtobuf = () => ({ peerId: subject, multiaddrs: [], seqNumber: 1n });
  try {
    await check({ store, signer, chooseSubject: matches => { subject = matches ? signer : differentSubject; }, reads, writes });
  } finally {
    RecordEnvelope.openAndCertify = originalCertify;
    PeerRecord.createFromProtobuf = originalDecode;
  }
};

test("installed peer-store rejects unequal decoded signer and subject before reading or writing", async () => {
  await withDecodedRecords(async ({ store, chooseSubject, reads, writes }) => {
    chooseSubject(false);
    expect(await store.consumePeerRecord(new Uint8Array())).toBe(false);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });
});

test("expected signer does not bypass the decoded subject identity check", async () => {
  await withDecodedRecords(async ({ store, signer, chooseSubject, reads, writes }) => {
    chooseSubject(false);
    expect(await store.consumePeerRecord(new Uint8Array(), { expectedPeer: signer })).toBe(false);
    expect(reads).toEqual([]);
    expect(writes).toEqual([]);
  });
});

test("equal decoded signer and subject retain the existing store path", async () => {
  await withDecodedRecords(async ({ store, signer, reads, writes }) => {
    expect(await store.consumePeerRecord(new Uint8Array(), { expectedPeer: signer })).toBe(true);
    expect(reads).toHaveLength(1);
    expect(writes).toHaveLength(1);
    expect(String(reads[0])).toBe(String(signer));
    expect(String(writes[0])).toBe(String(signer));
  });
});
