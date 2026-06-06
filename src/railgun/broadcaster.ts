import type { Address } from "viem";
import {
  assertBroadcasterReady,
  kohakuPrivateActionsPendingMessage,
  type PayLeg
} from "../intents/payFlow";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { PreparedRailgunPay } from "./pay";
import {
  submitRailgunWakuBroadcasterTransaction,
  type PreparedBroadcasterSubmit
} from "./wakuBroadcaster";

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

export type RailgunPrivateSubmitter = "waku-railgun-broadcaster";

export const submitterForRailgunPrivateOrigin =
  (): RailgunPrivateSubmitter => "waku-railgun-broadcaster";

export const assertRailgunPrivateSubmitter: (
  submitter: string
) => asserts submitter is RailgunPrivateSubmitter = (submitter) => {
  if (submitter !== "waku-railgun-broadcaster") {
    throw new Error(
      "Private RAILGUN actions must be submitted by a Waku RAILGUN broadcaster."
    );
  }
};

export const sendRailgunBroadcasterTransaction = async ({
  prepared,
  policy,
  onStatus = () => undefined
}: {
  prepared: PreparedBroadcasterSubmit;
  policy: ConnectionPolicy;
  onStatus?: (message: string) => void;
}): Promise<RailgunBroadcasterSubmissionResult> => {
  assertRailgunPrivateSubmitter(prepared.submitter);
  assertBroadcasterReady(policy);

  return submitRailgunWakuBroadcasterTransaction({
    prepared,
    policy,
    onStatus
  });
};

export const submitPayIntent = async ({
  intent,
  policy,
  onStatus = () => undefined
}: {
  intent: RailgunPrivatePayIntent;
  policy: ConnectionPolicy;
  onStatus?: (message: string) => void;
}): Promise<RailgunBroadcasterSubmissionResult> => {
  if (intent.kind === "pay" && intent.source === "railgun-private") {
    assertBroadcasterReady(policy);

    if (!intent.preparedPay.privateOperation) {
      throw new Error(kohakuPrivateActionsPendingMessage);
    }

    return sendRailgunBroadcasterTransaction({
      prepared: intent.preparedPay.privateOperation,
      policy,
      onStatus
    });
  }

  throw new Error("Unsupported Pay intent.");
};
