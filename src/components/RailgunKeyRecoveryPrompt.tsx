import { Copy, RotateCcw, ShieldAlert } from "lucide-react";
import { useState } from "react";

type RailgunKeyRecoveryPromptProps = {
  mode: "legacy-passphrase" | "missing";
  oldRailgunAddress: string;
  replacementRailgunAddress: string | null;
  isReplacing: boolean;
  status: string;
  replacementRecoveryPhrase: string | null;
  onReplace: () => void;
};

const modeCopy = {
  "legacy-passphrase": {
    title: "Password-era 0zk wallet",
    detail:
      "This 0zk address was created by an older password-protected build, so Bindle cannot use its keys for shielding now."
  },
  missing: {
    title: "0zk wallet secrets missing",
    detail:
      "This browser has a 0zk address saved, but the matching local RAILGUN key record is missing."
  }
};

export function RailgunKeyRecoveryPrompt({
  mode,
  oldRailgunAddress,
  replacementRailgunAddress,
  isReplacing,
  status,
  replacementRecoveryPhrase,
  onReplace
}: RailgunKeyRecoveryPromptProps) {
  const [copiedRecoveryPhrase, setCopiedRecoveryPhrase] = useState(false);
  const copy = modeCopy[mode];
  const replacementReady =
    replacementRailgunAddress !== null && replacementRecoveryPhrase !== null;

  const copyRecoveryPhrase = async () => {
    if (!replacementRecoveryPhrase) {
      return;
    }

    await navigator.clipboard.writeText(replacementRecoveryPhrase);
    setCopiedRecoveryPhrase(true);
  };

  return (
    <section className="panel railgun-repair" aria-label="Repair shielded wallet">
      <div className="section-heading">
        <div>
          <h2>{replacementReady ? "New 0zk wallet created" : copy.title}</h2>
          <span>
            {replacementReady
              ? "Save this recovery phrase before shielding funds to the new address."
              : copy.detail}
          </span>
        </div>
        <ShieldAlert size={21} aria-hidden="true" />
      </div>

      <div className="funding-card" aria-label="Incompatible 0zk address">
        <span>
          {replacementReady
            ? "Replaced blocked 0zk address"
            : "Current blocked 0zk address"}
        </span>
        <strong>{oldRailgunAddress}</strong>
      </div>

      {replacementRailgunAddress ? (
        <div className="funding-card" aria-label="New 0zk address">
          <span>New 0zk address</span>
          <strong>{replacementRailgunAddress}</strong>
        </div>
      ) : null}

      {!replacementReady ? (
        <>
          <p className="repair-warning">
            Replacing this creates a fresh shield target for future sweeps from
            your public funding wallet. It does not recover or move funds
            already shielded to the old 0zk address.
          </p>

          <button
            className="primary-action wide"
            type="button"
            disabled={isReplacing}
            onClick={onReplace}
          >
            <RotateCcw size={18} aria-hidden="true" />
            {isReplacing ? "Replacing 0zk wallet" : "Wipe and regenerate 0zk"}
          </button>
        </>
      ) : null}

      {status ? <span className="status-message">{status}</span> : null}

      {replacementRecoveryPhrase ? (
        <div className="recovery-card" aria-label="New shielded wallet recovery phrase">
          <span>New recovery phrase - save before shielding</span>
          <strong>{replacementRecoveryPhrase}</strong>
          <button
            className="secondary-action wide"
            type="button"
            onClick={() => void copyRecoveryPhrase()}
          >
            <Copy size={18} aria-hidden="true" />
            {copiedRecoveryPhrase ? "Copied" : "Copy recovery phrase"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
