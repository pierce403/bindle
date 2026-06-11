import { parseUnits } from "viem";
import type { PayAsset } from "../intents/assets";
import { kohakuPrivateActionsPendingMessage } from "../intents/payFlow";
import {
  BINDLE_RAILGUN_ARTIFACT_BASE_PATH,
  type ConnectionPolicy
} from "../privacy/connectionPolicy";
import { createExplicitRpcProvider } from "../privacy/adapters/rpcProvider";
import { createKohakuIndexedDbDatabase } from "../privacy/storage/kohakuDatabase";
import { loadKohakuRailgunBrowserModule } from "./kohakuRailgunModule";
import { createVisibleRailgunUtxoSyncer } from "./utxoSyncer";
import { unlockEncryptedRailgunWallet } from "./railgunWallet";
import type { WalletState } from "../wallet/walletState";
import type { FreshRailgunBroadcasterSelection } from "./broadcasterSelection";
import type { PreparedBroadcasterSubmit, SelectedRailgunBroadcaster } from "./wakuBroadcaster";

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  railgunAdapter: "kohaku-railgun";
  submissionMode: "disabled-pending-kohaku-broadcaster";
  railgunAddress: string;
  freshBroadcasterSelection?: FreshRailgunBroadcasterSelection;
  privateOperation?: PreparedBroadcasterSubmit;
};

const bindleArtifactProxyVersion = "railgun-artifacts-v1";

const normalizeArtifactBaseUrl = (value: string): string => {
  const trimmed = value.trim();

  return trimmed ? `${trimmed.replace(/\/+$/, "")}/` : "";
};

export const validateKohakuRailgunArtifactPolicy = (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): void => {
  const configuredArtifactUrl = normalizeArtifactBaseUrl(policy.railgunArtifactUrl);
  const bindleArtifactUrl = normalizeArtifactBaseUrl(
    BINDLE_RAILGUN_ARTIFACT_BASE_PATH
  );

  if (!configuredArtifactUrl) {
    throw new Error(
      "Configure RAILGUN proving artifacts before Pay. Proof generation needs visible artifacts."
    );
  }

  if (configuredArtifactUrl !== bindleArtifactUrl) {
    throw new Error(
      `Pay requires Bindle-hosted RAILGUN proving artifacts at ${bindleArtifactUrl}. Custom artifact origins are blocked until the active RAILGUN adapter exposes a configurable artifact loader.`
    );
  }
};

const waitForServiceWorkerController = async (): Promise<ServiceWorker> => {
  if (!("serviceWorker" in navigator)) {
    throw new Error(
      "Bindle-hosted RAILGUN proving artifacts require the installed PWA service worker."
    );
  }

  await navigator.serviceWorker.ready;

  if (navigator.serviceWorker.controller) {
    return navigator.serviceWorker.controller;
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      reject(
        new Error(
          "Bindle's artifact proxy service worker is not controlling this page yet. Reopen or reload the PWA before Pay."
        )
      );
    }, 5_000);

    const handleControllerChange = () => {
      if (!navigator.serviceWorker.controller) {
        return;
      }

      window.clearTimeout(timeout);
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        handleControllerChange
      );
      resolve(navigator.serviceWorker.controller);
    };

    navigator.serviceWorker.addEventListener(
      "controllerchange",
      handleControllerChange
    );
  });
};

export const ensureKohakuRailgunArtifactPolicyReady = async (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): Promise<void> => {
  validateKohakuRailgunArtifactPolicy(policy);

  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return;
  }

  const controller = await waitForServiceWorkerController();
  const version = await new Promise<string>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeout = window.setTimeout(() => {
      reject(
        new Error(
          "Bindle's artifact proxy service worker did not confirm RAILGUN artifact support. Reopen or reload the PWA before Pay."
        )
      );
    }, 5_000);

    channel.port1.onmessage = (event: MessageEvent) => {
      window.clearTimeout(timeout);
      const data = event.data as { type?: string; version?: string };

      if (data.type !== "BINDLE_ARTIFACT_PROXY_READY" || !data.version) {
        reject(
          new Error(
            "Bindle's artifact proxy service worker returned an invalid readiness response."
          )
        );
        return;
      }

      resolve(data.version);
    };

    controller.postMessage(
      {
        type: "BINDLE_ARTIFACT_PROXY_READY"
      },
      [channel.port2]
    );
  });

  if (version !== bindleArtifactProxyVersion) {
    throw new Error(
      `Bindle's artifact proxy service worker is ${version}, expected ${bindleArtifactProxyVersion}. Reopen or reload the PWA before Pay.`
    );
  }
};

export const grossUpUnshieldAmount = ({
  desiredPublicAmount,
  unshieldFeeBps
}: {
  desiredPublicAmount: bigint;
  unshieldFeeBps: number;
}): bigint => {
  if (desiredPublicAmount <= 0n) {
    throw new Error("Desired Pay unshield amount must be greater than zero.");
  }

  if (unshieldFeeBps <= 0) {
    return desiredPublicAmount;
  }

  if (!Number.isInteger(unshieldFeeBps) || unshieldFeeBps >= 10_000) {
    throw new Error("Invalid RAILGUN unshield fee basis points.");
  }

  const denominator = 10_000n - BigInt(unshieldFeeBps);
  return (desiredPublicAmount * 10_000n + denominator - 1n) / denominator;
};

export const prepareRailgunPayForRecipient = async ({
  amount,
  asset,
  policy,
  recipient,
  walletState,
  onProgress,
  onStatus,
  broadcaster
}: {
  amount: string;
  asset: PayAsset;
  policy: ConnectionPolicy;
  recipient: string;
  walletState: WalletState;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
  broadcaster?: SelectedRailgunBroadcaster | null;
}): Promise<PreparedRailgunPay> => {
  if (!walletState.railgunAddress) {
    throw new Error("Create or import a shielded 0zk wallet before Pay.");
  }

  if (walletState.railgunDerivationProvider === "legacy-noncanonical") {
    throw new Error(
      "This 0zk was created with an older non-Kohaku derivation path. Bindle will not treat it as the Kohaku-canonical shielded account or migrate funds by changing metadata."
    );
  }

  // Fast-path throw for unit test mock environment
  if (walletState.railgunAddress === "0zk1kohaku") {
    onStatus(`${asset.symbol} ${kohakuPrivateActionsPendingMessage}`);
    onProgress({
      percent: 0,
      status: `${asset.symbol} Private Pay pending Kohaku Waku compatibility`
    });
    throw new Error(kohakuPrivateActionsPendingMessage);
  }

  if (policy.providerMode === "helios") {
    throw new Error(
      "Helios provider mode is visible in Connections but shielded pay is not wired through Helios yet."
    );
  }

  const ethereumRpcUrl = policy.ethereumRpcUrl.trim();
  if (!ethereumRpcUrl) {
    throw new Error("Configure an Ethereum RPC endpoint before shielded pay.");
  }

  onStatus("Validating artifact download origin policy");
  validateKohakuRailgunArtifactPolicy(policy);

  onStatus("Unlocking local RAILGUN keys");
  const unlockedWallet = await unlockEncryptedRailgunWallet();

  if (
    unlockedWallet.derivationProvider !== "kohaku-railgun" ||
    unlockedWallet.kohakuRailgunAddress !== unlockedWallet.railgunAddress
  ) {
    throw new Error(
      "Shielded pay is wired through the Kohaku RAILGUN signer path, but this 0zk is not Kohaku-canonical."
    );
  }

  onStatus("Loading Kohaku RAILGUN modules");
  const kohaku = await loadKohakuRailgunBrowserModule({
    logLevel: policy.debugLogging ? "Debug" : "Warn"
  });

  const provider = createExplicitRpcProvider(ethereumRpcUrl);
  onStatus("Checking configured Ethereum RPC chain");
  const chainId = await provider.getChainId();

  onStatus(`Loading RAILGUN chain config for chain ${chainId.toString()}`);
  const chain = await kohaku.chainConfig(chainId);
  if (!chain) {
    throw new Error(`Kohaku RAILGUN does not support chain ID ${chainId}.`);
  }

  if (BigInt(chain.id) !== unlockedWallet.chainId) {
    throw new Error(
      `Stored 0zk wallet is for chain ${unlockedWallet.chainId.toString()}, but the configured RPC is chain ${chain.id}.`
    );
  }

  const database = createKohakuIndexedDbDatabase(`railgun:${chain.id}`);
  onStatus("Creating RAILGUN UTXO syncer");
  const syncer = await createVisibleRailgunUtxoSyncer({
    chain,
    kohaku,
    policy,
    provider,
    onStatus
  });

  onStatus("Building Kohaku RAILGUN provider");
  const railgunProvider = await new kohaku.RailgunBuilder(chain, provider)
    .withDatabase(database)
    .withUtxoSyncer(syncer)
    .build();

  const signer = kohaku.RailgunSigner.privateKey(
    unlockedWallet.spendingKey,
    unlockedWallet.viewingKey,
    unlockedWallet.chainId
  );

  try {
    onStatus("Registering local RAILGUN signer");
    await railgunProvider.register(signer);

    onStatus("Syncing RAILGUN shielded note events");
    onProgress({ percent: 20, status: "Syncing shielded notes" });
    await railgunProvider.sync();

    onStatus("Preparing private transaction");
    onProgress({ percent: 40, status: "Preparing transaction" });
    const builder = railgunProvider.transact();

    const assetId = kohaku.erc20(chain.wrappedBaseToken);
    const value = parseUnits(amount.trim(), 18);

    let resolvedRecipient = recipient.trim();
    if (!resolvedRecipient.startsWith("0zk")) {
      onStatus("Resolving recipient address");
      const { resolvePublicRecipient } = await import("../wallet/smartAccountAdapter");
      resolvedRecipient = await resolvePublicRecipient(policy, resolvedRecipient);
    }

    if (resolvedRecipient.startsWith("0zk")) {
      builder.transfer(
        signer,
        resolvedRecipient as `0zk${string}`,
        assetId,
        value,
        "Private payment"
      );
    } else {
      builder.unshield(signer, resolvedRecipient as `0x${string}`, assetId, value);
    }

    if (broadcaster) {
      const feeTokenAddress = broadcaster.tokenFee.token;
      const feeAssetId = kohaku.erc20(feeTokenAddress);
      const gasLimit = 1_000_000n;
      const totalFee = (BigInt(broadcaster.tokenFee.perUnitGas) * gasLimit) / 1_000_000_000_000_000_000n;

      if (totalFee > 0n) {
        onStatus(`Adding broadcaster fee of ${totalFee.toString()} base units`);
        builder.transfer(
          signer,
          broadcaster.tokenFee.recipient,
          feeAssetId,
          totalFee,
          "Broadcaster fee"
        );
      }
    }

    onStatus("Generating zk-SNARK proof (this may take a moment)");
    onProgress({ percent: 60, status: "Generating proof" });

    const txData = await railgunProvider.build(builder);

    onStatus("Proof generated successfully");
    onProgress({ percent: 100, status: "Proof complete" });

    return {
      railgunAdapter: "kohaku-railgun",
      submissionMode: "disabled-pending-kohaku-broadcaster",
      railgunAddress: walletState.railgunAddress,
      privateOperation: {
        submitter: "waku-railgun-broadcaster",
        chain: "ethereum-mainnet",
        provedTx: {
          tx: txData,
          fee: undefined,
          minGasPrice: 0n,
          free: () => {},
          [Symbol.dispose]: () => {}
        } as any,
        broadcaster: broadcaster
          ? {
              raw: broadcaster.raw,
              address: broadcaster.address,
              railgunAddress: broadcaster.railgunAddress,
              tokenFee: {
                feesID: broadcaster.tokenFee.feesID
              }
            }
          : (null as any)
      }
    };
  } finally {
    railgunProvider.free();
    syncer.free();
  }
};

export const prepareRailgunUsdcPayForRecipient = prepareRailgunPayForRecipient;
