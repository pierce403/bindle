import { Copy, Download, KeyRound, Palette, RotateCcw, Settings, Upload } from "lucide-react";
import { useRef } from "react";
import { ThemeControls } from "./ThemeControls";
import type { ThemeSelection } from "../theme/theme";
import {
  getCurrentPasskeyHostname,
  type BindleOwnerEnrollmentCode
} from "../wallet/passkeys";
import type { PasskeyAuthenticatorKind } from "../wallet/passkeys";
import type { WalletState } from "../wallet/walletState";

type SettingsPanelProps = {
  theme: ThemeSelection;
  walletState: WalletState;
  accountExportStatus: string;
  ownerEnrollmentCode: string;
  ownerEnrollment: BindleOwnerEnrollmentCode | null;
  ownerEnrollmentImportText: string;
  ownerEnrollmentStatus: string;
  isExportingAccount: boolean;
  isImportingAccount: boolean;
  isCreatingOwnerEnrollment: boolean;
  onThemeChange: (theme: ThemeSelection) => void;
  onExportAccount: () => void;
  onImportAccountExport: (file: File) => void;
  onCreateOwnerEnrollmentCode: (kind: PasskeyAuthenticatorKind) => void;
  onCopyOwnerEnrollmentCode: () => void;
  onOwnerEnrollmentImportTextChange: (text: string) => void;
  onImportOwnerEnrollmentCode: () => void;
  onActivateOwnerEnrollment: () => void;
  onPasskeyPreferenceChange: (preference: {
    authenticatorAttachment: AuthenticatorAttachment;
    userVerification: UserVerificationRequirement;
  }) => void;
  onResetWallet: () => void;
};

export function SettingsPanel({
  theme,
  walletState,
  accountExportStatus,
  ownerEnrollmentCode,
  ownerEnrollment,
  ownerEnrollmentImportText,
  ownerEnrollmentStatus,
  isExportingAccount,
  isImportingAccount,
  isCreatingOwnerEnrollment,
  onThemeChange,
  onExportAccount,
  onImportAccountExport,
  onCreateOwnerEnrollmentCode,
  onCopyOwnerEnrollmentCode,
  onOwnerEnrollmentImportTextChange,
  onImportOwnerEnrollmentCode,
  onActivateOwnerEnrollment,
  onPasskeyPreferenceChange,
  onResetWallet
}: SettingsPanelProps) {
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const passkeyRpId = walletState.passkeyRpId ?? "not configured";
  const currentHostname = getCurrentPasskeyHostname();
  const migratedPasskeyExpected =
    currentHostname !== null &&
    walletState.passkeyRpId !== null &&
    walletState.passkeyRpId !== currentHostname;
  const shorten = (value: string | null | undefined): string =>
    value && value.length > 22
      ? `${value.slice(0, 12)}...${value.slice(-8)}`
      : (value ?? "not present");

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
          <small>
            Active credential: {shorten(walletState.passkeyCredentialId)}
          </small>
          <small>
            Active public key: {shorten(walletState.passkeyPublicKey)}
          </small>
          {migratedPasskeyExpected ? (
            <small>
              Migrated account detected. This site must be allowed by the
              original RP ID's WebAuthn related-origin file, and the matching
              passkey must exist on this device.
            </small>
          ) : null}
        </div>
        <div className="settings-actions">
          <button
            className="secondary-action"
            type="button"
            aria-pressed={walletState.passkeyAuthenticatorAttachment === "platform"}
            onClick={() =>
              onPasskeyPreferenceChange({
                authenticatorAttachment: "platform",
                userVerification: "required"
              })
            }
            disabled={!walletState.passkeyCredentialId}
            title="Ask the phone or computer passkey provider when signing"
          >
            Phone/computer
          </button>
          <button
            className="secondary-action"
            type="button"
            aria-pressed={
              walletState.passkeyAuthenticatorAttachment === "cross-platform"
            }
            onClick={() =>
              onPasskeyPreferenceChange({
                authenticatorAttachment: "cross-platform",
                userVerification: "preferred"
              })
            }
            disabled={!walletState.passkeyCredentialId}
            title="Ask for a roaming security key such as a YubiKey when signing"
          >
            YubiKey
          </button>
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
        </div>
      </div>

      <div className="settings-row">
        <div>
          <strong>Account import</strong>
          <span>
            Imports a Bindle account JSON file and re-encrypts included RAILGUN
            recovery material into this browser. Public smart-account spending
            still requires the matching passkey.
          </span>
          {accountExportStatus ? <small>{accountExportStatus}</small> : null}
        </div>
        <div className="settings-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={isExportingAccount || isImportingAccount}
            title="Import account JSON"
          >
            <Upload size={17} aria-hidden="true" />
            {isImportingAccount ? "Importing" : "Import account JSON"}
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
          <strong>Owner enrollment code</strong>
          <span>
            Creates a new passkey on this site and copies the public owner
            metadata for the bindle.me migration bridge.
          </span>
          {ownerEnrollment ? (
            <>
              <small>
                Pending credential: {shorten(ownerEnrollment.credential.id)}
              </small>
              <small>
                Pending RP ID: {ownerEnrollment.credential.rpId}; authenticator:{" "}
                {ownerEnrollment.credential.authenticatorAttachment}
              </small>
              <small>
                Pending public key:{" "}
                {shorten(ownerEnrollment.credential.publicKey)}
              </small>
            </>
          ) : (
            <small>No generated owner is stored in this browser.</small>
          )}
          {ownerEnrollmentStatus ? <small>{ownerEnrollmentStatus}</small> : null}
        </div>
        <div className="settings-actions">
          <button
            className="secondary-action"
            type="button"
            onClick={() => onCreateOwnerEnrollmentCode("security-key")}
            disabled={
              isCreatingOwnerEnrollment || !walletState.smartWalletAddress
            }
            title="Create a bindle.cash YubiKey owner enrollment code"
          >
            <KeyRound size={17} aria-hidden="true" />
            YubiKey code
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => onCreateOwnerEnrollmentCode("platform")}
            disabled={
              isCreatingOwnerEnrollment || !walletState.smartWalletAddress
            }
            title="Create a bindle.cash phone or computer owner enrollment code"
          >
            <KeyRound size={17} aria-hidden="true" />
            Phone code
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={onCopyOwnerEnrollmentCode}
            disabled={!ownerEnrollmentCode}
            title="Copy owner enrollment code"
          >
            <Copy size={17} aria-hidden="true" />
            Copy code
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={onActivateOwnerEnrollment}
            disabled={!ownerEnrollment}
            title="Use this stored owner enrollment as the active signing passkey metadata"
          >
            Use owner
          </button>
        </div>
        <textarea
          className="code-output"
          value={ownerEnrollmentImportText}
          onChange={(event) =>
            onOwnerEnrollmentImportTextChange(event.currentTarget.value)
          }
          placeholder="Paste bindle-owner-v1:... here if the generated code was not saved locally."
          aria-label="Import owner enrollment code"
        />
        <button
          className="secondary-action"
          type="button"
          onClick={onImportOwnerEnrollmentCode}
          disabled={!ownerEnrollmentImportText.trim()}
        >
          Import code
        </button>
        {ownerEnrollmentCode ? (
          <textarea
            className="code-output"
            readOnly
            value={ownerEnrollmentCode}
            aria-label="Owner enrollment code"
          />
        ) : null}
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
