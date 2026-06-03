import type { ProviderMode } from "../privacy/connectionPolicy";
import { createKohakuWasmTrapError } from "../privacy/toolkitErrors";

export type ReadinessItem = {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
};

export type ReadinessReport = {
  ready: boolean;
  items: ReadinessItem[];
};

export type ShieldReadinessInput = {
  smartWalletAddress: string | null;
  railgunAddress: string | null;
  hasRecoverableRailgunKeyMaterial: boolean;
  publicBalanceWei: bigint | null;
  ethereumRpcUrl: string;
  bundlerUrl: string;
  providerMode: ProviderMode;
};

export type UnshieldReadinessInput = {
  railgunAddress: string | null;
  hasRecoverableRailgunKeyMaterial: boolean;
  shieldedBalanceWei: bigint | null;
  toolkitReady: boolean;
  ethereumRpcUrl: string;
  broadcasterUrl: string;
  providerMode: ProviderMode;
};

export type ShieldCall = {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
};

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuShieldModule = Pick<
  KohakuRailgunTypes,
  "ShieldBuilder" | "chainConfig" | "initLogging"
> & {
  default: () => Promise<unknown>;
};

const railgunAddressPattern = /^0zk[A-Za-z0-9]{16,}$/;

const loadKohakuShieldModule = (): Promise<KohakuShieldModule> =>
  import(
    "../../node_modules/@kohaku-eth/railgun/dist/pkg/index.js"
  ) as Promise<KohakuShieldModule>;

const withKohakuWasmTrapContext = async <T>(
  operation: string,
  action: () => Promise<T> | T
): Promise<T> => {
  try {
    return await action();
  } catch (error) {
    throw createKohakuWasmTrapError(operation, error);
  }
};

const readinessReport = (items: ReadinessItem[]): ReadinessReport => ({
  ready: items.every((item) => item.ready),
  items
});

export const summarizeMissingRequirements = (
  report: ReadinessReport,
  limit = 3
): string => {
  const missing = report.items
    .filter((item) => !item.ready)
    .map((item) => item.label);

  if (missing.length === 0) {
    return "ready";
  }

  const visible = missing.slice(0, limit).join(", ");
  const remaining = missing.length - limit;

  return remaining > 0 ? `${visible}, and ${remaining} more` : visible;
};

export const assessShieldReadiness = ({
  smartWalletAddress,
  railgunAddress,
  hasRecoverableRailgunKeyMaterial,
  publicBalanceWei,
  ethereumRpcUrl,
  bundlerUrl,
  providerMode
}: ShieldReadinessInput): ReadinessReport =>
  readinessReport([
    {
      id: "public-smart-wallet",
      label: "public smart wallet",
      ready: smartWalletAddress !== null,
      detail: smartWalletAddress ?? "create the passkey funding address"
    },
    {
      id: "public-balance",
      label: "synced public ETH",
      ready: publicBalanceWei !== null && publicBalanceWei > 0n,
      detail:
        publicBalanceWei !== null
          ? `${publicBalanceWei.toString()} wei`
          : "sync the public funding balance"
    },
    {
      id: "railgun-address",
      label: "real 0zk address",
      ready: railgunAddress !== null && railgunAddressPattern.test(railgunAddress),
      detail: railgunAddress ?? "create or import a recoverable RAILGUN wallet"
    },
    {
      id: "railgun-key-material",
      label: "recoverable RAILGUN keys",
      ready: hasRecoverableRailgunKeyMaterial,
      detail: hasRecoverableRailgunKeyMaterial
        ? "available"
        : "spending/viewing material is not wired"
    },
    {
      id: "ethereum-rpc",
      label: "Ethereum RPC",
      ready: ethereumRpcUrl.trim().length > 0,
      detail: ethereumRpcUrl.trim() || "configure a visible RPC endpoint"
    },
    {
      id: "erc4337-bundler",
      label: "ERC-4337 bundler",
      ready: bundlerUrl.trim().length > 0,
      detail: bundlerUrl.trim() || "configure a visible bundler endpoint"
    },
    {
      id: "provider-mode",
      label: "Direct RPC mode",
      ready: providerMode === "direct-rpc",
      detail:
        providerMode === "direct-rpc"
          ? "direct RPC"
          : "Helios shield calls are not wired yet"
    }
  ]);

export const assessUnshieldReadiness = ({
  railgunAddress,
  hasRecoverableRailgunKeyMaterial,
  shieldedBalanceWei,
  toolkitReady,
  ethereumRpcUrl,
  broadcasterUrl,
  providerMode
}: UnshieldReadinessInput): ReadinessReport =>
  readinessReport([
    {
      id: "railgun-address",
      label: "real 0zk address",
      ready: railgunAddress !== null && railgunAddressPattern.test(railgunAddress),
      detail: railgunAddress ?? "create or import a recoverable RAILGUN wallet"
    },
    {
      id: "railgun-key-material",
      label: "recoverable RAILGUN keys",
      ready: hasRecoverableRailgunKeyMaterial,
      detail: hasRecoverableRailgunKeyMaterial
        ? "available"
        : "spending/viewing material is not wired"
    },
    {
      id: "shielded-balance",
      label: "synced shielded ETH",
      ready: shieldedBalanceWei !== null && shieldedBalanceWei > 0n,
      detail:
        shieldedBalanceWei !== null
          ? `${shieldedBalanceWei.toString()} wei`
          : "sync shielded balances first"
    },
    {
      id: "privacy-toolkit",
      label: "RAILGUN toolkit ready",
      ready: toolkitReady,
      detail: toolkitReady ? "ready" : "start the privacy toolkit"
    },
    {
      id: "ethereum-rpc",
      label: "Ethereum RPC",
      ready: ethereumRpcUrl.trim().length > 0,
      detail: ethereumRpcUrl.trim() || "configure a visible RPC endpoint"
    },
    {
      id: "railgun-broadcaster",
      label: "RAILGUN broadcaster",
      ready: broadcasterUrl.trim().length > 0,
      detail: broadcasterUrl.trim() || "configure a visible broadcaster"
    },
    {
      id: "provider-mode",
      label: "Direct RPC mode",
      ready: providerMode === "direct-rpc",
      detail:
        providerMode === "direct-rpc"
          ? "direct RPC"
          : "Helios unshield calls are not wired yet"
    }
  ]);

export const prepareNativeEthShieldCalls = async ({
  railgunAddress,
  amountWei,
  chainId = 1n,
  debugLogging = false
}: {
  railgunAddress: string;
  amountWei: bigint;
  chainId?: bigint;
  debugLogging?: boolean;
}): Promise<ShieldCall[]> => {
  if (!railgunAddressPattern.test(railgunAddress)) {
    throw new Error("A real 0zk RAILGUN address is required for shielding.");
  }

  if (amountWei <= 0n) {
    throw new Error("Shield amount must be greater than zero.");
  }

  const kohaku = await loadKohakuShieldModule();
  await withKohakuWasmTrapContext("preparing the native ETH shield transaction", async () => {
    await kohaku.default();
    kohaku.initLogging(debugLogging ? "Debug" : "Warn");
  });

  const chain = await withKohakuWasmTrapContext(
    `loading the Kohaku RAILGUN shield chain config for chain ID ${chainId}`,
    () => kohaku.chainConfig(chainId)
  );

  if (!chain) {
    throw new Error(`Kohaku RAILGUN does not support chain ID ${chainId}.`);
  }

  return withKohakuWasmTrapContext(
    "building the native ETH shield transaction",
    () =>
      new kohaku.ShieldBuilder(chain)
        .shieldNative(railgunAddress as `0zk${string}`, amountWei)
        .build()
        .map((tx) => ({
          to: tx.to,
          data: tx.data,
          value: BigInt(tx.value)
        }))
  );
};
