import type {
  AssetId,
  RailgunAddress,
  RailgunProvider,
  RailgunSigner,
  TransactionBuilder,
  TxData
} from "@kohaku-eth/railgun";
import { isAddress, type Address } from "viem";
import { decodeKohakuTransaction, type KohakuTransactionPublicData } from "./privateTransactionBridge";

export type KohakuPrivateIntent =
  | { kind: "transfer"; recipient: RailgunAddress; asset: AssetId; amount: bigint; memo: string }
  | { kind: "erc20-unshield"; recipient: Address; asset: AssetId; amount: bigint };

type PrivateProvider = Pick<RailgunProvider, "transact" | "build">;

/** Prove only: callers own visible RPC/UTXO/POI policy, registered signer,
 * synchronized state, and resource lifetimes. This helper never broadcasts,
 * accesses a public wallet, or invents a fee/POI proof. Successful construction
 * is still blocked from broadcaster submission by the separate capability gate.
 */
export const buildKohakuPrivateTransaction = async ({
  provider,
  signer,
  intents
}: {
  provider: PrivateProvider;
  signer: RailgunSigner;
  intents: readonly KohakuPrivateIntent[];
}): Promise<{ transaction: TxData; publicData: KohakuTransactionPublicData }> => {
  if (signer.chainId !== 1n) throw new Error("Private transaction signer must be for Ethereum mainnet.");
  if (intents.length === 0) throw new Error("At least one private transaction intent is required.");
  for (const intent of intents) {
    if (intent.amount <= 0n || intent.amount >= 1n << 120n) throw new Error("Invalid private transaction amount.");
    if (intent.asset.type !== "Erc20" || !isAddress(intent.asset.value)) throw new Error("Only an explicit ERC-20 asset is supported.");
    if (intent.kind === "transfer" && !/^0zk1[0-9a-z]+$/.test(intent.recipient)) throw new Error("Invalid shielded recipient.");
    if (intent.kind === "erc20-unshield" && !isAddress(intent.recipient)) throw new Error("Invalid unshield recipient.");
  }

  // wasm-bindgen exposes Rust methods taking `self`. Every step consumes its
  // input wrapper; reusing or freeing the consumed wrapper traps in WASM.
  let builder: TransactionBuilder | undefined = provider.transact();
  try {
    for (const intent of intents) {
      if (!builder) throw new Error("Kohaku transaction builder was consumed.");
      const consumed: TransactionBuilder = builder;
      builder = undefined;
      builder = intent.kind === "transfer"
        ? consumed.transfer(signer, intent.recipient, intent.asset, intent.amount, intent.memo)
        : consumed.unshield(signer, intent.recipient, intent.asset, intent.amount);
    }
    // Keep the actual type here: the provider accepts the generated wrapper,
    // not a copied/opaque object containing WASM internals.
    if (!builder) throw new Error("Kohaku transaction builder was consumed.");
    const consumed: TransactionBuilder = builder;
    builder = undefined;
    const transaction = await provider.build(consumed);
    return { transaction, publicData: decodeKohakuTransaction(transaction) };
  } finally {
    // The final build also consumes its builder. Free only an unconsumed one.
    builder?.free();
  }
};
