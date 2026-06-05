import type { Address } from "viem";
import {
  assertBroadcasterReady,
  type PayLeg
} from "../intents/payFlow";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { PreparedRailgunPay } from "./pay";

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
  void intent;

  throw new Error(
    "RAILGUN Broadcaster submission is not wired for Private Pay yet."
  );
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
