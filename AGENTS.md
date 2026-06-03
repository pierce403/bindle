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
- Prefer small, verifiable changes that preserve privacy defaults.
- Commit finished knowledge and implementation changes. Push `main` when the
  change is meant to update the GitHub repo or `bindle.me`.

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
- RAILGUN Wallet SDK fallback, loaded only behind an explicit adapter choice.
- GitHub Pages from `main:/docs`.
- Manual PWA manifest and service worker from `public/`.
- Custom domain: `bindle.me`.
- Target first-run onboarding: mobile PWA passkey creates a smart wallet, then
  Bindle connects that account to shielded ETH through the privacy toolkit.
  Seed phrases, EOA imports, and legacy SDK wallet lifecycle paths are
  advanced compatibility or recovery flows, not the default UX.
- Default theme: dark black/red paisley, with black/white and black/blue
  palettes plus light/dark modes.
- Product direction follows Zodl/Zashi-style simplicity: a single home balance,
  obvious Receive/Send/Pay/Swap actions, an unshielded-balance warning, and
  no fake activity. App-level sections use bottom navigation for wallet, node
  connections, settings, and later chat; activity stays on the wallet home.

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
- `dist/`: local build output; ignored by git.
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
- No hard-coded third-party endpoints without explicit user or operator choice.
- No hidden smart-wallet bundler, paymaster, passkey attestation, or recovery
  endpoint.
- Empty states are allowed only when they represent the real first-run state.
- Controls that are not wired must either be removed or clearly disabled.

Privacy defaults:

- Privacy toolkit: Kohaku RAILGUN.
- Ethereum RPC: unset.
- Private POI aggregator: unset.
- Broadcaster: unset.
- Provider resolver: local table.
- Price quotes: manual.
- ERC-4337 bundler: unset.
- Paymaster: unset.
- Passkey attestation: none.
- Wallet recovery: none.
- Waku: off.

Production work should preserve this shape. Add networked capabilities as
explicit, inspectable endpoints rather than hidden defaults.

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

Protected build and typecheck:

```bash
SOCKET_SECURITY_API_TOKEN=... pnpm build
pnpm typecheck
```

Local app-only build when Socket is unavailable:

```bash
pnpm build:app
```

Run browser onboarding tests:

```bash
pnpm test:e2e
```

Regenerate PWA icons:

```bash
pnpm icons
```

Update GitHub Pages output after source changes:

```bash
pnpm icons
SOCKET_SECURITY_API_TOKEN=... pnpm build
rm -rf docs/assets
cp -R dist/. docs/
```

Commit and push:

```bash
git status --short --branch
git add .
git commit -m "Describe the change"
git push origin main
```

Verify Pages:

```bash
curl -sS -I https://bindle.me/
curl -sS https://bindle.me/
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
- Do not use Kohaku's higher-level `createRailgunPlugin()` helper in Bindle
  until indexer/POI endpoints are configurable. Its current implementation
  wires a default Subsquid syncer, which violates Bindle's no-hidden-endpoints
  rule.
- Bindle's Kohaku adapter imports the generated WASM binding file directly
  from `@kohaku-eth/railgun/dist/pkg/index.js` and initializes it with the
  default export plus `initLogging()`. Importing the package root pulled the
  plugin facade into Vite, which pulled `viem/isows` and failed the production
  build in this repo.
- The current Kohaku adapter uses `RailgunBuilder.withUtxoSyncer(UtxoSyncer.rpc(...))`
  so startup contacts only the user-configured Ethereum RPC endpoint and
  same-origin bundled WASM assets.
- Passkey-backed smart wallet work should stay behind the Kohaku/privacy
  adapter boundary. Any ERC-4337 bundler, paymaster, passkey attestation, or
  recovery service must be represented in `ConnectionPolicy` before it is used.
- Platform passkeys may sync through Apple, Google, Microsoft, or another
  account provider depending on device settings. UX and docs must disclose that
  tradeoff instead of presenting passkeys as purely local by default.
- Bindle now has local wallet metadata in `src/wallet/walletState.ts`.
  localStorage is only for non-secret metadata: wallet status, public addresses
  if real, passkey-present boolean, credential id metadata, timestamps, and
  errors. Do not store EOA private keys, mnemonics, RAILGUN viewing/spending
  material, WebAuthn private material, or provider secrets there.
- Passkey enrollment is wired through browser WebAuthn in `src/wallet/passkeys.ts`.
  The pinned Kohaku packages do not currently expose a browser-ready
  `@kohaku-eth/pq-account` or equivalent passkey ERC-4337 address derivation
  API, so `src/wallet/smartAccountAdapter.ts` must keep the smart-wallet address
  pending until a real adapter is available.
- `ConnectionPolicy` includes explicit empty/off fields for ERC-4337 bundler,
  paymaster, passkey attestation, and wallet recovery. Do not add defaults for
  these endpoints.
- `@railgun-community/wallet@10.8.6` requires `ethers@6.14.3`; newer ethers
  versions conflict with the peer dependency.
- The RAILGUN SDK bundle is large. It is intentionally lazy-loaded behind
  `startRailgunBrowserEngine()`.
- The SDK references Node built-ins in browser builds. Vite uses
  `vite-plugin-node-polyfills`, plus a local `src/shims/vm.ts` shim to avoid
  bundling `vm-browserify`'s direct `eval` path.
- `pnpm audit` reports vulnerabilities through the current RAILGUN dependency
  graph. Do not force automated audit fixes without a deliberate SDK
  compatibility review.
- Bindle is pnpm-only. `packageManager` pins pnpm, `.npmrc` enables pnpm's
  package-manager strict mode, and `scripts/require-pnpm.mjs` blocks npm/yarn
  installs.
- `pnpm build` is Socket-protected: it runs `socket ci` before `build:app`.
  `SOCKET_SECURITY_API_TOKEN` is required for that protected path. Use
  `pnpm build:app` only for local no-network compilation.
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
- Bindle's logo is generated raster art based on a black/red paisley yin-yang
  mark. The canonical source is `assets/bindle-logo-source.png`; `pnpm icons`
  regenerates the public logo, favicon PNGs, and PWA icons.
- Playwright is configured in `playwright.config.ts` and starts Vite on
  `localhost:5178`. WebAuthn rejects `127.0.0.1` as an invalid RP domain in the
  virtual-passkey test, so keep the e2e origin on `localhost`. It prefers
  `/usr/bin/google-chrome`, then
  `/snap/bin/chromium`, then Playwright's managed browser if one exists. The
  suite runs with one worker to avoid local Chrome Crash Reports lock failures
  during parallel WebAuthn launches.
- Current onboarding specs include passing assertions for honest first-run
  passkey gating, virtual-passkey enrollment without fake addresses, no default
  hosted endpoints, and a skipped acceptance spec for the future real
  public-ETH shield sweep.

## Current Missing Product Work

Track product TODOs in `FEATURES.md`. Keep that file current rather than
duplicating the backlog here.

## Helios Notes

Helios can reduce trust in a centralized RPC, but it does not remove outbound
networking. The official project describes it as a Rust/WASM light client
suitable for embedding in wallets and dapps, while still requiring an execution
RPC that supports `eth_getProof` and consensus/checkpoint data.

Treat Helios as a future adapter behind the same explicit connection policy.
Do not silently add default Helios endpoints.

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
