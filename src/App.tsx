import { Eye, MoreHorizontal } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { parseEther } from "viem";
import { ActivityFeed, type ActivityItem } from "./components/ActivityFeed";
import { BalancePanel, type WalletAction } from "./components/BalancePanel";
import { BottomNav, type AppTab } from "./components/BottomNav";
import { BrowserLandingPage } from "./components/BrowserLandingPage";
import { BuildMetadataLink } from "./components/BuildMetadataLink";
import { DebugPanel } from "./components/DebugPanel";
import { OnboardingWizard } from "./components/OnboardingWizard";
import { PrivacySwitchboard } from "./components/PrivacySwitchboard";
import { PwaInstallPrompt } from "./components/PwaInstallPrompt";
import { RailgunKeyRecoveryPrompt } from "./components/RailgunKeyRecoveryPrompt";
import { SettingsPanel } from "./components/SettingsPanel";
import { UnshieldedBalanceBanner } from "./components/UnshieldedBalanceBanner";
import { WalletActionPanel } from "./components/WalletActionPanel";
import { getPayAsset } from "./intents/assets";
import {
  getRailgunBroadcasterReadiness,
  privateUsdcPayLegs
} from "./intents/payFlow";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";
import {
  clearDebugLog,
  createDebugLogEntry,
  loadDebugLog,
  saveDebugLog,
  trimDebugLog,
  type CreateDebugLogEntryInput,
  type DebugLogEntry
} from "./debug/debugLog";
import {
  markConnectionPolicyCustom,
  type ConnectionPolicy
} from "./privacy/connectionPolicy";
import {
  loadConnectionPolicy,
  saveConnectionPolicy
} from "./privacy/connectionPolicyState";
import { buildEndpointDisclosure } from "./privacy/preflightDisclosure";
import {
  assessShieldReadiness,
  prepareNativeEthShieldCalls,
  summarizeMissingRequirements
} from "./railgun/shielding";
import {
  prepareRailgunUsdcPayForRecipient,
  type RailgunPayProgress
} from "./railgun/pay";
import { submitPayIntent } from "./railgun/broadcaster";
import {
  fetchShieldedEthBalance,
  type ShieldedEthBalance
} from "./railgun/shieldedBalance";
import {
  clearCachedShieldedEthBalance,
  loadCachedShieldedEthBalance,
  saveCachedShieldedEthBalance
} from "./railgun/shieldedBalanceCache";
import {
  clearEncryptedRailgunWallet,
  createEncryptedRailgunWallet,
  exportEncryptedRailgunWallet,
  getEncryptedRailgunWalletStorageMode,
  importEncryptedRailgunWallet
} from "./railgun/railgunWallet";
import {
  startPrivacyToolkit,
  type PrivacyToolkitHandle,
  type PrivacyToolkitState
} from "./privacy/toolkit";
import {
  describeToolkitStartFailure,
  isKohakuRpcFetchFailure,
  type ToolkitRecoveryAction
} from "./privacy/toolkitErrors";
import { usePwaDisplayMode } from "./pwa/usePwaDisplayMode";
import { defaultTheme, type ThemeSelection } from "./theme/theme";
import {
  accountExportFilename,
  createBindleAccountExport,
  parseBindleAccountExport
} from "./wallet/accountExport";
import {
  deriveSmartWalletAddressFromPasskey,
  resolvePublicRecipient,
  sendSmartWalletCalls,
  sendSmartWalletEthPayment
} from "./wallet/smartAccountAdapter";
import {
  fetchSmartAccountDeploymentStatus,
  initialSmartAccountDeploymentStatus,
  smartAccountDeploymentLabel,
  type SmartAccountDeploymentStatus
} from "./wallet/smartAccountDeployment";
import {
  fetchPublicEthBalance,
  type PublicEthBalance
} from "./wallet/publicBalance";
import {
  fetchPublicEthActivity,
  type PublicEthActivityScan
} from "./wallet/publicActivity";
import {
  createBindleOwnerEnrollmentCode,
  detectPasskeyCapability,
  createBindlePasskeyCredential,
  parseBindleOwnerEnrollmentCode,
  type PasskeyAuthenticatorKind,
  type PasskeyCapability
} from "./wallet/passkeys";
import {
  clearPendingOwnerEnrollment,
  loadPendingOwnerEnrollment,
  savePendingOwnerEnrollment,
  type PendingOwnerEnrollment
} from "./wallet/ownerEnrollmentState";
import {
  clearLocalOnboardingComplete,
  loadLocalOnboardingComplete,
  saveLocalOnboardingComplete
} from "./wallet/onboardingState";
import {
  clearRailgunWalletState,
  loadWalletState,
  markPasskeyEnrolled,
  markRailgunWalletReady,
  markSmartWalletReady,
  markWalletError,
  resetWalletState,
  saveWalletState,
  type WalletState
} from "./wallet/walletState";

const initialDraft: IntentDraft = {
  recipient: "",
  amount: "",
  asset: "ETH",
  note: ""
};

const shieldedBalanceSyncWarningMs = 30_000;
const shieldedBalanceSyncTimeoutMs = 120_000;

const shieldedBalanceSyncDetail = (
  railgunAddress: string,
  policy: ConnectionPolicy
): string =>
  [
    `Railgun address: ${railgunAddress}`,
    `RPC: ${policy.ethereumRpcUrl.trim()}`,
    `RAILGUN sync indexer: ${policy.railgunSyncUrl.trim() || "off (RPC-only)"}`
  ].join("\n");

const createShieldedBalanceSyncTimeoutError = (): Error => {
  const error = new Error(
    `Shielded balance sync is still waiting after ${Math.round(
      shieldedBalanceSyncTimeoutMs / 1000
    ).toString()} seconds. Kohaku has not returned a balance or an error. This usually means the visible RAILGUN sync indexer/RPC path is hanging or overloaded. Check Connections, keep the RAILGUN sync indexer enabled for default sync, or try again.`
  );
  error.name = "ShieldedBalanceSyncTimeoutError";
  return error;
};

const isShieldedBalanceSyncTimeoutError = (error: unknown): boolean =>
  error instanceof Error && error.name === "ShieldedBalanceSyncTimeoutError";

type PublicBalanceState =
  | { status: "missing-wallet" | "missing-rpc" | "idle" | "syncing" }
  | { status: "ready"; balance: PublicEthBalance }
  | { status: "error"; message: string };

type PublicActivityState =
  | { status: "missing-wallet" | "missing-rpc" | "idle" | "syncing"; items: [] }
  | { status: "ready"; scan: PublicEthActivityScan; items: ActivityItem[] }
  | { status: "error"; message: string; items: ActivityItem[] };

type ShieldedBalanceState =
  | {
      status:
        | "missing-wallet"
        | "missing-rpc"
        | "missing-secrets"
        | "idle"
        | "syncing";
    }
  | { status: "ready"; balance: ShieldedEthBalance }
  | { status: "error"; message: string };

type AppNoticeAction =
  | ToolkitRecoveryAction
  | { kind: "open-connections"; label: string };

type AppNotice = {
  kind: "error" | "warning";
  title: string;
  message: string;
  action?: AppNoticeAction;
} | null;

type RailgunStorageMode = "browser-local" | "legacy-passphrase" | "missing";

const initialPublicBalanceState = (): PublicBalanceState =>
  loadWalletState().smartWalletAddress
    ? { status: "idle" }
    : { status: "missing-wallet" };

const initialPublicActivityState = (): PublicActivityState =>
  loadWalletState().smartWalletAddress
    ? { status: "idle", items: [] }
    : { status: "missing-wallet", items: [] };

const initialShieldedBalanceState = (): ShieldedBalanceState =>
  loadWalletState().railgunAddress
    ? { status: "idle" }
    : { status: "missing-wallet" };

const publicBalanceText = (state: PublicBalanceState): string | null => {
  switch (state.status) {
    case "ready":
      return state.balance.formatted;
    case "syncing":
      return "syncing";
    case "error":
      return "sync failed";
    case "missing-rpc":
      return "RPC required";
    case "missing-wallet":
    case "idle":
      return null;
  }
};

const shortHash = (value: string): string => `${value.slice(0, 6)}...${value.slice(-4)}`;

const shortAddress = (value: string): string =>
  `${value.slice(0, 6)}...${value.slice(-4)}`;

const activityTime = (timestamp: string): string =>
  new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short"
  }).format(new Date(timestamp));

const publicActivityStatus = (state: PublicActivityState): string => {
  switch (state.status) {
    case "ready":
      return state.items.length > 0
        ? `public activity synced at block ${state.scan.blockNumber.toString()}`
        : `no public ETH transfers found since block ${state.scan.scannedFromBlock.toString()}`;
    case "syncing":
      return "scanning public ETH activity";
    case "error":
      return `activity sync failed: ${state.message}`;
    case "missing-rpc":
      return "configure RPC to scan public funding activity";
    case "missing-wallet":
      return "create a funding wallet to scan activity";
    case "idle":
      return "public activity not synced";
  }
};

const publicActivityToItems = (scan: PublicEthActivityScan): ActivityItem[] =>
  scan.items.map((item) => {
    const isIncoming = item.direction === "in";
    const counterparty = isIncoming ? item.from : item.to;

    return {
      id: item.id,
      name: isIncoming ? "Received ETH" : "Sent ETH",
      handle: counterparty ? shortAddress(counterparty) : "contract creation",
      amount: item.amount,
      asset: "ETH",
      note: isIncoming
        ? `From ${counterparty ? shortAddress(counterparty) : "unknown"}`
        : `To ${counterparty ? shortAddress(counterparty) : "unknown"}`,
      direction: item.direction,
      route: `Public funding wallet · ${shortHash(item.hash)}`,
      time: activityTime(item.timestamp),
      privacy: "public"
    };
  });

const shieldedBalanceNetworkStatus = (
  state: ShieldedBalanceState,
  cachedBalance: ShieldedEthBalance | null
): string => {
  switch (state.status) {
    case "ready":
      return `shielded synced at block ${state.balance.blockNumber.toString()}`;
    case "syncing":
      if (cachedBalance) {
        return `updating; last synced at block ${cachedBalance.blockNumber.toString()}`;
      }
      return "syncing shielded ETH";
    case "error":
      if (cachedBalance) {
        return `sync failed; last synced at block ${cachedBalance.blockNumber.toString()}`;
      }
      return "shielded sync failed";
    case "missing-rpc":
      if (cachedBalance) {
        return `RPC required; last synced at block ${cachedBalance.blockNumber.toString()}`;
      }
      return "RPC required";
    case "missing-secrets":
      return "wallet secrets missing";
    case "missing-wallet":
      return "0zk pending";
    case "idle":
      if (cachedBalance) {
        return `last synced at block ${cachedBalance.blockNumber.toString()}`;
      }
      return "shielded ETH not synced";
  }
};

const loadCachedShieldedBalanceForWallet = (
  railgunAddress: string | null
): ShieldedEthBalance | null =>
  railgunAddress ? loadCachedShieldedEthBalance(railgunAddress) : null;

const isBalanceForRailgunAddress = (
  balance: ShieldedEthBalance | null,
  railgunAddress: string | null
): balance is ShieldedEthBalance =>
  Boolean(
    balance &&
      railgunAddress &&
      balance.railgunAddress.toLowerCase() === railgunAddress.toLowerCase()
  );

function WalletApp() {
  const [draft, setDraft] = useState<IntentDraft>(initialDraft);
  const [routedIntent, setRoutedIntent] = useState<RoutedIntent>(() =>
    routeIntent(initialDraft)
  );
  const [policy, setPolicy] = useState<ConnectionPolicy>(() =>
    loadConnectionPolicy()
  );
  const [toolkitState, setToolkitState] = useState<PrivacyToolkitState>("idle");
  const [toolkitHandle, setToolkitHandle] =
    useState<PrivacyToolkitHandle | null>(null);
  const toolkitStartRef = useRef<Promise<PrivacyToolkitHandle> | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [appNotice, setAppNotice] = useState<AppNotice>(null);
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>(() =>
    loadDebugLog()
  );
  const [theme, setTheme] = useState<ThemeSelection>(defaultTheme);
  const [activeAction, setActiveAction] = useState<WalletAction | null>(null);
  const [activeTab, setActiveTab] = useState<AppTab>("wallet");
  const [walletState, setWalletState] = useState<WalletState>(() =>
    loadWalletState()
  );
  const [passkeyCapability, setPasskeyCapability] =
    useState<PasskeyCapability>({
      checked: false,
      webAuthnSupported: false,
      platformAuthenticatorAvailable: false,
      userVerificationAvailable: false,
      available: false,
      message: "Checking passkey support"
    });
  const [isCreatingPasskey, setIsCreatingPasskey] = useState(false);
  const [isDerivingSmartWallet, setIsDerivingSmartWallet] = useState(false);
  const [isCreatingRailgunWallet, setIsCreatingRailgunWallet] = useState(false);
  const [isImportingRailgunWallet, setIsImportingRailgunWallet] =
    useState(false);
  const [isSubmittingSmartPayment, setIsSubmittingSmartPayment] = useState(false);
  const [smartPaymentStatus, setSmartPaymentStatus] = useState("");
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [payStatus, setPayStatus] = useState("");
  const [payProofProgress, setPayProofProgress] = useState<RailgunPayProgress>({
    percent: 0,
    status: ""
  });
  const [isSubmittingShield, setIsSubmittingShield] = useState(false);
  const [shieldStatus, setShieldStatus] = useState("");
  const [isExportingAccount, setIsExportingAccount] = useState(false);
  const [isImportingAccount, setIsImportingAccount] = useState(false);
  const [accountExportStatus, setAccountExportStatus] = useState("");
  const [pendingOwnerEnrollment, setPendingOwnerEnrollment] =
    useState<PendingOwnerEnrollment | null>(() => loadPendingOwnerEnrollment());
  const [ownerEnrollmentImportText, setOwnerEnrollmentImportText] = useState("");
  const [ownerEnrollmentStatus, setOwnerEnrollmentStatus] = useState("");
  const [isCreatingOwnerEnrollment, setIsCreatingOwnerEnrollment] =
    useState(false);
  const [isReplacingRailgunWallet, setIsReplacingRailgunWallet] = useState(false);
  const [railgunRepairStatus, setRailgunRepairStatus] = useState("");
  const [railgunRepairPreviousAddress, setRailgunRepairPreviousAddress] =
    useState<string | null>(null);
  const [railgunReplacementRecoveryPhrase, setRailgunReplacementRecoveryPhrase] =
    useState<string | null>(null);
  const [railgunStorageMode, setRailgunStorageMode] =
    useState<RailgunStorageMode>("missing");
  const [railgunStorageChecked, setRailgunStorageChecked] = useState(false);
  const [localOnboardingComplete, setLocalOnboardingComplete] = useState(
    loadLocalOnboardingComplete
  );
  const [publicBalance, setPublicBalance] = useState<PublicBalanceState>(
    initialPublicBalanceState
  );
  const [publicActivity, setPublicActivity] = useState<PublicActivityState>(
    initialPublicActivityState
  );
  const [shieldedBalance, setShieldedBalance] = useState<ShieldedBalanceState>(
    initialShieldedBalanceState
  );
  const [cachedShieldedBalance, setCachedShieldedBalance] =
    useState<ShieldedEthBalance | null>(() =>
      loadCachedShieldedBalanceForWallet(loadWalletState().railgunAddress)
    );
  const [smartAccountDeployment, setSmartAccountDeployment] =
    useState<SmartAccountDeploymentStatus>(() =>
      initialSmartAccountDeploymentStatus(loadWalletState().smartWalletAddress)
    );
  const publicBalanceRequestRef = useRef(0);
  const publicActivityRequestRef = useRef(0);
  const shieldedBalanceRequestRef = useRef(0);
  const smartAccountDeploymentRequestRef = useRef(0);
  const publicBalanceAutoSyncKeyRef = useRef<string | null>(null);
  const shieldedBalanceAutoSyncKeyRef = useRef<string | null>(null);
  const hasRailgunWallet = walletState.railgunAddress !== null;
  const hasSmartWallet = walletState.smartWalletAddress !== null;
  const rpcReady = toolkitState === "ready" && policy.ethereumRpcUrl.length > 0;
  const bundlerReady = policy.bundlerUrl.trim().length > 0;
  const rpcConfigured = policy.ethereumRpcUrl.trim().length > 0;
  const smartWalletStatus = walletState.smartWalletAddress
    ? "ready"
    : walletState.passkeyPresent
      ? "pending"
      : "not created";
  const railgunStatus = walletState.railgunAddress ? "ready" : "not created";
  const hasOnboardingWalletShape =
    walletState.smartWalletAddress !== null && walletState.railgunAddress !== null;
  const localWalletProvisioned =
    hasOnboardingWalletShape &&
    walletState.railgunKeyStore === "encrypted-local" &&
    railgunStorageChecked &&
    railgunStorageMode === "browser-local";
  const localWalletFullyProvisioned =
    localWalletProvisioned && toolkitState === "ready";
  const onboardingComplete =
    hasOnboardingWalletShape &&
    (localOnboardingComplete || localWalletFullyProvisioned);
  const sendEndpointDisclosure = buildEndpointDisclosure(
    policy,
    hasSmartWallet && !hasRailgunWallet ? "public-smart-payment" : "send-review"
  );
  const actionEndpointDisclosure =
    activeAction === "pay"
      ? buildEndpointDisclosure(policy, "pay-review")
      : sendEndpointDisclosure;
  const privatePayReadiness = getRailgunBroadcasterReadiness(policy);
  const publicBalanceDisclosure = buildEndpointDisclosure(
    policy,
    "public-balance-sync"
  );
  const shieldEndpointDisclosure = buildEndpointDisclosure(policy, "shield-sweep");
  const publicBalanceEndpointSummary = publicBalanceDisclosure
    .filter((endpoint) => endpoint.configured || endpoint.required)
    .map((endpoint) =>
      endpoint.configured
        ? `${endpoint.label} (${endpoint.source}: ${endpoint.value})`
        : `${endpoint.label} (${endpoint.required ? "required, off" : "off"})`
    )
    .join(", ");
  const knownPublicBalance = publicBalanceText(publicBalance);
  const publicBalanceWei =
    publicBalance.status === "ready" ? publicBalance.balance.wei : null;
  const hasRecoverableRailgunKeyMaterial =
    walletState.railgunAddress !== null &&
    walletState.railgunKeyStore === "encrypted-local" &&
    railgunStorageMode === "browser-local";
  const currentCachedShieldedBalance = isBalanceForRailgunAddress(
    cachedShieldedBalance,
    walletState.railgunAddress
  )
    ? cachedShieldedBalance
    : null;
  const visibleShieldedBalance =
    shieldedBalance.status === "ready"
      ? shieldedBalance.balance
      : currentCachedShieldedBalance;
  const isShowingCachedShieldedBalance =
    visibleShieldedBalance !== null && shieldedBalance.status !== "ready";
  const railgunRepairMode =
    railgunStorageChecked &&
    walletState.railgunAddress !== null &&
    (walletState.railgunKeyStore !== "encrypted-local" ||
      railgunStorageMode !== "browser-local")
      ? walletState.railgunKeyStore === "encrypted-local"
        ? railgunStorageMode === "legacy-passphrase"
          ? "legacy-passphrase"
          : "missing"
        : "missing"
      : null;
  const shieldedBalanceUsd =
    visibleShieldedBalance !== null ? visibleShieldedBalance.usd ?? "$--" : "$--";
  const balanceLabel = isShowingCachedShieldedBalance
    ? "Shielded balance (last synced)"
    : "Shielded balance";
  const smartWalletDeploymentStatus = smartAccountDeploymentLabel(
    smartAccountDeployment
  );
  const shieldReadiness = assessShieldReadiness({
    smartWalletAddress: walletState.smartWalletAddress,
    railgunAddress: walletState.railgunAddress,
    hasRecoverableRailgunKeyMaterial,
    publicBalanceWei,
    ethereumRpcUrl: policy.ethereumRpcUrl,
    bundlerUrl: policy.bundlerUrl,
    providerMode: policy.providerMode
  });
  const canShield = shieldReadiness.ready && !isSubmittingShield;
  const shieldDisclosure =
    publicBalance.status === "ready"
      ? shieldReadiness.ready
        ? "Shield ready. Review amount and endpoints before signing."
        : railgunRepairMode
          ? "Shield blocked: replace the incompatible local 0zk wallet before shielding."
        : `Shield blocked: ${summarizeMissingRequirements(shieldReadiness)}.`
      : null;
  const shieldedStatus =
    shieldedBalance.status === "ready"
      ? `${shieldedBalance.balance.formattedEth} shielded`
      : currentCachedShieldedBalance
        ? `${currentCachedShieldedBalance.formattedEth} shielded`
      : !hasRailgunWallet
        ? "0zk pending"
        : !hasRecoverableRailgunKeyMaterial
          ? "wallet secrets missing"
          : shieldedBalance.status === "syncing"
            ? "syncing"
            : shieldedBalance.status === "error"
              ? "sync failed"
              : "not synced";
  const canSyncPublicBalance =
    walletState.smartWalletAddress !== null &&
    rpcConfigured &&
    publicBalance.status !== "syncing";
  const canSyncShieldedBalance =
    walletState.railgunAddress !== null &&
    hasRecoverableRailgunKeyMaterial &&
    rpcConfigured &&
    shieldedBalance.status !== "syncing";
  const shieldedBalanceEndpointDisclosure = buildEndpointDisclosure(
    policy,
    "shielded-balance-sync"
  );
  const shieldedBalanceEndpointSummary = shieldedBalanceEndpointDisclosure
    .filter((endpoint) => endpoint.configured || endpoint.required)
    .map((endpoint) =>
      endpoint.configured
        ? `${endpoint.label} (${endpoint.source}: ${endpoint.value})`
        : `${endpoint.label} (${endpoint.required ? "required, off" : "off"})`
    )
    .join(", ");
  const showRailgunRepairPrompt =
    (railgunRepairMode !== null && walletState.railgunAddress !== null) ||
    railgunReplacementRecoveryPhrase !== null;

  const recordDebugEvent = useCallback((input: CreateDebugLogEntryInput) => {
    setDebugLog((currentEntries) => {
      const nextEntries = trimDebugLog([
        ...currentEntries,
        createDebugLogEntry(input)
      ]);
      saveDebugLog(nextEntries);
      return nextEntries;
    });
  }, []);

  useEffect(() => {
    setCachedShieldedBalance(
      loadCachedShieldedBalanceForWallet(walletState.railgunAddress)
    );
  }, [walletState.railgunAddress]);

  useEffect(() => {
    if (localWalletFullyProvisioned && !localOnboardingComplete) {
      saveLocalOnboardingComplete();
      setLocalOnboardingComplete(true);
      return;
    }

    if (!hasOnboardingWalletShape && localOnboardingComplete) {
      clearLocalOnboardingComplete();
      setLocalOnboardingComplete(false);
    }
  }, [hasOnboardingWalletShape, localOnboardingComplete, localWalletFullyProvisioned]);

  const clearDebugEvents = useCallback(() => {
    clearDebugLog();
    setDebugLog([]);
  }, []);

  const messageFromError = useCallback(
    (error: unknown, fallback: string, source: string, detail?: string) => {
      const message = error instanceof Error ? error.message : fallback;
      recordDebugEvent({
        level: "error",
        source,
        message,
        detail,
        error
      });
      return message;
    },
    [recordDebugEvent]
  );

  useEffect(() => {
    setPayStatus("");
    setPayProofProgress({ percent: 0, status: "" });
  }, [draft.amount, draft.asset, draft.recipient]);

  useEffect(() => {
    const handleWindowError = (event: ErrorEvent) => {
      recordDebugEvent({
        level: "error",
        source: "browser",
        message: event.message || "Unhandled browser error",
        detail: `${event.filename}:${event.lineno}:${event.colno}`,
        error: event.error
      });
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      recordDebugEvent({
        level: "error",
        source: "browser",
        message:
          reason instanceof Error
            ? reason.message
            : "Unhandled promise rejection",
        error: reason
      });
    };

    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, [recordDebugEvent]);

  useEffect(() => {
    let cancelled = false;

    void detectPasskeyCapability().then((capability) => {
      if (!cancelled) {
        setPasskeyCapability(capability);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!walletState.smartWalletAddress) {
      setPublicBalance({ status: "missing-wallet" });
      setPublicActivity({ status: "missing-wallet", items: [] });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setPublicBalance({ status: "missing-rpc" });
      setPublicActivity({ status: "missing-rpc", items: [] });
      return;
    }

    setPublicBalance({ status: "idle" });
    setPublicActivity({ status: "idle", items: [] });
  }, [walletState.smartWalletAddress, policy.ethereumRpcUrl, policy.providerMode]);

  useEffect(() => {
    if (!walletState.railgunAddress) {
      shieldedBalanceAutoSyncKeyRef.current = null;
      setShieldedBalance({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      shieldedBalanceAutoSyncKeyRef.current = null;
      setShieldedBalance({ status: "missing-rpc" });
      return;
    }

    if (!hasRecoverableRailgunKeyMaterial) {
      shieldedBalanceAutoSyncKeyRef.current = null;
      setShieldedBalance({ status: "missing-secrets" });
      return;
    }

    setShieldedBalance({ status: "idle" });
  }, [
    walletState.railgunAddress,
    walletState.railgunKeyStore,
    railgunStorageMode,
    hasRecoverableRailgunKeyMaterial,
    policy.ethereumRpcUrl,
    policy.railgunSyncUrl,
    policy.providerMode
  ]);

  useEffect(() => {
    let cancelled = false;

    if (!walletState.railgunAddress) {
      setRailgunStorageMode("missing");
      setRailgunStorageChecked(true);
      return () => {
        cancelled = true;
      };
    }

    if (walletState.railgunKeyStore === null) {
      setRailgunStorageMode("missing");
      setRailgunStorageChecked(true);
      setAppNotice((currentNotice) =>
        currentNotice?.kind === "error"
          ? currentNotice
          : {
              kind: "warning",
              title: "Shielded wallet secrets missing",
              message:
                "This browser has a 0zk address saved but no local RAILGUN key-store marker. Regenerate the shielded wallet before funding it."
            }
      );
      return () => {
        cancelled = true;
      };
    }

    setRailgunStorageChecked(false);

    void getEncryptedRailgunWalletStorageMode().then((mode) => {
      if (cancelled) {
        return;
      }

      setRailgunStorageMode(mode);
      setRailgunStorageChecked(true);

      if (mode === "legacy-passphrase") {
        setAppNotice((currentNotice) =>
          currentNotice?.kind === "error"
            ? currentNotice
            : {
                kind: "warning",
                title: "Legacy shielded wallet storage",
                message:
                  "This 0zk address was created by an older password-protected build. Reset local wallet state or import the recovery phrase again before funding it."
              }
        );
      }

      if (mode === "missing") {
        setAppNotice((currentNotice) =>
          currentNotice?.kind === "error"
            ? currentNotice
            : {
                kind: "warning",
                title: "Shielded wallet secrets missing",
                message:
                  "This browser has a 0zk address saved but no matching local RAILGUN secrets. Import the recovery phrase again before funding it."
              }
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [walletState.railgunAddress, walletState.railgunKeyStore]);

  const startToolkit = useCallback(async () => {
    if (toolkitStartRef.current || toolkitState === "starting") {
      return;
    }

    if (toolkitHandle) {
      setStatusMessage(`${toolkitHandle.label} is already ready`);
      return;
    }

    setToolkitState("starting");
    setStatusMessage("Starting privacy toolkit");
    recordDebugEvent({
      level: "info",
      source: "toolkit",
      message: `Starting ${policy.privacyToolkit}`
    });
    setAppNotice(null);
    let lastToolkitStep = "Starting privacy toolkit";

    try {
      const startPromise = startPrivacyToolkit(policy, (message) => {
        lastToolkitStep = message;
        setStatusMessage(message);
        recordDebugEvent({
          level: "info",
          source: "toolkit",
          message,
          detail: `Toolkit: ${policy.privacyToolkit}`
        });
      });
      toolkitStartRef.current = startPromise;
      const handle = await startPromise;
      setToolkitHandle(handle);
      setToolkitState("ready");
      setStatusMessage(`${handle.label} is ready`);
      setAppNotice(null);
    } catch (error) {
      const failure = describeToolkitStartFailure(lastToolkitStep, error);
      recordDebugEvent({
        level: "error",
        source: "toolkit",
        message: failure.message,
        detail: `Toolkit: ${policy.privacyToolkit}`,
        error
      });
      setToolkitState("error");
      setStatusMessage(failure.message);
      setAppNotice({
        kind: "error",
        title: "Toolkit failed",
        message: failure.message,
        action: failure.action
      });
    } finally {
      toolkitStartRef.current = null;
    }
  }, [policy, recordDebugEvent, toolkitHandle, toolkitState]);

  useEffect(() => {
    if (
      !policy.autoStartToolkit ||
      !policy.ethereumRpcUrl.trim() ||
      !hasRecoverableRailgunKeyMaterial
    ) {
      return;
    }

    if (toolkitState !== "idle" && toolkitState !== "stopped") {
      return;
    }

    if (toolkitHandle || toolkitStartRef.current) {
      return;
    }

    void startToolkit();
  }, [
    policy.autoStartToolkit,
    policy.ethereumRpcUrl,
    startToolkit,
    toolkitHandle,
    toolkitState,
    hasRecoverableRailgunKeyMaterial
  ]);

  const updateConnectionPolicy = (nextPolicy: ConnectionPolicy) => {
    setPolicy(saveConnectionPolicy(nextPolicy));
  };

  const handleNoticeAction = (action: AppNoticeAction) => {
    if (action.kind === "switch-privacy-toolkit") {
      updateConnectionPolicy(
        markConnectionPolicyCustom({
          ...policy,
          privacyToolkit: action.toolkit
        })
      );
      setToolkitHandle(null);
      setToolkitState("idle");
      setStatusMessage(
        "Privacy toolkit set to RAILGUN Wallet SDK. Review Connections, then start the toolkit again."
      );
      setAppNotice({
        kind: "warning",
        title: "Toolkit changed",
        message:
          "Bindle is using the explicit RAILGUN Wallet SDK fallback for this browser session. Endpoints remain visible in Connections before anything starts."
      });
      setActiveTab("nodes");
      return;
    }

    setActiveTab("nodes");
    setAppNotice(null);
  };

  const syncPublicActivity = async (latestBlockNumber?: bigint) => {
    const smartWalletAddress = walletState.smartWalletAddress;

    if (!smartWalletAddress) {
      setPublicActivity({ status: "missing-wallet", items: [] });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setPublicActivity({ status: "missing-rpc", items: [] });
      return;
    }

    const requestId = publicActivityRequestRef.current + 1;
    publicActivityRequestRef.current = requestId;
    setPublicActivity({ status: "syncing", items: [] });
    recordDebugEvent({
      level: "info",
      source: "activity",
      message: "Scanning public ETH funding activity",
      detail: `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
    });

    try {
      const scan = await fetchPublicEthActivity({
        latestBlockNumber,
        policy,
        smartWalletAddress
      });

      if (publicActivityRequestRef.current === requestId) {
        const items = publicActivityToItems(scan);
        setPublicActivity({ status: "ready", scan, items });
        recordDebugEvent({
          level: "info",
          source: "activity",
          message: `Public ETH activity synced: ${items.length.toString()} transfer${items.length === 1 ? "" : "s"}`,
          detail: `Blocks: ${scan.scannedFromBlock.toString()}-${scan.scannedToBlock.toString()}`
        });
      }
    } catch (error) {
      if (publicActivityRequestRef.current === requestId) {
        const message = messageFromError(
          error,
          "Unable to sync public activity",
          "activity",
          `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
        );
        setPublicActivity({ status: "error", message, items: [] });
      }
    }
  };

  const syncSmartAccountDeployment = async () => {
    const smartWalletAddress = walletState.smartWalletAddress;

    if (!smartWalletAddress) {
      setSmartAccountDeployment({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setSmartAccountDeployment({ status: "missing-rpc" });
      return;
    }

    const requestId = smartAccountDeploymentRequestRef.current + 1;
    smartAccountDeploymentRequestRef.current = requestId;
    setSmartAccountDeployment({ status: "checking" });
    recordDebugEvent({
      level: "info",
      source: "smart-account",
      message: "Checking public smart-account deployment status",
      detail: `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
    });

    try {
      const deployment = await fetchSmartAccountDeploymentStatus(
        policy,
        smartWalletAddress
      );

      if (smartAccountDeploymentRequestRef.current === requestId) {
        setSmartAccountDeployment(deployment);

        if (
          deployment.status === "deployed" ||
          deployment.status === "counterfactual"
        ) {
          recordDebugEvent({
            level: "info",
            source: "smart-account",
            message:
              deployment.status === "deployed"
                ? "Public smart account is deployed"
                : "Public smart account is counterfactual",
            detail:
              deployment.status === "deployed"
                ? `Address: ${smartWalletAddress}\nBlock: ${deployment.blockNumber.toString()}\nCode size: ${deployment.codeSize.toString()} bytes`
                : `Address: ${smartWalletAddress}\nBlock: ${deployment.blockNumber.toString()}\nNo contract code is deployed yet; the first successful ERC-4337 UserOperation deploys this account.`
          });
        }
      }
    } catch (error) {
      if (smartAccountDeploymentRequestRef.current === requestId) {
        const message = messageFromError(
          error,
          "Unable to check smart-account deployment",
          "smart-account",
          `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
        );
        setSmartAccountDeployment({ status: "error", message });
      }
    }
  };

  const syncPublicBalance = async () => {
    const smartWalletAddress = walletState.smartWalletAddress;

    if (!smartWalletAddress) {
      setPublicBalance({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setPublicBalance({ status: "missing-rpc" });
      return;
    }

    const requestId = publicBalanceRequestRef.current + 1;
    publicBalanceRequestRef.current = requestId;
    setPublicBalance({ status: "syncing" });
    setStatusMessage("Syncing public ETH balance");
    recordDebugEvent({
      level: "info",
      source: "balance",
      message: "Syncing public ETH balance",
      detail: `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
    });

    try {
      const balance = await fetchPublicEthBalance(policy, smartWalletAddress);

      if (publicBalanceRequestRef.current === requestId) {
        setPublicBalance({ status: "ready", balance });
        setStatusMessage(
          `Public ETH balance synced at block ${balance.blockNumber.toString()}`
        );
        recordDebugEvent({
          level: "info",
          source: "balance",
          message: `Public ETH balance synced: ${balance.formatted}`,
          detail: `Block: ${balance.blockNumber.toString()}`
        });
        void syncSmartAccountDeployment();
        void syncPublicActivity(balance.blockNumber);
      }
    } catch (error) {
      if (publicBalanceRequestRef.current === requestId) {
        const message = messageFromError(
          error,
          "Unable to sync public balance",
          "balance",
          `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
        );
        setPublicBalance({ status: "error", message });
        setStatusMessage(message);
      }
    }
  };

  const syncShieldedBalance = async () => {
    if (!walletState.railgunAddress) {
      setShieldedBalance({ status: "missing-wallet" });
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      setShieldedBalance({ status: "missing-rpc" });
      return;
    }

    if (!hasRecoverableRailgunKeyMaterial) {
      setShieldedBalance({ status: "missing-secrets" });
      return;
    }

    const requestId = shieldedBalanceRequestRef.current + 1;
    shieldedBalanceRequestRef.current = requestId;
    const detail = shieldedBalanceSyncDetail(walletState.railgunAddress, policy);
    setShieldedBalance({ status: "syncing" });
    setStatusMessage("Syncing shielded RAILGUN balance");
    recordDebugEvent({
      level: "info",
      source: "shielded-balance",
      message: "Syncing shielded RAILGUN balance",
      detail
    });

    const warningTimer = window.setTimeout(() => {
      if (shieldedBalanceRequestRef.current !== requestId) {
        return;
      }

      const message = "Shielded balance sync is still waiting on Kohaku";
      setStatusMessage(message);
      recordDebugEvent({
        level: "warning",
        source: "shielded-balance",
        message,
        detail
      });
    }, shieldedBalanceSyncWarningMs);
    let timeoutTimer: number | null = null;

    try {
      const balance = await Promise.race([
        fetchShieldedEthBalance(policy, {
          onStatus: (message) => {
            if (shieldedBalanceRequestRef.current !== requestId) {
              return;
            }

            setStatusMessage(message);
            recordDebugEvent({
              level: "info",
              source: "shielded-balance",
              message,
              detail
            });
          }
        }),
        new Promise<never>((_, reject) => {
          timeoutTimer = window.setTimeout(
            () => reject(createShieldedBalanceSyncTimeoutError()),
            shieldedBalanceSyncTimeoutMs
          );
        })
      ]);

      if (shieldedBalanceRequestRef.current === requestId) {
        saveCachedShieldedEthBalance(balance);
        setCachedShieldedBalance(balance);
        setShieldedBalance({ status: "ready", balance });
        setStatusMessage(
          `Shielded balance synced: ${balance.formattedEth}${
            balance.usd ? ` (${balance.usd})` : ""
          }`
        );
        recordDebugEvent({
          level: "info",
          source: "shielded-balance",
          message: `Shielded balance synced: ${balance.formattedEth}`,
          detail: [
            `Block: ${balance.blockNumber.toString()}`,
            `USD: ${balance.usd ?? "unavailable"}`,
            `Raw balance entries: ${balance.rawBalanceCount.toString()}`,
            `Wrapped ETH entries: ${balance.matchedWrappedBaseTokenBalances.toString()}`
          ].join("\n")
        });
      }
    } catch (error) {
      if (shieldedBalanceRequestRef.current === requestId) {
        const message = messageFromError(
          error,
          "Unable to sync shielded balance",
          "shielded-balance",
          detail
        );
        setShieldedBalance({ status: "error", message });
        setStatusMessage(message);
        setAppNotice({
          kind: "error",
          title: "Shielded sync failed",
          message: `${message} Open Debug for the full stack trace.`,
          action:
            isKohakuRpcFetchFailure(error) ||
            isShieldedBalanceSyncTimeoutError(error)
              ? { kind: "open-connections", label: "Open Connections" }
              : undefined
        });
        if (isShieldedBalanceSyncTimeoutError(error)) {
          shieldedBalanceRequestRef.current = requestId + 1;
        }
      }
    } finally {
      window.clearTimeout(warningTimer);
      if (timeoutTimer !== null) {
        window.clearTimeout(timeoutTimer);
      }
    }
  };

  useEffect(() => {
    const railgunAddress = walletState.railgunAddress;
    const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

    if (!railgunAddress || !ethereumRpcUrl || !hasRecoverableRailgunKeyMaterial) {
      shieldedBalanceAutoSyncKeyRef.current = null;
      return;
    }

    if (
      toolkitStartRef.current ||
      toolkitState === "starting" ||
      shieldedBalance.status === "syncing"
    ) {
      return;
    }

    if (policy.autoStartToolkit && toolkitState !== "ready") {
      return;
    }

    const syncKey = [
      railgunAddress,
      ethereumRpcUrl,
      policy.railgunSyncUrl.trim(),
      policy.providerMode,
      policy.privacyToolkit,
      railgunStorageMode
    ].join(":");

    if (shieldedBalanceAutoSyncKeyRef.current === syncKey) {
      return;
    }

    shieldedBalanceAutoSyncKeyRef.current = syncKey;
    void syncShieldedBalance();
  }, [
    walletState.railgunAddress,
    policy.ethereumRpcUrl,
    policy.railgunSyncUrl,
    policy.autoStartToolkit,
    policy.providerMode,
    policy.privacyToolkit,
    hasRecoverableRailgunKeyMaterial,
    railgunStorageMode,
    toolkitState,
    shieldedBalance.status
  ]);

  useEffect(() => {
    const smartWalletAddress = walletState.smartWalletAddress;
    const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

    if (!smartWalletAddress) {
      publicBalanceAutoSyncKeyRef.current = null;
      setSmartAccountDeployment({ status: "missing-wallet" });
      return;
    }

    if (!ethereumRpcUrl) {
      publicBalanceAutoSyncKeyRef.current = null;
      setSmartAccountDeployment({ status: "missing-rpc" });
      return;
    }

    const syncKey = `${smartWalletAddress}:${ethereumRpcUrl}:${policy.providerMode}`;

    if (publicBalanceAutoSyncKeyRef.current === syncKey) {
      return;
    }

    publicBalanceAutoSyncKeyRef.current = syncKey;
    void syncPublicBalance();
  }, [walletState.smartWalletAddress, policy.ethereumRpcUrl, policy.providerMode]);

  const deriveSmartWallet = async (state = walletState) => {
    if (!state.passkeyCredentialId || !state.passkeyPublicKey) {
      setStatusMessage(
        "Create a funding passkey before deriving a smart-wallet address."
      );
      return state;
    }

    setIsDerivingSmartWallet(true);

    try {
      const smartWalletAddress = await deriveSmartWalletAddressFromPasskey(
        policy,
        state
      );

      if (smartWalletAddress.status === "ready") {
        const nextState = markSmartWalletReady(state, smartWalletAddress.address);
        setWalletState(nextState);
        setStatusMessage("Smart-wallet funding address ready");
        return nextState;
      }

      setStatusMessage(smartWalletAddress.reason);
      return state;
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to derive smart-wallet funding address",
        "smart-wallet",
        `RPC: ${policy.ethereumRpcUrl.trim() || "off"}`
      );
      setWalletState(markWalletError(state, message));
      setStatusMessage(message);
      return state;
    } finally {
      setIsDerivingSmartWallet(false);
    }
  };

  const createPasskeyWallet = async () => {
    if (
      !passkeyCapability.available ||
      (walletState.passkeyPresent && walletState.passkeyPublicKey)
    ) {
      return;
    }

    setIsCreatingPasskey(true);

    try {
      const credential = await createBindlePasskeyCredential();
      const passkeyState = markPasskeyEnrolled(walletState, credential);
      setWalletState(passkeyState);

      if (policy.ethereumRpcUrl.trim()) {
        await deriveSmartWallet(passkeyState);
      } else {
        setStatusMessage(
          "Passkey enrolled. Configure Ethereum RPC to derive the funding address."
        );
      }
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to create passkey",
        "passkey"
      );
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
    } finally {
      setIsCreatingPasskey(false);
    }
  };

  const createRailgunWallet = async (): Promise<string | null> => {
    if (isCreatingRailgunWallet || walletState.railgunAddress) {
      return null;
    }

    setIsCreatingRailgunWallet(true);
    setStatusMessage("Creating shielded RAILGUN wallet");
    setAppNotice(null);
    setRailgunRepairPreviousAddress(null);
    setRailgunReplacementRecoveryPhrase(null);

    try {
      const wallet = await createEncryptedRailgunWallet();
      const nextState = markRailgunWalletReady(
        walletState,
        wallet.railgunAddress,
        "created"
      );
      setWalletState(nextState);
      setRailgunStorageMode("browser-local");
      setRailgunStorageChecked(true);
      setStatusMessage("Shielded RAILGUN wallet created");
      return wallet.recoveryPhrase;
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to create shielded RAILGUN wallet",
        "railgun-wallet"
      );
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
      return null;
    } finally {
      setIsCreatingRailgunWallet(false);
    }
  };

  const importRailgunWallet = async (
    recoveryPhrase: string
  ): Promise<void> => {
    if (isImportingRailgunWallet || walletState.railgunAddress) {
      return;
    }

    setIsImportingRailgunWallet(true);
    setStatusMessage("Importing shielded RAILGUN wallet");
    setAppNotice(null);

    try {
      const wallet = await importEncryptedRailgunWallet({
        recoveryPhrase
      });
      const nextState = markRailgunWalletReady(
        walletState,
        wallet.railgunAddress,
        "imported"
      );
      setWalletState(nextState);
      setRailgunStorageMode("browser-local");
      setRailgunStorageChecked(true);
      setRailgunRepairPreviousAddress(null);
      setRailgunReplacementRecoveryPhrase(null);
      setStatusMessage("Shielded RAILGUN wallet imported");
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to import shielded RAILGUN wallet",
        "railgun-wallet"
      );
      setWalletState(markWalletError(walletState, message));
      setStatusMessage(message);
    } finally {
      setIsImportingRailgunWallet(false);
    }
  };

  const replaceIncompatibleRailgunWallet = async () => {
    if (!railgunRepairMode || isReplacingRailgunWallet) {
      return;
    }

    setIsReplacingRailgunWallet(true);
    const previousRailgunAddress = walletState.railgunAddress;
    setRailgunRepairPreviousAddress(previousRailgunAddress);
    setRailgunReplacementRecoveryPhrase(null);
    setRailgunRepairStatus("Wiping incompatible local RAILGUN key record");
    setStatusMessage("Replacing shielded RAILGUN wallet");
    setAppNotice(null);

    try {
      await clearEncryptedRailgunWallet();
      clearCachedShieldedEthBalance(previousRailgunAddress);
      setCachedShieldedBalance(null);
      const clearedState = clearRailgunWalletState(walletState);
      setWalletState(clearedState);
      setRailgunStorageMode("missing");
      setRailgunStorageChecked(true);
      setRailgunRepairStatus("Generating fresh browser-local 0zk wallet");

      const wallet = await createEncryptedRailgunWallet();
      const nextState = markRailgunWalletReady(
        clearedState,
        wallet.railgunAddress,
        "created"
      );
      setWalletState(nextState);
      setRailgunStorageMode("browser-local");
      setRailgunStorageChecked(true);
      setRailgunReplacementRecoveryPhrase(wallet.recoveryPhrase);
      setRailgunRepairStatus(
        "New 0zk wallet ready. Save the recovery phrase before shielding."
      );
      setStatusMessage("New shielded RAILGUN wallet created");
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to replace shielded RAILGUN wallet",
        "railgun-wallet"
      );
      setRailgunRepairStatus(message);
      setStatusMessage(message);
      setWalletState(markWalletError(walletState, message));
    } finally {
      setIsReplacingRailgunWallet(false);
    }
  };

  const submitSmartPayment = async () => {
    if (!walletState.smartWalletAddress) {
      setSmartPaymentStatus("Create the smart-wallet funding address first.");
      return;
    }

    setIsSubmittingSmartPayment(true);
    setSmartPaymentStatus("Submitting ERC-4337 user operation");
    recordDebugEvent({
      level: "info",
      source: "smart-payment",
      message: "Submitting ERC-4337 user operation",
      detail: `Recipient: ${draft.recipient}\nAmount: ${draft.amount} ETH\nBundler: ${policy.bundlerUrl.trim() || "off"}`
    });

    try {
      const result = await sendSmartWalletEthPayment({
        amount: draft.amount,
        policy,
        recipient: draft.recipient,
        walletState
      });
      setSmartPaymentStatus(
        result.transactionHash
          ? `Submitted: ${result.transactionHash}`
          : `Submitted user operation: ${result.userOperationHash}`
      );
      recordDebugEvent({
        level: "info",
        source: "smart-payment",
        message: result.transactionHash
          ? `Submitted transaction ${result.transactionHash}`
          : `Submitted user operation ${result.userOperationHash}`
      });
    } catch (error) {
      setSmartPaymentStatus(
        messageFromError(
          error,
          "Unable to submit payment",
          "smart-payment",
          `Recipient: ${draft.recipient}\nAmount: ${draft.amount} ETH\nBundler: ${policy.bundlerUrl.trim() || "off"}`
        )
      );
    } finally {
      setIsSubmittingSmartPayment(false);
    }
  };

  const submitPay = async () => {
    const asset = getPayAsset(draft.asset);

    if (!asset) {
      setPayStatus("Choose a supported pay asset.");
      return;
    }

    if (asset.symbol !== "USDC") {
      setPayStatus("USDC Pay is wired first.");
      return;
    }

    if (!walletState.railgunAddress) {
      setPayStatus("Create or import a shielded 0zk wallet before Pay.");
      return;
    }

    setIsSubmittingPay(true);
    setPayStatus("Resolving recipient");
    setPayProofProgress({ percent: 0, status: "Preparing Pay" });
    setAppNotice(null);
    recordDebugEvent({
      level: "info",
      source: "pay",
      message: "Preparing Private Pay route",
      detail: [
        `Recipient: ${draft.recipient.trim()}`,
        `Amount: ${draft.amount.trim()} ${asset.symbol}`,
        `RPC: ${policy.ethereumRpcUrl.trim() || "off"}`,
        `Broadcaster: ${policy.broadcasterUrl.trim() || "off"}`,
        `Waku: ${policy.wakuEnabled ? "enabled" : "off"}`,
        `Quote source: ${policy.priceQuoteUrl.trim() || "off"}`
      ].join("\n")
    });

    try {
      if (!privatePayReadiness.ready) {
        throw new Error(privatePayReadiness.message);
      }

      const recipient = await resolvePublicRecipient(policy, draft.recipient);
      setPayStatus("Preparing RAILGUN proof and Uniswap v4 route");
      const preparedPay = await prepareRailgunUsdcPayForRecipient({
        amount: draft.amount,
        asset,
        policy,
        recipient,
        walletState,
        onProgress: setPayProofProgress,
        onStatus: (message) => {
          setPayStatus(message);
          recordDebugEvent({
            level: "info",
            source: "pay",
            message,
            detail: `Recipient: ${recipient}\nAmount: ${draft.amount.trim()} ${asset.symbol}`
          });
        }
      });

      recordDebugEvent({
        level: "info",
        source: "pay",
        message: "Submitting Private Pay through RAILGUN Broadcaster",
        detail: [
          preparedPay.route.debugLabel,
          `RAILGUN adapter: ${preparedPay.railgunAdapter}`,
          `RAILGUN 0zk: ${preparedPay.railgunAddress}`,
          `Quoted input wei: ${preparedPay.route.quotedInputAmount.toString()}`,
          `Max input wei: ${preparedPay.route.maxInputAmount.toString()}`,
          `Unshield target: ${preparedPay.railgunUnshieldTransaction.to}`,
          `Unshield tx value wei: ${preparedPay.railgunUnshieldTransaction.value.toString()}`,
          `Gross unshield WETH wei: ${preparedPay.unshieldAmountWei.toString()}`,
          `Public swap WETH wei: ${preparedPay.publicWethInputWei.toString()}`
        ].join("\n")
      });
      setPayStatus("Submitting through RAILGUN Broadcaster");
      const result = await submitPayIntent({
        intent: {
          kind: "pay",
          source: "railgun-private",
          legs: privateUsdcPayLegs,
          recipient,
          amount: draft.amount.trim(),
          preparedPay
        },
        policy
      });
      const submittedMessage = result.transactionHash
        ? `Pay submitted: ${result.transactionHash}`
        : "Private Pay broadcaster submission accepted";

      setPayStatus(submittedMessage);
      recordDebugEvent({
        level: "info",
        source: "pay",
        message: submittedMessage
      });
      void syncPublicBalance();
      void syncShieldedBalance();
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to submit Pay",
        "pay",
        [
          `Recipient: ${draft.recipient.trim()}`,
          `Amount: ${draft.amount.trim()} ${asset.symbol}`,
          `Railgun address: ${walletState.railgunAddress ?? "missing"}`,
          `Smart account: ${walletState.smartWalletAddress ?? "missing"}`,
          `Broadcaster: ${policy.broadcasterUrl.trim() || "off"}`,
          `Waku: ${policy.wakuEnabled ? "enabled" : "off"}`
        ].join("\n")
      );
      setPayStatus(message);
      setAppNotice({
        kind: "error",
        title: "Pay failed",
        message: `${message} Open Debug for the full stack trace.`
      });
    } finally {
      setIsSubmittingPay(false);
    }
  };

  const submitShield = async (amount: string) => {
    if (!walletState.railgunAddress) {
      setShieldStatus("Create a shielded 0zk address before shielding.");
      return;
    }

    if (publicBalance.status !== "ready") {
      setShieldStatus("Sync public ETH balance before shielding.");
      return;
    }

    let amountWei: bigint;

    try {
      amountWei = parseEther(amount.trim());
    } catch {
      setShieldStatus("Enter a valid ETH amount to shield.");
      return;
    }

    if (amountWei <= 0n) {
      setShieldStatus("Shield amount must be greater than zero.");
      return;
    }

    if (amountWei > publicBalance.balance.wei) {
      setShieldStatus("Shield amount exceeds the synced public ETH balance.");
      return;
    }

    setIsSubmittingShield(true);
    setShieldStatus("Preparing RAILGUN shield transaction");
    setAppNotice(null);
    recordDebugEvent({
      level: "info",
      source: "shield",
      message: "Preparing RAILGUN shield transaction",
      detail: `Amount wei: ${amountWei.toString()}\nRailgun address: ${walletState.railgunAddress}\nBundler: ${policy.bundlerUrl.trim() || "off"}`
    });

    try {
      const shieldCalls = await prepareNativeEthShieldCalls({
        amountWei,
        debugLogging: policy.debugLogging,
        railgunAddress: walletState.railgunAddress
      });
      setShieldStatus("Submitting shield user operation");
      recordDebugEvent({
        level: "info",
        source: "shield",
        message: "Submitting shield user operation",
        detail: `Calls: ${shieldCalls.length.toString()}`
      });
      const result = await sendSmartWalletCalls({
        calls: shieldCalls,
        origin: "public-smart-wallet",
        policy,
        walletState
      });
      setShieldStatus(
        result.transactionHash
          ? `Shield submitted: ${result.transactionHash}`
          : `Shield user operation submitted: ${result.userOperationHash}`
      );
      recordDebugEvent({
        level: "info",
        source: "shield",
        message: result.transactionHash
          ? `Shield submitted: ${result.transactionHash}`
          : `Shield user operation submitted: ${result.userOperationHash}`
      });
      await syncPublicBalance();
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to submit shield",
        "shield",
        `Amount wei: ${amountWei.toString()}\nRailgun address: ${walletState.railgunAddress}`
      );
      setShieldStatus(message);
      setAppNotice({
        kind: "error",
        title: "Shield failed",
        message: `${message} Open Debug for the full stack trace.`
      });
    } finally {
      setIsSubmittingShield(false);
    }
  };

  const exportAccount = async () => {
    if (isExportingAccount || isImportingAccount) {
      return;
    }

    if (
      !walletState.passkeyPresent &&
      !walletState.smartWalletAddress &&
      !walletState.railgunAddress
    ) {
      setAccountExportStatus("No local account exists to export.");
      return;
    }

    setIsExportingAccount(true);
    setAccountExportStatus("Preparing account export");
    setStatusMessage("Preparing account export");
    setAppNotice(null);

    try {
      const railgunWallet = await exportEncryptedRailgunWallet();
      const accountExport = createBindleAccountExport({
        railgunWallet,
        wallet: walletState
      });
      const blob = new Blob([JSON.stringify(accountExport, null, 2)], {
        type: "application/json"
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = accountExportFilename(walletState);
      link.rel = "noopener";
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);

      const message = railgunWallet
        ? "Account export downloaded. It can reclaim the shielded 0zk account; the public smart account still requires the same synced passkey."
        : "Account metadata export downloaded. No local RAILGUN recovery phrase was included; the public smart account still requires the same synced passkey.";
      setAccountExportStatus(message);
      setStatusMessage("Account export downloaded");
      recordDebugEvent({
        level: "info",
        source: "settings",
        message: "Account export downloaded",
        detail: railgunWallet
          ? `Railgun address: ${railgunWallet.railgunAddress}`
          : "No RAILGUN wallet secrets included"
      });
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to export account",
        "settings"
      );
      setAccountExportStatus(message);
      setStatusMessage(message);
      setAppNotice({
        kind: "error",
        title: "Account export failed",
        message: `${message} Open Debug for the full stack trace.`
      });
    } finally {
      setIsExportingAccount(false);
    }
  };

  const importAccountExportFile = async (file: File) => {
    if (isExportingAccount || isImportingAccount) {
      return;
    }

    if (
      (walletState.passkeyPresent ||
        walletState.smartWalletAddress ||
        walletState.railgunAddress) &&
      !window.confirm(
        "Importing an account export replaces local Bindle wallet metadata and Bindle-owned encrypted RAILGUN secrets in this browser. Continue?"
      )
    ) {
      return;
    }

    setIsImportingAccount(true);
    setAccountExportStatus("Importing account export");
    setStatusMessage("Importing account export");
    setAppNotice(null);

    try {
      const accountExport = parseBindleAccountExport(await file.text());
      const importedWallet = accountExport.railgunWallet
        ? await importEncryptedRailgunWallet({
            recoveryPhrase: accountExport.railgunWallet.recoveryPhrase,
            keyIndex: accountExport.railgunWallet.keyIndex,
            chainId: BigInt(accountExport.railgunWallet.chainId)
          })
        : null;

      if (
        importedWallet &&
        accountExport.railgunWallet &&
        importedWallet.railgunAddress !== accountExport.railgunWallet.railgunAddress
      ) {
        await clearEncryptedRailgunWallet();
        throw new Error(
          "Account export RAILGUN address does not match its recovery phrase."
        );
      }

      const baseState: WalletState = {
        ...accountExport.wallet,
        railgunAddress: null,
        railgunKeyStore: null,
        mnemonicPresent: false,
        railgunWalletCreatedAt: null,
        railgunWalletImportedAt: null,
        lastError: null,
        status: accountExport.wallet.smartWalletAddress
          ? "smart-wallet-planned"
          : accountExport.wallet.passkeyPresent
            ? "passkey-ready"
            : "none"
      };
      const nextState = importedWallet
        ? markRailgunWalletReady(
            baseState,
            importedWallet.railgunAddress,
            "imported"
          )
        : saveWalletState(baseState);

      if (!importedWallet) {
        await clearEncryptedRailgunWallet();
      }

      setWalletState(nextState);
      setRailgunStorageMode(importedWallet ? "browser-local" : "missing");
      setRailgunStorageChecked(true);
      setRailgunRepairPreviousAddress(null);
      setRailgunRepairStatus("");
      setRailgunReplacementRecoveryPhrase(null);
      setPublicBalance(
        nextState.smartWalletAddress ? { status: "idle" } : { status: "missing-wallet" }
      );
      setPublicActivity(
        nextState.smartWalletAddress
          ? { status: "idle", items: [] }
          : { status: "missing-wallet", items: [] }
      );
      setShieldedBalance(
        nextState.railgunAddress ? { status: "idle" } : { status: "missing-wallet" }
      );
      setSmartAccountDeployment(
        initialSmartAccountDeploymentStatus(nextState.smartWalletAddress)
      );

      const passkeyRpId = nextState.passkeyRpId ?? "this site";
      const message = importedWallet
        ? `Account export imported. Shielded 0zk keys were re-encrypted here; public smart-account spending still requires the same synced passkey for RP ID ${passkeyRpId}.`
        : `Account metadata imported. No RAILGUN recovery phrase was present; public smart-account spending still requires the same synced passkey for RP ID ${passkeyRpId}.`;
      setAccountExportStatus(message);
      setStatusMessage("Account export imported");
      recordDebugEvent({
        level: "info",
        source: "settings",
        message: "Account export imported",
        detail: importedWallet
          ? `Railgun address: ${importedWallet.railgunAddress}\nPasskey RP ID: ${passkeyRpId}`
          : `No RAILGUN wallet secrets imported\nPasskey RP ID: ${passkeyRpId}`
      });
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to import account export",
        "settings"
      );
      setAccountExportStatus(message);
      setStatusMessage(message);
      setAppNotice({
        kind: "error",
        title: "Account import failed",
        message: `${message} Open Debug for the full stack trace.`
      });
    } finally {
      setIsImportingAccount(false);
    }
  };

  const createOwnerEnrollmentCode = async (
    authenticatorKind: PasskeyAuthenticatorKind
  ) => {
    if (!walletState.smartWalletAddress) {
      setOwnerEnrollmentStatus(
        "Create or import the public smart-account address first."
      );
      return;
    }

    setIsCreatingOwnerEnrollment(true);
    setOwnerEnrollmentStatus(
      authenticatorKind === "security-key"
        ? "Creating bindle.cash YubiKey owner credential"
        : "Creating bindle.cash owner credential"
    );
    setAppNotice(null);

    try {
      const { code, enrollment } = await createBindleOwnerEnrollmentCode({
        authenticatorKind,
        smartWalletAddress: walletState.smartWalletAddress
      });
      const pending = savePendingOwnerEnrollment({ code, enrollment });
      setPendingOwnerEnrollment(pending);
      setOwnerEnrollmentImportText("");
      setOwnerEnrollmentStatus(
        `Owner enrollment code ready for RP ID ${enrollment.targetRpId}. Paste it into the bindle.me migration bridge, then import the updated export it downloads.`
      );
      setStatusMessage("Owner enrollment code ready");
      recordDebugEvent({
        level: "info",
        source: "settings",
        message: "Owner enrollment code created",
        detail: [
          `Smart account: ${walletState.smartWalletAddress}`,
          `RP ID: ${enrollment.targetRpId}`,
          `Authenticator: ${enrollment.credential.authenticatorAttachment}`,
          `User verification: ${enrollment.credential.userVerification}`,
          `Credential: ${enrollment.credential.id}`
        ].join("\n")
      });
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to create owner enrollment code",
        "settings"
      );
      setOwnerEnrollmentStatus(message);
      setStatusMessage(message);
      setAppNotice({
        kind: "error",
        title: "Owner enrollment failed",
        message: `${message} Open Debug for the full stack trace.`
      });
    } finally {
      setIsCreatingOwnerEnrollment(false);
    }
  };

  const copyOwnerEnrollmentCode = async () => {
    if (!pendingOwnerEnrollment?.code) {
      return;
    }

    await navigator.clipboard.writeText(pendingOwnerEnrollment.code);
    setOwnerEnrollmentStatus("Owner enrollment code copied.");
  };

  const importOwnerEnrollmentCode = () => {
    try {
      const enrollment = parseBindleOwnerEnrollmentCode(ownerEnrollmentImportText);

      if (
        walletState.smartWalletAddress &&
        enrollment.smartWalletAddress &&
        walletState.smartWalletAddress.toLowerCase() !==
          enrollment.smartWalletAddress.toLowerCase()
      ) {
        throw new Error(
          "Owner enrollment code is for a different smart-wallet address."
        );
      }

      const pending = savePendingOwnerEnrollment({
        code: ownerEnrollmentImportText.trim(),
        enrollment
      });
      setPendingOwnerEnrollment(pending);
      setOwnerEnrollmentStatus(
        `Owner enrollment code imported for RP ID ${enrollment.credential.rpId}.`
      );
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to import owner enrollment code",
        "settings"
      );
      setOwnerEnrollmentStatus(message);
    }
  };

  const activatePendingOwnerEnrollment = () => {
    if (!pendingOwnerEnrollment) {
      setOwnerEnrollmentStatus("Create or import an owner enrollment code first.");
      return;
    }

    const { enrollment } = pendingOwnerEnrollment;

    if (
      walletState.smartWalletAddress &&
      enrollment.smartWalletAddress &&
      walletState.smartWalletAddress.toLowerCase() !==
        enrollment.smartWalletAddress.toLowerCase()
    ) {
      setOwnerEnrollmentStatus(
        "Owner enrollment code is for a different smart-wallet address."
      );
      return;
    }

    const enrolledState = markPasskeyEnrolled(walletState, {
      id: enrollment.credential.id,
      publicKey: enrollment.credential.publicKey,
      rpId: enrollment.credential.rpId,
      authenticatorAttachment: enrollment.credential.authenticatorAttachment,
      userVerification: enrollment.credential.userVerification
    });
    const nextState =
      enrollment.smartWalletAddress && !enrolledState.smartWalletAddress
        ? saveWalletState({
            ...enrolledState,
            smartWalletAddress: enrollment.smartWalletAddress,
            status: enrolledState.railgunAddress
              ? "railgun-ready"
              : "smart-wallet-planned"
          })
        : enrolledState;
    setWalletState(nextState);
    setOwnerEnrollmentStatus(
      `Active signing passkey set to RP ID ${enrollment.credential.rpId}.`
    );
    setStatusMessage("Active signing passkey updated");
    recordDebugEvent({
      level: "info",
      source: "settings",
      message: "Active signing passkey updated from owner enrollment",
      detail: [
        `Smart account: ${nextState.smartWalletAddress ?? "not present"}`,
        `RP ID: ${enrollment.credential.rpId}`,
        `Authenticator: ${enrollment.credential.authenticatorAttachment}`,
        `Credential: ${enrollment.credential.id}`
      ].join("\n")
    });
  };

  const updatePasskeyPreference = ({
    authenticatorAttachment,
    userVerification
  }: {
    authenticatorAttachment: AuthenticatorAttachment;
    userVerification: UserVerificationRequirement;
  }) => {
    if (!walletState.passkeyCredentialId) {
      setStatusMessage("Import or create a passkey-backed account first.");
      return;
    }

    const nextState = saveWalletState({
      ...walletState,
      passkeyAuthenticatorAttachment: authenticatorAttachment,
      passkeyUserVerification: userVerification
    });
    setWalletState(nextState);

    const message =
      authenticatorAttachment === "cross-platform"
        ? "Passkey signing preference set to YubiKey / security key"
        : "Passkey signing preference set to phone or computer";
    setStatusMessage(message);
    recordDebugEvent({
      level: "info",
      source: "settings",
      message: "Passkey signing preference updated",
      detail: `Authenticator: ${authenticatorAttachment}\nUser verification: ${userVerification}`
    });
  };

  const resetLocalWallet = () => {
    setWalletState(resetWalletState());
    clearLocalOnboardingComplete();
    setLocalOnboardingComplete(false);
    clearCachedShieldedEthBalance();
    setCachedShieldedBalance(null);
    setShieldedBalance({ status: "missing-wallet" });
    setRailgunStorageMode("missing");
    setRailgunStorageChecked(true);
    setAccountExportStatus("");
    setPendingOwnerEnrollment(null);
    setOwnerEnrollmentImportText("");
    clearPendingOwnerEnrollment();
    setOwnerEnrollmentStatus("");
    setRailgunRepairStatus("");
    setRailgunRepairPreviousAddress(null);
    setRailgunReplacementRecoveryPhrase(null);
    setStatusMessage("Local wallet metadata cleared");
    setAppNotice(null);
    void clearEncryptedRailgunWallet()
      .then(() => setStatusMessage("Local wallet metadata and secrets cleared"))
      .catch((error) => {
        setStatusMessage(
          messageFromError(
            error,
            "Unable to clear encrypted RAILGUN wallet secrets",
            "settings"
          )
        );
      });
  };

  const noticeAction = appNotice?.action;

  return (
    <main
      className="app-shell"
      data-theme-accent={theme.accent}
      data-theme-mode={theme.mode}
    >
      <section className="phone-frame" aria-label="Bindle wallet">
        <header className="app-header">
          <div className="brand-lockup">
            <img className="brand-mark" src="/logo.png" alt="" />
            <div className="brand-copy">
              <strong>Bindle</strong>
              <span className="eyebrow">ETH mainnet</span>
              <BuildMetadataLink />
            </div>
          </div>

          <div className="header-actions">
            <button className="icon-button ghost" type="button" title="Hide balance">
              <Eye size={21} aria-hidden="true" />
            </button>
            <button className="icon-button ghost" type="button" title="More">
              <MoreHorizontal size={22} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="app-content">
          {appNotice ? (
            <section
              className={`app-notice ${appNotice.kind}`}
              aria-label={`${appNotice.title} notice`}
            >
              <strong>{appNotice.title}</strong>
              <span>{appNotice.message}</span>
              {noticeAction ? (
                <button
                  className="notice-action"
                  type="button"
                  onClick={() => handleNoticeAction(noticeAction)}
                >
                  {noticeAction.label}
                </button>
              ) : null}
            </section>
          ) : null}

        {showRailgunRepairPrompt ? (
          <RailgunKeyRecoveryPrompt
            mode={railgunRepairMode ?? "missing"}
            oldRailgunAddress={
              railgunRepairMode
                ? walletState.railgunAddress ?? ""
                : railgunRepairPreviousAddress ?? ""
            }
            replacementRailgunAddress={
              railgunReplacementRecoveryPhrase ? walletState.railgunAddress : null
            }
            isReplacing={isReplacingRailgunWallet}
            status={railgunRepairStatus}
            replacementRecoveryPhrase={railgunReplacementRecoveryPhrase}
            onReplace={() => void replaceIncompatibleRailgunWallet()}
          />
        ) : null}

        {activeTab === "wallet" ? (
          <>
            {!onboardingComplete ? (
              <OnboardingWizard
                walletState={walletState}
                passkeyCapability={passkeyCapability}
                isCreatingPasskey={isCreatingPasskey}
                isCreatingRailgunWallet={isCreatingRailgunWallet}
                isImportingRailgunWallet={isImportingRailgunWallet}
                policy={policy}
                toolkitState={toolkitState}
                statusMessage={statusMessage}
                onCreatePasskey={() => void createPasskeyWallet()}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onCreateRailgunWallet={createRailgunWallet}
                onImportRailgunWallet={importRailgunWallet}
                onOpenConnections={() => setActiveTab("nodes")}
                onStartToolkit={() => void startToolkit()}
                isDerivingSmartWallet={isDerivingSmartWallet}
              />
            ) : null}

            <BalancePanel
              totalBalance={shieldedBalanceUsd}
              balanceLabel={balanceLabel}
              networkStatus={shieldedBalanceNetworkStatus(
                shieldedBalance,
                currentCachedShieldedBalance
              )}
              shieldedStatus={shieldedStatus}
              networkLabel="Ethereum mainnet"
              smartWalletAddress={walletState.smartWalletAddress}
              smartWalletStatus={smartWalletStatus}
              smartWalletDeploymentStatus={smartWalletDeploymentStatus}
              railgunAddress={walletState.railgunAddress}
              railgunStatus={railgunStatus}
              canSyncShielded={canSyncShieldedBalance}
              isSyncingShielded={shieldedBalance.status === "syncing"}
              syncShieldedDisclosure={
                canSyncShieldedBalance
                  ? `Sync may contact ${shieldedBalanceEndpointSummary}`
                  : null
              }
              activeAction={activeAction}
              onActionChange={setActiveAction}
              onSyncShielded={() => void syncShieldedBalance()}
            />

            <UnshieldedBalanceBanner
              balance={knownPublicBalance}
              canShield={canShield}
              canSync={canSyncPublicBalance}
              isSyncing={publicBalance.status === "syncing"}
              isShielding={isSubmittingShield}
              syncDisclosure={
                canSyncPublicBalance ? publicBalanceEndpointSummary : null
              }
              shieldDisclosure={shieldDisclosure}
              shieldEndpointDisclosures={shieldEndpointDisclosure}
              shieldStatus={shieldStatus}
              onSync={() => void syncPublicBalance()}
              onShield={(amount) => void submitShield(amount)}
            />

            {activeAction ? (
              <WalletActionPanel
                action={activeAction}
                draft={draft}
                routedIntent={routedIntent}
                hasRailgunWallet={hasRailgunWallet}
                hasSmartWallet={hasSmartWallet}
                rpcConfigured={rpcConfigured}
                rpcReady={rpcReady}
                bundlerReady={bundlerReady}
                walletState={walletState}
                isSubmittingSmartPayment={isSubmittingSmartPayment}
                smartPaymentStatus={smartPaymentStatus}
                isSubmittingPay={isSubmittingPay}
                payStatus={payStatus}
                payProofPercent={payProofProgress.percent}
                payProofStatus={payProofProgress.status}
                privatePayReadiness={privatePayReadiness}
                endpointDisclosures={actionEndpointDisclosure}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onOpenConnections={() => setActiveTab("nodes")}
                onCloseAction={() => setActiveAction(null)}
                onSubmitSmartPayment={() => void submitSmartPayment()}
                onSubmitPay={() => void submitPay()}
                onDraftChange={setDraft}
                onRouteChange={setRoutedIntent}
              />
            ) : null}

            <ActivityFeed
              items={publicActivity.items}
              status={publicActivityStatus(publicActivity)}
            />
          </>
        ) : null}

        {activeTab === "nodes" ? (
          <PrivacySwitchboard
            policy={policy}
            toolkitState={toolkitState}
            statusMessage={statusMessage}
            isStarting={toolkitState === "starting"}
            onConnect={startToolkit}
            onChange={updateConnectionPolicy}
          />
        ) : null}

        {activeTab === "settings" ? (
          <SettingsPanel
            theme={theme}
            walletState={walletState}
            accountExportStatus={accountExportStatus}
            ownerEnrollmentCode={pendingOwnerEnrollment?.code ?? ""}
            ownerEnrollment={pendingOwnerEnrollment?.enrollment ?? null}
            ownerEnrollmentImportText={ownerEnrollmentImportText}
            ownerEnrollmentStatus={ownerEnrollmentStatus}
            isExportingAccount={isExportingAccount}
            isImportingAccount={isImportingAccount}
            isCreatingOwnerEnrollment={isCreatingOwnerEnrollment}
            onThemeChange={setTheme}
            onExportAccount={() => void exportAccount()}
            onImportAccountExport={(file) => void importAccountExportFile(file)}
            onCreateOwnerEnrollmentCode={(kind) =>
              void createOwnerEnrollmentCode(kind)
            }
            onCopyOwnerEnrollmentCode={() => void copyOwnerEnrollmentCode()}
            onOwnerEnrollmentImportTextChange={setOwnerEnrollmentImportText}
            onImportOwnerEnrollmentCode={importOwnerEnrollmentCode}
            onActivateOwnerEnrollment={activatePendingOwnerEnrollment}
            onPasskeyPreferenceChange={updatePasskeyPreference}
            onResetWallet={resetLocalWallet}
          />
        ) : null}

        {activeTab === "debug" ? (
          <DebugPanel entries={debugLog} onClear={clearDebugEvents} />
        ) : null}

          <PwaInstallPrompt />
        </div>
        <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
      </section>
    </main>
  );
}

function App() {
  const runningAsPwa = usePwaDisplayMode();

  if (!runningAsPwa) {
    return <BrowserLandingPage />;
  }

  return <WalletApp />;
}

export default App;
