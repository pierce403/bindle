import { expect, test } from "@playwright/test";
import { encodeFunctionData, toFunctionSelector, zeroAddress, type Hex } from "viem";
import type { RailgunSigner, TransactionBuilder, TxData } from "@kohaku-eth/railgun";
import {
  assertKohakuPrivateSubmissionReady,
  assertPreparedPrivateRailgunTransaction,
  decodeKohakuTransaction,
  getKohakuPrivateCapabilities,
  normalizeKohakuPrivateTransaction,
  railgunTransactAbi,
  RAILGUN_MAINNET_SMART_WALLET,
  type PreTransactionPOIsPerTxidLeafPerList,
  type PrivateRailgunFee
} from "../src/railgun/privateTransactionBridge";
import { buildKohakuPrivateTransaction } from "../src/railgun/kohakuPrivateBuilder";

// Synthetic ABI/proof-shaped public values only. These are deliberately not
// cryptographic proofs and must never make the live capability guard pass.
const word = (value: number): Hex => `0x${value.toString(16).padStart(64, "0")}`;
const listKey = word(101).slice(2);
const leafHash = word(102);
const weth = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
const fixtureRecipient = "0zk1qynw6pq3nvntq90sts0khgs8ndqxzsrza88cd553dqwt28mskxlxtrv7j6fe3z53l7lczqdhfmfffxa8cps4hw7nprhx3hv3ykx097l8p7gjh2xla365qacrwu2";
const now = 1_800_000_000_000;
const fee: PrivateRailgunFee = {
  broadcasterRailgunAddress: fixtureRecipient,
  feesID: "signed-fee-ad-1",
  tokenAddress: weth,
  amount: 13_200_000_000_000n,
  gasEstimate: 10_000n,
  perUnitGas: 1_100_000_000_000_000_000n,
  expiresAt: now + 60_000
};
const pois: PreTransactionPOIsPerTxidLeafPerList = {
  [listKey]: {
    [leafHash]: {
      snarkProof: { pi_a: ["1", "2"], pi_b: [["3", "4"], ["5", "6"]], pi_c: ["7", "8"] },
      txidMerkleroot: word(10),
      poiMerkleroots: [word(11)],
      blindedCommitmentsOut: [word(12)],
      railgunTxidIfHasUnshield: word(0)
    }
  }
};

const operation = (options: { chainId?: bigint; gasPrice?: bigint; adaptContract?: Hex; adaptParams?: Hex; nullifiers?: Hex[] } = {}) => ({
  proof: { a: { x: 1n, y: 2n }, b: { x: [3n, 4n], y: [5n, 6n] }, c: { x: 7n, y: 8n } },
  merkleRoot: word(13),
  nullifiers: options.nullifiers ?? [word(14), word(15)],
  commitments: [word(16)],
  boundParams: {
    treeNumber: 0,
    minGasPrice: options.gasPrice ?? 1_000_000_000n,
    unshield: 0,
    chainID: options.chainId ?? 1n,
    adaptContract: options.adaptContract ?? zeroAddress,
    adaptParams: options.adaptParams ?? word(0),
    commitmentCiphertext: [{
      ciphertext: [word(17), word(18), word(19), word(20)],
      blindedSenderViewingKey: word(21),
      blindedReceiverViewingKey: word(22),
      annotationData: "0x1122",
      memo: "0x3344"
    }]
  },
  unshieldPreimage: { npk: word(0), token: { tokenType: 0, tokenAddress: zeroAddress, tokenSubID: 0n }, value: 0n }
} as const);

const txData = (options: Parameters<typeof operation>[0] = {}): TxData => ({
  to: RAILGUN_MAINNET_SMART_WALLET,
  data: encodeFunctionData({ abi: railgunTransactAbi, functionName: "transact", args: [[operation(options)]] }),
  value: "0x0"
});

const prepared = () => normalizeKohakuPrivateTransaction({
  transaction: txData(), fee, preTransactionPOIs: pois, requiredPoiListKeys: [listKey], now
});

test("Kohaku bridge preserves calldata, target, nullifiers, fees and POI without mutation", () => {
  // Independently checked against engine 9.7.0's official V2.1 smart-wallet ABI.
  expect(toFunctionSelector(railgunTransactAbi[0])).toBe("0xd8ae136a");
  const result = prepared();
  expect(result.target).toBe(txData().to);
  expect(result.calldata).toBe(txData().data);
  expect(result.nullifiers).toEqual([word(14), word(15)]);
  expect(result.fee).toEqual(fee);
  expect(result.preTransactionPOIs).toEqual(pois);
  expect(result.preTransactionPOIs).not.toBe(pois);
  expect(result.chain).toEqual({ type: 0, id: 1 });
  expect(result.relayAdapt).toEqual({ kind: "none", contract: null, parameters: [word(0)] });
  expect(() => assertPreparedPrivateRailgunTransaction(result, { expectedFee: fee, requiredPoiListKeys: [listKey], now })).not.toThrow();
});

test("ABI decoder preserves proof-bound adapter fields but normalization rejects unsupported relay paths", () => {
  const transaction = txData({ adaptContract: "0xAc9f360Ae85469B27aEDdEaFC579Ef2d052aD405", adaptParams: word(23) });
  const decoded = decodeKohakuTransaction(transaction);
  expect(decoded.boundParameters[0].adaptContract).toBe("0xAc9f360Ae85469B27aEDdEaFC579Ef2d052aD405");
  expect(decoded.boundParameters[0].adaptParams).toBe(word(23));
  expect(() => normalizeKohakuPrivateTransaction({ transaction, fee, preTransactionPOIs: pois, requiredPoiListKeys: [listKey], now })).toThrow(/RelayAdapt/);
  for (const kind of ["relay-adapt", "relay-adapt-7702"] as const) {
    expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), relayAdapt: { kind, contract: zeroAddress, parameters: [word(0)] } }, { now })).toThrow(/RelayAdapt/);
  }
});

test("bridge rejects a different chain, unknown target and public ETH value", () => {
  expect(() => decodeKohakuTransaction(txData({ chainId: 11155111n }))).toThrow(/different chain/);
  expect(() => decodeKohakuTransaction({ ...txData(), to: zeroAddress })).toThrow(/target/);
  expect(() => decodeKohakuTransaction({ ...txData(), value: "0x1" })).toThrow(/public ETH/);
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), chain: { type: 0, id: 11155111 } } as unknown as ReturnType<typeof prepared>, { now })).toThrow(/mainnet/);
});

test("bridge rejects missing, duplicate, or changed nullifiers and unknown or trailing calldata", () => {
  expect(() => decodeKohakuTransaction(txData({ nullifiers: [] }))).toThrow(/nullifiers/);
  expect(() => decodeKohakuTransaction(txData({ nullifiers: [word(14), word(14)] }))).toThrow(/duplicate nullifier/);
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), nullifiers: [word(24)] }, { now })).toThrow(/nullifiers differ/);
  expect(() => decodeKohakuTransaction({ ...txData(), data: "0x12345678" })).toThrow();
  expect(() => decodeKohakuTransaction({ ...txData(), data: `${txData().data}00` })).toThrow(/canonical/);
});

test("bridge rejects post-proof gas edits and incomplete or mismatched fee metadata", () => {
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), overallBatchMinGasPrice: 1n }, { now })).toThrow(/gas price differs/);
  for (const change of [
    { broadcasterRailgunAddress: "" }, { feesID: "" }, { tokenAddress: zeroAddress },
    { amount: 13_199_999_999_999n }, { gasEstimate: 0n }, { perUnitGas: 0n }, { expiresAt: now }
  ]) {
    expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), fee: { ...fee, ...change } }, { now })).toThrow();
  }
  for (const change of [
    { feesID: "changed-ad" }, { tokenAddress: "0x1111111111111111111111111111111111111111" as Hex },
    { amount: 13_200_000_000_001n }, { perUnitGas: 1_000_000_000_000_000_000n }, { gasEstimate: 9_999n }, { expiresAt: now + 1 }
  ]) {
    expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), fee: { ...fee, ...change } }, { expectedFee: fee, now })).toThrow(/reviewed broadcaster quote/);
  }
});

test("mainnet fee conversion accounts for gas price and 18-decimal unit scale", () => {
  // 10,000 gas * 120% gas reserve * 1 gwei * 110% WETH fee rate.
  expect(prepared().fee.amount).toBe(13_200_000_000_000n);
  expect(() => normalizeKohakuPrivateTransaction({
    transaction: txData({ gasPrice: 0n }), fee, preTransactionPOIs: pois, requiredPoiListKeys: [listKey], now
  })).toThrow(/nonzero proof-bound minimum gas price/);
});

test("bridge rejects absent, malformed, incomplete, and cross-list mismatched POI", () => {
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), preTransactionPOIs: {} }, { now })).toThrow(/missing pre-transaction POI/);
  expect(() => assertPreparedPrivateRailgunTransaction(prepared(), { now, requiredPoiListKeys: [word(99).slice(2)] })).toThrow(/active list/);
  const malformed = structuredClone(pois);
  malformed[listKey][leafHash].snarkProof.pi_a[0] = "NaN";
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), preTransactionPOIs: malformed }, { now })).toThrow(/field value/);
  const mismatched = { ...pois, [word(103).slice(2)]: { [word(104)]: pois[listKey][leafHash] } };
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), preTransactionPOIs: mismatched }, { now })).toThrow(/different transaction leaves/);
  const incomplete = { [listKey]: {} };
  expect(() => assertPreparedPrivateRailgunTransaction({ ...prepared(), preTransactionPOIs: incomplete }, { now })).toThrow(/operation count/);
});

test("syntactically valid fixtures never imply live Kohaku broadcaster readiness", () => {
  expect(prepared().preTransactionPOIs).toEqual(pois);
  expect(getKohakuPrivateCapabilities()).toMatchObject({
    proofApi: "available", poiApi: "post-transaction-only", liveSubmissionReady: false,
    preTransactionPoiExport: false, broadcasterFeeOutputVerification: false,
    configurableBoundGasPrice: false, relayAdaptBuilder: false, relayAdapt7702Builder: false
  });
  expect(() => assertKohakuPrivateSubmissionReady()).toThrow(/no pre-transaction POI proof export/);
});

test("dry-run construction retains each consuming WASM builder and never submits", async () => {
  const calls: string[] = [];
  const signer: RailgunSigner = {
    address: fixtureRecipient, chainId: 1n, free() {}, [Symbol.dispose]() {}
  };
  const makeBuilder = (): TransactionBuilder => {
    let consumed = false;
    const consume = (method: string): TransactionBuilder => {
      if (consumed) throw new Error("Reused consumed WASM wrapper");
      consumed = true;
      calls.push(method);
      return makeBuilder();
    };
    return {
      transfer: () => consume("transfer"),
      unshield: () => consume("unshield"),
      free: () => { if (consumed) throw new Error("Freed consumed WASM wrapper"); },
      [Symbol.dispose]() {}
    };
  };
  const result = await buildKohakuPrivateTransaction({
    signer,
    provider: {
      transact: makeBuilder,
      build: async (builder) => { builder.free(); calls.push("prove"); return txData(); }
    },
    intents: [
      { kind: "transfer", recipient: fixtureRecipient, asset: { type: "Erc20", value: weth }, amount: 42n, memo: "" },
      { kind: "erc20-unshield", recipient: "0x1111111111111111111111111111111111111111", asset: { type: "Erc20", value: weth }, amount: 43n }
    ]
  });
  expect(calls).toEqual(["transfer", "unshield", "prove"]);
  expect(result.transaction).toEqual(txData());
  expect(result.publicData.nullifiers).toEqual([word(14), word(15)]);
});
