import type { PayAsset } from "../intents/assets";
import { kohakuPrivateActionsPendingMessage } from "../intents/payFlow";
import {
  BINDLE_RAILGUN_ARTIFACT_BASE_PATH,
  type ConnectionPolicy
} from "../privacy/connectionPolicy";
import type { WalletState } from "../wallet/walletState";
import type { PreparedBroadcasterSubmit } from "./wakuBroadcaster";

export type RailgunPayProgress = {
  percent: number;
  status: string;
};

export type PreparedRailgunPay = {
  railgunAdapter: "kohaku-railgun";
  submissionMode: "disabled-pending-kohaku-broadcaster";
  railgunAddress: string;
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

export const prepareRailgunUsdcPayForRecipient = async ({
  asset,
  walletState,
  onProgress,
  onStatus
}: {
  amount: string;
  asset: PayAsset;
  policy: ConnectionPolicy;
  recipient: `0x${string}`;
  walletState: WalletState;
  onProgress: (progress: RailgunPayProgress) => void;
  onStatus: (message: string) => void;
}): Promise<PreparedRailgunPay> => {
  if (!walletState.railgunAddress) {
    throw new Error("Create or import a shielded 0zk wallet before Pay.");
  }

  if (asset.symbol !== "USDC") {
    throw new Error("Pay is currently wired for USDC output.");
  }

  if (walletState.railgunDerivationProvider === "legacy-noncanonical") {
    throw new Error(
      "This 0zk was created with an older non-Kohaku derivation path. Bindle will not treat it as the Kohaku-canonical shielded account or migrate funds by changing metadata."
    );
  }

  onStatus(kohakuPrivateActionsPendingMessage);
  onProgress({
    percent: 0,
    status: "Private actions pending Kohaku broadcaster verification"
  });
  throw new Error(kohakuPrivateActionsPendingMessage);
};
