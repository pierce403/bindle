import { Palette, Settings } from "lucide-react";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSelection } from "../theme/theme";

type SettingsPanelProps = {
  theme: ThemeSelection;
  onThemeChange: (theme: ThemeSelection) => void;
};

export function SettingsPanel({ theme, onThemeChange }: SettingsPanelProps) {
  return (
    <section className="panel settings-panel" aria-labelledby="settings-heading">
      <div className="section-heading">
        <div>
          <h2 id="settings-heading">Settings</h2>
          <span>Local preferences</span>
        </div>
        <Settings size={21} aria-hidden="true" />
      </div>

      <div className="settings-row">
        <div>
          <strong>Theme</strong>
          <span>Stored only in this session.</span>
        </div>
        <Palette size={20} aria-hidden="true" />
      </div>

      <ThemeControls theme={theme} onChange={onThemeChange} />
    </section>
  );
}
