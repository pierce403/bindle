import type { Database } from "@kohaku-eth/railgun";

type StoredEntry = {
  key: string;
  value: string;
};

const storeName = "entries";

const openDatabase = (databaseName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: "key" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  databaseName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> => {
  const database = await openDatabase(databaseName);

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);
      const request = operation(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

export const createKohakuIndexedDbDatabase = (
  prefix: string,
  databaseName = "bindle-kohaku-railgun"
): Database => {
  const scopedKey = (key: string) => `${prefix}:${key}`;

  return {
    // Storage boundary: this IndexedDB database is for Kohaku RAILGUN provider
    // state only. Kohaku's type docs say provider state can include sensitive
    // synced note data, so Bindle keeps it local and never mirrors it to a
    // backend. Bindle does not store mnemonics or private keys in this adapter.
    get: async (key) => {
      const entry = await withStore<StoredEntry | undefined>(
        databaseName,
        "readonly",
        (store) => store.get(scopedKey(key))
      );

      return entry?.value ?? null;
    },
    set: async (key, value) => {
      await withStore<IDBValidKey>(
        databaseName,
        "readwrite",
        (store) => store.put({ key: scopedKey(key), value })
      );
    },
    delete: async (key) => {
      await withStore<undefined>(
        databaseName,
        "readwrite",
        (store) => store.delete(scopedKey(key))
      );
    }
  };
};
