import {
  NETWORK_CONFIG,
  NetworkName,
  type Chain
} from "@railgun-community/shared-models";
import { HDNodeWallet } from "ethers";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { ensureRailgunBrowserEngine } from "./client";
import {
  normalizeRecoveryPhrase,
  persistRailgunWalletFromSdkDerivation,
  unlockEncryptedRailgunWallet,
  type CreatedRailgunWalletResult,
  type RailgunWalletDerivationProvider,
  type RailgunWalletResult,
  type UnlockedRailgunWallet
} from "./railgunWallet";

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

export const getOrCreateWalletSdkEncryptionKey = async (): Promise<string> =>
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

export type RailgunWalletSdkCompatibility = {
  compatible: boolean;
  reason: "compatible" | "address-mismatch" | "not-sdk-derived";
  localAddress: string;
  kohakuRailgunAddress: string;
  walletSdkAddress: string;
  derivationProvider: RailgunWalletDerivationProvider;
  keyIndex: number;
  chainId: bigint;
};

type WalletSdkDerivedWallet = {
  walletID: string;
  encryptionKey: string;
  railgunAddress: string;
  chain: Chain;
  networkName: NetworkName.Ethereum;
};

export class RailgunSdkAddressMismatchError extends Error {
  compatibility: RailgunWalletSdkCompatibility;

  constructor(compatibility: RailgunWalletSdkCompatibility) {
    const providerMessage =
      compatibility.derivationProvider === "railgun-wallet-sdk"
        ? "The RAILGUN Wallet SDK derives a different 0zk from the same recovery phrase."
        : "Your saved 0zk was created with an older/Kohaku-local derivation path. The RAILGUN Wallet SDK derives a different 0zk from the same recovery phrase.";

    super(
      `${providerMessage} Private Pay is blocked to avoid spending from the wrong shielded account.\n\nLocal saved 0zk: ${compatibility.localAddress}\nWallet SDK 0zk: ${compatibility.walletSdkAddress}\nDerivation provider: ${compatibility.derivationProvider}`
    );
    this.name = "RailgunSdkAddressMismatchError";
    this.compatibility = compatibility;
  }
}

export const evaluateRailgunWalletSdkCompatibility = ({
  localAddress,
  kohakuRailgunAddress,
  walletSdkAddress,
  derivationProvider,
  keyIndex,
  chainId
}: Omit<RailgunWalletSdkCompatibility, "compatible" | "reason">): RailgunWalletSdkCompatibility => {
  const addressMatches = walletSdkAddress === localAddress;
  const providerMatches = derivationProvider === "railgun-wallet-sdk";

  return {
    compatible: addressMatches && providerMatches,
    reason: addressMatches
      ? providerMatches
        ? "compatible"
        : "not-sdk-derived"
      : "address-mismatch",
    localAddress,
    kohakuRailgunAddress,
    walletSdkAddress,
    derivationProvider,
    keyIndex,
    chainId
  };
};

const assertMainnetWallet = (unlockedWallet: UnlockedRailgunWallet): void => {
  if (unlockedWallet.chainId !== 1n) {
    throw new Error(
      `Private Pay is currently wired for Ethereum mainnet, but this 0zk wallet is chain ${unlockedWallet.chainId.toString()}.`
    );
  }
};

const deriveWalletSdkWallet = async ({
  policy,
  recoveryPhrase,
  keyIndex,
  onStatus
}: {
  policy: ConnectionPolicy;
  recoveryPhrase: string;
  keyIndex: number;
  onStatus: (message: string) => void;
}): Promise<WalletSdkDerivedWallet> => {
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
    recoveryPhrase,
    creationBlockNumbers,
    keyIndex
  );
  const fullWallet = walletSdk.fullWalletForID(walletInfo.id);

  return {
    walletID: walletInfo.id,
    encryptionKey,
    railgunAddress: fullWallet.getAddress(chain),
    chain,
    networkName
  };
};

export const createEncryptedRailgunWalletWithSdk = async ({
  policy,
  onStatus,
  keyIndex = 0,
  chainId = 1n
}: {
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
  keyIndex?: number;
  chainId?: bigint;
}): Promise<CreatedRailgunWalletResult> => {
  if (chainId !== 1n) {
    throw new Error("Wallet SDK RAILGUN wallet creation is currently mainnet-only.");
  }

  const wallet = HDNodeWallet.createRandom();
  const recoveryPhrase = normalizeRecoveryPhrase(wallet.mnemonic?.phrase ?? "");

  if (!recoveryPhrase) {
    throw new Error("Unable to generate a RAILGUN recovery phrase.");
  }

  const sdkWallet = await deriveWalletSdkWallet({
    policy,
    recoveryPhrase,
    keyIndex,
    onStatus
  });
  const result = await persistRailgunWalletFromSdkDerivation({
    recoveryPhrase,
    railgunAddress: sdkWallet.railgunAddress,
    source: "created",
    keyIndex,
    chainId
  });

  return {
    ...result,
    recoveryPhrase
  };
};

export const importEncryptedRailgunWalletWithSdk = async ({
  policy,
  recoveryPhrase,
  onStatus,
  keyIndex = 0,
  chainId = 1n
}: {
  policy: ConnectionPolicy;
  recoveryPhrase: string;
  onStatus: (message: string) => void;
  keyIndex?: number;
  chainId?: bigint;
}): Promise<RailgunWalletResult> => {
  if (chainId !== 1n) {
    throw new Error("Wallet SDK RAILGUN wallet import is currently mainnet-only.");
  }

  const normalizedPhrase = normalizeRecoveryPhrase(recoveryPhrase);
  const sdkWallet = await deriveWalletSdkWallet({
    policy,
    recoveryPhrase: normalizedPhrase,
    keyIndex,
    onStatus
  });

  return persistRailgunWalletFromSdkDerivation({
    recoveryPhrase: normalizedPhrase,
    railgunAddress: sdkWallet.railgunAddress,
    source: "imported",
    keyIndex,
    chainId
  });
};

export const checkRailgunWalletSdkCompatibility = async ({
  policy,
  onStatus
}: {
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<RailgunWalletSdkCompatibility> => {
  onStatus("Unlocking local RAILGUN wallet");
  const unlockedWallet = await unlockEncryptedRailgunWallet();
  assertMainnetWallet(unlockedWallet);
  const sdkWallet = await deriveWalletSdkWallet({
    policy,
    recoveryPhrase: unlockedWallet.recoveryPhrase,
    keyIndex: unlockedWallet.keyIndex,
    onStatus
  });

  return evaluateRailgunWalletSdkCompatibility({
    localAddress: unlockedWallet.railgunAddress,
    kohakuRailgunAddress: unlockedWallet.kohakuRailgunAddress,
    walletSdkAddress: sdkWallet.railgunAddress,
    derivationProvider: unlockedWallet.derivationProvider,
    keyIndex: unlockedWallet.keyIndex,
    chainId: unlockedWallet.chainId
  });
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
  assertMainnetWallet(unlockedWallet);

  const sdkWallet = await deriveWalletSdkWallet({
    policy,
    recoveryPhrase: unlockedWallet.recoveryPhrase,
    keyIndex: unlockedWallet.keyIndex,
    onStatus
  });
  const compatibility = evaluateRailgunWalletSdkCompatibility({
    localAddress: unlockedWallet.railgunAddress,
    kohakuRailgunAddress: unlockedWallet.kohakuRailgunAddress,
    walletSdkAddress: sdkWallet.railgunAddress,
    derivationProvider: unlockedWallet.derivationProvider,
    keyIndex: unlockedWallet.keyIndex,
    chainId: unlockedWallet.chainId
  });

  if (!compatibility.compatible) {
    throw new RailgunSdkAddressMismatchError(compatibility);
  }

  return {
    walletID: sdkWallet.walletID,
    encryptionKey: sdkWallet.encryptionKey,
    railgunAddress: sdkWallet.railgunAddress,
    unlockedWallet,
    chain: sdkWallet.chain,
    networkName: sdkWallet.networkName
  };
};
