import { HDNodeWallet, Mnemonic } from "ethers";
import { loadKohakuRailgunBrowserModule } from "./kohakuRailgunModule";

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuSignerModule = Pick<
  KohakuRailgunTypes,
  "RailgunSigner"
>;

type BrowserLocalRailgunWalletRecord = {
  id: "primary";
  version: 2;
  railgunAddress: string;
  derivationProvider?:
    | RailgunWalletDerivationProvider
    | "kohaku-railgun-alpha"
    | "railgun-wallet-sdk"
    | "railgun-wallet-sdk-legacy";
  keyIndex: number;
  chainId: string;
  createdAt: string;
  updatedAt: string;
  source: "created" | "imported";
  keyStorage: "browser-local";
  cipher: "AES-GCM";
  iv: string;
  ciphertext: string;
  wrappingKey: CryptoKey;
};

type LegacyPassphraseRailgunWalletRecord = {
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

type EncryptedRailgunWalletRecord =
  | BrowserLocalRailgunWalletRecord
  | LegacyPassphraseRailgunWalletRecord;

type RailgunSecretPayload = {
  version: 1;
  recoveryPhrase: string;
  keyIndex: number;
  chainId: string;
};

export type RailgunWalletDerivationProvider =
  | "kohaku-railgun"
  | "legacy-noncanonical";

export type RailgunWalletResult = {
  railgunAddress: string;
  derivationProvider: RailgunWalletDerivationProvider;
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
  kohakuRailgunAddress: string;
};

export type ExportedRailgunWallet = {
  railgunAddress: string;
  derivationProvider: RailgunWalletDerivationProvider;
  recoveryPhrase: string;
  keyIndex: number;
  chainId: string;
  exportedFrom: "browser-local";
};

const databaseName = "bindle-railgun-wallet-secrets";
const objectStoreName = "wallets";
const primaryRecordId = "primary";

let kohakuSignerModulePromise: Promise<KohakuSignerModule> | null = null;

const loadKohakuSignerModule = (): Promise<KohakuSignerModule> => {
  kohakuSignerModulePromise ??= loadKohakuRailgunBrowserModule({
    logLevel: "Warn"
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

export const normalizeRecoveryPhrase = (phrase: string): string =>
  phrase.trim().replace(/\s+/g, " ").toLowerCase();

export const assertRecoveryPhrase = (phrase: string): void => {
  if (!Mnemonic.isValidMnemonic(phrase)) {
    throw new Error("Recovery phrase is not a valid BIP-39 mnemonic.");
  }
};

const createBrowserLocalEncryptionKey = (): Promise<CryptoKey> =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt"
  ]);

const encryptSecretPayload = async (
  payload: RailgunSecretPayload
): Promise<
  Pick<BrowserLocalRailgunWalletRecord, "iv" | "ciphertext" | "wrappingKey">
> => {
  const wrappingKey = await createBrowserLocalEncryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(iv) },
    wrappingKey,
    bytesToArrayBuffer(new TextEncoder().encode(JSON.stringify(payload)))
  );

  return {
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext)),
    wrappingKey
  };
};

const decryptSecretPayload = async (
  record: EncryptedRailgunWalletRecord
): Promise<RailgunSecretPayload> => {
  if (record.version !== 2) {
    throw new Error(
      "This shielded wallet was stored by an older password-protected build. Reset local wallet state or import the recovery phrase again."
    );
  }

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bytesToArrayBuffer(base64ToBytes(record.iv)) },
    record.wrappingKey,
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
  record: BrowserLocalRailgunWalletRecord
): Promise<void> => {
  // Storage boundary: this IndexedDB object store is the only Bindle-owned
  // place where RAILGUN recovery material may be persisted. The recovery phrase
  // is encrypted with a non-extractable browser-local WebCrypto key before it
  // reaches IndexedDB. This is not a defense against compromised browsers,
  // extensions, or same-origin app code; passkey-backed wrapping belongs at a
  // later layer. The matching public 0zk address and key-store marker live in
  // localStorage metadata.
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

const derivationProviderForRecord = (
  record: EncryptedRailgunWalletRecord
): RailgunWalletDerivationProvider => {
  if (record.version !== 2) {
    return "kohaku-railgun";
  }

  if (
    record.derivationProvider === "kohaku-railgun" ||
    record.derivationProvider === "kohaku-railgun-alpha"
  ) {
    return "kohaku-railgun";
  }

  if (
    record.derivationProvider === "railgun-wallet-sdk" ||
    record.derivationProvider === "railgun-wallet-sdk-legacy" ||
    record.derivationProvider === "legacy-noncanonical"
  ) {
    return "legacy-noncanonical";
  }

  return "kohaku-railgun";
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
  source,
  keyIndex,
  chainId
}: {
  recoveryPhrase: string;
  source: "created" | "imported";
  keyIndex: number;
  chainId: bigint;
}): Promise<RailgunWalletResult> => {
  assertRecoveryPhrase(recoveryPhrase);

  const derived = await deriveRailgunWallet({
    recoveryPhrase,
    keyIndex,
    chainId
  });
  const railgunAddress = derived.railgunAddress;
  const derivationProvider: RailgunWalletDerivationProvider = "kohaku-railgun";

  const now = new Date().toISOString();
  const encrypted = await encryptSecretPayload({
    version: 1,
    recoveryPhrase,
    keyIndex,
    chainId: chainId.toString()
  });

  await storeEncryptedWallet({
    id: primaryRecordId,
    version: 2,
    railgunAddress,
    derivationProvider,
    keyIndex,
    chainId: chainId.toString(),
    createdAt: now,
    updatedAt: now,
    source,
    keyStorage: "browser-local",
    cipher: "AES-GCM",
    ...encrypted
  });

  return {
    railgunAddress,
    derivationProvider,
    keyIndex,
    chainId,
    storedAt: now
  };
};

export const createEncryptedRailgunWallet = async ({
  keyIndex = 0,
  chainId = 1n
}: {
  keyIndex?: number;
  chainId?: bigint;
} = {}): Promise<CreatedRailgunWalletResult> => {
  const wallet = HDNodeWallet.createRandom();
  const recoveryPhrase = normalizeRecoveryPhrase(wallet.mnemonic?.phrase ?? "");

  if (!recoveryPhrase) {
    throw new Error("Unable to generate a RAILGUN recovery phrase.");
  }

  const result = await persistRailgunWallet({
    recoveryPhrase,
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
  keyIndex = 0,
  chainId = 1n
}: {
  recoveryPhrase: string;
  keyIndex?: number;
  chainId?: bigint;
}): Promise<RailgunWalletResult> =>
  persistRailgunWallet({
    recoveryPhrase: normalizeRecoveryPhrase(recoveryPhrase),
    source: "imported",
    keyIndex,
    chainId
  });

export const hasEncryptedRailgunWallet = async (): Promise<boolean> =>
  (await loadEncryptedWalletRecord()) !== null;

export const getEncryptedRailgunWalletStorageMode = async (): Promise<
  "browser-local" | "legacy-passphrase" | "missing"
> => {
  const record = await loadEncryptedWalletRecord();

  if (!record) {
    return "missing";
  }

  return record.version === 2 ? "browser-local" : "legacy-passphrase";
};

export const unlockEncryptedRailgunWallet =
  async (): Promise<UnlockedRailgunWallet> => {
    const record = await loadEncryptedWalletRecord();

    if (!record) {
      throw new Error("No encrypted RAILGUN wallet is stored locally.");
    }

    const payload = await decryptSecretPayload(record);
    const chainId = BigInt(payload.chainId);
    const derivationProvider = derivationProviderForRecord(record);
    const derived = await deriveRailgunWallet({
      recoveryPhrase: payload.recoveryPhrase,
      keyIndex: payload.keyIndex,
      chainId
    });

    if (
      derivationProvider === "kohaku-railgun" &&
      derived.railgunAddress !== record.railgunAddress
    ) {
      throw new Error("Stored RAILGUN wallet address does not match the secret.");
    }

    return {
      railgunAddress: record.railgunAddress,
      derivationProvider,
      recoveryPhrase: payload.recoveryPhrase,
      spendingKey: derived.spendingKey,
      viewingKey: derived.viewingKey,
      kohakuRailgunAddress: derived.railgunAddress,
      keyIndex: payload.keyIndex,
      chainId,
      storedAt: record.updatedAt
    };
  };

export const exportEncryptedRailgunWallet =
  async (): Promise<ExportedRailgunWallet | null> => {
    const record = await loadEncryptedWalletRecord();

    if (!record) {
      return null;
    }

    const unlocked = await unlockEncryptedRailgunWallet();

    return {
      railgunAddress: unlocked.railgunAddress,
      derivationProvider: unlocked.derivationProvider,
      recoveryPhrase: unlocked.recoveryPhrase,
      keyIndex: unlocked.keyIndex,
      chainId: unlocked.chainId.toString(),
      exportedFrom: "browser-local"
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
