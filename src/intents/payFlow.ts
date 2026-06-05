import type { PayAsset } from "./assets";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { TxOrigin } from "../wallet/transactionOrigin";

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

export type PayPrivacyLabel = "Private Pay" | "Public Pay";

export type RailgunBroadcasterReadiness = {
  ready: boolean;
  status: "off" | "not-selected" | "not-connected" | "adapter-unwired";
  message: string;
  feeToken: string;
  fee: string;
  wakuStatus: string;
};

export const privatePayBroadcasterRequiredMessage =
  "Pay requires a RAILGUN Broadcaster for the private source leg. Public smart-wallet submission would link this payment to your funding wallet.";

export const privateUsdcPayLegs: PayLeg[] = [
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

export const classifyPayTransactionOrigin = (legs: PayLeg[]): TxOrigin =>
  legs.some((leg) => leg.kind === "private-source")
    ? "railgun-private"
    : "public-smart-wallet";

export const payPrivacyLabel = (legs: PayLeg[]): PayPrivacyLabel =>
  classifyPayTransactionOrigin(legs) === "railgun-private"
    ? "Private Pay"
    : "Public Pay";

const normalizedBroadcasterMode = (policy: ConnectionPolicy) =>
  policy.railgunBroadcasterMode ?? "off";

export const getRailgunBroadcasterReadiness = (
  policy: ConnectionPolicy
): RailgunBroadcasterReadiness => {
  const feeToken =
    policy.railgunBroadcasterFeeToken === "custom"
      ? policy.railgunBroadcasterCustomFeeTokenAddress.trim() || "custom token"
      : policy.railgunBroadcasterFeeToken;

  if (
    normalizedBroadcasterMode(policy) === "off" ||
    !policy.railgunBroadcasterEnabled
  ) {
    return {
      ready: false,
      status: "off",
      message: privatePayBroadcasterRequiredMessage,
      feeToken,
      fee: "unquoted",
      wakuStatus: policy.wakuEnabled ? "enabled" : "off"
    };
  }

  if (!policy.wakuEnabled) {
    return {
      ready: false,
      status: "not-connected",
      message: privatePayBroadcasterRequiredMessage,
      feeToken,
      fee: "unquoted",
      wakuStatus: "off"
    };
  }

  if (!policy.broadcasterUrl.trim()) {
    return {
      ready: false,
      status: "not-selected",
      message: privatePayBroadcasterRequiredMessage,
      feeToken,
      fee: "unquoted",
      wakuStatus: "enabled"
    };
  }

  return {
    ready: false,
    status: "adapter-unwired",
    message:
      "RAILGUN Broadcaster discovery, fee quoting, and submission are not wired yet, so Private Pay stays disabled.",
    feeToken,
    fee: "unquoted",
    wakuStatus: "enabled"
  };
};

export const assertBroadcasterReady = (policy: ConnectionPolicy): void => {
  const readiness = getRailgunBroadcasterReadiness(policy);

  if (!readiness.ready) {
    throw new Error(readiness.message);
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
