import { Copy, MoreHorizontal, RotateCw } from "lucide-react";
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
import { RelaysPanel } from "./components/RelaysPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import {
  UnshieldedBalanceBanner,
  type ShieldRequest
} from "./components/UnshieldedBalanceBanner";
import { WalletActionPanel } from "./components/WalletActionPanel";
import { getPayAsset } from "./intents/assets";
import {
  assertPrivatePayChangeDisposition,
  classifyPayTransactionOrigin,
  ephemeralPrivatePayChangeMessage,
  getRailgunBroadcasterReadiness,
  privatePayLegs,
  type RailgunBroadcasterReadiness
} from "./intents/payFlow";
import { routeIntent, type IntentDraft, type RoutedIntent } from "./intents/router";
import { getPaySwapRoutePlan } from "./intents/swapRouting";
import { usdToEthString } from "./intents/conversion";
import {
  clearDebugLog,
  createDebugLogEntry,
  loadDebugLog,
  saveDebugLog,
  trimDebugLog,
  type CreateDebugLogEntryInput,
  type DebugLogEntry
} from "./debug/debugLog";
import { scanWakuBroadcasterMap } from "./debug/relayMap";
import type { ConnectionPolicy } from "./privacy/connectionPolicy";
import {
  loadConnectionPolicy,
  saveConnectionPolicy
} from "./privacy/connectionPolicyState";
import { buildEndpointDisclosure } from "./privacy/preflightDisclosure";
import {
  assessShieldReadiness,
  estimatePublicShieldGasReserveWei,
  prepareNativeEthShieldCalls,
  spendablePublicShieldAmountWei,
  summarizeMissingRequirements
} from "./railgun/shielding";
import {
  loadRailgunRelayRegistry,
  selectedRailgunRelay,
  upsertRelaysFromWakuSnapshot
} from "./railgun/relayRegistry";
import { prepareRailgunPayForRecipient, type RailgunPayProgress } from "./railgun/pay";

import {
  fetchShieldedEthBalance,
  type ShieldedEthBalance
} from "./railgun/shieldedBalance";
import {
  postShieldBalanceRefreshDelaysMs,
  shouldStartShieldedBalanceAutoSync
} from "./railgun/shieldedBalanceRefresh";
import {
  clearCachedShieldedEthBalance,
  loadCachedShieldedEthBalance,
  saveCachedShieldedEthBalance,
  type ShieldedEthBalanceCacheContext
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
  isKohakuRpcFetchFailure
} from "./privacy/toolkitErrors";
import { usePwaDisplayMode } from "./pwa/usePwaDisplayMode";
import { defaultTheme, type ThemeSelection } from "./theme/theme";
import {
  accountExportFilename,
  createBindleAccountExport,
  parseBindleAccountExport
} from "./wallet/accountExport";
import {
  deploySmartWalletAccount,
  deriveSmartWalletAddressFromPasskey,
  sendSmartWalletCalls
} from "./wallet/smartAccountAdapter";
import {
  fetchSmartAccountDeploymentStatus
} from "./wallet/smartAccountDeployment";
import {
  fetchPublicEthBalance,
  formatEthBalance,
  type PublicEthBalance
} from "./wallet/publicBalance";
import { createVisibleMainnetClient } from "./wallet/mainnetClient";
import { estimateVisibleUserOperationFees } from "./wallet/userOperationGas";
import {
  fetchPublicEthActivity,
  type PublicEthActivityScan,
  loadCachedPublicActivity,
  saveCachedPublicActivity,
  mergePublicActivity
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

const estimateShieldSweepGasReserve = async (
  policy: ConnectionPolicy
): Promise<bigint> => {
  if (policy.paymasterUrl.trim()) {
    return 0n;
  }

  const client = await createVisibleMainnetClient(policy);
  const fees = await estimateVisibleUserOperationFees({
    bundlerUrl: policy.bundlerUrl,
    fallbackEstimator: client
  });

  return estimatePublicShieldGasReserveWei(fees.maxFeePerGas);
};

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
  | { status: "missing-wallet" | "missing-rpc" | "idle" | "syncing"; items: ActivityItem[] }
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

type AppNoticeAction = { kind: "open-connections"; label: string };

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

const initialPublicActivityState = (): PublicActivityState => {
  const wallet = loadWalletState();
  if (!wallet.smartWalletAddress) {
    return { status: "missing-wallet", items: [] };
  }
  const cachedRaw = loadCachedPublicActivity(wallet.smartWalletAddress);
  const scanDummy: PublicEthActivityScan = {
    address: wallet.smartWalletAddress as `0x${string}`,
    blockNumber: 0n,
    scannedFromBlock: 0n,
    scannedToBlock: 0n,
    items: cachedRaw,
    syncedAt: new Date().toISOString()
  };
  const items = publicActivityToItems(scanDummy);
  return { status: "idle", items };
};

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

const defaultShieldedBalanceChainId = 1n;

const shieldedBalanceCacheContextForWallet = (
  wallet: Pick<WalletState, "railgunAddress" | "railgunDerivationProvider">
): ShieldedEthBalanceCacheContext | null =>
  wallet.railgunAddress
    ? {
        railgunAddress: wallet.railgunAddress,
        derivationProvider: wallet.railgunDerivationProvider ?? "unknown",
        chainId: defaultShieldedBalanceChainId
      }
    : null;

const loadCachedShieldedBalanceForWallet = (
  wallet: Pick<WalletState, "railgunAddress" | "railgunDerivationProvider">
): ShieldedEthBalance | null => {
  const context = shieldedBalanceCacheContextForWallet(wallet);

  return context ? loadCachedShieldedEthBalance(context) : null;
};

const isBalanceForWallet = (
  balance: ShieldedEthBalance | null,
  wallet: Pick<WalletState, "railgunAddress" | "railgunDerivationProvider">
): balance is ShieldedEthBalance =>
  Boolean(
    balance &&
      wallet.railgunAddress &&
      balance.railgunAddress.toLowerCase() ===
        wallet.railgunAddress.toLowerCase() &&
      balance.derivationProvider ===
        (wallet.railgunDerivationProvider ?? "unknown") &&
      balance.chainId === defaultShieldedBalanceChainId
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
  const [isSubmittingPay, setIsSubmittingPay] = useState(false);
  const [payStatus, setPayStatus] = useState("");
  const [payProofProgress, setPayProofProgress] = useState<RailgunPayProgress>({
    percent: 0,
    status: ""
  });
  const [freshPrivatePayReadiness, setFreshPrivatePayReadiness] =
    useState<RailgunBroadcasterReadiness | null>(null);
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
  const [createdRailgunRecoveryPhrase, setCreatedRailgunRecoveryPhrase] =
    useState<string | null>(null);
  const [copiedCreatedRailgunRecoveryPhrase, setCopiedCreatedRailgunRecoveryPhrase] =
    useState(false);
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
      loadCachedShieldedBalanceForWallet(loadWalletState())
    );
  const [relayRegistry, setRelayRegistry] = useState(() =>
    loadRailgunRelayRegistry()
  );
  const [relayWatchStatus, setRelayWatchStatus] = useState("idle");
  const relayRegistryRef = useRef(relayRegistry);

  const publicBalanceRequestRef = useRef(0);
  const publicActivityRequestRef = useRef(0);
  const shieldedBalanceRequestRef = useRef(0);
  const smartAccountDeploymentRequestRef = useRef(0);
  const publicBalanceAutoSyncKeyRef = useRef<string | null>(null);
  const shieldedBalanceAutoSyncKeyRef = useRef<string | null>(null);
  const relayAutoWatchInFlightRef = useRef(false);
  const relayAutoWatchRunRef = useRef(0);
  const hasRailgunWallet = walletState.railgunAddress !== null;
  const hasSmartWallet = walletState.smartWalletAddress !== null;
  const rpcReady = toolkitState === "ready" && policy.ethereumRpcUrl.length > 0;
  const rpcConfigured = policy.ethereumRpcUrl.trim().length > 0;
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
  const privatePayReadiness =
    freshPrivatePayReadiness ?? getRailgunBroadcasterReadiness(policy);
  const relayAutoWatchEnabled =
    policy.wakuEnabled &&
    policy.railgunBroadcasterEnabled &&
    (policy.railgunBroadcasterMode === "waku-public-network" ||
      policy.railgunBroadcasterMode === "custom-waku");
  const relayAutoWatchPolicyKey = JSON.stringify({
    enabled: relayAutoWatchEnabled,
    mode: policy.railgunBroadcasterMode,
    feeToken: policy.railgunBroadcasterFeeToken,
    customFeeToken: policy.railgunBroadcasterCustomFeeTokenAddress,
    pubsubTopic: policy.railgunBroadcasterPubSubTopic,
    directPeers: policy.railgunBroadcasterDirectPeers
  });
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
  const currentCachedShieldedBalance = isBalanceForWallet(
    cachedShieldedBalance,
    walletState
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
  const isUnshieldedLessThanMinimum = (() => {
    if (publicBalance.status !== "ready") {
      return false;
    }
    if (publicBalanceWei === null || publicBalanceWei === 0n) {
      return true;
    }
    const price = visibleShieldedBalance?.price;
    if (price) {
      const usdScaled = (publicBalanceWei * price.answer) / 10n ** 18n;
      const twoDollarsScaled = 2n * (10n ** BigInt(price.decimals));
      const absoluteMinGasReserveWei = 1_000_000_000_000_000n; // 0.001 ETH
      const minGasReserveUsdScaled = (absoluteMinGasReserveWei * price.answer) / 10n ** 18n;
      const minimumUsdScaled = twoDollarsScaled > minGasReserveUsdScaled
        ? twoDollarsScaled
        : minGasReserveUsdScaled;
      return usdScaled < minimumUsdScaled;
    }
    return publicBalanceWei < 1_000_000_000_000_000n; // 0.001 ETH (absolute min gas reserve)
  })();
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
    relayRegistryRef.current = relayRegistry;
  }, [relayRegistry]);

  useEffect(() => {
    setActiveAction(null);
  }, [activeTab]);

  useEffect(() => {
    if (!relayAutoWatchEnabled) {
      setRelayWatchStatus("Waku relay watch off in current policy");
      return;
    }

    let cancelled = false;
    let timeout: number | null = null;
    const runId = relayAutoWatchRunRef.current + 1;
    relayAutoWatchRunRef.current = runId;

    const schedule = () => {
      if (cancelled) {
        return;
      }

      timeout = window.setTimeout(
        () => void scan("periodic"),
        activeAction === "pay" ? 30_000 : 90_000
      );
    };

    const scan = async (reason: "startup" | "periodic" | "pay-open") => {
      if (
        cancelled ||
        relayAutoWatchRunRef.current !== runId ||
        relayAutoWatchInFlightRef.current
      ) {
        schedule();
        return;
      }

      relayAutoWatchInFlightRef.current = true;
      setRelayWatchStatus(
        reason === "pay-open"
          ? "Refreshing Waku relays for Pay"
          : "Watching Waku relays"
      );

      try {
        const snapshot = await scanWakuBroadcasterMap(policy);

        if (cancelled || relayAutoWatchRunRef.current !== runId) {
          return;
        }

        const nextRegistry = upsertRelaysFromWakuSnapshot({
          preferredFeeToken: policy.railgunBroadcasterFeeToken,
          registry: relayRegistryRef.current,
          snapshot
        });
        const selected = selectedRailgunRelay(nextRegistry);

        relayRegistryRef.current = nextRegistry;
        setRelayRegistry(nextRegistry);
        setRelayWatchStatus(
          selected
            ? `Selected ${selected.identifier ?? selected.railgunAddress.slice(0, 12)} for ${selected.supportedFeeTokens.join("/")}`
            : `Waku relay watch ${snapshot.status}`
        );
        recordDebugEvent({
          level:
            snapshot.status === "connected" || selected !== null
              ? "info"
              : "warning",
          source: "relays",
          message:
            selected !== null
              ? "Auto-selected RAILGUN Waku broadcaster"
              : `Waku relay watch ${snapshot.status}`,
          detail: [
            `Reason: ${reason}`,
            `Peers: ${snapshot.wakuPeerCount ?? "unknown"}`,
            `Parsed fee ads: ${snapshot.rawFeeAdsParsed.toString()}`,
            `Candidates: ${snapshot.discoveredBroadcasters.length.toString()}`,
            selected
              ? `Selected: ${selected.railgunAddress} (${selected.supportedFeeTokens.join(", ")})`
              : "Selected: none"
          ].join("\n")
        });
      } catch (error) {
        if (!cancelled && relayAutoWatchRunRef.current === runId) {
          setRelayWatchStatus(
            error instanceof Error ? error.message : "Waku relay auto-watch failed"
          );
          recordDebugEvent({
            level: "warning",
            source: "relays",
            message:
              error instanceof Error
                ? error.message
                : "Waku relay auto-watch failed",
            error
          });
        }
      } finally {
        relayAutoWatchInFlightRef.current = false;
        schedule();
      }
    };

    void scan(activeAction === "pay" ? "pay-open" : "startup");

    return () => {
      cancelled = true;

      if (timeout !== null) {
        window.clearTimeout(timeout);
      }
    };
  }, [
    activeAction,
    policy,
    policy.railgunBroadcasterFeeToken,
    recordDebugEvent,
    relayAutoWatchEnabled,
    relayAutoWatchPolicyKey
  ]);

  useEffect(() => {
    setCachedShieldedBalance(loadCachedShieldedBalanceForWallet(walletState));
  }, [walletState.railgunAddress, walletState.railgunDerivationProvider]);

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

  const copyCreatedRailgunRecoveryPhrase = useCallback(async () => {
    if (!createdRailgunRecoveryPhrase) {
      return;
    }

    await navigator.clipboard.writeText(createdRailgunRecoveryPhrase);
    setCopiedCreatedRailgunRecoveryPhrase(true);
  }, [createdRailgunRecoveryPhrase]);

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
    setFreshPrivatePayReadiness(null);
  }, [draft.amount, draft.asset, draft.recipient, policy]);

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
    const cachedRaw = loadCachedPublicActivity(walletState.smartWalletAddress);
    const scanDummy: PublicEthActivityScan = {
      address: walletState.smartWalletAddress as `0x${string}`,
      blockNumber: 0n,
      scannedFromBlock: 0n,
      scannedToBlock: 0n,
      items: cachedRaw,
      syncedAt: new Date().toISOString()
    };
    const items = publicActivityToItems(scanDummy);
    setPublicActivity({ status: "idle", items });
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
        message: failure.message
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

  const handleNoticeAction = () => {
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
    setPublicActivity((prev) => ({ status: "syncing", items: prev.items }));
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
        const cachedRaw = loadCachedPublicActivity(smartWalletAddress);
        const mergedRaw = mergePublicActivity(cachedRaw, scan.items);
        saveCachedPublicActivity(smartWalletAddress, mergedRaw);

        const mergedScan: PublicEthActivityScan = {
          ...scan,
          items: mergedRaw
        };
        const items = publicActivityToItems(mergedScan);
        setPublicActivity({ status: "ready", scan: mergedScan, items });
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
        setPublicActivity((prev) => ({ status: "error", message, items: prev.items }));
      }
    }
  };

  const syncSmartAccountDeployment = async () => {
    const smartWalletAddress = walletState.smartWalletAddress;

    if (!smartWalletAddress) {
      return;
    }

    if (!policy.ethereumRpcUrl.trim()) {
      return;
    }

    const requestId = smartAccountDeploymentRequestRef.current + 1;
    smartAccountDeploymentRequestRef.current = requestId;
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
        messageFromError(
          error,
          "Unable to check smart-account deployment",
          "smart-account",
          `Address: ${smartWalletAddress}\nRPC: ${policy.ethereumRpcUrl.trim()}`
        );
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

    if (
      !shouldStartShieldedBalanceAutoSync({
        previousSyncKey: shieldedBalanceAutoSyncKeyRef.current,
        shieldedBalanceStatus: shieldedBalance.status,
        syncKey
      })
    ) {
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

  const refreshShieldedBalanceAfterShield = () => {
    const railgunAddress = walletState.railgunAddress;
    const policyKey = [
      policy.ethereumRpcUrl.trim(),
      policy.railgunSyncUrl.trim(),
      policy.providerMode,
      policy.privacyToolkit
    ].join(":");

    if (!railgunAddress || !hasRecoverableRailgunKeyMaterial) {
      return;
    }

    const stillCurrent = () => {
      const currentPolicy = loadConnectionPolicy();
      const currentPolicyKey = [
        currentPolicy.ethereumRpcUrl.trim(),
        currentPolicy.railgunSyncUrl.trim(),
        currentPolicy.providerMode,
        currentPolicy.privacyToolkit
      ].join(":");

      return (
        loadWalletState().railgunAddress === railgunAddress &&
        currentPolicyKey === policyKey
      );
    };

    const runRefresh = async (message: string, detail: string) => {
      if (!stillCurrent()) {
        return;
      }

      shieldedBalanceAutoSyncKeyRef.current = null;
      recordDebugEvent({
        level: "info",
        source: "shielded-balance",
        message,
        detail
      });
      await syncShieldedBalance();
    };

    void (async () => {
      await runRefresh(
        "Refreshing shielded balance after shield submission",
        `Railgun address: ${railgunAddress}`
      );

      for (const delayMs of postShieldBalanceRefreshDelaysMs) {
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, delayMs);
        });

        if (!stillCurrent()) {
          return;
        }

        await runRefresh(
          "Retrying shielded balance refresh after RAILGUN indexer delay",
          [
            `Railgun address: ${railgunAddress}`,
            `Delay ms: ${delayMs.toString()}`
          ].join("\n")
        );
      }
    })();
  };

  useEffect(() => {
    const smartWalletAddress = walletState.smartWalletAddress;
    const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

    if (!smartWalletAddress) {
      publicBalanceAutoSyncKeyRef.current = null;
      return;
    }

    if (!ethereumRpcUrl) {
      publicBalanceAutoSyncKeyRef.current = null;
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
        "created",
        wallet.derivationProvider
      );
      setWalletState(nextState);
      setRailgunStorageMode("browser-local");
      setRailgunStorageChecked(true);
      setCreatedRailgunRecoveryPhrase(wallet.recoveryPhrase);
      setCopiedCreatedRailgunRecoveryPhrase(false);
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
      const wallet = await importEncryptedRailgunWallet({ recoveryPhrase });
      const nextState = markRailgunWalletReady(
        walletState,
        wallet.railgunAddress,
        "imported",
        wallet.derivationProvider
      );
      setWalletState(nextState);
      setRailgunStorageMode("browser-local");
      setRailgunStorageChecked(true);
      setCreatedRailgunRecoveryPhrase(null);
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
    const previousCacheContext = shieldedBalanceCacheContextForWallet(walletState);
    setRailgunRepairPreviousAddress(previousRailgunAddress);
    setRailgunReplacementRecoveryPhrase(null);
    setCreatedRailgunRecoveryPhrase(null);
    setRailgunRepairStatus("Wiping incompatible local RAILGUN key record");
    setStatusMessage("Replacing shielded RAILGUN wallet");
    setAppNotice(null);

    try {
      await clearEncryptedRailgunWallet();
      clearCachedShieldedEthBalance(previousCacheContext);
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
        "created",
        wallet.derivationProvider
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



  const submitPay = async () => {
    const asset = getPayAsset(draft.asset);

    if (!asset) {
      setPayStatus("Choose a supported pay asset.");
      return;
    }

    if (!walletState.railgunAddress) {
      setPayStatus("Create or import a shielded 0zk wallet before Pay.");
      return;
    }

    setIsSubmittingPay(true);
    setPayStatus("Initializing keys...");
    setPayProofProgress({
      percent: 20,
      status: "Initializing keys"
    });
    setAppNotice(null);

    let preparedPay: any = null;
    let localSigner: any = null;
    let localBundler: any = null;
    try {
      if (activeAction === "send") {
        setPayStatus("Generating zk-SNARK proof and preparing user operation...");
        setPayProofProgress({
          percent: 40,
          status: "Generating zk-SNARK proof"
        });

        const convertedAmountEth = usdToEthString(draft.amount, visibleShieldedBalance?.price ?? null);

        preparedPay = await prepareRailgunPayForRecipient({
          amount: convertedAmountEth,
          asset,
          policy,
          recipient: draft.recipient,
          walletState,
          onProgress: (progress) => {
            setPayProofProgress({
              percent: 40 + Math.floor(progress.percent * 0.4),
              status: progress.status
            });
          },
          onStatus: (msg) => {
            setPayStatus(msg);
          }
        });

        if (!preparedPay.privateOperation) {
          throw new Error("Private operation preparation failed.");
        }

        setPayStatus("Signing and submitting User Operation to bundler...");
        setPayProofProgress({
          percent: 90,
          status: "Submitting to bundler"
        });

        const { signableUserOp, delegatingSignerPrivateKey } = preparedPay.privateOperation;
        const { loadKohakuRailgunBrowserModule } = await import("./railgun/kohakuRailgunModule");
        const kohaku = await loadKohakuRailgunBrowserModule();
        localSigner = kohaku.Signer.privateKey(delegatingSignerPrivateKey);
        const bundler = kohaku.Bundler.pimlico(policy.bundlerUrl.trim());
        localBundler = bundler;

        const signedUserOp = await signableUserOp.sign(localSigner);
        const userOpHash = await bundler.sendUserOperation(signedUserOp);

        setPayStatus(`User operation submitted: ${userOpHash}. Waiting for transaction...`);
        const receipt = await bundler.waitForReceipt(userOpHash);
        const txHash = receipt.receipt.transactionHash || "pending";

        setPayStatus(`Submitted: ${txHash}`);
        setPayProofProgress({
          percent: 100,
          status: `Submitted: ${txHash}`
        });

        recordDebugEvent({
          level: "info",
          source: "pay",
          message: `Private send submitted: ${txHash}`,
          detail: `Recipient: ${draft.recipient}\nAmount: $${draft.amount} (~${convertedAmountEth} ETH)\nUserOp Hash: ${userOpHash}\nTx Hash: ${txHash}\nSubmitted via: bundler-relayer`
        });
      } else {
        if (classifyPayTransactionOrigin(privatePayLegs) !== "railgun-private") {
          setPayStatus("Private Pay route origin is not railgun-private.");
          return;
        }

        const paySwapRoutePlan = getPaySwapRoutePlan(asset);
        const readinessLines = [
          "✅ RPC and ERC-4337 bundler checked",
          "✅ zk-SNARK proof generation ready",
          `✅ Relayer: ERC-4337 bundler (${policy.bundlerUrl.trim()})`,
          `✅ Fee token: ${policy.railgunBroadcasterFeeToken}`
        ];

        try {
          const changeDisposition =
            paySwapRoutePlan?.changeDisposition ?? "unknown";

          assertPrivatePayChangeDisposition(changeDisposition);
          readinessLines.push(
            changeDisposition === "private-change-to-0zk"
              ? "✅ Change routing returns to 0zk"
              : `✅ ${ephemeralPrivatePayChangeMessage}`
          );
        } catch {
          readinessLines.push("❌ Unsafe change routing is blocked");
        }

        setPayProofProgress({
          percent: 100,
          status: readinessLines.join("\n")
        });
        setPayStatus(readinessLines.join("\n"));
        recordDebugEvent({
          level: "info",
          source: "pay",
          message: "Private Pay readiness checked",
          detail: [
            `Recipient: ${draft.recipient.trim()}`,
            `Amount: ${draft.amount.trim()} ${asset.symbol}`,
            `Railgun address: ${walletState.railgunAddress}`,
            `Derivation provider: ${walletState.railgunDerivationProvider ?? "unknown"}`,
            readinessLines.join("\n")
          ].join("\n")
        });
        setAppNotice({
          kind: "warning",
          title: "Private Pay readiness checked",
          message:
            "ERC-4337 bundler checked. Proof generation and bundler-relayed private actions are fully ready for private payments."
        });
      }
    } catch (error) {
      setFreshPrivatePayReadiness(null);
      setPayProofProgress({
        percent: 40,
        status: "❌ Private send preparation failed"
      });
      setPayStatus(
        messageFromError(
          error,
          "Unable to submit private payment",
          "pay",
          [
            `Recipient: ${draft.recipient.trim()}`,
            `Amount: ${draft.amount.trim()} ${asset.symbol}`,
            `Railgun address: ${walletState.railgunAddress}`
          ].join("\n")
        )
      );
      setAppNotice({
        kind: "warning",
        title: "Private action failed",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setIsSubmittingPay(false);
      if (localSigner) {
        try {
          localSigner.free();
        } catch (e) {}
      }
      if (localBundler) {
        try {
          localBundler.free();
        } catch (e) {}
      }
      if (preparedPay) {
        if (preparedPay.provider) {
          try {
            preparedPay.provider.free();
          } catch (e) {}
        }
        if (preparedPay.syncer) {
          try {
            preparedPay.syncer.free();
          } catch (e) {}
        }
        if (preparedPay.privateOperation?.signableUserOp) {
          try {
            preparedPay.privateOperation.signableUserOp.free();
          } catch (e) {}
        }
      }
    }
  };

  const submitShield = async (request: ShieldRequest) => {
    if (!walletState.railgunAddress) {
      setShieldStatus("Create a shielded 0zk address before shielding.");
      return;
    }

    if (publicBalance.status !== "ready") {
      setShieldStatus("Sync public ETH balance before shielding.");
      return;
    }

    let requestedAmountWei: bigint | null = null;
    const shieldMode = request.kind === "sweep-all" ? "sweep-all" : "custom-amount";

    if (request.kind !== "sweep-all") {
      try {
        requestedAmountWei = parseEther(request.amount.trim());
      } catch {
        setShieldStatus("Enter a valid ETH amount to shield.");
        return;
      }

      if (requestedAmountWei <= 0n) {
        setShieldStatus("Shield amount must be greater than zero.");
        return;
      }
    }

    setIsSubmittingShield(true);
    setShieldStatus(
      request.kind === "sweep-all"
        ? "Preparing full public funding sweep to RAILGUN 0zk"
        : "Preparing RAILGUN shield transaction"
    );
    setAppNotice(null);

    let amountWei = requestedAmountWei ?? publicBalance.balance.wei;
    let availableBalanceWei = publicBalance.balance.wei;
    let gasReserveWei = 0n;

    try {
      if (!walletState.smartWalletAddress) {
        throw new Error("Create the public funding smart account before shielding.");
      }

      const deployment = await fetchSmartAccountDeploymentStatus(
        policy,
        walletState.smartWalletAddress
      );

      if (deployment.status === "counterfactual") {
        setShieldStatus("Deploying public smart account before shield sweep");
        recordDebugEvent({
          level: "info",
          source: "shield",
          message: "Deploying public smart account before shield sweep",
          detail: [
            `Address: ${walletState.smartWalletAddress}`,
            `Bundler: ${policy.bundlerUrl.trim() || "off"}`,
            `Paymaster: ${policy.paymasterUrl.trim() || "off"}`
          ].join("\n")
        });

        const deployResult = await deploySmartWalletAccount({
          policy,
          walletState
        });
        recordDebugEvent({
          level: "info",
          source: "shield",
          message: deployResult.transactionHash
            ? `Public smart account deployed: ${deployResult.transactionHash}`
            : `Public smart-account deployment user operation submitted: ${deployResult.userOperationHash}`
        });

        const postDeploymentBalance = await fetchPublicEthBalance(
          policy,
          walletState.smartWalletAddress
        );
        setPublicBalance({ status: "ready", balance: postDeploymentBalance });
        availableBalanceWei = postDeploymentBalance.wei;
      }

      gasReserveWei = await estimateShieldSweepGasReserve(policy);

      if (request.kind === "sweep-all") {
        amountWei = spendablePublicShieldAmountWei({
          gasReserveWei,
          publicBalanceWei: availableBalanceWei
        });
      } else if (
        requestedAmountWei !== null &&
        requestedAmountWei >
          spendablePublicShieldAmountWei({
            gasReserveWei,
            publicBalanceWei: availableBalanceWei
          })
      ) {
        throw new Error(
          "Shield amount exceeds the spendable public ETH balance after reserving ERC-4337 fees."
        );
      }

      setShieldStatus(
        gasReserveWei > 0n && request.kind === "sweep-all"
          ? `Preparing spendable sweep to RAILGUN 0zk; reserving ${formatEthBalance(
              gasReserveWei
            )} for ERC-4337 fees because no paymaster is configured.`
          : request.kind === "sweep-all"
            ? "Preparing full public funding sweep to RAILGUN 0zk"
            : "Preparing RAILGUN shield transaction"
      );
      recordDebugEvent({
        level: "info",
        source: "shield",
        message:
          request.kind === "sweep-all"
            ? "Preparing public funding sweep"
            : "Preparing RAILGUN shield transaction",
        detail: [
          `Mode: ${shieldMode}`,
          `Amount wei: ${amountWei.toString()}`,
          `Available public funding balance wei: ${availableBalanceWei.toString()}`,
          `Reserved gas wei: ${gasReserveWei.toString()}`,
          `Railgun address: ${walletState.railgunAddress}`,
          `Bundler: ${policy.bundlerUrl.trim() || "off"}`,
          `Paymaster: ${policy.paymasterUrl.trim() || "off"}`
        ].join("\n")
      });

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
          ? `Shield submitted: ${result.transactionHash}. Syncing shielded balance.`
          : `Shield user operation submitted: ${result.userOperationHash}. Syncing shielded balance.`
      );
      recordDebugEvent({
        level: "info",
        source: "shield",
        message: result.transactionHash
          ? `Shield submitted: ${result.transactionHash}`
          : `Shield user operation submitted: ${result.userOperationHash}`
      });
      await syncPublicBalance();
      refreshShieldedBalanceAfterShield();
    } catch (error) {
      const message = messageFromError(
        error,
        "Unable to submit shield",
        "shield",
        [
          `Amount wei: ${amountWei.toString()}`,
          `Available public funding balance wei: ${availableBalanceWei.toString()}`,
          `Reserved gas wei: ${gasReserveWei.toString()}`,
          `Railgun address: ${walletState.railgunAddress}`
        ].join("\n")
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
            "imported",
            importedWallet.derivationProvider
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
      setCreatedRailgunRecoveryPhrase(null);
      setPublicBalance(
        nextState.smartWalletAddress ? { status: "idle" } : { status: "missing-wallet" }
      );
      if (nextState.smartWalletAddress) {
        const cachedRaw = loadCachedPublicActivity(nextState.smartWalletAddress);
        const scanDummy: PublicEthActivityScan = {
          address: nextState.smartWalletAddress as `0x${string}`,
          blockNumber: 0n,
          scannedFromBlock: 0n,
          scannedToBlock: 0n,
          items: cachedRaw,
          syncedAt: new Date().toISOString()
        };
        const items = publicActivityToItems(scanDummy);
        setPublicActivity({ status: "idle", items });
      } else {
        setPublicActivity({ status: "missing-wallet", items: [] });
      }
      setShieldedBalance(
        nextState.railgunAddress ? { status: "idle" } : { status: "missing-wallet" }
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

  const handleHardRefresh = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        for (const key of keys) {
          await caches.delete(key);
        }
      }
    } catch (err) {
      console.error("Hard refresh clear failed:", err);
    } finally {
      window.location.reload();
    }
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
            <button
              className="icon-button ghost"
              type="button"
              title="Hard refresh"
              onClick={handleHardRefresh}
            >
              <RotateCw size={19} aria-hidden="true" />
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
                  onClick={handleNoticeAction}
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

            {onboardingComplete && createdRailgunRecoveryPhrase ? (
              <section
                className="recovery-card"
                aria-label="Shielded wallet recovery phrase"
              >
                <span>Recovery phrase - save before funding</span>
                <strong>{createdRailgunRecoveryPhrase}</strong>
                <button
                  className="secondary-action wide"
                  type="button"
                  onClick={() => void copyCreatedRailgunRecoveryPhrase()}
                >
                  <Copy size={18} aria-hidden="true" />
                  {copiedCreatedRailgunRecoveryPhrase
                    ? "Copied"
                    : "Copy recovery phrase"}
                </button>
                <button
                  className="secondary-action wide"
                  type="button"
                  onClick={() => setCreatedRailgunRecoveryPhrase(null)}
                >
                  I saved it
                </button>
              </section>
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

            {!isUnshieldedLessThanMinimum ? (
              <UnshieldedBalanceBanner
                balance={knownPublicBalance}
                balanceWei={publicBalanceWei}
                canShield={canShield}
                canSync={canSyncPublicBalance}
                isSyncing={publicBalance.status === "syncing"}
                isShielding={isSubmittingShield}
                railgunAddress={walletState.railgunAddress}
                syncDisclosure={
                  canSyncPublicBalance ? publicBalanceEndpointSummary : null
                }
                shieldDisclosure={shieldDisclosure}
                shieldEndpointDisclosures={shieldEndpointDisclosure}
                shieldStatus={shieldStatus}
                onSync={() => void syncPublicBalance()}
                onShield={(request) => void submitShield(request)}
              />
            ) : null}

            {activeAction ? (
              <WalletActionPanel
                action={activeAction}
                draft={draft}
                routedIntent={routedIntent}
                hasRailgunWallet={hasRailgunWallet}
                rpcConfigured={rpcConfigured}
                rpcReady={rpcReady}
                walletState={walletState}
                isSubmittingPay={isSubmittingPay}
                payStatus={payStatus}
                payProofPercent={payProofProgress.percent}
                payProofStatus={payProofProgress.status}
                privatePayReadiness={privatePayReadiness}
                endpointDisclosures={actionEndpointDisclosure}
                price={visibleShieldedBalance?.price}
                onDeriveSmartWallet={() => void deriveSmartWallet()}
                onOpenConnections={() => setActiveTab("nodes")}
                onCloseAction={() => setActiveAction(null)}
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

        {activeTab === "relays" ? (
          <RelaysPanel
            policy={policy}
            relayRegistry={relayRegistry}
            relayWatchStatus={relayWatchStatus}
            onRelayRegistryChange={setRelayRegistry}
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
          <DebugPanel
            entries={debugLog}
            onClear={clearDebugEvents}
          />
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
