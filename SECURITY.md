# Bindle Security Policy

Bindle is distributed as a statically hosted Progressive Web App and a signed
Android APK for public smart-wallet and shielded RAILGUN activity. This document
describes their different update trust boundaries and where the browser,
Android device, signing key, and `bindle.cash` origin remain trusted.

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

## Android APK Update Controls

The APK is a Capacitor application with package ID `cash.bindle.wallet`. Its
HTML, JavaScript, WASM, and proving artifacts are embedded in the signed package;
the configuration has no remote `server.url`. The APK does not register the PWA
release controller. Its bundled Android service worker can validate and cache
proving artifacts from the package, but cannot fetch, cache, stage, approve, or
replace the application shell.

Android package signing is the update trust anchor. Once Bindle is installed,
Android will accept an in-place replacement only when it has the same package ID
and signing certificate (and an acceptable version code). Bindle versions map
`major.minor.patch` to `major * 1,000,000 + minor * 1,000 + patch`. The expected
release certificate SHA-256 fingerprint is:

```text
6F:F8:E9:D9:15:11:95:24:8F:F8:D2:92:4C:BC:10:E1:BE:35:C3:2D:1A:B5:43:A3:C6:BD:FD:30:6D:61:70:44
```

The app checks `https://bindle.cash/android-release.json` for strictly shaped
release metadata. The browser install page reads the same-origin copy. A valid
manifest must name a newer internally consistent version and an HTTPS APK under
this repository's GitHub Releases path. Checking happens automatically when the
relevant UI mounts and reveals ordinary request metadata. Downloading requires
a user click, opens the GitHub release asset, and does not install it. Bindle has
no silent install, background package replacement, Play Store updater, or
in-app sideload permission. Android presents and enforces the eventual install.

The manifest and its SHA-256 field are advisory discovery metadata, not an
independent signature and not a hash verification performed by the downloading
browser. For an already-installed copy, a GitHub or `bindle.cash` attacker who
does not possess the release signing key can publish or advertise another APK,
but Android should reject it as an update. Such an attacker can still suppress
updates, lie about availability, link an existing release, consume bandwidth,
or try to persuade the user to uninstall first. A compromised signing key can
authorize malicious in-place updates and is therefore a critical secret.

A fresh installer has no previously pinned Android certificate. Compromise of
the download page, GitHub account, browser, device, or user decision can lead to
installation of an attacker-signed lookalike. Fresh installers should verify the
certificate fingerprint or APK digest through an independent trusted channel.
There is no Play Store review, Play signing, transparency log, or automatic key
recovery. Losing the release keystore or password prevents future updates.

Android passkeys use RP ID `bindle.cash`. `/.well-known/assetlinks.json` binds
that RP ID to the package and release certificate. Domain compromise can remove
that association, disrupt passkey use, or publish an association for an
attacker-controlled app; the signing check still prevents that app from
replacing an installed Bindle APK. The app also depends on Android, Credential
Manager, the system WebView, and passkey providers, which update outside this
APK's controls.

Wallet secrets remain in the app WebView's IndexedDB under a non-extractable
WebCrypto key; they have not been migrated into Android Keystore hardware. APK
replacement normally preserves app data. Clearing app data or uninstalling
removes local secrets and may make funds unrecoverable without a separately
backed-up recovery phrase. Removal prevents later code from using erased local
keys, but it is data loss, not a safe substitute for recovery planning.

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

Users who require protection from a malicious or compromised web origin should
use the APK only after independently verifying its signing certificate. The APK
narrows application-code updates to the Android signing key, but does not remove
the domain, operating system, WebView, network endpoints, passkey provider, or
device from the broader wallet threat model.
