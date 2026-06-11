import { formatUnits } from "viem";

export const parseDecimalToBigint = (value: string, decimals: number): bigint | null => {
  const normalized = value.trim();
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
    return null;
  }
  const parts = normalized.split(".");
  const integerPart = parts[0] || "0";
  let fractionalPart = parts[1] || "";
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.slice(0, decimals);
  } else {
    fractionalPart = fractionalPart.padEnd(decimals, "0");
  }
  return BigInt(integerPart + fractionalPart);
};

export const usdToWei = (
  usdAmountStr: string,
  price: { answer: bigint; decimals: number } | null
): bigint => {
  if (!price || !usdAmountStr.trim()) {
    return 0n;
  }
  const cleanUsd = usdAmountStr.trim();
  const parsedUsd = parseDecimalToBigint(cleanUsd, price.decimals);
  if (parsedUsd === null) {
    return 0n;
  }
  return (parsedUsd * 10n ** 18n) / price.answer;
};

export const usdToEthString = (
  usdAmountStr: string,
  price: { answer: bigint; decimals: number } | null
): string => {
  const wei = usdToWei(usdAmountStr, price);
  if (wei === 0n) {
    return "0";
  }
  return formatUnits(wei, 18);
};
