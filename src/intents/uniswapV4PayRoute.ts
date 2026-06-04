import {
  encodeAbiParameters,
  encodeFunctionData,
  getAddress,
  parseUnits,
  zeroAddress,
  type Address,
  type Hex
} from "viem";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import { createVisibleMainnetClient } from "../wallet/mainnetClient";
import type { PayAsset } from "./assets";
import {
  DEFAULT_PAY_MAX_SLIPPAGE_BPS,
  UNISWAP_V4_QUOTE_SOURCE,
  uniswapV4MainnetContracts
} from "./swapRouting";

export type CrossContractCall = {
  to: Address;
  data: Hex;
  value?: bigint;
};

export type UniswapV4PoolKey = {
  currency0: Address;
  currency1: Address;
  fee: number;
  tickSpacing: number;
  hooks: Address;
};

export type UniswapV4PayRouteQuote = {
  poolKey: UniswapV4PoolKey;
  quotedInputAmount: bigint;
  maxInputAmount: bigint;
  gasEstimate: bigint;
  slippageBps: number;
};

export type UniswapV4PayRoute = UniswapV4PayRouteQuote & {
  outputAmount: bigint;
  outputAsset: PayAsset;
  recipient: Address;
  refundRecipient: Address;
  deadline: bigint;
  calls: CrossContractCall[];
  debugLabel: string;
};

const wethMainnetAddress = getAddress(
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"
) as Address;
const nativeEthCurrency = zeroAddress as Address;
const noHooks = zeroAddress as Address;
const universalRouterAddress = getAddress(
  uniswapV4MainnetContracts.universalRouter
) as Address;
const quoterAddress = getAddress(uniswapV4MainnetContracts.quoter) as Address;

export const UNISWAP_V4_NATIVE_ETH_SWEEP_TOKEN = nativeEthCurrency;
export const UNISWAP_V4_WETH_ADDRESS = wethMainnetAddress;
export const UNISWAP_V4_USDC_ETH_CANDIDATE_POOLS: UniswapV4PoolKey[] = [
  { currency0: nativeEthCurrency, currency1: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as Address, fee: 500, tickSpacing: 10, hooks: noHooks },
  { currency0: nativeEthCurrency, currency1: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as Address, fee: 3000, tickSpacing: 60, hooks: noHooks },
  { currency0: nativeEthCurrency, currency1: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as Address, fee: 100, tickSpacing: 1, hooks: noHooks },
  { currency0: nativeEthCurrency, currency1: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48") as Address, fee: 10000, tickSpacing: 200, hooks: noHooks }
];

const maxUint128 = (1n << 128n) - 1n;
const payRouteDeadlineSeconds = 20n * 60n;

const v4QuoterAbi = [
  {
    type: "function",
    name: "quoteExactOutputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "poolKey",
            type: "tuple",
            components: [
              { name: "currency0", type: "address" },
              { name: "currency1", type: "address" },
              { name: "fee", type: "uint24" },
              { name: "tickSpacing", type: "int24" },
              { name: "hooks", type: "address" }
            ]
          },
          { name: "zeroForOne", type: "bool" },
          { name: "exactAmount", type: "uint128" },
          { name: "hookData", type: "bytes" }
        ]
      }
    ],
    outputs: [
      { name: "amountIn", type: "uint256" },
      { name: "gasEstimate", type: "uint256" }
    ]
  }
] as const;

const universalRouterAbi = [
  {
    type: "function",
    name: "execute",
    stateMutability: "payable",
    inputs: [
      { name: "commands", type: "bytes" },
      { name: "inputs", type: "bytes[]" },
      { name: "deadline", type: "uint256" }
    ],
    outputs: []
  }
] as const;

const wethAbi = [
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "wad", type: "uint256" }],
    outputs: []
  }
] as const;

const quoteExactOutputSingleParams = [
  {
    type: "tuple",
    components: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "zeroForOne", type: "bool" },
      { name: "amountOut", type: "uint128" },
      { name: "amountInMaximum", type: "uint128" },
      { name: "minHopPriceX36", type: "uint256" },
      { name: "hookData", type: "bytes" }
    ]
  }
] as const;

const currencyAndAmountParams = [
  { name: "currency", type: "address" },
  { name: "amount", type: "uint256" }
] as const;

const takeParams = [
  { name: "currency", type: "address" },
  { name: "recipient", type: "address" },
  { name: "amount", type: "uint256" }
] as const;

const sweepParams = [
  { name: "token", type: "address" },
  { name: "recipient", type: "address" },
  { name: "amountMinimum", type: "uint256" }
] as const;

const v4ActionsAndParams = [
  { name: "actions", type: "bytes" },
  { name: "params", type: "bytes[]" }
] as const;

const slippageCeiling = (amount: bigint, slippageBps: number): bigint => {
  if (!Number.isFinite(slippageBps) || slippageBps <= 0) {
    return amount;
  }

  const numerator = amount * BigInt(10_000 + Math.ceil(slippageBps));
  return (numerator + 9_999n) / 10_000n;
};

const assertUint128 = (label: string, value: bigint): void => {
  if (value < 0n || value > maxUint128) {
    throw new Error(`${label} exceeds the Uniswap v4 uint128 amount range.`);
  }
};

export const parsePayOutputAmount = (amount: string, asset: PayAsset): bigint => {
  const parsedAmount = parseUnits(amount.trim(), asset.decimals);

  if (parsedAmount <= 0n) {
    throw new Error("Pay amount must be greater than zero.");
  }

  return parsedAmount;
};

export const quoteUniswapV4EthToUsdcExactOutput = async ({
  outputAmount,
  policy,
  quoterAccount,
  slippageBps = DEFAULT_PAY_MAX_SLIPPAGE_BPS
}: {
  outputAmount: bigint;
  policy: ConnectionPolicy;
  quoterAccount: Address;
  slippageBps?: number;
}): Promise<UniswapV4PayRouteQuote> => {
  if (policy.priceQuoteUrl.trim() !== UNISWAP_V4_QUOTE_SOURCE) {
    throw new Error(
      "Configure the visible Uniswap v4 onchain quote source before Pay."
    );
  }

  assertUint128("USDC output amount", outputAmount);

  const client = await createVisibleMainnetClient(policy);
  const failures: string[] = [];
  const quotes: UniswapV4PayRouteQuote[] = [];

  for (const poolKey of UNISWAP_V4_USDC_ETH_CANDIDATE_POOLS) {
    try {
      const { result } = await client.simulateContract({
        account: quoterAccount,
        address: quoterAddress,
        abi: v4QuoterAbi,
        functionName: "quoteExactOutputSingle",
        args: [
          {
            poolKey,
            zeroForOne: true,
            exactAmount: outputAmount,
            hookData: "0x"
          }
        ]
      });
      const [quotedInputAmount, gasEstimate] = result;
      const maxInputAmount = slippageCeiling(quotedInputAmount, slippageBps);

      assertUint128("ETH input maximum", maxInputAmount);
      quotes.push({
        poolKey,
        quotedInputAmount,
        maxInputAmount,
        gasEstimate,
        slippageBps
      });
    } catch (error) {
      failures.push(
        `${poolKey.fee.toString()}/${poolKey.tickSpacing.toString()}: ${
          error instanceof Error ? error.message : "quote failed"
        }`
      );
    }
  }

  const bestQuote = quotes.sort((left, right) =>
    left.quotedInputAmount < right.quotedInputAmount
      ? -1
      : left.quotedInputAmount > right.quotedInputAmount
        ? 1
        : 0
  )[0];

  if (!bestQuote) {
    throw new Error(
      `Uniswap v4 did not return an ETH/USDC exact-output quote through the configured RPC. Tried ${failures.join("; ")}`
    );
  }

  return bestQuote;
};

export const buildUniswapV4EthToUsdcExactOutputCalls = ({
  deadline,
  outputAmount,
  poolKey,
  recipient,
  refundRecipient,
  maxInputAmount
}: {
  deadline: bigint;
  outputAmount: bigint;
  poolKey: UniswapV4PoolKey;
  recipient: Address;
  refundRecipient: Address;
  maxInputAmount: bigint;
}): CrossContractCall[] => {
  assertUint128("USDC output amount", outputAmount);
  assertUint128("ETH input maximum", maxInputAmount);

  const v4SwapParams = encodeAbiParameters(quoteExactOutputSingleParams, [
    {
      poolKey,
      zeroForOne: true,
      amountOut: outputAmount,
      amountInMaximum: maxInputAmount,
      minHopPriceX36: 0n,
      hookData: "0x"
    }
  ]);
  const settleAllParams = encodeAbiParameters(currencyAndAmountParams, [
    nativeEthCurrency,
    maxInputAmount
  ]);
  const sendOutputParams = encodeAbiParameters(takeParams, [
    poolKey.currency1,
    recipient,
    outputAmount
  ]);
  const v4SwapInput = encodeAbiParameters(v4ActionsAndParams, [
    "0x080c0e",
    [v4SwapParams, settleAllParams, sendOutputParams]
  ]);
  const sweepLeftoverEthInput = encodeAbiParameters(sweepParams, [
    UNISWAP_V4_NATIVE_ETH_SWEEP_TOKEN,
    refundRecipient,
    0n
  ]);
  const routerData = encodeFunctionData({
    abi: universalRouterAbi,
    functionName: "execute",
    args: ["0x1004", [v4SwapInput, sweepLeftoverEthInput], deadline]
  });
  const withdrawWethData = encodeFunctionData({
    abi: wethAbi,
    functionName: "withdraw",
    args: [maxInputAmount]
  });

  return [
    {
      to: wethMainnetAddress,
      data: withdrawWethData,
      value: 0n
    },
    {
      to: universalRouterAddress,
      data: routerData,
      value: maxInputAmount
    }
  ];
};

export const prepareUniswapV4EthToUsdcExactOutputRoute = async ({
  amount,
  outputAsset,
  policy,
  quoterAccount,
  recipient,
  refundRecipient,
  nowSeconds = BigInt(Math.floor(Date.now() / 1000))
}: {
  amount: string;
  outputAsset: PayAsset;
  policy: ConnectionPolicy;
  quoterAccount: Address;
  recipient: Address;
  refundRecipient: Address;
  nowSeconds?: bigint;
}): Promise<UniswapV4PayRoute> => {
  if (outputAsset.symbol !== "USDC") {
    throw new Error("Uniswap v4 Pay currently supports USDC output.");
  }

  const outputAmount = parsePayOutputAmount(amount, outputAsset);
  const quote = await quoteUniswapV4EthToUsdcExactOutput({
    outputAmount,
    policy,
    quoterAccount
  });
  const deadline = nowSeconds + payRouteDeadlineSeconds;
  const calls = buildUniswapV4EthToUsdcExactOutputCalls({
    deadline,
    outputAmount,
    poolKey: quote.poolKey,
    recipient,
    refundRecipient,
    maxInputAmount: quote.maxInputAmount
  });

  return {
    ...quote,
    outputAmount,
    outputAsset,
    recipient,
    refundRecipient,
    deadline,
    calls,
    debugLabel: `Uniswap v4 exact-output ETH->USDC pool ${quote.poolKey.fee.toString()}/${quote.poolKey.tickSpacing.toString()}`
  };
};
