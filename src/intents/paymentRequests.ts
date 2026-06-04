import { getPayAsset, type PayAssetSymbol } from "./assets";
import type { IntentDraft } from "./router";
import { isValidDecimalAmount, isValidRecipientShape } from "./validation";

export type ParsedPaymentRequest = Pick<
  IntentDraft,
  "recipient" | "amount" | "asset" | "note"
>;

type PaymentRequestResult =
  | { ok: true; request: ParsedPaymentRequest }
  | { ok: false; error: string };

const fieldFromRecord = (
  record: Record<string, unknown>,
  names: string[]
): string => {
  for (const name of names) {
    const value = record[name];

    if (typeof value === "string") {
      return value.trim();
    }
  }

  return "";
};

const normalizeAsset = (asset: string): PayAssetSymbol | null => {
  const match = getPayAsset(asset || "ETH");

  return match?.symbol ?? null;
};

const normalizeRequest = (
  recipient: string,
  amount: string,
  asset: string,
  note = ""
): PaymentRequestResult => {
  const normalizedRecipient = recipient.trim();
  const normalizedAmount = amount.trim();
  const normalizedAsset = normalizeAsset(asset);

  if (!isValidRecipientShape(normalizedRecipient)) {
    return { ok: false, error: "Payment request recipient is not 0zk, 0x, or .eth." };
  }

  if (!isValidDecimalAmount(normalizedAmount)) {
    return { ok: false, error: "Payment request amount must be greater than zero." };
  }

  if (!normalizedAsset) {
    return { ok: false, error: "Payment request asset is not supported." };
  }

  return {
    ok: true,
    request: {
      recipient: normalizedRecipient,
      amount: normalizedAmount,
      asset: normalizedAsset,
      note: note.trim()
    }
  };
};

const parseJsonPaymentRequest = (input: string): PaymentRequestResult | null => {
  if (!input.startsWith("{")) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(input);
  } catch {
    return { ok: false, error: "Payment request JSON could not be parsed." };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "Payment request JSON must be an object." };
  }

  const record = parsed as Record<string, unknown>;

  return normalizeRequest(
    fieldFromRecord(record, ["to", "recipient", "address"]),
    fieldFromRecord(record, ["amount", "value"]),
    fieldFromRecord(record, ["asset", "symbol", "token"]) || "ETH",
    fieldFromRecord(record, ["note", "memo"])
  );
};

const parseUriPaymentRequest = (input: string): PaymentRequestResult | null => {
  if (!/^(bindle|ethereum):/i.test(input)) {
    return null;
  }

  let url: URL;

  try {
    url = input.toLowerCase().startsWith("bindle:")
      ? new URL(input.replace(/^bindle:pay/i, "bindle://pay"))
      : new URL(input);
  } catch {
    return { ok: false, error: "Payment request URI could not be parsed." };
  }

  const params = url.searchParams;
  const recipient =
    params.get("to") ??
    params.get("recipient") ??
    params.get("address") ??
    url.pathname.replace(/^\/+/, "").split("@")[0] ??
    "";
  const amount = params.get("amount") ?? params.get("value") ?? "";
  const asset = params.get("asset") ?? params.get("symbol") ?? "ETH";
  const note = params.get("note") ?? params.get("memo") ?? "";

  return normalizeRequest(recipient, amount, asset, note);
};

export const parsePaymentRequest = (input: string): PaymentRequestResult => {
  const normalized = input.trim();

  if (!normalized) {
    return { ok: false, error: "Payment request is empty." };
  }

  return (
    parseJsonPaymentRequest(normalized) ??
    parseUriPaymentRequest(normalized) ?? {
      ok: false,
      error: "Payment request must be bindle:, ethereum:, or JSON."
    }
  );
};
