type IndexedDbDatabaseInfo = {
  name: string;
  version: number | null;
  stores: Array<{
    name: string;
    count: number | null;
  }>;
};

export type LocalDiagnostics = {
  createdAt: string;
  indexedDbSupported: boolean;
  indexedDbDatabasesSupported: boolean;
  indexedDb: IndexedDbDatabaseInfo[];
  localStorageKeys: string[];
};

const bindleDatabaseNames = new Set([
  "bindle-kohaku-railgun",
  "bindle-railgun-artifacts",
  "bindle-railgun-wallet-secrets",
  "bindle-railgun-engine"
]);

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openExistingDatabase = (name: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(name);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      request.transaction?.abort();
      reject(new Error(`IndexedDB ${name} did not already exist.`));
    };
  });

const inspectDatabase = async (
  name: string,
  version: number | null
): Promise<IndexedDbDatabaseInfo> => {
  const database = await openExistingDatabase(name);

  try {
    const storeNames = Array.from(database.objectStoreNames);
    const stores = await Promise.all(
      storeNames.map(async (storeName) => {
        try {
          const transaction = database.transaction(storeName, "readonly");
          const store = transaction.objectStore(storeName);
          const count = await requestToPromise(store.count());

          return { name: storeName, count };
        } catch {
          return { name: storeName, count: null };
        }
      })
    );

    return {
      name,
      version: version ?? database.version,
      stores
    };
  } finally {
    database.close();
  }
};

const listBindleDatabaseNames = async (): Promise<
  Array<{ name: string; version: number | null }>
> => {
  if (
    typeof indexedDB.databases !== "function"
  ) {
    return [];
  }

  const databases = await indexedDB.databases();

  return databases
    .filter((database) => database.name && bindleDatabaseNames.has(database.name))
    .map((database) => ({
      name: database.name as string,
      version: database.version ?? null
    }));
};

const listBindleLocalStorageKeys = (): string[] => {
  if (typeof window === "undefined" || !("localStorage" in window)) {
    return [];
  }

  return Array.from({ length: window.localStorage.length }, (_, index) =>
    window.localStorage.key(index)
  )
    .filter((key): key is string => key !== null && key.startsWith("bindle."))
    .sort();
};

export const collectLocalDiagnostics = async (): Promise<LocalDiagnostics> => {
  const indexedDbSupported =
    typeof window !== "undefined" && "indexedDB" in window;
  const indexedDbDatabasesSupported =
    indexedDbSupported && typeof indexedDB.databases === "function";
  const databaseNames = indexedDbSupported ? await listBindleDatabaseNames() : [];
  const indexedDb = indexedDbSupported
    ? await Promise.all(
        databaseNames.map((database) =>
          inspectDatabase(database.name, database.version).catch(() => ({
            name: database.name,
            version: database.version,
            stores: []
          }))
        )
      )
    : [];

  return {
    createdAt: new Date().toISOString(),
    indexedDbSupported,
    indexedDbDatabasesSupported,
    indexedDb,
    localStorageKeys: listBindleLocalStorageKeys()
  };
};

export const formatLocalDiagnostics = (
  diagnostics: LocalDiagnostics
): string => JSON.stringify(diagnostics, null, 2);
