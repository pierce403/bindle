import {
  decodeFunctionData,
  encodeFunctionData,
  getAddress,
  isAddress,
  parseAbi,
  zeroAddress,
  type Address,
  type Hex
} from "viem";

export const KOHAKU_RAILGUN_VERSION = "0.0.1-alpha.30" as const;
export const RAILGUN_MAINNET_SMART_WALLET =
  "0xFA7093CDD9EE6932B4eb2c9e1cde7CE00B1FA4b9" as const;

// Public contract ABI, also used by Kohaku's ProvedTx::new. Keep this small
// decoder independent of the RAILGUN wallet SDK and of Waku implementation.
// https://github.com/ethereum/kohaku/blob/bec944afef87059f0bc7848fe63f4e211ca6ef6e/crates/railgun/src/abis/railgun.rs
export const railgunTransactAbi = parseAbi([
  "struct G1Point { uint256 x; uint256 y; }",
  "struct G2Point { uint256[2] x; uint256[2] y; }",
  "struct SnarkProof { G1Point a; G2Point b; G1Point c; }",
  "struct TokenData { uint8 tokenType; address tokenAddress; uint256 tokenSubID; }",
  "struct CommitmentPreimage { bytes32 npk; TokenData token; uint120 value; }",
  "struct CommitmentCiphertext { bytes32[4] ciphertext; bytes32 blindedSenderViewingKey; bytes32 blindedReceiverViewingKey; bytes annotationData; bytes memo; }",
  "struct BoundParams { uint16 treeNumber; uint72 minGasPrice; uint8 unshield; uint64 chainID; address adaptContract; bytes32 adaptParams; CommitmentCiphertext[] commitmentCiphertext; }",
  "struct Transaction { SnarkProof proof; bytes32 merkleRoot; bytes32[] nullifiers; bytes32[] commitments; BoundParams boundParams; CommitmentPreimage unshieldPreimage; }",
  "function transact(Transaction[] _transactions)"
]);

export type PreTransactionPOI = {
  snarkProof: {
    pi_a: [string, string];
    pi_b: [[string, string], [string, string]];
    pi_c: [string, string];
  };
  txidMerkleroot: string;
  poiMerkleroots: string[];
  blindedCommitmentsOut: string[];
  railgunTxidIfHasUnshield: string;
};

export type PreTransactionPOIsPerTxidLeafPerList = Record<
  string,
  Record<string, PreTransactionPOI>
>;

export type PrivateRailgunFee = {
  broadcasterRailgunAddress: string;
  feesID: string;
  tokenAddress: Address;
  amount: bigint;
  gasEstimate: bigint;
  /** Token base units per 10^18 wei of native gas cost, including markup. */
  perUnitGas: bigint;
  /** Unix milliseconds, matching the official broadcaster client's fee cache. */
  expiresAt: number;
};

export type PrivateRailgunRelayAdapt = {
  kind: "none" | "relay-adapt" | "relay-adapt-7702";
  contract: Address | null;
  parameters: Hex[];
};

export type PreparedPrivateRailgunTransaction = {
  txidVersion: "V2_PoseidonMerkle";
  chain: { type: 0; id: 1 };
  target: Address;
  calldata: Hex;
  value: bigint;
  nullifiers: Hex[];
  overallBatchMinGasPrice: bigint;
  relayAdapt: PrivateRailgunRelayAdapt;
  preTransactionPOIs: PreTransactionPOIsPerTxidLeafPerList;
  fee: PrivateRailgunFee;
  provenance: {
    source: "kohaku-railgun";
    version: typeof KOHAKU_RAILGUN_VERSION;
  };
};

export type KohakuTransactionPublicData = {
  target: Address;
  calldata: Hex;
  value: bigint;
  nullifiers: Hex[];
  operationCount: number;
  /** These are already proof-bound; never change them after proving. */
  boundParameters: Array<{
    chainId: bigint;
    minGasPrice: bigint;
    adaptContract: Address;
    adaptParams: Hex;
  }>;
};

type KohakuTxData = { to: Hex; data: Hex; value: Hex };

const fail = (message: string): never => {
  throw new Error(`Private RAILGUN transaction rejected: ${message}`);
};

const assertHex = (value: unknown, label: string, bytes?: number): void => {
  if (
    typeof value !== "string" ||
    !/^0x(?:[0-9a-fA-F]{2})*$/.test(value) ||
    (bytes !== undefined && value.length !== bytes * 2 + 2)
  ) {
    fail(`${label} must be ${bytes === undefined ? "hex bytes" : `${bytes} bytes`}.`);
  }
};

const assertNonzeroWord = (value: string, label: string): void => {
  assertHex(value, label, 32);
  if (BigInt(value) === 0n) fail(`${label} cannot be zero.`);
};

/** Decode public outputs from the only proved-transaction API in alpha.30.
 * This does not verify a SNARK or make the transaction ready for submission.
 */
export const decodeKohakuTransaction = (
  transaction: KohakuTxData
): KohakuTransactionPublicData => {
  if (!isAddress(transaction.to)) fail("target is not an Ethereum address.");
  if (getAddress(transaction.to) !== getAddress(RAILGUN_MAINNET_SMART_WALLET)) {
    fail("target is not the mainnet RAILGUN smart wallet.");
  }
  assertHex(transaction.data, "calldata");
  if (!/^0x[0-9a-fA-F]+$/.test(transaction.value)) fail("invalid transaction value.");
  const value = BigInt(transaction.value);
  if (value !== 0n) fail("a private transaction must not spend public ETH.");

  const decoded = decodeFunctionData({ abi: railgunTransactAbi, data: transaction.data });
  // Reject trailing data and noncanonical ABI encodings as well as bad selectors.
  const encoded = encodeFunctionData({
    abi: railgunTransactAbi,
    functionName: decoded.functionName,
    args: decoded.args
  });
  if (encoded.toLowerCase() !== transaction.data.toLowerCase()) {
    fail("calldata is not a canonical RAILGUN transact call.");
  }
  const operations = decoded.args[0];
  if (operations.length === 0) fail("transaction has no RAILGUN operations.");
  const nullifiers: Hex[] = [];
  const boundParameters: KohakuTransactionPublicData["boundParameters"] = [];
  for (const operation of operations) {
    if (operation.boundParams.chainID !== 1n) fail("proof is for a different chain.");
    if (operation.nullifiers.length === 0 || operation.commitments.length === 0) {
      fail("operation is missing input nullifiers or output commitments.");
    }
    assertNonzeroWord(operation.merkleRoot, "Merkle root");
    for (const nullifier of operation.nullifiers) {
      assertNonzeroWord(nullifier, "nullifier");
      nullifiers.push(nullifier);
    }
    if (operation.boundParams.unshield > 2) fail("unknown unshield type.");
    const unshieldCount = operation.boundParams.unshield === 0 ? 0 : 1;
    if (operation.boundParams.commitmentCiphertext.length !== operation.commitments.length - unshieldCount) {
      fail("commitment ciphertext count does not match output commitments.");
    }
    for (const commitment of operation.commitments) assertNonzeroWord(commitment, "commitment");
    boundParameters.push({
      chainId: operation.boundParams.chainID,
      minGasPrice: operation.boundParams.minGasPrice,
      adaptContract: operation.boundParams.adaptContract,
      adaptParams: operation.boundParams.adaptParams
    });
  }
  if (new Set(nullifiers.map((item) => item.toLowerCase())).size !== nullifiers.length) {
    fail("duplicate nullifier.");
  }
  return {
    target: transaction.to,
    calldata: transaction.data,
    value,
    nullifiers,
    operationCount: operations.length,
    boundParameters
  };
};

const assertField = (value: unknown, label: string): void => {
  // Upstream proof scalars are strings. Preserve their representation, while
  // rejecting JSON numbers, signs, whitespace, and unbounded values.
  if (
    typeof value !== "string" ||
    !/^(?:[0-9]{1,78}|0x[0-9a-fA-F]{1,64})$/.test(value) ||
    BigInt(value) >= 21888242871839275222246405745257275088696311157297823662689037894645226208583n
  ) fail(`${label} is not a BN254 field value.`);
};

const assertDigest = (value: unknown, label: string): void => {
  if (typeof value !== "string" || !/^(?:0x)?[0-9a-fA-F]{64}$/.test(value)) {
    fail(`${label} must be a 32-byte digest.`);
  }
};

const assertPOIs = (
  proofs: PreTransactionPOIsPerTxidLeafPerList,
  requiredListKeys: readonly string[],
  operationCount: number
): void => {
  if (!proofs || typeof proofs !== "object" || Array.isArray(proofs)) fail("missing pre-transaction POI map.");
  const lists = Object.keys(proofs);
  if (lists.length === 0 || requiredListKeys.some((key) => !Object.hasOwn(proofs, key))) {
    fail("missing pre-transaction POI for an active list.");
  }
  let expectedLeaves: string | undefined;
  for (const key of lists) {
    assertDigest(key, "POI list key");
    const entries = proofs[key];
    if (!entries || typeof entries !== "object" || Array.isArray(entries)) fail("invalid POI leaf map.");
    const leaves = Object.keys(entries);
    if (leaves.length !== operationCount) fail("POI count does not match the RAILGUN operation count.");
    const leafSet = leaves.map((leaf) => leaf.toLowerCase().replace(/^0x/, "")).sort().join(",");
    if (expectedLeaves !== undefined && expectedLeaves !== leafSet) fail("POI lists cover different transaction leaves.");
    expectedLeaves = leafSet;
    for (const [leaf, proof] of Object.entries(entries)) {
      assertDigest(leaf, "POI transaction leaf");
      if (!proof || typeof proof !== "object") fail("missing POI proof.");
      const snark = proof.snarkProof;
      if (
        !snark || !Array.isArray(snark.pi_a) || snark.pi_a.length !== 2 ||
        !Array.isArray(snark.pi_b) || snark.pi_b.length !== 2 ||
        snark.pi_b.some((row) => !Array.isArray(row) || row.length !== 2) ||
        !Array.isArray(snark.pi_c) || snark.pi_c.length !== 2
      ) fail("malformed POI SNARK coordinates.");
      for (const scalar of [...snark.pi_a, ...snark.pi_b.flat(), ...snark.pi_c]) assertField(scalar, "POI SNARK coordinate");
      assertDigest(proof.txidMerkleroot, "POI TXID Merkle root");
      assertDigest(proof.railgunTxidIfHasUnshield, "POI unshield TXID");
      if (!Array.isArray(proof.poiMerkleroots) || proof.poiMerkleroots.length === 0) fail("missing POI Merkle roots.");
      if (!Array.isArray(proof.blindedCommitmentsOut) || proof.blindedCommitmentsOut.length === 0) fail("missing POI blinded commitments.");
      for (const root of proof.poiMerkleroots) assertDigest(root, "POI Merkle root");
      for (const commitment of proof.blindedCommitmentsOut) assertDigest(commitment, "POI blinded commitment");
    }
  }
};

/** Validate lossless public-field translation and metadata agreement only.
 * The capability guard below is separately mandatory before live submission:
 * syntax checks cannot verify POI or an encrypted broadcaster fee output.
 */
export const assertPreparedPrivateRailgunTransaction = (
  transaction: PreparedPrivateRailgunTransaction,
  options: {
    requiredPoiListKeys?: readonly string[];
    expectedFee?: PrivateRailgunFee;
    now?: number;
  } = {}
): void => {
  if (transaction.txidVersion !== "V2_PoseidonMerkle") fail("unsupported TXID version.");
  if (transaction.chain?.type !== 0 || transaction.chain.id !== 1) fail("only Ethereum mainnet is supported.");
  if (transaction.provenance?.source !== "kohaku-railgun" || transaction.provenance.version !== KOHAKU_RAILGUN_VERSION) {
    fail("unsupported proof construction provenance.");
  }
  if (transaction.value !== 0n) fail("a private transaction must not spend public ETH.");
  const publicData = decodeKohakuTransaction({ to: transaction.target, data: transaction.calldata, value: "0x0" });
  if (
    !Array.isArray(transaction.nullifiers) ||
    publicData.nullifiers.length !== transaction.nullifiers.length ||
    publicData.nullifiers.some((value, index) => value.toLowerCase() !== transaction.nullifiers[index]?.toLowerCase())
  ) fail("nullifiers differ from the proved calldata.");
  if (typeof transaction.overallBatchMinGasPrice !== "bigint" || transaction.overallBatchMinGasPrice <= 0n) fail("a nonzero proof-bound minimum gas price is required for mainnet broadcaster fees.");
  if (publicData.boundParameters.some((bound) => bound.minGasPrice !== transaction.overallBatchMinGasPrice)) {
    fail("minimum gas price differs from the proved calldata.");
  }
  if (transaction.relayAdapt?.kind !== "none") fail("Kohaku does not expose a supported RelayAdapt or RelayAdapt7702 proof builder.");
  if (transaction.relayAdapt.contract !== null || transaction.relayAdapt.parameters.length !== publicData.operationCount) fail("invalid RelayAdapt metadata.");
  if (publicData.boundParameters.some((bound, index) =>
    getAddress(bound.adaptContract) !== zeroAddress ||
    BigInt(bound.adaptParams) !== 0n ||
    bound.adaptParams.toLowerCase() !== transaction.relayAdapt.parameters[index]?.toLowerCase()
  )) fail("RelayAdapt fields differ from the supported proved calldata.");

  const fee = transaction.fee;
  if (!fee || !/^0zk1[0-9a-z]+$/.test(fee.broadcasterRailgunAddress)) fail("missing broadcaster fee recipient.");
  if (typeof fee.feesID !== "string" || !fee.feesID.trim()) fail("missing broadcaster fee ID.");
  if (!isAddress(fee.tokenAddress) || getAddress(fee.tokenAddress) === zeroAddress) fail("invalid fee token.");
  for (const [label, value] of Object.entries({ amount: fee.amount, gasEstimate: fee.gasEstimate, perUnitGas: fee.perUnitGas })) {
    if (typeof value !== "bigint" || value <= 0n) fail(`invalid fee ${label}.`);
  }
  // Upstream wallet: services/transactions/tx-gas-broadcaster-fee-estimator.ts.
  // `feePerUnitGas` is a conversion rate per 10^18 wei of gas cost, NOT a
  // token-wei-per-EVM-gas figure. Upstream reserves 20% over estimated gas.
  const gasLimit = (fee.gasEstimate * 12000n) / 10000n;
  const minimumFee = (fee.perUnitGas * gasLimit * transaction.overallBatchMinGasPrice) / 10n ** 18n;
  if (fee.amount < minimumFee) fail("fee does not cover the gas estimate and advertised conversion rate.");
  if (!Number.isSafeInteger(fee.expiresAt) || fee.expiresAt <= (options.now ?? Date.now())) fail("broadcaster fee expired.");
  if (options.expectedFee) {
    const expected = options.expectedFee;
    if (
      fee.broadcasterRailgunAddress !== expected.broadcasterRailgunAddress || fee.feesID !== expected.feesID ||
      getAddress(fee.tokenAddress) !== getAddress(expected.tokenAddress) || fee.amount !== expected.amount ||
      fee.gasEstimate !== expected.gasEstimate || fee.perUnitGas !== expected.perUnitGas || fee.expiresAt !== expected.expiresAt
    ) fail("fee metadata differs from the reviewed broadcaster quote.");
  }
  assertPOIs(transaction.preTransactionPOIs, options.requiredPoiListKeys ?? [], publicData.operationCount);
};

export const normalizeKohakuPrivateTransaction = ({
  transaction,
  fee,
  preTransactionPOIs,
  requiredPoiListKeys,
  now
}: {
  transaction: KohakuTxData;
  fee: PrivateRailgunFee;
  preTransactionPOIs: PreTransactionPOIsPerTxidLeafPerList;
  requiredPoiListKeys: readonly string[];
  now?: number;
}): PreparedPrivateRailgunTransaction => {
  const decoded = decodeKohakuTransaction(transaction);
  const prepared: PreparedPrivateRailgunTransaction = {
    txidVersion: "V2_PoseidonMerkle",
    chain: { type: 0, id: 1 },
    target: decoded.target,
    calldata: decoded.calldata,
    value: decoded.value,
    nullifiers: decoded.nullifiers,
    overallBatchMinGasPrice: decoded.boundParameters[0].minGasPrice,
    relayAdapt: { kind: "none", contract: null, parameters: decoded.boundParameters.map((bound) => bound.adaptParams) },
    preTransactionPOIs: structuredClone(preTransactionPOIs),
    fee: { ...fee },
    provenance: { source: "kohaku-railgun", version: KOHAKU_RAILGUN_VERSION }
  };
  assertPreparedPrivateRailgunTransaction(prepared, { requiredPoiListKeys, now });
  return prepared;
};

/** Exact capabilities of the pinned public WASM binding, not inferred from the
 * existence of similarly named Rust internals or successful fixture decoding.
 */
export const getKohakuPrivateTransactionCapabilities = () => ({
  version: KOHAKU_RAILGUN_VERSION,
  proofApi: "available" as const,
  transactionPublicFields: "abi-decodable" as const,
  poiApi: "post-transaction-only" as const,
  preTransactionPoiExport: false,
  broadcasterFeeOutputVerification: false,
  configurableBoundGasPrice: false,
  relayAdaptBuilder: false,
  relayAdapt7702Builder: false,
  liveSubmissionReady: false,
  blockers: [
    "Kohaku alpha.30 exposes post-transaction POI processing, but no pre-transaction POI proof export for the broadcaster payload.",
    "Kohaku alpha.30 has no public broadcaster fee-output binding or configurable proof-bound minimum gas price API.",
    "Native ETH unshield requires RelayAdapt; the public Kohaku transaction builder only supports transfer and ERC-20 unshield."
  ]
});

export const assertKohakuPrivateSubmissionReady = (): never => {
  return fail(KOHAKU_PRIVATE_SUBMISSION_BLOCKER);
};

export const getKohakuPrivateCapabilities = getKohakuPrivateTransactionCapabilities;
export const KOHAKU_PRIVATE_SUBMISSION_BLOCKER =
  getKohakuPrivateTransactionCapabilities().blockers.join(" ");
