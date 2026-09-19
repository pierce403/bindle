import type { PayAsset } from "./assets";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { TxOrigin } from "../wallet/transactionOrigin";
import { KOHAKU_PRIVATE_SUBMISSION_BLOCKER } from "../railgun/privateTransactionBridge";

export type PayLeg =
  | {
      kind: "private-source";
      origin: "railgun-private";
      action:
        | "private-transfer"
        | "private-swap"
        | "unshield"
        | "unshield-and-call";
      requiresBroadcaster: true;
    }
  | {
      kind: "public-settlement";
      destination: "0x" | "provider" | "bridge" | "merchant";
      disclosure: "recipient-token-amount" | "provider-route" | "public-call";
    };

export type PayPrivacyLabel = "Private Pay";
export type PrivatePayChangeDisposition =
  | "private-change-to-0zk"
  | "ephemeral-settlement-account"
  | "unknown"
  | "public-recipient"
  | "public-smart-wallet"
  | "provider-retained";

export type RailgunBroadcasterReadiness = {
  ready: boolean;
  status: "off" | "not-selected" | "not-connected" | "configured";
  message: string;
  feeToken: string;
  fee: string;
  wakuStatus: string;
};

export const privatePayBroadcasterRequiredMessage =
  "Pay requires a RAILGUN Broadcaster for the private source leg. Public smart-wallet submission would link this payment to your funding wallet.";

export const kohakuPrivateActionsPendingMessage =
  KOHAKU_PRIVATE_SUBMISSION_BLOCKER;

export const privatePayChangeRequiredMessage =
  "Private Pay change must return privately to your 0zk or remain in a fresh ephemeral settlement account for later sweep. Bindle will not send leftover change to the recipient, provider, or durable funding wallet.";

export const ephemeralPrivatePayChangeMessage =
  "Leftover swap/change funds may remain in a fresh ephemeral settlement account for later sweep.";

export const defaultPrivatePayChangeDisposition: PrivatePayChangeDisposition =
  "unknown";

export const privatePayLegs: PayLeg[] = [
  {
    kind: "private-source",
    origin: "railgun-private",
    action: "unshield-and-call",
    requiresBroadcaster: true
  },
  {
    kind: "public-settlement",
    destination: "0x",
    disclosure: "recipient-token-amount"
  }
];

export const privateUsdcPayLegs = privatePayLegs;

export const classifyPayTransactionOrigin = (legs: PayLeg[]): TxOrigin =>
  legs.some((leg) => leg.kind === "private-source")
    ? "railgun-private"
    : "public-smart-wallet";

export const payPrivacyLabel = (_legs: PayLeg[]): PayPrivacyLabel =>
  "Private Pay";



export const getRailgunBroadcasterReadiness = (
  policy: ConnectionPolicy
): RailgunBroadcasterReadiness => {
  const feeToken =
    policy.railgunBroadcasterFeeToken === "custom"
      ? policy.railgunBroadcasterCustomFeeTokenAddress.trim() || "custom token"
      : policy.railgunBroadcasterFeeToken;

  const broadcasterUrl = policy.broadcasterUrl.trim();

  if (!broadcasterUrl || !policy.wakuEnabled || !policy.railgunBroadcasterEnabled || policy.railgunBroadcasterMode === "off") {
    return {
      ready: false,
      status: "off",
      message: "Enable the RAILGUN Waku broadcaster transport before private payments. " + kohakuPrivateActionsPendingMessage,
      feeToken,
      fee: "unquoted",
      wakuStatus: "off"
    };
  }

  return {
    ready: false,
    status: "configured",
    message: kohakuPrivateActionsPendingMessage,
    feeToken,
    fee: "not quoted",
    wakuStatus: "configured; discovery is separate from payment readiness"
  };
};

export const assertBroadcasterReady = (policy: ConnectionPolicy): void => {
  const readiness = getRailgunBroadcasterReadiness(policy);

  if (!readiness.ready) {
    throw new Error(readiness.message);
  }
};

export const isAcceptablePrivatePayChangeDisposition = (
  disposition: PrivatePayChangeDisposition
): boolean =>
  disposition === "private-change-to-0zk" ||
  disposition === "ephemeral-settlement-account";

export const assertPrivatePayChangeDisposition = (
  disposition: PrivatePayChangeDisposition
): void => {
  if (!isAcceptablePrivatePayChangeDisposition(disposition)) {
    throw new Error(privatePayChangeRequiredMessage);
  }
};

export const describePaySettlement = ({
  amount,
  asset,
  recipient
}: {
  amount: string;
  asset: PayAsset | null;
  recipient: string;
}): string =>
  `${amount.trim() || "pending"} ${asset?.symbol ?? "asset"} to ${
    recipient.trim() || "recipient"
  }`;
