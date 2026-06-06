import {
  Bug,
  Home,
  MessageCircle,
  PlugZap,
  Settings,
  Waypoints
} from "lucide-react";

export type AppTab =
  | "wallet"
  | "chat"
  | "nodes"
  | "relays"
  | "settings"
  | "debug";

type BottomNavProps = {
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
};

const tabs: Array<{
  id: AppTab;
  label: string;
  disabled?: boolean;
  Icon: typeof Home;
}> = [
  { id: "wallet", label: "Wallet", Icon: Home },
  { id: "chat", label: "Chat", Icon: MessageCircle, disabled: true },
  { id: "nodes", label: "Nodes", Icon: PlugZap },
  { id: "relays", label: "Relays", Icon: Waypoints },
  { id: "settings", label: "Settings", Icon: Settings },
  { id: "debug", label: "Debug", Icon: Bug }
];

export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav className="bottom-nav" aria-label="App sections">
      {tabs.map(({ id, label, disabled, Icon }) => (
        <button
          key={id}
          type="button"
          disabled={disabled}
          aria-current={activeTab === id ? "page" : undefined}
          onClick={() => onTabChange(id)}
          title={disabled ? "XMTP chat is planned" : label}
        >
          <Icon size={21} aria-hidden="true" />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
