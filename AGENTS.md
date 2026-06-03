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
- RAILGUN Wallet SDK, loaded behind an explicit connection flow.
- GitHub Pages from `main:/docs`.
- Manual PWA manifest and service worker from `public/`.
- Custom domain: `bindle.me`.
- Default theme: dark black/red paisley, with black/white and black/blue
  palettes plus light/dark modes.

Important directories:

- `src/`: source app code.
- `src/railgun/`: browser RAILGUN engine adapter and artifact storage.
- `src/privacy/`: outbound connection policy.
- `src/intents/`: local recipient route classification.
- `src/theme/`: theme selection data.
- `public/`: static files copied into builds, including `CNAME`.
- `public/manifest.webmanifest`, `public/service-worker.js`, and
  `public/icons/`: PWA installability assets.
- `docs/`: committed production build served by GitHub Pages.
- `dist/`: local build output; ignored by git.
- `scripts/generate-pwa-icons.mjs`: dependency-free PWA icon generator.

## Product And Privacy Rules

Hard product rules:

- No simulated transaction feed.
- No seeded contacts.
- No fake balances, fake `0zk` addresses, or invented liquidity.
- No hard-coded third-party endpoints without explicit user or operator choice.
- Empty states are allowed only when they represent the real first-run state.
- Controls that are not wired must either be removed or clearly disabled.

Privacy defaults:

- Ethereum RPC: unset.
- Private POI aggregator: unset.
- Broadcaster: unset.
- Provider resolver: local table.
- Price quotes: manual.
- Waku: off.

Production work should preserve this shape. Add networked capabilities as
explicit, inspectable endpoints rather than hidden defaults.

## Build, Preview, And Deploy Commands

Install dependencies:

```bash
npm install
```

Run local dev server:

```bash
npm run dev
```

Build and typecheck:

```bash
npm run build
```

Regenerate PWA icons:

```bash
npm run icons
```

Update GitHub Pages output after source changes:

```bash
npm run icons
npm run build
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

- `@railgun-community/wallet@10.8.6` requires `ethers@6.14.3`; newer ethers
  versions conflict with the peer dependency.
- The RAILGUN SDK bundle is large. It is intentionally lazy-loaded behind
  `startRailgunBrowserEngine()`.
- The SDK references Node built-ins in browser builds. Vite uses
  `vite-plugin-node-polyfills`, plus a local `src/shims/vm.ts` shim to avoid
  bundling `vm-browserify`'s direct `eval` path.
- `npm audit` reports vulnerabilities through the current RAILGUN dependency
  graph. Non-breaking `npm audit fix --omit=dev` did not resolve them. Do not
  use `--force` without a deliberate SDK compatibility review.
- Running `npm audit fix --omit=dev` may prune dev dependencies locally. Run
  `npm install` afterward before building.
- The GitHub CLI snap may fail to use SSH in this environment. The remote is
  HTTPS: `https://github.com/pierce403/bindle.git`.
- Pushing workflow files requires GitHub `workflow` scope. This repo currently
  avoids Actions-based Pages deployment.
- `git` commands that write `.git` metadata may require sandbox escalation here.
- PWA installability depends on `manifest.webmanifest`, 192x192 and 512x512 PNG
  icons, and a service worker with a fetch handler.

## Current Missing Product Work

- Real wallet create/import.
- Real `0zk` address derivation and persistence.
- ETH shield transaction generation through RAILGUN.
- Balance sync from actual wallet state.
- Helios adapter and compatibility tests against RAILGUN provider calls.
- Provider resolver and broadcaster policy for outgoing decloaked routes.
- Security cleanup or mitigation strategy for RAILGUN transitive dependencies.

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
