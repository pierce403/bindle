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
  "Private actions are pending Kohaku Waku broadcaster compatibility. Bindle now watches Waku fee ads and auto-selects compatible relay candidates, but live Private Pay still needs a verified Kohaku submitter plus a proved private operation. Bindle will not submit private RAILGUN actions through your public smart wallet.";

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

  const bundlerUrl = policy.bundlerUrl.trim();

  if (!bundlerUrl) {
    return {
      ready: false,
      status: "off",
      message: "Configure an ERC-4337 bundler before shielded pay.",
      feeToken,
      fee: "unquoted",
      wakuStatus: "off"
    };
  }

  return {
    ready: true,
    status: "configured",
    message: "ERC-4337 Bundler configured. Private Pay will submit via EIP-7702 user operations.",
    feeToken,
    fee: "paid from 0zk balance",
    wakuStatus: "off"
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
