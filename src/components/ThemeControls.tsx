import { Moon, Palette, Sun } from "lucide-react";
import {
  themeAccents,
  type ThemeAccent,
  type ThemeMode,
  type ThemeSelection
} from "../theme/theme";

type ThemeControlsProps = {
  theme: ThemeSelection;
  onChange: (theme: ThemeSelection) => void;
};

export function ThemeControls({ theme, onChange }: ThemeControlsProps) {
  const nextMode: ThemeMode = theme.mode === "dark" ? "light" : "dark";
  const ModeIcon = theme.mode === "dark" ? Moon : Sun;

  return (
    <section className="theme-dock" aria-label="Theme">
      <button
        className="icon-button"
        type="button"
        title={`${nextMode} mode`}
        onClick={() => onChange({ ...theme, mode: nextMode })}
      >
        <ModeIcon size={18} aria-hidden="true" />
      </button>

      <div className="swatch-group" aria-label="Palette">
        <Palette size={17} aria-hidden="true" />
        {themeAccents.map((accent) => (
          <button
            className={`swatch ${accent.id}`}
            type="button"
            title={accent.label}
            aria-label={accent.label}
            aria-pressed={theme.accent === accent.id}
            key={accent.id}
            onClick={() =>
              onChange({ ...theme, accent: accent.id as ThemeAccent })
            }
          />
        ))}
      </div>
    </section>
  );
}

