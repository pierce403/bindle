import type { Address } from "viem";
import {
  assertBroadcasterReady,
  type PayLeg
} from "../intents/payFlow";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { PreparedRailgunPay } from "./pay";
import { submitRailgunWakuBroadcasterTransaction } from "./wakuBroadcaster";

export type RailgunBroadcasterSubmissionResult = {
  transactionHash: `0x${string}` | null;
  broadcasterId: string;
};

export type RailgunPrivatePayIntent = {
  kind: "pay";
  source: "railgun-private";
  legs: PayLeg[];
  recipient: Address;
  amount: string;
  preparedPay: PreparedRailgunPay;
};

export const sendRailgunBroadcasterTransaction = async ({
  intent,
  policy
}: {
  intent: RailgunPrivatePayIntent;
  policy: ConnectionPolicy;
}): Promise<RailgunBroadcasterSubmissionResult> => {
  assertBroadcasterReady(policy);

  if (intent.preparedPay.submissionMode !== "railgun-waku-broadcaster") {
    throw new Error("Private Pay cannot be submitted by the public smart wallet.");
  }

  return submitRailgunWakuBroadcasterTransaction({
    prepared: {
      txidVersion: intent.preparedPay.txidVersion,
      chain: { type: 0, id: 1 },
      transaction: intent.preparedPay.transaction,
      broadcaster: intent.preparedPay.broadcaster,
      nullifiers: intent.preparedPay.nullifiers,
      overallBatchMinGasPrice: intent.preparedPay.overallBatchMinGasPrice,
      useRelayAdapt: intent.preparedPay.useRelayAdapt,
      preTransactionPOIsPerTxidLeafPerList:
        intent.preparedPay.preTransactionPOIsPerTxidLeafPerList
    },
    policy,
    onStatus: () => undefined
  });
};

export const submitPayIntent = async ({
  intent,
  policy
}: {
  intent: RailgunPrivatePayIntent;
  policy: ConnectionPolicy;
}): Promise<RailgunBroadcasterSubmissionResult> => {
  if (intent.kind === "pay" && intent.source === "railgun-private") {
    assertBroadcasterReady(policy);
    return sendRailgunBroadcasterTransaction({ intent, policy });
  }

  if (intent.kind === "pay" && intent.source === "railgun-private") {
    throw new Error("Private Pay cannot be submitted by the public smart wallet.");
  }

  throw new Error("Unsupported Pay intent.");
};
