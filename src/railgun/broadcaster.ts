import type { Address } from "viem";
import {
  kohakuPrivateActionsPendingMessage,
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

export const sendRailgunBroadcasterTransaction = async (): Promise<
  RailgunBroadcasterSubmissionResult
> => {
  throw new Error(kohakuPrivateActionsPendingMessage);
};

export const submitPayIntent = async ({
  intent
}: {
  intent: RailgunPrivatePayIntent;
  policy: ConnectionPolicy;
}): Promise<RailgunBroadcasterSubmissionResult> => {
  if (intent.kind === "pay" && intent.source === "railgun-private") {
    throw new Error(kohakuPrivateActionsPendingMessage);
  }

  throw new Error("Unsupported Pay intent.");
};
