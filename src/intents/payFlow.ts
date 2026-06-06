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
export type PrivatePayChangeDisposition =
  | "private-change-to-0zk"
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
  "Private actions are pending Kohaku Waku broadcaster compatibility. Public Waku fee ads are visible, but Bindle still needs a verified selectable Kohaku broadcaster and a proved private operation with private change before live Private Pay. Bindle will not submit private RAILGUN actions through your public smart wallet.";

export const privatePayChangeRequiredMessage =
  "Private Pay requires leftover swap/change funds to return privately to your 0zk. Private change routing is not wired yet, so Pay is blocked rather than leaking or giving away change.";

export const defaultPrivatePayChangeDisposition: PrivatePayChangeDisposition =
  "unknown";

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

  if (
    policy.railgunBroadcasterMode !== "waku-public-network" &&
    policy.railgunBroadcasterMode !== "custom-waku"
  ) {
    return {
      ready: false,
      status: "not-selected",
      message: privatePayBroadcasterRequiredMessage,
      feeToken,
      fee: "unquoted",
      wakuStatus: "enabled"
    };
  }

  if (
    !policy.railgunBroadcasterPubSubTopic.trim() ||
    policy.railgunBroadcasterDirectPeers.length === 0
  ) {
    return {
      ready: false,
      status: "not-selected",
      message:
        "Configure a visible RAILGUN Waku pubsub topic plus at least one direct peer before Private Pay.",
      feeToken,
      fee: "unquoted",
      wakuStatus: "enabled"
    };
  }

  return {
    ready: true,
    status: "configured",
    message:
      "RAILGUN Broadcaster configured. Waku discovery, fee quote, and encrypted submission will run during Private Pay.",
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

export const assertPrivatePayChangeDisposition = (
  disposition: PrivatePayChangeDisposition
): void => {
  if (disposition !== "private-change-to-0zk") {
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
