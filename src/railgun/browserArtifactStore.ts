type ArtifactStoreConstructor = new (
  getFile: (path: string) => Promise<string | Uint8Array>,
  storeFile: (
    dir: string,
    path: string,
    item: string | Uint8Array
  ) => Promise<void>,
  fileExists: (path: string) => Promise<boolean>
) => unknown;

type ArtifactRecord = {
  path: string;
  item: string | Uint8Array;
};

const objectStoreName = "artifacts";

const requestToPromise = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const openArtifactDatabase = (databaseName: string): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(objectStoreName)) {
        database.createObjectStore(objectStoreName, { keyPath: "path" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withArtifactStore = async <T>(
  databaseName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const database = await openArtifactDatabase(databaseName);

  try {
    const transaction = database.transaction(objectStoreName, mode);
    const store = transaction.objectStore(objectStoreName);
    return await run(store);
  } finally {
    database.close();
  }
};

export const createBrowserArtifactStore = (
  ArtifactStore: ArtifactStoreConstructor,
  databaseName = "bindle-railgun-artifacts"
): unknown => {
  const getFile = async (path: string): Promise<string | Uint8Array> => {
    const record = await withArtifactStore(databaseName, "readonly", (store) =>
      requestToPromise<ArtifactRecord | undefined>(store.get(path))
    );

    if (!record) {
      throw new Error(`Missing Railgun artifact: ${path}`);
    }

    return record.item;
  };

  const storeFile = async (
    _dir: string,
    path: string,
    item: string | Uint8Array
  ): Promise<void> => {
    await withArtifactStore(databaseName, "readwrite", async (store) => {
      await requestToPromise(store.put({ path, item }));
    });
  };

  const fileExists = async (path: string): Promise<boolean> => {
    const key = await withArtifactStore(databaseName, "readonly", (store) =>
      requestToPromise<IDBValidKey | undefined>(store.getKey(path))
    );

    return key !== undefined;
  };

  return new ArtifactStore(getFile, storeFile, fileExists);
};
