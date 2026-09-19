# Bindle Security Policy

Bindle is a statically hosted Progressive Web App for public smart-wallet and
shielded RAILGUN activity. Security-sensitive state stays in the browser. This
document describes the intended boundaries, including where the browser and
the `bindle.cash` origin remain trusted.

## Reporting A Vulnerability

Please use a private GitHub Security Advisory in
[`pierce403/bindle`](https://github.com/pierce403/bindle/security/advisories/new)
for vulnerabilities that could expose wallet material, change transaction
intent, bypass update consent, or compromise the release channel. A public issue
is appropriate only when confidential handling is unnecessary.

Include the affected version, browser and operating system, reproduction steps,
and whether any real funds or credentials were involved. Do not test with other
people's wallets or funds.

## Application Security Boundaries

### Funding smart account

- Default funding uses a Coinbase ERC-4337 smart account controlled by a P-256
  WebAuthn passkey.
- Bindle stores public credential identifiers and owner metadata, not the
  passkey private key. The authenticator or passkey provider performs signing.
- Platform passkeys may sync through Apple, Google, Microsoft, or another
  account provider. They are not necessarily device-local.

### Shielded RAILGUN wallet

- The RAILGUN recovery phrase is encrypted in IndexedDB
  (`bindle-railgun-wallet-secrets`) with an AES-GCM WebCrypto key marked
  non-extractable.
- `localStorage` contains public addresses, status, cached display data, and
  credential markers only. It must not contain mnemonics, private keys, or
  RAILGUN spending or viewing keys.
- A non-extractable key limits direct key export. It does not protect against
  malicious same-origin JavaScript that can ask the browser to decrypt or use
  data while the origin is running.

### Network and service boundary

- RPC, bundler, paymaster, relay, attestation, recovery, and artifact endpoints
  must be visible and replaceable through `ConnectionPolicy`.
- Bindle has no private telemetry API, hosted custody service, or user-account
  database.
- Public RPC and bundler operators can observe network metadata. RAILGUN
  privacy does not make every surrounding network request private.

### Supply chain

- The repository is pnpm-only, pins the package-manager version, disables
  dependency lifecycle scripts, and holds newly published package versions.
- Production release assets are listed in `/release.json` with SHA-256 hashes.
  The update controller verifies every asset before it can become pending.
- Hashes detect incomplete or mixed deployments. Because the manifest and
  assets come from the same origin and are not independently signed, they do
  not prove that a release is trustworthy or that displayed commit metadata is
  truthful.

## PWA Update Controls

### Intended model from 0.1.5 onward

Version 0.1.5 moves ordinary application releases behind a byte-stable update
controller at `/service-worker.js`:

1. The controller fetches same-origin `/release.json` with the network cache
   bypassed.
2. It validates the manifest shape, downloads every listed shell asset, checks
   each SHA-256 hash, and stores the complete release in a release-specific
   cache.
3. Downloading creates a *pending* release only. It does not change the approved
   release pointer and does not execute the pending HTML or JavaScript.
4. Navigation and release-asset requests continue to use the approved cache.
   Missing or ambiguous approval state fails closed instead of falling through
   to the newly deployed network shell.
5. Only `BINDLE_APPROVE_UPDATE` with the exact pending release ID changes the
   approved pointer. Open wallet actions defer reload even after approval.

The production build hashes the stable controller and fails if its bytes
change. Normal releases change `/release.json` and hashed application assets,
not the controller. A future controller change must use a content-addressed,
append-only URL and be registered only after a separate explicit approval; it
must not replace `/service-worker.js` in place.

Published release IDs are also immutable. The build refuses to reuse the ID in
the checked-in `docs/release.json`, because the controller treats an approved
ID as already staged and would not distinguish a second asset set carrying the
same ID. This repository check prevents accidental ID reuse; it is not an
independent signature or a browser-enforced content identity.

### User preferences

- **Ask** is the default. A verified pending release is shown with its version,
  commit claim, and build time. “Not now” dismisses that release locally.
- **Reject** allows checks and verified downloads but hides installation
  prompts and keeps serving the approved release.
- **Approve** intentionally approves a pending release automatically, but only
  when no protected wallet action or recovery-phrase review is open.

Preferences are local browser state. Approval in another window applies to the
origin, while each open window delays its own reload until its protected action
is finished.

### Migration to 0.1.5

Browsers already registered to the older mutable `/service-worker.js` URL must
download and execute the 0.1.5 controller's install handler before they can
evaluate it as a pending update. The 0.1.5 handler preserves the previously
approved shell, including when the old installation has only one legacy shell
and no approval record. Closing every window may activate the controller, but
activation does not approve 0.1.5 and navigation still serves the old shell.

This transition cannot be made self-protecting from a malicious 0.1.5 worker:
the browser's service-worker model executes candidate install code before the
application can ask for consent. Users must trust the release channel for this
one-time migration.

### Caveats and non-goals

The controls reduce accidental upgrades and make a normal new application
release unable to replace a rejected shell. They are not a trust anchor outside
the `bindle.cash` origin.

- A compromised hosting account, DNS/TLS path, browser, extension, or device
  can replace the stable controller, clear origin storage, or otherwise bypass
  these controls. A pure same-origin PWA cannot prevent a malicious origin from
  replacing its service worker.
- The build-time controller hash prevents accidental changes in this repository;
  an attacker or maintainer able to change both the controller and the expected
  hash can defeat it. Code review and release-channel security remain required.
- Any same-origin script can access Cache Storage and message the controller.
  Consequently, a same-origin XSS is already inside this control boundary and
  can approve a pending release as well as attack wallet operations directly.
- Clearing site data, uninstalling the PWA, browser storage eviction, private
  browsing cleanup, or storage corruption removes the saved preference and
  approved-shell guarantee. A subsequent visit may be a fresh installation.
- Release metadata is publisher-provided, not independently signed or recorded
  in a transparency log. The UI shows what the release channel claims.
- A party that can bypass the repository build and publish the manifest can
  still reuse or forge release metadata. The immutable-ID build check protects
  the normal release workflow, not a compromised origin or maintainer.
- Update checks and downloads contact `bindle.cash` and reveal ordinary request
  metadata to its hosting path even when a release is rejected.
- The controller deliberately retains the approved, previous, pending, and
  potentially older release caches so an already-open window can finish loading
  its hashed modules. These caches contain application assets, not wallet state.
  The controller does not preserve arbitrary application data if the browser
  itself evicts origin storage.

Users who require protection from a malicious or compromised web origin need a
separately distributed, independently verified native wrapper, browser
extension, or comparable external trust anchor. Bindle does not currently
provide one.
