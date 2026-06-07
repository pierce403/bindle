# AGENTS.md - Instructions for Coding Agents

## Self-Improvement Directive

When working on Bindle, update this file whenever you learn something important
that future agents should not have to rediscover. Capture both successful paths
and failed experiments. Keep notes concrete, current, and scoped to this repo.

Record:

- Verified build, test, preview, and deploy commands.
- Product or privacy rules that affect implementation choices.
- Common errors, dependency pitfalls, and known unsafe shortcuts.
- Collaborator preferences that matter for future work.
- Gaps that must stay visible until implemented.

## Persona, Rapport, And Operating Context

The current harness identity is Codex. Agents using this file should introduce
themselves by their assigned name when they first read it with the human.

Work style for this repo:

- Be direct, pragmatic, and explicit about tradeoffs.
- Do not ship simulated product state. Empty real states are better than fake UX.
- Prefer small, verifiable changes that keep outbound services visible,
  replaceable, and disclosed.
- Commit finished knowledge and implementation changes. Push `main` when the
  change is meant to update the GitHub repo or `bindle.cash`.

## Responsibilities

Agents working on Bindle are expected to:

- Preserve the no-silent-third-party-connections rule.
- Keep GitHub Pages deployment working from `main:/docs`.
- Keep the UI honest about what is real, missing, disabled, or experimental.
- Verify builds before committing code or generated `docs` output.
- Surface dependency and privacy risks plainly instead of hiding them.
- Update this file when new project lessons become durable.

## Project Overview

Bindle is a statically hosted TypeScript wallet interface for private Ethereum
payments through RAILGUN. It aims for extreme simplicity, Venmo-like usability,
and privacy-oriented defaults.

Current stack:

- Vite, React, TypeScript.
- Kohaku-first privacy toolkit adapter boundary, defaulting to the Kohaku
  RAILGUN adapter.
- Legacy RAILGUN Wallet SDK code and dependencies have been removed. Old
  noncanonical derivation metadata is normalized only so those records stay
  blocked safely.
- GitHub Pages from `main:/docs`.
- Manual PWA manifest and service worker from `public/`.
- Custom domain: `bindle.cash`.
- Target first-run onboarding: mobile PWA passkey creates a smart wallet, then
  Bindle connects that account to shielded ETH through the privacy toolkit.
  Seed phrases, EOA imports, and legacy noncanonical wallet records are
  advanced compatibility or recovery flows, not the default UX.
- Browser visits are informational only. `src/App.tsx` gates the wallet behind
  installed PWA display mode and renders `BrowserLandingPage` otherwise.
- Default theme: dark black/red paisley, with black/white and black/blue
  palettes plus light/dark modes.
- Product direction follows Zodl/Zashi-style simplicity: a single home balance,
  obvious Receive/Send/Pay/Swap actions, an unshielded-balance warning, and
  no fake activity. App-level sections use bottom navigation for wallet, node
  connections, relay discovery, settings, and later chat; activity stays on
  the wallet home.

Important directories:

- `src/`: source app code.
- `src/railgun/`: browser RAILGUN engine adapter and artifact storage.
- `src/privacy/`: outbound connection policy and privacy toolkit adapters.
- `src/intents/`: local recipient route classification.
- `src/theme/`: theme selection data.
- `FEATURES.md`: canonical feature backlog and product TODO list.
- `public/`: static files copied into builds, including `CNAME`.
- `assets/bindle-logo-source.png`: generated source image for the app logo.
- `public/manifest.webmanifest`, `public/service-worker.js`,
  `public/logo.png`, `public/favicon-16.png`, `public/favicon-32.png`, and
  `public/icons/`: PWA installability assets.
- `docs/`: committed production build served by GitHub Pages.
- `dist/`: ignored local scratch output if a one-off command writes there.
- `scripts/generate-logo-source.mjs`: dependency-free raster compositor for the
  rose paisley bandana logo source.
- `scripts/generate-pwa-icons.mjs`: dependency-free PWA icon generator.

## Product And Privacy Rules

Hard product rules:

- No simulated transaction feed.
- No seeded contacts.
- No fake balances, fake `0zk` addresses, or invented liquidity.
- The wallet home should bias toward Zodl-like simplicity: one main balance,
  obvious Receive/Send/Pay/Swap actions, an unshielded-balance warning, and
  activity below.
- The primary active asset is ETH on Ethereum mainnet, shielded with RAILGUN.
  Pay across networks/currencies, swaps, and XMTP chat are future work until
  wired honestly.
- Default onboarding should be passkey-backed smart wallet creation from the
  phone PWA. Do not make seed phrases, EOAs, browser extensions, or fake
  wallet state the primary first-run path.
- Do not expose wallet setup, balances, sends, shielding, or local wallet
  controls from ordinary browser display mode.
- No hidden endpoints, silent phone-home, or unlabelled hosted infrastructure.
- Default endpoints are allowed only when they are visible in
  `ConnectionPolicy`, shown in Connections, replaceable by the user, and
  included in preflight disclosure before sensitive actions.
- No hidden smart-wallet bundler, paymaster, passkey attestation, or recovery
  endpoint.
- Empty states are allowed only when they represent the real first-run state.
- Controls that are not wired must either be removed or clearly disabled.

Current endpoint presets:

- Bindle default: Kohaku RAILGUN, direct RPC mode,
  `https://ethereum-rpc.publicnode.com` for Ethereum RPC, and
  `https://public.pimlico.io/v2/1/rpc` for the ERC-4337 bundler, plus
  same-origin static RAILGUN proving artifacts at `/railgun-artifacts/`. These
  are public defaults that can see network metadata; never imply they are
  trustless or private.
- Privacy max: hosted endpoints empty/off for users bringing local or
  self-hosted infrastructure.
- Custom: preserves user-entered values while editing each endpoint manually.
- Local dev: localhost-style RPC and bundler endpoints.

Production work should preserve the policy shape: defaults may exist only as
labelled, inspectable, replaceable preset values. No endpoint may be hidden in
source code, SDK helper defaults, environment magic, CDN imports, or
undocumented library defaults.

## Build, Preview, And Deploy Commands

Install dependencies:

```bash
corepack enable
pnpm install
```

Run local dev server:

```bash
pnpm dev
```

Build and typecheck:

```bash
pnpm build
pnpm typecheck
```

Run browser onboarding tests:

```bash
pnpm test:e2e
```

Run a no-spend Kohaku RAILGUN Waku relay scan from the terminal:

```bash
pnpm scan:waku
pnpm scan:waku -- --timeout 120000 --json
```

Regenerate PWA icons:

```bash
pnpm icons
```

Regenerate the rose paisley logo source and all PWA icons:

```bash
pnpm logo
```

Update GitHub Pages output after source changes:

```bash
pnpm icons
pnpm build
```

`pnpm build` writes directly to `docs`. Build metadata defaults to the current
git commit timestamp so repeat builds of the same commit do not churn hashed
assets; set `BINDLE_BUILD_TIME` explicitly only when a deployment-time label is
intended.

Commit and push:

```bash
git status --short --branch
git add .
git commit -m "Describe the change"
git push origin main
```

Verify Pages:

```bash
curl -sS -I https://bindle.cash/
curl -sS https://bindle.cash/
```

GitHub Pages is configured as legacy branch publishing from `main:/docs`; this
avoids requiring GitHub workflow scope.

## Coding Conventions

- Use TypeScript with strict compiler settings.
- Keep edits scoped to the relevant surface; do not refactor unrelated modules.
- Use structured state/types instead of ad hoc string checks when behavior grows.
- Keep generated `docs` output in sync with the committed source build.
- Use lucide icons for UI controls when an icon exists.
- Do not add decorative UI that undermines the app's utilitarian wallet flow.
- Do not use long-lived hidden endpoints or analytics scripts.
- The service worker should only cache same-origin GET requests. Keep navigation
  network-first and do not cache wallet RPC, broadcaster, provider resolver, or
  other sensitive POST traffic.

## Known Issues And Pitfalls

- Kohaku RAILGUN is currently pinned to `@kohaku-eth/railgun@0.0.1-alpha.22`
  with `@kohaku-eth/provider@0.1.0-alpha.8` and
  `@kohaku-eth/plugins@0.0.1-alpha.8`.
- The active `@kohaku-eth/railgun@0.0.1-alpha.22` plugin broadcast helper
  builds a bundler/delegating-signer user operation. Do not use that path for
  Bindle private-origin actions unless the delegating signer is proven to be a
  neutral RAILGUN relay and not user-linkable.
- Bindle aliases `@kohaku-eth/railgun@0.0.1-alpha.12` as
  `@kohaku-eth/railgun-waku` only for the older Kohaku Waku broadcaster
  transport (`JsBroadcasterManager`, `WakuAdapter`, fee quote, broadcast). This
  is not the RAILGUN Wallet SDK and must not replace the Kohaku-canonical 0zk
  derivation path.
- The Waku relay path imports `@waku/sdk@0.0.36` directly. That SDK hardcodes
  its DNS discovery trees, so `src/railgun/wakuBroadcaster.ts` keeps SDK DNS
  discovery disabled and dials only the direct peers visible in
  `ConnectionPolicy`, then uses peer exchange/cache after connecting.
- Kohaku Waku `JsBroadcasterManager.bestBroadcasterForToken` is called by
  Kohaku's own alpha.12 plugin with `BigInt(Date.now())`, so pass JavaScript
  milliseconds, not Unix seconds.
- Public RAILGUN Waku broadcasters are online on `/waku/2/rs/5/1`. A live
  scan on June 6, 2026 observed and parsed current WETH/USDC fee ads, but the
  installed Kohaku alpha.12 `JsBroadcasterManager` still returned no selectable
  `JsBroadcaster`. Bindle now separates raw fee-ad discovery from Kohaku manager
  selection in `src/railgun/wakuFeeAds.ts`, Debug Map, and
  `pnpm scan:waku`. Private Pay remains blocked until a selectable
  broadcaster/proved-operation path is available.
- Do not use Kohaku's higher-level `createRailgunPlugin()` helper in Bindle
  until indexer/POI endpoints are configurable. Its current implementation
  wires a default Subsquid syncer, which violates Bindle's no-hidden-endpoints
  rule.
- `kassandraoftroy/kohaku-cli` is useful reference code but not a directly
  copyable Bindle private relay path. As of its May 31, 2026 state it uses
  `createRailgunPlugin(host, { rpcBatchSize: 450 })`; RAILGUN unshield calls
  `setBundler(Bundler.pimlico(...))` and `setDelegatingSigner(...)`, and its UI
  labels the route `Railgun (ERC-4337 bundler)`. That confirms the Kohaku alpha
  can prepare/broadcast unshield through a bundler/delegating signer, but it is
  not the Waku RAILGUN broadcaster path required for Bindle private-origin
  Pay.
- `kohaku-cli` wraps Kohaku provider `eth_getLogs` calls into small sequential
  chunks, defaulting to 499 blocks with `KOHAKU_GETLOGS_MAX_BLOCK_SPAN` as an
  override. This is a credible reference for mitigating browser RPCs that reject
  large RAILGUN note-sync log scans.
- `kassandraoftroy/derive-railgun-keys` documents the BabyJubJub RAILGUN HD
  derivation used by `kohaku-cli`: spending `m/44'/1984'/0'/0'/i'`, viewing
  `m/420'/1984'/0'/0'/i'`, HMAC seed string `babyjubjub seed`. Treat it as a
  reference, not a Bindle dependency: the published package pulls older Kohaku
  railgun alpha dependencies including Waku/snarkjs.
- Bindle's Kohaku adapter imports the generated WASM binding file directly
  from `@kohaku-eth/railgun/dist/pkg/index.js` and initializes it with the
  default export plus `initLogging()`. Importing the package root pulled the
  plugin facade into Vite, which pulled `viem/isows` and failed the production
  build in this repo.
- The current Kohaku adapter uses `RailgunBuilder.withUtxoSyncer(UtxoSyncer.rpc(...))`
  so startup contacts only the active visible Ethereum RPC endpoint and
  same-origin bundled WASM assets.
- Kohaku's current alpha RAILGUN prover has
  `https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/`.
  compiled in as its artifact base. Bindle mirrors the compressed `.br`
  artifacts under `/railgun-artifacts/` and the service worker maps the
  compiled third-party URL to that same-origin path before the request leaves
  the controlled PWA. Do not allow Pay/private proof flows to proceed with a
  custom artifact mirror until Kohaku exposes a configurable artifact loader.
- Passkey-backed smart wallet work should stay behind the Kohaku/privacy
  adapter boundary. Any ERC-4337 bundler, paymaster, passkey attestation, or
  recovery service must be represented in `ConnectionPolicy` and preflight
  disclosure before it is used.
- Platform passkeys may sync through Apple, Google, Microsoft, or another
  account provider depending on device settings. UX and docs must disclose that
  tradeoff instead of presenting passkeys as purely local by default.
- Bindle now has local wallet metadata in `src/wallet/walletState.ts`.
  localStorage is only for non-secret metadata: wallet status, public addresses
  if real, passkey-present boolean, credential id metadata, timestamps, and
  errors. Do not store EOA private keys, mnemonics, RAILGUN viewing/spending
  material, WebAuthn private material, or provider secrets there. The
  `railgunKeyStore` field is only a marker that encrypted local key material
  exists.
- Bindle-owned RAILGUN wallet secrets live in
  `src/railgun/railgunWallet.ts`. It derives spending/viewing keys from
  Kohaku's `RailgunSigner.spendingKeyPath()` and `viewingKeyPath()`, computes
  the real `0zk` address with `RailgunSigner.privateKey()`, and stores only an
  encrypted recovery phrase in IndexedDB
  (`bindle-railgun-wallet-secrets`) under a non-extractable browser-local
  WebCrypto key. Do not reintroduce user-entered wallet passwords in onboarding;
  passkey-backed key wrapping belongs at a later layer. Keep localStorage
  limited to public metadata.
- Local RAILGUN wallet records carry explicit `derivationProvider` metadata.
  Existing version-2 records without that field are treated as
  `kohaku-railgun` when the Kohaku-derived address matches. New default
  create/import flows derive the 0zk address through Kohaku only and persist
  `kohaku-railgun`. Old SDK-derived or otherwise noncanonical records are
  normalized to `legacy-noncanonical` and must not be silently converted into
  Kohaku accounts or used as proof that funds migrated.
- Do not repair normal wallets into non-Kohaku 0zk accounts. The same
  phrase/key index can derive different shielded accounts across derivation
  implementations, so normal UI, balance sync, and private actions must use the
  single Kohaku-canonical 0zk.
- If saved `0zk` metadata points at a missing key-store marker, missing
  IndexedDB secrets, or a legacy password-era record,
  `RailgunKeyRecoveryPrompt` lets the user wipe only the incompatible RAILGUN
  local state and regenerate a fresh browser-local `0zk`. Keep the warning that
  this does not recover funds already shielded to the old address.
- Passkey enrollment is wired through browser WebAuthn in `src/wallet/passkeys.ts`.
  `src/wallet/smartAccountAdapter.ts` uses Viem's Coinbase Smart Wallet support
  to derive a real passkey-backed ERC-4337 funding address and submit public ETH
  user operations through explicit RPC/bundler endpoints. It resolves deployed
  Coinbase Smart Wallet owner indexes from the on-chain owner list, so migrated
  or re-enrolled passkeys do not need to be owner slot 0. Bindle stores multiple
  public passkey owner records in local wallet metadata and tries saved
  candidates when signing; a WebAuthn "no passkeys available" error means the
  browser/authenticator could not find matching local credential material for
  the requested RP ID, not that Bindle has access to or lost private key
  material. Kohaku's upstream `pq-account` source is still not published as an
  npm package or wired as the default adapter.
- Do not force `internal` WebAuthn transport hints for platform passkeys.
  Synced phone/computer passkeys may otherwise show "no passkeys available"
  during smart-wallet signing. Bindle only hints USB/NFC/BLE for explicit
  YubiKey/security-key mode and retries without transport hints when the
  browser reports no credential.
- Public smart-wallet funding balance sync lives in `src/wallet/publicBalance.ts`
  and uses `src/wallet/mainnetClient.ts` so it can only call the visible
  Ethereum mainnet RPC from `ConnectionPolicy`. The app may refresh this on load
  when an RPC is configured because the selected RPC is currently inside
  Bindle's normal-user trust boundary. Keep the endpoint visible in the UI.
- Shield UI frames the passkey smart account as the public funding address and
  the destination as the user's RAILGUN `0zk` address. The default Shield action
  is a full sweep of the exact synced public ETH balance. Do not reintroduce an
  EOA gas reserve, but do keep ERC-4337 bundler/paymaster policy visible because
  gas sponsorship or fee handling can still make a full sweep fail.
- Cached shielded balances live in localStorage for paint-on-open only and must
  stay keyed by `railgunAddress + derivationProvider + chainId`. Do not return
  a cached Kohaku balance for a legacy noncanonical or unknown wallet record
  that happens to have the same address string.
- Shield/unshield readiness lives in `src/railgun/shielding.ts`. Native ETH
  shield call prep uses Kohaku's low-level `ShieldBuilder.shieldNative`, not the
  higher-level helper that wires hidden Subsquid defaults. Recoverable local
  RAILGUN key material now exists after shielded wallet create/import. Shield
  submission is wired through `prepareNativeEthShieldCalls()` and
  `sendSmartWalletCalls()` after explicit amount and endpoint review. Do not
  bypass visible RPC/bundler policy.
- Pay routes that spend from private RAILGUN balance are classified as
  `railgun-private` in `src/intents/payFlow.ts`. They must be submitted through
  a legitimate RAILGUN Broadcaster, never through
  `sendSmartWalletCalls()`, the passkey smart wallet, Pimlico bundler,
  paymaster, or an EOA. Keep the smart-account adapter guard in
  `src/wallet/transactionOrigin.ts` and the final broadcaster safety gate in
  `src/railgun/broadcaster.ts` intact. `origin === "railgun-private"` must
  imply `submitter === "waku-railgun-broadcaster"`. Private Pay is currently
  disabled before recipient resolution, quotes, proof generation, or live
  submission because Bindle still needs a Kohaku-derived proved private
  operation whose change returns privately to `0zk`.
  Private Pay must also keep
  `changeDisposition === "private-change-to-0zk"` before live submission; do
  not send Uniswap leftover/slippage to the recipient, provider, public smart
  wallet, or any other public change address by default.
- First-run setup is surfaced through `src/components/OnboardingWizard.tsx`.
  Keep new wallet prerequisites in that state-driven flow so users are not
  forced to discover setup steps by opening Receive or Connections manually.
- `ConnectionPolicy` includes preset-aware fields for ERC-4337 bundler,
  paymaster, passkey attestation, and wallet recovery. Defaults are allowed only
  when labelled in presets and shown in Connections; hidden defaults remain
  forbidden.
- Explicit connection settings are persisted in
  `src/privacy/connectionPolicyState.ts`. This is a local operator
  convenience, and migration must not preserve hidden or unlabelled endpoints.
- Full SDK purge removed `@railgun-community/wallet`,
  `@railgun-community/shared-models`,
  `@railgun-community/waku-broadcaster-client-web`, `level-js`, and their type
  packages. `snarkjs` is now present through the Waku-enabled Kohaku alpha.12
  provider/prover dependency path, not the removed RAILGUN Wallet SDK.
- `src/railgun/wakuBroadcaster.ts` starts a Waku LightNode from visible policy
  direct peers, constructs the Kohaku `JsBroadcasterManager`, selects a
  broadcaster by fee token, and submits prepared private operations. It does
  not yet construct the proved Pay/private operation itself.
- Bindle auto-watches Waku for RAILGUN broadcaster fee ads when the installed
  PWA is open and the visible Waku broadcaster preset is enabled. This is a
  convenience feature, not a private spend: it must never create proofs, submit
  transactions, touch the public smart wallet, use the user's 0zk, or call
  Pimlico. The Relays tab is the inspect/choose surface for this app-wide relay
  registry. Keep RAILGUN broadcasters and ERC-4337 bundlers separate in UI copy.
- Saved RAILGUN broadcaster observations are hints, not authority. Every
  `railgun-private` action path must refresh Waku ads immediately before a new
  private transaction, update the relay registry from that fresh snapshot,
  reject stale, unavailable, wrong-token, or raw-fee-ad-only candidates for live
  submit, and pass the fresh `SelectedRailgunBroadcaster` through to the final
  `waku-railgun-broadcaster` submit path. Do not use a saved registry row alone
  for private submit.
- `scripts/scan-kohaku-waku-relays.mjs` is the terminal equivalent of the
  no-spend Waku broadcaster map. It initializes Kohaku alpha.12 WASM from local
  bytes because Node cannot `fetch()` the package's file URL, dials only
  visible direct peers by default, reports both raw RAILGUN fee ads and Kohaku
  manager selections using millisecond timestamps, and stops the Waku node
  before exit.
- Bindle is pnpm-only. `packageManager` pins pnpm, `.npmrc` enables pnpm's
  package-manager strict mode, and `scripts/require-pnpm.mjs` blocks npm/yarn
  installs.
- `package.json` uses pnpm overrides to keep Dependabot-alerted transitive
  packages on patched versions: `underscore@1.13.8`, `uuid@11.1.1`, and
  `ws@8.20.1`. The old `vite-plugin-node-polyfills` dependency was removed
  because it pulled the unfixed `elliptic`/`crypto-browserify` graph and is no
  longer needed after the RAILGUN Wallet SDK purge. Do not re-add broad Node
  browser polyfills unless a current build failure proves a specific polyfill is
  required.
- `pnpm-workspace.yaml` sets `ignoreDepScripts: true` so dependency lifecycle
  scripts do not execute during install, sets `minimumReleaseAge: 1440`, and
  records the reviewed transitive dependency build scripts that pnpm should
  continue to ignore.
- The GitHub CLI snap may fail to use SSH in this environment. The remote is
  HTTPS: `https://github.com/pierce403/bindle.git`.
- Pushing workflow files requires GitHub `workflow` scope. This repo currently
  avoids Actions-based Pages deployment.
- `git` commands that write `.git` metadata may require sandbox escalation here.
- PWA installability depends on `manifest.webmanifest`, 192x192 and 512x512 PNG
  icons, and a service worker with a fetch handler.
- Bindle's logo is generated raster art based on a black/red rose paisley
  bandana cloth bundle. The canonical source is
  `assets/bindle-logo-source.png`; `pnpm logo` regenerates that source from the
  rose paisley texture, and `pnpm icons` regenerates the public logo, favicon
  PNGs, and PWA icons.
- Playwright is configured in `playwright.config.ts` and starts Vite on
  `localhost:5178`. WebAuthn rejects `127.0.0.1` as an invalid RP domain in the
  virtual-passkey test, so keep the e2e origin on `localhost`. It prefers
  `/usr/bin/google-chrome`, then
  `/snap/bin/chromium`, then Playwright's managed browser if one exists. The
  suite runs with one worker to avoid local Chrome Crash Reports lock failures
  during parallel WebAuthn launches.
- Current onboarding specs include passing assertions for honest first-run
  passkey gating, virtual-passkey enrollment without fake addresses, local
  RAILGUN wallet creation with a real `0zk` address, visible default endpoints,
  Privacy max clearing hosted endpoints, and a skipped acceptance spec for the
  future real public-ETH shield sweep.

## Current Missing Product Work

Track product TODOs in `FEATURES.md`. Keep that file current rather than
duplicating the backlog here.

## Helios Notes

Helios can reduce trust in a centralized RPC, but it does not remove outbound
networking. The official project describes it as a Rust/WASM light client
suitable for embedding in wallets and dapps, while still requiring an execution
RPC that supports `eth_getProof` and consensus/checkpoint data.

Treat Helios as a future adapter behind the same visible connection policy.
Helios can reduce trust in RPC responses, but it does not hide metadata from
the endpoint. Do not enable Helios defaults unless execution RPC, consensus RPC,
checkpoint, and checkpoint source/value are visible in Connections and
preflight disclosure.

## Tooling Preferences

- Prefer `rg` for repository search.
- Prefer inspectable CLI workflows over manual hidden steps.
- Use `apply_patch` for manual file edits.
- Use official docs or primary sources for fast-moving dependency/platform
  questions.
- Keep dependency changes pinned and explain why versions move.

## Memory And Skills Structure

No project-local `MEMORY.md`, `SKILLS.md`, or skill directory exists yet. If
durable memory or reusable workflows become useful, add a compact index first
and document it here.

## Harness Compatibility

`AGENTS.md` is canonical. If another agent harness needs its own instruction
file, prefer a symlink to this file so instructions do not diverge:

```bash
ln -s AGENTS.md CLAUDE.md
ln -s AGENTS.md GEMINI.md
```

Only add those symlinks when they are actually needed by the workflow.

## Rapport And Reflection

Collaborator cues observed so far:

- Strong preference for privacy-first defaults and minimizing outbound leaks.
- Strong preference against sample UX or fake state.
- Wants honest first-run onboarding, especially with ETH shielding.
- Values direct articulation of what is missing and what tradeoffs remain.

Keep this file concise. When it grows, consolidate repeated lessons rather than
appending stale logs.
