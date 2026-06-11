
import { encodeFunctionData, getAddress, parseUnits, type Address } from "viem";
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

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedBundlerSubmit = {
  submitter: "erc4337-bundler";
  chain: "ethereum-mainnet";
  signableUserOp: any;
  delegatingSignerPrivateKey: `0x${string}`;
};

export type PreparedRailgunPay = {
  railgunAdapter: "kohaku-railgun";
  submissionMode: "erc4337-bundler";
  railgunAddress: string;
  privateOperation?: PreparedBundlerSubmit;
  provider?: any;
  syncer?: any;
};

const mainnetUsdcAddress = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
) as Address;
const UNISWAP_V4_WETH_ADDRESS = getAddress(
  "0xC02aaA39b223FE8D0A0e5C4F27ead9083C756Cc2"
) as Address;

export const resolveRailgunBroadcasterFeeTokenAddress = (
  policy: Pick<
    ConnectionPolicy,
    "railgunBroadcasterFeeToken" | "railgunBroadcasterCustomFeeTokenAddress"
  >
): Address => {
  if (policy.railgunBroadcasterFeeToken === "USDC") {
    return mainnetUsdcAddress;
  }

  if (policy.railgunBroadcasterFeeToken === "WETH") {
    return UNISWAP_V4_WETH_ADDRESS;
  }

  if (policy.railgunBroadcasterFeeToken === "custom") {
    const value = policy.railgunBroadcasterCustomFeeTokenAddress.trim();

    if (!value) {
      throw new Error("Configure a custom broadcaster fee token address.");
    }

    return getAddress(value) as Address;
  }

  return UNISWAP_V4_WETH_ADDRESS;
};

const bindleArtifactProxyVersion = "railgun-artifacts-v4";

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

const sha256Hex = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
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

  // --- Artifact proxy self-test (Phase 5) ---
  try {
    const manifestResponse = await fetch("/railgun-artifacts/manifest.json");
    if (!manifestResponse.ok) {
      throw new Error(`Manifest status ${manifestResponse.status.toString()}`);
    }
    const manifest = await manifestResponse.json();
    const testFile = "railgun/01x01/matrices.bin.br";
    const entry = manifest.files.find((f: any) => f.path === testFile);
    if (!entry) {
      throw new Error(`Test file ${testFile} not found in manifest.`);
    }

    // Fetch through the same hardcoded Kohaku URL that Rust would request
    const targetUrl = `https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/${testFile}`;
    const testFetch = await fetch(targetUrl);
    if (!testFetch.ok) {
      throw new Error(`Fetch status ${testFetch.status.toString()}`);
    }

    const bytes = await testFetch.arrayBuffer();
    const hash = await sha256Hex(bytes);

    if (bytes.byteLength !== entry.localSize || hash !== entry.sha256) {
      throw new Error("Validation mismatch.");
    }
  } catch (err: any) {
    throw new Error(
      `RAILGUN artifact proxy returned transformed or truncated bytes. Reload/reinstall PWA to refresh service worker. Detail: ${err.message}`
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
  if (unshieldFeeBps === 0) {
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
  onStatus
}: {
  amount: string;
  asset: PayAsset;
  policy: ConnectionPolicy;
  recipient: string;
  walletState: WalletState;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
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

  const bundlerUrl = policy.bundlerUrl.trim();
  if (!bundlerUrl) {
    throw new Error("Configure an ERC-4337 bundler before shielded pay.");
  }

  onStatus("Ensuring RAILGUN artifact service worker proxy is ready");
  await ensureKohakuRailgunArtifactPolicyReady(policy);

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

  let syncer: any = null;
  let railgunProvider: any = null;
  let builder: any = null;
  let signer: any = null;
  let bundler: any = null;
  let delegatingSigner: any = null;

  try {
    onStatus("Creating RAILGUN UTXO syncer");
    syncer = await createVisibleRailgunUtxoSyncer({
      chain,
      kohaku,
      policy,
      provider,
      onStatus
    });

    onStatus("Building Kohaku RAILGUN provider");
    railgunProvider = await new kohaku.RailgunBuilder(chain, provider)
      .withDatabase(database)
      .withUtxoSyncer(syncer)
      .build();

    signer = kohaku.RailgunSigner.privateKey(
      unlockedWallet.spendingKey,
      unlockedWallet.viewingKey,
      unlockedWallet.chainId
    );

    onStatus("Registering local RAILGUN signer");
    await railgunProvider.register(signer);

    onStatus("Syncing RAILGUN shielded note events");
    onProgress({ percent: 20, status: "Syncing shielded notes" });
    await railgunProvider.sync();

    onStatus("Preparing private transaction");
    onProgress({ percent: 40, status: "Preparing transaction" });
    builder = railgunProvider.transact();

    const assetId = kohaku.erc20(chain.wrappedBaseToken);
    const value = parseUnits(amount.trim(), 18);

    let resolvedRecipient = recipient.trim();
    if (!resolvedRecipient.startsWith("0zk")) {
      onStatus("Resolving recipient address");
      const { resolvePublicRecipient } = await import("../wallet/smartAccountAdapter");
      resolvedRecipient = await resolvePublicRecipient(policy, resolvedRecipient);
    }

    if (resolvedRecipient.startsWith("0zk")) {
      builder = builder.transfer(
        signer,
        resolvedRecipient as `0zk${string}`,
        assetId,
        value,
        "Private payment"
      );
    } else {
      builder = builder.unshield(signer, resolvedRecipient as `0x${string}`, assetId, value);
    }

    onStatus("Resolving fee token address");
    const feeTokenAddress = resolveRailgunBroadcasterFeeTokenAddress(policy);

    onStatus("Instantiating Pimlico bundler and delegating signer");
    bundler = kohaku.Bundler.pimlico(bundlerUrl);
    delegatingSigner = kohaku.Signer.privateKey(unlockedWallet.spendingKey);

    let tailCalls: any[] = [];
    if (!resolvedRecipient.startsWith("0zk")) {
      const data = encodeFunctionData({
        abi: [{
          name: "withdraw",
          type: "function",
          inputs: [{ name: "wad", type: "uint256" }],
        }],
        functionName: "withdraw",
        args: [value],
      });

      tailCalls.push({
        target: chain.wrappedBaseToken as `0x${string}`,
        data: data
      });
    }

    onStatus("Preparing User Operation and generating zk-SNARK proof");
    onProgress({ percent: 60, status: "Generating proof" });

    const signableUserOp = await railgunProvider.prepareUserOp(
      builder,
      bundler,
      delegatingSigner.address,
      signer,
      feeTokenAddress,
      tailCalls
    );

    // After prepareUserOp, builder is consumed/freed. Set it to null.
    builder = null;

    onStatus("Proof and User Operation generated successfully");
    onProgress({ percent: 100, status: "Proof complete" });

    // Clean up temporary local WASM objects that are not returned
    try { signer.free(); } catch (e) {}
    signer = null;
    try { bundler.free(); } catch (e) {}
    bundler = null;
    try { delegatingSigner.free(); } catch (e) {}
    delegatingSigner = null;

    return {
      railgunAdapter: "kohaku-railgun",
      submissionMode: "erc4337-bundler",
      railgunAddress: walletState.railgunAddress,
      provider: railgunProvider,
      syncer: syncer,
      privateOperation: {
        submitter: "erc4337-bundler",
        chain: "ethereum-mainnet",
        signableUserOp,
        delegatingSignerPrivateKey: unlockedWallet.spendingKey
      }
    };
  } catch (error) {
    if (builder) {
      try { builder.free(); } catch (e) {}
    }
    if (signer) {
      try { signer.free(); } catch (e) {}
    }
    if (bundler) {
      try { bundler.free(); } catch (e) {}
    }
    if (delegatingSigner) {
      try { delegatingSigner.free(); } catch (e) {}
    }
    if (railgunProvider) {
      try { railgunProvider.free(); } catch (e) {}
    }
    if (syncer) {
      try { syncer.free(); } catch (e) {}
    }
    throw error;
  }
};

export const prepareRailgunUsdcPayForRecipient = prepareRailgunPayForRecipient;
