export type ActivityItem = {
  id: string;
  name: string;
  handle: string;
  amount: string;
  asset: "USDC" | "ETH" | "DAI";
  note: string;
  direction: "in" | "out";
  route: string;
  time: string;
};

export const activity: ActivityItem[] = [
  {
    id: "1",
    name: "Ari",
    handle: "0zk1q...m2x9",
    amount: "48.00",
    asset: "USDC",
    note: "Dinner",
    direction: "in",
    route: "Private send",
    time: "9:41 AM"
  },
  {
    id: "2",
    name: "Maya",
    handle: "@coinbase/maya",
    amount: "125.00",
    asset: "USDC",
    note: "Rent share",
    direction: "out",
    route: "Railgun -> Coinbase",
    time: "Yesterday"
  },
  {
    id: "3",
    name: "Ops Safe",
    handle: "ops.bindle.eth",
    amount: "0.22",
    asset: "ETH",
    note: "Gas float",
    direction: "out",
    route: "Railgun -> Safe",
    time: "Mon"
  },
  {
    id: "4",
    name: "Nico",
    handle: "0zk1p...81ra",
    amount: "32.50",
    asset: "DAI",
    note: "Tickets",
    direction: "in",
    route: "Private send",
    time: "Fri"
  }
];

export const contacts = [
  { name: "Ari", handle: "0zk1q...m2x9" },
  { name: "Maya", handle: "@coinbase/maya" },
  { name: "Ops", handle: "ops.bindle.eth" },
  { name: "Nico", handle: "0zk1p...81ra" }
];
