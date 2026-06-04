import { formatEther, formatUnits } from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createExplicitRpcProvider } from "../privacy/adapters/rpcProvider";
import { createKohakuIndexedDbDatabase } from "../privacy/storage/kohakuDatabase";
import { createKohakuWasmTrapError } from "../privacy/toolkitErrors";
import { createVisibleMainnetClient } from "../wallet/mainnetClient";
import { loadKohakuRailgunBrowserModule } from "./kohakuRailgunModule";
import { unlockEncryptedRailgunWallet } from "./railgunWallet";

type KohakuRailgunTypes = typeof import("@kohaku-eth/railgun");
type KohakuBalanceModule = Pick<
  KohakuRailgunTypes,
  "RailgunBuilder" | "RailgunSigner" | "UtxoSyncer" | "chainConfig"
>;

type RailgunAssetId = {
  type: string;
  value?: `0x${string}`;
};

export type ShieldedEthBalance = {
  railgunAddress: string;
  wei: bigint;
  formattedEth: string;
  usd: string | null;
  blockNumber: bigint;
  syncedAt: string;
  price: {
    answer: bigint;
    decimals: number;
    updatedAt: bigint;
    source: "chainlink-eth-usd-via-rpc";
  } | null;
};

const chainlinkEthUsdFeed = "0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
const chainlinkEthUsdAbi = [
  {
    inputs: [],
    name: "decimals",
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "latestRoundData",
    outputs: [
      { name: "roundId", type: "uint80" },
      { name: "answer", type: "int256" },
      { name: "startedAt", type: "uint256" },
      { name: "updatedAt", type: "uint256" },
      { name: "answeredInRound", type: "uint80" }
    ],
    stateMutability: "view",
    type: "function"
  }
] as const;

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

const loadKohakuBalanceModule = ({
  debugLogging
}: {
  debugLogging: boolean;
}): Promise<KohakuBalanceModule> =>
  loadKohakuRailgunBrowserModule({
    logLevel: debugLogging ? "Debug" : "Warn"
  });

export const formatShieldedEthBalance = (wei: bigint): string => {
  const exact = formatEther(wei);
  const [whole, fraction = ""] = exact.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "");

  return trimmedFraction ? `${whole}.${trimmedFraction} ETH` : `${whole} ETH`;
};

export const formatUsdFromEth = ({
  ethWei,
  priceAnswer,
  priceDecimals
}: {
  ethWei: bigint;
  priceAnswer: bigint;
  priceDecimals: number;
}): string => {
  const usdScaled = (ethWei * priceAnswer) / 10n ** 18n;
  const exact = formatUnits(usdScaled, priceDecimals);
  const [whole, fraction = ""] = exact.split(".");
  const roundedFraction = `${fraction}00`.slice(0, 2);
  const formattedWhole = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  return `$${formattedWhole}.${roundedFraction}`;
};

export const sumWrappedBaseTokenBalance = ({
  balances,
  wrappedBaseToken
}: {
  balances: Array<[RailgunAssetId, bigint]>;
  wrappedBaseToken: `0x${string}`;
}): bigint =>
  balances.reduce((total, [asset, amount]) => {
    if (
      asset.type !== "Erc20" ||
      !asset.value ||
      asset.value.toLowerCase() !== wrappedBaseToken.toLowerCase()
    ) {
      return total;
    }

    return total + amount;
  }, 0n);

const fetchEthUsdPrice = async (
  policy: ConnectionPolicy
): Promise<ShieldedEthBalance["price"]> => {
  const client = await createVisibleMainnetClient(policy);
  const [decimals, roundData] = await Promise.all([
    client.readContract({
      address: chainlinkEthUsdFeed,
      abi: chainlinkEthUsdAbi,
      functionName: "decimals"
    }),
    client.readContract({
      address: chainlinkEthUsdFeed,
      abi: chainlinkEthUsdAbi,
      functionName: "latestRoundData"
    })
  ]);
  const [, answer, , updatedAt] = roundData as unknown as [
    bigint,
    bigint,
    bigint,
    bigint,
    bigint
  ];

  if (answer <= 0n) {
    throw new Error("Chainlink ETH/USD price feed returned a non-positive answer.");
  }

  return {
    answer,
    decimals,
    updatedAt,
    source: "chainlink-eth-usd-via-rpc"
  };
};

export const fetchShieldedEthBalance = async (
  policy: ConnectionPolicy
): Promise<ShieldedEthBalance> => {
  if (policy.providerMode === "helios") {
    throw new Error(
      "Helios provider mode is visible in Connections but shielded balance sync is not wired through Helios yet."
    );
  }

  const ethereumRpcUrl = policy.ethereumRpcUrl.trim();

  if (!ethereumRpcUrl) {
    throw new Error("Configure an Ethereum RPC endpoint before shielded balance sync.");
  }

  const unlockedWallet = await unlockEncryptedRailgunWallet();
  const kohaku = await withKohakuWasmTrapContext(
    "loading Kohaku RAILGUN shielded balance module",
    () => loadKohakuBalanceModule({ debugLogging: policy.debugLogging })
  );
  const provider = createExplicitRpcProvider(ethereumRpcUrl);
  const chainId = await provider.getChainId();
  const chain = await withKohakuWasmTrapContext(
    `loading the Kohaku RAILGUN chain config for chain ID ${chainId}`,
    () => kohaku.chainConfig(chainId)
  );

  if (!chain) {
    throw new Error(`Kohaku RAILGUN does not support chain ID ${chainId}.`);
  }

  if (BigInt(chain.id) !== unlockedWallet.chainId) {
    throw new Error(
      `Stored 0zk wallet is for chain ${unlockedWallet.chainId.toString()}, but the configured RPC is chain ${chain.id}.`
    );
  }

  const database = createKohakuIndexedDbDatabase(`railgun:${chain.id}`);
  const syncer = await withKohakuWasmTrapContext(
    "creating the Kohaku RAILGUN balance syncer",
    () => kohaku.UtxoSyncer.rpc(chain, provider, 10n)
  );
  const railgunProvider = await withKohakuWasmTrapContext(
    "building the Kohaku RAILGUN balance provider",
    () =>
      new kohaku.RailgunBuilder(chain, provider)
        .withDatabase(database)
        .withUtxoSyncer(syncer)
        .build()
  );
  const signer = kohaku.RailgunSigner.privateKey(
    unlockedWallet.spendingKey,
    unlockedWallet.viewingKey,
    unlockedWallet.chainId
  );

  try {
    await withKohakuWasmTrapContext(
      "registering the local RAILGUN signer for balance sync",
      () => railgunProvider.register(signer)
    );
    await withKohakuWasmTrapContext("syncing RAILGUN shielded notes", () =>
      railgunProvider.sync()
    );
    const balances = await withKohakuWasmTrapContext(
      "reading RAILGUN shielded balances",
      () => railgunProvider.balance(signer.address)
    );
    const wei = sumWrappedBaseTokenBalance({
      balances: balances as Array<[RailgunAssetId, bigint]>,
      wrappedBaseToken: chain.wrappedBaseToken
    });
    const [blockNumber, price] = await Promise.all([
      provider.getBlockNumber(),
      fetchEthUsdPrice(policy).catch(() => null)
    ]);

    return {
      railgunAddress: signer.address,
      wei,
      formattedEth: formatShieldedEthBalance(wei),
      usd: price
        ? formatUsdFromEth({
            ethWei: wei,
            priceAnswer: price.answer,
            priceDecimals: price.decimals
          })
        : null,
      blockNumber,
      syncedAt: new Date().toISOString(),
      price
    };
  } finally {
    signer.free();
    railgunProvider.free();
    syncer.free();
  }
};
