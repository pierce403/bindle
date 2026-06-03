import { findProviderRoute, type ProviderRoute } from "./providers";

export type IntentDraft = {
  recipient: string;
  amount: string;
  asset: "USDC" | "ETH" | "DAI";
  note: string;
};

export type RoutedIntent = {
  id: string;
  route: ProviderRoute;
  privateLeg: {
    network: "ethereum";
    action: ProviderRoute["railgunAction"];
    spendsShieldedBalance: boolean;
    broadcasterPreferred: boolean;
  };
  declassifiedLeg: {
    recipient: string;
    destination: string;
    amount: string;
    asset: IntentDraft["asset"];
    memoCommitment: string;
    disclosure: ProviderRoute["disclosure"];
  };
};

const encodeMemoCommitment = (memo: string): string => {
  const input = new TextEncoder().encode(memo.trim().toLowerCase());
  let hash = 2166136261;

  for (const value of input) {
    hash ^= value;
    hash = Math.imul(hash, 16777619);
  }

  return `memo:${(hash >>> 0).toString(16).padStart(8, "0")}`;
};

export const routeIntent = (draft: IntentDraft): RoutedIntent => {
  const route = findProviderRoute(draft.recipient);

  return {
    id: crypto.randomUUID(),
    route,
    privateLeg: {
      network: "ethereum",
      action: route.railgunAction,
      spendsShieldedBalance: true,
      broadcasterPreferred: true
    },
    declassifiedLeg: {
      recipient: draft.recipient.trim(),
      destination:
        route.destination === "recipient supplied"
          ? draft.recipient.trim()
          : route.destination,
      amount: draft.amount.trim(),
      asset: draft.asset,
      memoCommitment: encodeMemoCommitment(draft.note),
      disclosure: route.disclosure
    }
  };
};
