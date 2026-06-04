import {
  Download,
  KeyRound,
  Network,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { BuildMetadataLink } from "./BuildMetadataLink";
import { PwaInstallPrompt } from "./PwaInstallPrompt";

const principles = [
  {
    title: "Passkey first",
    copy:
      "The intended phone flow starts with a passkey-backed smart wallet for public ETH funding.",
    Icon: KeyRound
  },
  {
    title: "Shielded ETH",
    copy:
      "Bindle is focused on Ethereum mainnet ETH shielded through the RAILGUN protocol.",
    Icon: ShieldCheck
  },
  {
    title: "Visible connections",
    copy:
      "RPC, bundler, paymaster, broadcaster, and resolver endpoints stay explicit and replaceable.",
    Icon: Network
  }
];

export function BrowserLandingPage() {
  return (
    <main
      className="app-shell landing-shell"
      data-theme-accent="red"
      data-theme-mode="dark"
    >
      <section className="landing-page" aria-label="About Bindle">
        <header className="landing-header">
          <div className="brand-lockup">
            <img className="brand-mark" src="/logo.png" alt="" />
            <div className="brand-copy">
              <strong>Bindle</strong>
              <span className="eyebrow">Private Ethereum wallet</span>
              <BuildMetadataLink />
            </div>
          </div>
          <span className="landing-mode">Browser mode: info only</span>
        </header>

        <section className="landing-hero">
          <div className="landing-copy">
            <span className="landing-kicker">Install to open the wallet</span>
            <h1>Simple ETH payments with a privacy boundary you can inspect.</h1>
            <p>
              Bindle is a statically hosted PWA for passkey-first Ethereum
              onboarding, public smart-wallet funding, and RAILGUN shielded ETH.
              The browser page explains the project; the installed app contains
              the wallet.
            </p>
          </div>

          <section className="landing-install" aria-label="Install Bindle PWA">
            <Download size={28} aria-hidden="true" />
            <div>
              <strong>Install Bindle as a PWA</strong>
              <span>
                The wallet UI is available only from the installed app window.
                This keeps casual browser visits separate from local wallet
                setup.
              </span>
            </div>
            <PwaInstallPrompt />
          </section>
        </section>

        <section className="landing-feature-grid" aria-label="Bindle goals">
          {principles.map(({ title, copy, Icon }) => (
            <article className="landing-feature" key={title}>
              <Icon size={24} aria-hidden="true" />
              <strong>{title}</strong>
              <span>{copy}</span>
            </article>
          ))}
        </section>

        <section className="landing-status" aria-label="Current implementation">
          <div>
            <WalletCards size={25} aria-hidden="true" />
            <h2>Current wallet milestone</h2>
          </div>
          <ul>
            <li>Fund a passkey-backed smart-wallet address with mainnet ETH.</li>
            <li>Refresh public ETH through the visible Ethereum RPC.</li>
            <li>Review and submit native ETH shielding through visible 4337 policy.</li>
            <li>Shielded balance sync, unshield, and private sends are still pending.</li>
          </ul>
        </section>
      </section>
    </main>
  );
}
