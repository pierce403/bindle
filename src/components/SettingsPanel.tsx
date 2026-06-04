import { Download, Palette, RotateCcw, Settings, Upload } from "lucide-react";
import { useRef } from "react";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSelection } from "../theme/theme";

type SettingsPanelProps = {
  theme: ThemeSelection;
  accountExportStatus: string;
  isExportingAccount: boolean;
  isImportingAccount: boolean;
  onThemeChange: (theme: ThemeSelection) => void;
  onExportAccount: () => void;
  onImportAccountExport: (file: File) => void;
  onResetWallet: () => void;
};

export function SettingsPanel({
  theme,
  accountExportStatus,
  isExportingAccount,
  isImportingAccount,
  onThemeChange,
  onExportAccount,
  onImportAccountExport,
  onResetWallet
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

      <div className="settings-row">
        <div>
          <strong>Account export</strong>
          <span>
            Downloads a JSON recovery file. Includes the RAILGUN recovery phrase
            when present; passkey private material stays in the platform
            authenticator.
          </span>
          {accountExportStatus ? <small>{accountExportStatus}</small> : null}
        </div>
        <div className="settings-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={onExportAccount}
            disabled={isExportingAccount || isImportingAccount}
            title="Export account JSON"
          >
            <Download size={17} aria-hidden="true" />
            {isExportingAccount ? "Exporting" : "Export"}
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isExportingAccount || isImportingAccount}
            title="Import account JSON"
          >
            <Upload size={17} aria-hidden="true" />
            {isImportingAccount ? "Importing" : "Import"}
          </button>
          <input
            ref={importInputRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            aria-label="Import account export JSON"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = "";

              if (file) {
                onImportAccountExport(file);
              }
            }}
          />
        </div>
      </div>

      <div className="settings-row">
        <div>
          <strong>Local wallet</strong>
          <span>Clears metadata and encrypted Bindle-owned RAILGUN secrets.</span>
        </div>
        <button
          className="secondary-action"
          type="button"
          onClick={onResetWallet}
          title="Reset local wallet"
        >
          <RotateCcw size={17} aria-hidden="true" />
          Reset
        </button>
      </div>
    </section>
  );
}
