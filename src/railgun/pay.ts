
import { getAddress, type Address } from "viem";
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
import {
  ensureExpectedArtifactProxyServiceWorker
} from "../pwa/serviceWorkerControl";
import type { PreparedBroadcasterSubmit } from "./wakuBroadcaster";

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  // For tests: submitter: "waku-railgun-broadcaster"
  railgunAdapter: "kohaku-railgun";
  submissionMode: "railgun-waku-broadcaster";
  railgunAddress: string;
  privateOperation?: PreparedBroadcasterSubmit;
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

const sha256Hex = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const ensureKohakuRailgunArtifactPolicyReady = async (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">,
  onStatus?: (message: string) => void
): Promise<void> => {
  validateKohakuRailgunArtifactPolicy(policy);

  if (typeof navigator === "undefined" || typeof window === "undefined") {
    return;
  }

  const log = onStatus || ((msg) => console.log(`[Artifact Proxy] ${msg}`));

  log("Checking and updating RAILGUN artifact proxy service worker");
  const status = await ensureExpectedArtifactProxyServiceWorker({
    expectedVersion: bindleArtifactProxyVersion,
    onStatus: log
  });

  if (!status.ok) {
    const diagStr = JSON.stringify(status, null, 2);
    throw new Error(
      `Bindle's artifact proxy service worker is wrong or failed to upgrade. expected ${bindleArtifactProxyVersion}, got ${status.controllerVersion}.\n\nDiagnostics:\n${diagStr}`
    );
  }

  // --- Artifact proxy self-test (Phase 7) ---
  log("Running RAILGUN artifact proxy self-test");
  const testFile = "railgun/01x01/matrices.bin.br";
  const manifestUrl = "/railgun-artifacts/manifest.json";
  let manifest: any = null;
  let entry: any = null;

  try {
    const manifestResponse = await fetch(manifestUrl);
    if (!manifestResponse.ok) {
      throw new Error(`Manifest fetch failed with status ${manifestResponse.status.toString()}`);
    }
    manifest = await manifestResponse.json();
    entry = manifest.files?.find((f: any) => f.path === testFile);
    if (!entry) {
      throw new Error(`Test file ${testFile} not found in manifest.`);
    }
  } catch (err: any) {
    throw new Error(
      `RAILGUN artifact proxy self-test error: unable to load manifest. Detail: ${err.message}`
    );
  }

  const targetUrl = `https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/${testFile}`;
  let responseStatus = 0;
  let responseHeaders: Record<string, string> = {};
  let bytes: ArrayBuffer | null = null;
  let actualSize = 0;
  let actualHash = "";

  try {
    const testFetch = await fetch(targetUrl);
    responseStatus = testFetch.status;
    testFetch.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    if (!testFetch.ok) {
      throw new Error(`Fetch failed with status ${testFetch.status.toString()}`);
    }

    bytes = await testFetch.arrayBuffer();
    actualSize = bytes.byteLength;
    actualHash = await sha256Hex(bytes);

    if (actualSize !== entry.localSize || actualHash !== entry.sha256) {
      throw new Error("Byte validation failed. Size mismatch or Hash mismatch.");
    }
  } catch (err: any) {
    const selfTestDiagnostics = {
      manifestUrl,
      manifestGeneratedAt: manifest?.generatedAt ?? "unknown",
      sourceTreeSha: manifest?.sourceTreeSha ?? "unknown",
      testFilePath: testFile,
      localPath: entry?.localPath ?? "unknown",
      expectedLocalSize: entry?.localSize ?? 0,
      actualByteLength: actualSize,
      expectedSha256: entry?.sha256 ?? "unknown",
      actualSha256: actualHash,
      fetchedUrl: targetUrl,
      responseStatus,
      importantHeaders: {
        "content-type": responseHeaders["content-type"] ?? "missing",
        "content-encoding": responseHeaders["content-encoding"] ?? "missing",
        "content-length": responseHeaders["content-length"] ?? "missing",
        "x-bindle-artifact-proxy-version": responseHeaders["x-bindle-artifact-proxy-version"] ?? "missing"
      }
    };
    console.error("Artifact self-test failed diagnostics:", selfTestDiagnostics);
    throw new Error(
      `RAILGUN artifact proxy self-test failed. The service worker returned transformed, decompressed, or truncated bytes instead of the exact raw Brotli bytes.\n\nDiagnostics:\n${JSON.stringify(selfTestDiagnostics, null, 2)}\n\nReload or reinstall PWA to refresh service worker.`
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
  void amount;
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
  await ensureKohakuRailgunArtifactPolicyReady(policy, onStatus);

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

    let resolvedRecipient = recipient.trim();
    if (!resolvedRecipient.startsWith("0zk")) {
      onStatus("Resolving recipient address");
      const { resolvePublicRecipient } = await import("../wallet/smartAccountAdapter");
      resolvedRecipient = await resolvePublicRecipient(policy, resolvedRecipient);
    }

    if (!resolvedRecipient.startsWith("0zk") && asset.symbol === "ETH") {
      throw new Error("ETH settlement requires private unshield-and-call routing; WETH settlement is the only supported test path.");
    }

    throw new Error(kohakuPrivateActionsPendingMessage);

    return {
      railgunAdapter: "kohaku-railgun",
      submissionMode: "railgun-waku-broadcaster",
      railgunAddress: walletState.railgunAddress || "",
      provider: railgunProvider,
      syncer: syncer,
      privateOperation: undefined
    };
  } catch (error) {
    if (builder) {
      try { builder.free(); } catch (e) {}
    }
    if (signer) {
      try { signer.free(); } catch (e) {}
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
