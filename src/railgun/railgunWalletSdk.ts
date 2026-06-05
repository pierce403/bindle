import {
  NETWORK_CONFIG,
  NetworkName,
  type Chain
} from "@railgun-community/shared-models";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { ensureRailgunBrowserEngine } from "./client";
import { unlockEncryptedRailgunWallet, type UnlockedRailgunWallet } from "./railgunWallet";

const databaseName = "bindle-railgun-wallet-sdk";
const objectStoreName = "settings";
const encryptionKeyRecordId = "wallet-sdk-encryption-key";

type SettingRecord = {
  id: string;
  value: string;
  createdAt: string;
};

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const canUseIndexedDb = (): boolean =>
  typeof window !== "undefined" && "indexedDB" in window;

const openSettingsDatabase = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error("IndexedDB is required for RAILGUN Wallet SDK storage."));
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

const withSettingsStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const database = await openSettingsDatabase();

  try {
    const transaction = database.transaction(objectStoreName, mode);
    const store = transaction.objectStore(objectStoreName);
    return await run(store);
  } finally {
    database.close();
  }
};

const randomEncryptionKey = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
};

const getOrCreateWalletSdkEncryptionKey = async (): Promise<string> =>
  withSettingsStore("readwrite", async (store) => {
    const existing = await requestToPromise<SettingRecord | undefined>(
      store.get(encryptionKeyRecordId)
    );

    if (existing?.value) {
      return existing.value;
    }

    // Storage boundary: the RAILGUN Wallet SDK needs a stable string
    // encryption key for its Level/IndexedDB wallet rows. Bindle stores that
    // SDK database key only in this browser-local IndexedDB settings store. It
    // is not a recovery secret and is never sent to a backend, but same-origin
    // app code can read it, so recovery remains the separately stored/exported
    // mnemonic managed by railgunWallet.ts.
    const record: SettingRecord = {
      id: encryptionKeyRecordId,
      value: randomEncryptionKey(),
      createdAt: new Date().toISOString()
    };
    await requestToPromise(store.put(record));
    return record.value;
  });

export type RailgunWalletSdkHandle = {
  walletID: string;
  encryptionKey: string;
  railgunAddress: string;
  unlockedWallet: UnlockedRailgunWallet;
  chain: Chain;
  networkName: NetworkName.Ethereum;
};

export const ensureRailgunWalletSdkWalletForLocalWallet = async ({
  policy,
  onStatus
}: {
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<RailgunWalletSdkHandle> => {
  onStatus("Unlocking local RAILGUN wallet");
  const unlockedWallet = await unlockEncryptedRailgunWallet();

  if (unlockedWallet.chainId !== 1n) {
    throw new Error(
      `Private Pay is currently wired for Ethereum mainnet, but this 0zk wallet is chain ${unlockedWallet.chainId.toString()}.`
    );
  }

  onStatus("Starting RAILGUN Wallet SDK engine");
  await ensureRailgunBrowserEngine(policy, onStatus);

  const walletSdk = await import("@railgun-community/wallet");
  const encryptionKey = await getOrCreateWalletSdkEncryptionKey();
  const networkName = NetworkName.Ethereum;
  const chain = NETWORK_CONFIG[networkName].chain;
  const creationBlockNumbers = {
    [networkName]: NETWORK_CONFIG[networkName].deploymentBlock
  };

  onStatus("Loading local 0zk wallet into RAILGUN Wallet SDK");
  const walletInfo = await walletSdk.createRailgunWallet(
    encryptionKey,
    unlockedWallet.recoveryPhrase,
    creationBlockNumbers,
    unlockedWallet.keyIndex
  );
  const fullWallet = walletSdk.fullWalletForID(walletInfo.id);
  const chainScopedAddress = fullWallet.getAddress(chain);

  if (chainScopedAddress !== unlockedWallet.railgunAddress) {
    throw new Error(
      `RAILGUN Wallet SDK derived ${chainScopedAddress}, but Bindle's local 0zk wallet is ${unlockedWallet.railgunAddress}. Pay is blocked to avoid spending from the wrong shielded account.`
    );
  }

  return {
    walletID: walletInfo.id,
    encryptionKey,
    railgunAddress: chainScopedAddress,
    unlockedWallet,
    chain,
    networkName
  };
};
