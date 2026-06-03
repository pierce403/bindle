import { HDNodeWallet, Mnemonic } from "ethers";

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuSignerModule = Pick<
  KohakuRailgunTypes,
  "RailgunSigner" | "initLogging"
> & {
  default: () => Promise<unknown>;
};

type EncryptedRailgunWalletRecord = {
  id: "primary";
  version: 1;
  railgunAddress: string;
  keyIndex: number;
  chainId: string;
  createdAt: string;
  updatedAt: string;
  source: "created" | "imported";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  cipher: "AES-GCM";
  salt: string;
  iv: string;
  ciphertext: string;
};

type RailgunSecretPayload = {
  version: 1;
  recoveryPhrase: string;
  keyIndex: number;
  chainId: string;
};

export type RailgunWalletResult = {
  railgunAddress: string;
  keyIndex: number;
  chainId: bigint;
  storedAt: string;
};

export type CreatedRailgunWalletResult = RailgunWalletResult & {
  recoveryPhrase: string;
};

export type UnlockedRailgunWallet = RailgunWalletResult & {
  recoveryPhrase: string;
  spendingKey: `0x${string}`;
  viewingKey: `0x${string}`;
};

const databaseName = "bindle-railgun-wallet-secrets";
const objectStoreName = "wallets";
const primaryRecordId = "primary";
const passphraseMinimumLength = 12;
const pbkdfIterations = 250_000;

let kohakuSignerModulePromise: Promise<KohakuSignerModule> | null = null;

const loadKohakuSignerModule = (): Promise<KohakuSignerModule> => {
  kohakuSignerModulePromise ??= import(
    "../../node_modules/@kohaku-eth/railgun/dist/pkg/index.js"
  ).then(async (kohaku) => {
    const signerModule = kohaku as KohakuSignerModule;
    await signerModule.default();
    signerModule.initLogging("Warn");
    return signerModule;
  });

  return kohakuSignerModulePromise;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const canUseIndexedDb = (): boolean =>
  typeof window !== "undefined" && "indexedDB" in window;

const openSecretDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is required for local RAILGUN key storage."));
      return;
    }

    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withSecretStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const database = await openSecretDatabase();

  try {
    const transaction = database.transaction(objectStoreName, mode);
    const store = transaction.objectStore(objectStoreName);
    return await run(store);
  } finally {
    database.close();
  }
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
};

const bytesToArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
};

const normalizeRecoveryPhrase = (phrase: string): string =>
  phrase.trim().replace(/\s+/g, " ").toLowerCase();

const assertPassphrase = (passphrase: string): void => {
  if (passphrase.length < passphraseMinimumLength) {
    throw new Error("Use a local passphrase with at least 12 characters.");
  }
};

const assertRecoveryPhrase = (phrase: string): void => {
  if (!Mnemonic.isValidMnemonic(phrase)) {
    throw new Error("Recovery phrase is not a valid BIP-39 mnemonic.");
  }
};

const deriveEncryptionKey = async (
  passphrase: string,
  salt: Uint8Array,
  iterations = pbkdfIterations
): Promise<CryptoKey> => {
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: bytesToArrayBuffer(salt),
      iterations
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
};

const encryptSecretPayload = async (
  payload: RailgunSecretPayload,
  passphrase: string
): Promise<Pick<EncryptedRailgunWalletRecord, "salt" | "iv" | "ciphertext">> => {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveEncryptionKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(iv) },
    key,
    bytesToArrayBuffer(new TextEncoder().encode(JSON.stringify(payload)))
  );

  return {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
};

const decryptSecretPayload = async (
  record: EncryptedRailgunWalletRecord,
  passphrase: string
): Promise<RailgunSecretPayload> => {
  const key = await deriveEncryptionKey(
    passphrase,
    base64ToBytes(record.salt),
    record.iterations
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(record.iv)) },
    key,
    bytesToArrayBuffer(base64ToBytes(record.ciphertext))
  );
  const parsed = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Stored RAILGUN wallet secret is invalid.");
  }

  const payload = parsed as Partial<RailgunSecretPayload>;

  if (
    payload.version !== 1 ||
    typeof payload.recoveryPhrase !== "string" ||
    typeof payload.keyIndex !== "number" ||
    typeof payload.chainId !== "string"
  ) {
    throw new Error("Stored RAILGUN wallet secret is invalid.");
  }

  return {
    version: 1,
    recoveryPhrase: payload.recoveryPhrase,
    keyIndex: payload.keyIndex,
    chainId: payload.chainId
  };
};

const storeEncryptedWallet = async (
  record: EncryptedRailgunWalletRecord
): Promise<void> => {
  // Storage boundary: this IndexedDB object store is the only Bindle-owned
  // place where RAILGUN recovery material may be persisted. The phrase is
  // encrypted with a user passphrase before it reaches IndexedDB. The matching
  // public 0zk address and key-store marker live in localStorage metadata.
  await withSecretStore("readwrite", async (store) => {
    await requestToPromise(store.put(record));
  });
};

const loadEncryptedWalletRecord =
  async (): Promise<EncryptedRailgunWalletRecord | null> => {
    if (!canUseIndexedDb()) {
      return null;
    }

    const record = await withSecretStore("readonly", (store) =>
      requestToPromise<EncryptedRailgunWalletRecord | undefined>(
        store.get(primaryRecordId)
      )
    );

    return record ?? null;
  };

const deriveRailgunWallet = async ({
  recoveryPhrase,
  keyIndex,
  chainId
}: {
  recoveryPhrase: string;
  keyIndex: number;
  chainId: bigint;
}): Promise<{
  railgunAddress: string;
  spendingKey: `0x${string}`;
  viewingKey: `0x${string}`;
}> => {
  const kohaku = await loadKohakuSignerModule();
  const spendingPath = kohaku.RailgunSigner.spendingKeyPath(keyIndex);
  const viewingPath = kohaku.RailgunSigner.viewingKeyPath(keyIndex);
  const spendingKey = HDNodeWallet.fromPhrase(
    recoveryPhrase,
    undefined,
    spendingPath
  ).privateKey as `0x${string}`;
  const viewingKey = HDNodeWallet.fromPhrase(
    recoveryPhrase,
    undefined,
    viewingPath
  ).privateKey as `0x${string}`;
  const signer = kohaku.RailgunSigner.privateKey(
    spendingKey,
    viewingKey,
    chainId
  );

  try {
    return {
      railgunAddress: signer.address,
      spendingKey,
      viewingKey
    };
  } finally {
    signer.free();
  }
};

const persistRailgunWallet = async ({
  recoveryPhrase,
  passphrase,
  source,
  keyIndex,
  chainId
}: {
  recoveryPhrase: string;
  passphrase: string;
  source: "created" | "imported";
  keyIndex: number;
  chainId: bigint;
}): Promise<RailgunWalletResult> => {
  assertPassphrase(passphrase);
  assertRecoveryPhrase(recoveryPhrase);

  const derived = await deriveRailgunWallet({
    recoveryPhrase,
    keyIndex,
    chainId
  });
  const now = new Date().toISOString();
  const encrypted = await encryptSecretPayload(
    {
      version: 1,
      recoveryPhrase,
      keyIndex,
      chainId: chainId.toString()
    },
    passphrase
  );

  await storeEncryptedWallet({
    id: primaryRecordId,
    version: 1,
    railgunAddress: derived.railgunAddress,
    keyIndex,
    chainId: chainId.toString(),
    createdAt: now,
    updatedAt: now,
    source,
    kdf: "PBKDF2-SHA256",
    iterations: pbkdfIterations,
    cipher: "AES-GCM",
    ...encrypted
  });

  return {
    railgunAddress: derived.railgunAddress,
    keyIndex,
    chainId,
    storedAt: now
  };
};

export const createEncryptedRailgunWallet = async ({
  passphrase,
  keyIndex = 0,
  chainId = 1n
}: {
  passphrase: string;
  keyIndex?: number;
  chainId?: bigint;
}): Promise<CreatedRailgunWalletResult> => {
  const wallet = HDNodeWallet.createRandom();
  const recoveryPhrase = normalizeRecoveryPhrase(wallet.mnemonic?.phrase ?? "");

  if (!recoveryPhrase) {
    throw new Error("Unable to generate a RAILGUN recovery phrase.");
  }

  const result = await persistRailgunWallet({
    recoveryPhrase,
    passphrase,
    source: "created",
    keyIndex,
    chainId
  });

  return {
    ...result,
    recoveryPhrase
  };
};

export const importEncryptedRailgunWallet = async ({
  recoveryPhrase,
  passphrase,
  keyIndex = 0,
  chainId = 1n
}: {
  recoveryPhrase: string;
  passphrase: string;
  keyIndex?: number;
  chainId?: bigint;
}): Promise<RailgunWalletResult> =>
  persistRailgunWallet({
    recoveryPhrase: normalizeRecoveryPhrase(recoveryPhrase),
    passphrase,
    source: "imported",
    keyIndex,
    chainId
  });

export const hasEncryptedRailgunWallet = async (): Promise<boolean> =>
  (await loadEncryptedWalletRecord()) !== null;

export const unlockEncryptedRailgunWallet = async (
  passphrase: string
): Promise<UnlockedRailgunWallet> => {
  assertPassphrase(passphrase);

  const record = await loadEncryptedWalletRecord();

  if (!record) {
    throw new Error("No encrypted RAILGUN wallet is stored locally.");
  }

  const payload = await decryptSecretPayload(record, passphrase);
  const chainId = BigInt(payload.chainId);
  const derived = await deriveRailgunWallet({
    recoveryPhrase: payload.recoveryPhrase,
    keyIndex: payload.keyIndex,
    chainId
  });

  if (derived.railgunAddress !== record.railgunAddress) {
    throw new Error("Stored RAILGUN wallet address does not match the secret.");
  }

  return {
    railgunAddress: derived.railgunAddress,
    recoveryPhrase: payload.recoveryPhrase,
    spendingKey: derived.spendingKey,
    viewingKey: derived.viewingKey,
    keyIndex: payload.keyIndex,
    chainId,
    storedAt: record.updatedAt
  };
};

export const clearEncryptedRailgunWallet = async (): Promise<void> => {
  if (!canUseIndexedDb()) {
    return;
  }

  await withSecretStore("readwrite", async (store) => {
    await requestToPromise(store.delete(primaryRecordId));
  });
};
