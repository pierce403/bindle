import type { PayAsset } from "../intents/assets";
import { BINDLE_RAILGUN_ARTIFACT_BASE_PATH, type ConnectionPolicy } from "../privacy/connectionPolicy";
import { ensureExpectedArtifactProxyServiceWorker } from "../pwa/serviceWorkerControl";
import type { WalletState } from "../wallet/walletState";
import { assertKohakuPrivateSubmissionReady, KOHAKU_PRIVATE_SUBMISSION_BLOCKER } from "./privateTransactionBridge";

export type RailgunPayProgress = { percent: number; status: string };

const bindleArtifactProxyVersion = "railgun-artifacts-v4";
const normalizeArtifactBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  return trimmed ? `${trimmed.replace(/\/+$/, "")}/` : "";
};

export const validateKohakuRailgunArtifactPolicy = (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">
): void => {
  const configured = normalizeArtifactBaseUrl(policy.railgunArtifactUrl);
  const expected = normalizeArtifactBaseUrl(BINDLE_RAILGUN_ARTIFACT_BASE_PATH);
  if (!configured) {
    throw new Error("Configure RAILGUN proving artifacts before Pay. Proof generation needs visible artifacts.");
  }
  if (configured !== expected) {
    throw new Error(`Pay requires Bindle-hosted RAILGUN proving artifacts at ${expected}. Custom artifact origins are blocked until the active RAILGUN adapter exposes a configurable artifact loader.`);
  }
};

type ArtifactEntry = { path: string; localPath: string; localSize: number; sha256: string };
const isArtifactEntry = (value: unknown): value is ArtifactEntry => {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.path === "string" && typeof entry.localPath === "string"
    && typeof entry.localSize === "number" && Number.isSafeInteger(entry.localSize)
    && entry.localSize > 0 && typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256);
};

export const ensureKohakuRailgunArtifactPolicyReady = async (
  policy: Pick<ConnectionPolicy, "railgunArtifactUrl">,
  onStatus: (message: string) => void = () => undefined
): Promise<void> => {
  validateKohakuRailgunArtifactPolicy(policy);
  if (typeof navigator === "undefined" || typeof window === "undefined") return;
  onStatus("Checking RAILGUN artifact proxy service worker");
  const status = await ensureExpectedArtifactProxyServiceWorker({
    expectedVersion: bindleArtifactProxyVersion,
    onStatus
  });
  if (!status.ok) {
    throw new Error(`Bindle's artifact proxy service worker is unavailable. Expected ${bindleArtifactProxyVersion}, got ${status.controllerVersion}.\nDiagnostics:\n${JSON.stringify(status, null, 2)}`);
  }

  onStatus("Checking RAILGUN artifact bytes");
  const testFile = "railgun/01x01/matrices.bin.br";
  const manifestResponse = await fetch("/railgun-artifacts/manifest.json");
  if (!manifestResponse.ok) throw new Error(`Artifact manifest returned ${manifestResponse.status}.`);
  const manifest: unknown = await manifestResponse.json();
  const files = typeof manifest === "object" && manifest !== null && "files" in manifest ? manifest.files : null;
  const entry = Array.isArray(files) ? files.find((file: unknown) => isArtifactEntry(file) && file.path === testFile) : null;
  if (!isArtifactEntry(entry)) throw new Error("RAILGUN artifact proxy self-test: invalid manifest entry.");

  // The verified controlling worker intercepts this compiled upstream URL.
  // It is never a network fallback.
  const targetUrl = `https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/${testFile}`;
  const response = await fetch(targetUrl);
  if (!response.ok) throw new Error(`RAILGUN artifact proxy self-test returned ${response.status}.`);
  const bytes = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  if (bytes.byteLength !== entry.localSize || hash !== entry.sha256) {
    throw new Error(`RAILGUN artifact proxy self-test failed: transformed or truncated bytes. Expected ${entry.localSize} bytes / ${entry.sha256}; received ${bytes.byteLength} bytes / ${hash}.`);
  }
};

export const grossUpUnshieldAmount = ({ desiredPublicAmount, unshieldFeeBps }: {
  desiredPublicAmount: bigint;
  unshieldFeeBps: number;
}): bigint => {
  if (desiredPublicAmount < 0n || !Number.isInteger(unshieldFeeBps) || unshieldFeeBps < 0 || unshieldFeeBps >= 10_000) {
    throw new Error("Invalid RAILGUN unshield amount or fee basis points.");
  }
  const denominator = 10_000n - BigInt(unshieldFeeBps);
  return (desiredPublicAmount * 10_000n + denominator - 1n) / denominator;
};

/** Gate before unlocking secrets, making requests, or preparing a fee quote.
 * Public dry-run construction lives in kohakuPrivateBuilder; proof API presence
 * alone cannot establish broadcaster readiness.
 */
export const prepareRailgunPayForRecipient = async ({ walletState, onProgress, onStatus }: {
  amount: string;
  asset: PayAsset;
  policy: ConnectionPolicy;
  recipient: string;
  walletState: WalletState;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
}): Promise<never> => {
  if (!walletState.railgunAddress) throw new Error("Create or import a shielded 0zk wallet before Pay.");
  if (walletState.railgunDerivationProvider === "legacy-noncanonical") {
    throw new Error("This wallet's derivation is unsupported. Changing metadata cannot migrate its funds.");
  }
  onStatus(KOHAKU_PRIVATE_SUBMISSION_BLOCKER);
  onProgress({ percent: 0, status: KOHAKU_PRIVATE_SUBMISSION_BLOCKER });
  return assertKohakuPrivateSubmissionReady();
};

export const prepareRailgunUsdcPayForRecipient = prepareRailgunPayForRecipient;
