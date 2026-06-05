import { getAddress, type Address } from "viem";
import {
  NetworkName,
  type Chain,
  type PreTransactionPOIsPerTxidLeafPerList,
  type SelectedBroadcaster,
  type TXIDVersion
} from "@railgun-community/shared-models";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { UNISWAP_V4_WETH_ADDRESS } from "../intents/uniswapV4PayRoute";

const mainnetUsdcAddress = getAddress(
  "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"
) as Address;

type WakuBroadcasterModule = typeof import("@railgun-community/waku-broadcaster-client-web");

type StartWakuBroadcasterArgs = {
  chain: Chain;
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
};

type PreparedBroadcasterSubmit = {
  txidVersion: TXIDVersion;
  chain: Chain;
  transaction: {
    to: string;
    data: string;
  };
  broadcaster: SelectedBroadcaster;
  nullifiers: string[];
  overallBatchMinGasPrice: bigint;
  useRelayAdapt: true;
  preTransactionPOIsPerTxidLeafPerList: PreTransactionPOIsPerTxidLeafPerList;
};

type WakuBroadcasterSubmitResult = {
  transactionHash: `0x${string}` | null;
  broadcasterId: string;
};

let wakuModulePromise: Promise<WakuBroadcasterModule> | null = null;
let activeWakuPolicyKey: string | null = null;
let wakuStartPromise: Promise<void> | null = null;

const loadWakuBroadcasterModule = (): Promise<WakuBroadcasterModule> => {
  wakuModulePromise ??= import("@railgun-community/waku-broadcaster-client-web");
  return wakuModulePromise;
};

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

  throw new Error(
    `${policy.railgunBroadcasterFeeToken} is not wired as a RAILGUN broadcaster fee token yet. Use USDC, WETH, or a custom ERC-20 token address.`
  );
};

const broadcasterPolicyKey = ({
  chain,
  policy
}: {
  chain: Chain;
  policy: ConnectionPolicy;
}): string =>
  JSON.stringify({
    chain,
    broadcasterUrl: policy.broadcasterUrl.trim(),
    railgunBroadcasterMode: policy.railgunBroadcasterMode,
    railgunBroadcasterEnabled: policy.railgunBroadcasterEnabled,
    railgunBroadcasterTrustedFeeSigner:
      policy.railgunBroadcasterTrustedFeeSigner.trim(),
    railgunBroadcasterPubSubTopic: policy.railgunBroadcasterPubSubTopic.trim(),
    railgunBroadcasterDnsDiscoveryUrls:
      policy.railgunBroadcasterDnsDiscoveryUrls,
    railgunBroadcasterDirectPeers: policy.railgunBroadcasterDirectPeers,
    wakuEnabled: policy.wakuEnabled,
    debugLogging: policy.debugLogging
  });

const startWakuBroadcaster = async ({
  chain,
  policy,
  onStatus
}: StartWakuBroadcasterArgs): Promise<WakuBroadcasterModule> => {
  if (!policy.wakuEnabled) {
    throw new Error("Enable Waku before Private Pay broadcaster submission.");
  }

  if (!policy.railgunBroadcasterEnabled) {
    throw new Error("Enable the RAILGUN broadcaster before Private Pay.");
  }

  const key = broadcasterPolicyKey({ chain, policy });
  const waku = await loadWakuBroadcasterModule();

  if (activeWakuPolicyKey === key && waku.WakuBroadcasterClient.isStarted()) {
    return waku;
  }

  if (wakuStartPromise) {
    await wakuStartPromise;
    return waku;
  }

  if (waku.WakuBroadcasterClient.isStarted()) {
    onStatus("Restarting RAILGUN Waku broadcaster client");
    await waku.WakuBroadcasterClient.stop();
    activeWakuPolicyKey = null;
  }

  onStatus("Starting RAILGUN Waku broadcaster client");
  const trustedFeeSigner = policy.railgunBroadcasterTrustedFeeSigner.trim();
  const dnsDiscoveryUrls = policy.railgunBroadcasterDnsDiscoveryUrls
    .map((item) => item.trim())
    .filter(Boolean);
  const additionalDirectPeers = policy.railgunBroadcasterDirectPeers
    .map((item) => item.trim())
    .filter(Boolean);

  wakuStartPromise = waku.WakuBroadcasterClient.start(
    chain,
    {
      trustedFeeSigner,
      pubSubTopic: policy.railgunBroadcasterPubSubTopic.trim(),
      dnsDiscoveryUrls,
      additionalDirectPeers,
      useDNSDiscovery: dnsDiscoveryUrls.length > 0,
      feeExpirationTimeout: 120_000,
      peerDiscoveryTimeout: 15_000,
      enableHealthcheckLogs: policy.debugLogging,
      broadcasterVersionRange: {
        minVersion: "8.0.0",
        maxVersion: "8.999.0"
      }
    },
    (_chain, status) => {
      onStatus(`RAILGUN Waku broadcaster ${status}`);
    },
    policy.debugLogging
      ? {
          log: (message) => onStatus(`Waku broadcaster: ${message}`),
          error: (error) =>
            onStatus(`Waku broadcaster error: ${error.message}`)
        }
      : undefined
  ).then(() => {
    activeWakuPolicyKey = key;
  });

  try {
    await wakuStartPromise;
    return waku;
  } finally {
    wakuStartPromise = null;
  }
};

const waitForBroadcasterFeeQuote = async ({
  waku,
  chain,
  feeTokenAddress,
  onStatus
}: {
  waku: WakuBroadcasterModule;
  chain: Chain;
  feeTokenAddress: Address;
  onStatus: (message: string) => void;
}): Promise<SelectedBroadcaster> => {
  onStatus("Discovering RAILGUN broadcasters and fee quotes");
  const startedAt = Date.now();
  const timeoutMs = 30_000;

  while (Date.now() - startedAt < timeoutMs) {
    const selected = waku.WakuBroadcasterClient.findBestBroadcaster(
      chain,
      feeTokenAddress,
      true
    );

    if (selected) {
      onStatus("RAILGUN broadcaster fee quote ready");
      return selected;
    }

    await new Promise((resolve) => {
      window.setTimeout(resolve, 1_000);
    });
  }

  throw new Error(
    `No RAILGUN Waku broadcaster advertised a fee for ${feeTokenAddress} on Ethereum mainnet. Try WETH, USDC, or another visible broadcaster endpoint.`
  );
};

export const getRailgunWakuBroadcasterQuote = async ({
  chain,
  feeTokenAddress,
  policy,
  onStatus
}: {
  chain: Chain;
  feeTokenAddress: Address;
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<SelectedBroadcaster> => {
  const waku = await startWakuBroadcaster({ chain, policy, onStatus });
  return waitForBroadcasterFeeQuote({
    waku,
    chain,
    feeTokenAddress,
    onStatus
  });
};

export const submitRailgunWakuBroadcasterTransaction = async ({
  prepared,
  policy,
  onStatus
}: {
  prepared: PreparedBroadcasterSubmit;
  policy: ConnectionPolicy;
  onStatus: (message: string) => void;
}): Promise<WakuBroadcasterSubmitResult> => {
  const waku = await startWakuBroadcaster({
    chain: prepared.chain,
    policy,
    onStatus
  });

  onStatus("Encrypting Private Pay request for selected broadcaster");
  const transaction = await waku.BroadcasterTransaction.create(
    prepared.txidVersion,
    prepared.transaction.to,
    prepared.transaction.data,
    prepared.broadcaster.railgunAddress,
    prepared.broadcaster.tokenFee.feesID,
    prepared.chain,
    prepared.nullifiers,
    prepared.overallBatchMinGasPrice,
    prepared.useRelayAdapt,
    prepared.preTransactionPOIsPerTxidLeafPerList
  );

  onStatus("Submitting Private Pay through RAILGUN Waku broadcaster");
  const transactionHash = await transaction.send();

  return {
    transactionHash: transactionHash.startsWith("0x")
      ? (transactionHash as `0x${string}`)
      : null,
    broadcasterId: prepared.broadcaster.railgunAddress
  };
};

export const getRailgunWakuBroadcasterNetworkName = (): NetworkName.Ethereum =>
  NetworkName.Ethereum;
