import { Download, Palette, RotateCcw, Settings, Upload } from "lucide-react";
import { useRef } from "react";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSelection } from "../theme/theme";
import { getCurrentPasskeyHostname } from "../wallet/passkeys";
import type { WalletState } from "../wallet/walletState";

type SettingsPanelProps = {
  theme: ThemeSelection;
  walletState: WalletState;
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
  walletState,
  accountExportStatus,
  isExportingAccount,
  isImportingAccount,
  onThemeChange,
  onExportAccount,
  onImportAccountExport,
  onResetWallet
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const passkeyRpId = walletState.passkeyRpId ?? "not configured";
  const currentHostname = getCurrentPasskeyHostname();
  const migratedPasskeyExpected =
    currentHostname !== null &&
    walletState.passkeyRpId !== null &&
    walletState.passkeyRpId !== currentHostname;

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
          <strong>Account access</strong>
          <span>
            Passkey RP ID: {passkeyRpId}
            {currentHostname ? `; current host: ${currentHostname}` : ""}
          </span>
          {walletState.passkeyAuthenticatorAttachment ||
          walletState.passkeyUserVerification ? (
            <small>
              Authenticator:{" "}
              {walletState.passkeyAuthenticatorAttachment ?? "unknown"}; user
              verification: {walletState.passkeyUserVerification ?? "default"}
            </small>
          ) : null}
          {migratedPasskeyExpected ? (
            <small>
              Migrated account detected. This site must be allowed by the
              original RP ID's WebAuthn related-origin file, and the matching
              passkey must exist on this device.
            </small>
          ) : null}
        </div>
      </div>

      <div className="settings-row">
        <div>
          <strong>Account export</strong>
          <span>
            Downloads a JSON recovery file. It can reclaim the shielded account
            when it includes the RAILGUN phrase; the public smart account still
            needs the same synced passkey.
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
