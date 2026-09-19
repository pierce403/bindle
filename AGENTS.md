# AGENTS.md - Instructions for Coding Agents

## Self-Improvement Directive

Update this file when important repo-specific lessons are learned. Record
verified build/test/preview/deploy commands, privacy rules, dependency pitfalls,
failed approaches, collaborator preferences, and gaps. Consolidate obsolete or
contradictory notes rather than appending logs. `FEATURES.md` owns the backlog.

## Persona and workflow

The harness identity is Codex. Introduce yourself by your assigned name on first
reading this file with the human. Be direct, pragmatic, and explicit about
tradeoffs. Prefer small, verifiable changes; empty real states beat fake UX.

**Commit and push completed tasks to `main` immediately. Do not finish with
completed work only in the working tree.** Work intended for the repository or
`bindle.cash` must include `git commit` and `git push origin main`. Build before
committing source/generated output, preserve unrelated work, and verify the
published release. GitHub Pages publishes `main:/docs`; do not replace that path
with an unrelated deployment system.

## Product and privacy rules

- No fake balances, `0zk` addresses, liquidity, contacts, transactions, or
  simulated successful broadcasts in the product. Test fixtures stay in tests.
- Keep the wallet simple: one shielded balance, obvious actions, public-funding
  warning, real activity, and bottom navigation. Addresses live in Receive.
- ETH on Ethereum mainnet is the primary asset. Do not represent generic
  cross-network Pay, Swap, or XMTP chat as implemented.
- Passkey-backed public funding is first-run onboarding. The shielded recovery
  phrase is currently an encrypted local interim key path; EOA/phrase recovery
  remains advanced. Platform passkeys may sync through device-account providers.
- Ordinary browser display mode is informational only. Wallet controls mount
  only in the installed PWA. This UX gate is not a browser security boundary.
- Every outbound dependency belongs in `ConnectionPolicy`, Connections, and
  relevant preflight disclosure. Defaults must be labelled and replaceable.
  No hidden endpoints, analytics, SDK bootstrap defaults, CDN imports, or
  environment-only services. Public defaults can observe network metadata.
- Private-origin submission must use only the RAILGUN broadcaster transport.
  Never fall back to the public smart wallet, Coinbase, ERC-4337, Pimlico,
  paymaster, EOA, or durable funding address. If prerequisites fail, stop.
- Private change may return to `0zk` or an explicitly reviewed fresh ephemeral
  settlement account. Never silently route it to a recipient/provider/public
  funding account.
- Send amounts are USD strings; `src/intents/conversion.ts` uses the active
  Chainlink price from the synced balance to convert them to ETH/Wei.
- No autonomous testing may risk real funds. Use deterministic fixtures, mocks
  confined to tests, and read-only live diagnostics. No mainnet spend is part
  of the modernization verification.

## Layout and architecture

- `src/`: Vite/React/strict TypeScript app; use lucide icons and scoped changes.
- `src/privacy/`: connection policy, disclosure, Kohaku adapter/storage.
- `src/railgun/`: wallet format, balances, proof boundary, broadcaster transport.
- `src/intents/`: local recipient/route classification and conversion.
- `src/pwa/`, `public/service-worker.js`: approved-release update lifecycle.
- `public/`: source static content copied to `docs/` by builds, including CNAME,
  proving artifacts, PWA assets, and `railgun-modernization.md`.
- `docs/`: committed production output; `dist/` is ignored scratch output.
- `FEATURES.md`: backlog; `PRIVACY.md`: trust boundaries; `README.md`: current
  setup and architecture; modernization report: precise validation evidence.

Kohaku owns wallet/state/proof APIs. The official RAILGUN broadcaster client owns
Waku networking, signed fee ads, selection, and encrypted submission. Bindle owns
policy, explicit translation/validation, UI, diagnostics, and recovery formats.

Pinned packages: Kohaku RAILGUN `0.0.1-alpha.30`, provider `0.1.0-alpha.9`,
plugins `0.0.1-alpha.13`; official broadcaster `9.1.1`, wallet `10.9.1`, and
shared-models `8.0.1`. The old Kohaku Waku alias is removed. The official client's
transitive Waku SDK is `0.0.36`; do not create a parallel Bindle Waku node.
The wallet package supplies broadcaster protocol/crypto helpers only. Do not
start its engine, let it own Bindle wallets, or infer that its substantial
transitive graph has disappeared.

## Wallet derivation safety

Historical Bindle used ethers secp256k1 BIP32 with RAILGUN path names, not the
reference RAILGUN tree. Reference RAILGUN uses HMAC-SHA512 with `babyjubjub seed`
and hardened hash chaining without secp256k1 child arithmetic. Same phrase,
different account. See [upstream issue 243](https://github.com/ethereum/kohaku/issues/243).

- `src/railgun/railgunDerivation.ts` supports `bindle-ethers-bip32-v1` and
  `railgun-babyjubjub-v1`. Missing stored/export versions ALWAYS mean historical
  Bindle; never reinterpret existing `kohaku-railgun` metadata as canonical.
- `derivationProvider` describes the adapter; `derivationVersion` describes the
  mnemonic algorithm. Both historical and canonical accounts use Kohaku signers.
- New creates use the canonical version. Bare phrase import explicitly chooses
  Standard RAILGUN or Bindle before v0.2. Account exports preserve the version.
- The encrypted payload and record metadata must agree; unknown versions and
  derived-address mismatches fail closed. Validate an imported expected address
  BEFORE overwriting IndexedDB. Failed recovery must preserve the old wallet.
- Old unsupported SDK records remain `legacy-noncanonical` for quarantine;
  never relabel them or imply funds moved. There is no automatic migration.
- `tests/fixtures/railgunDerivation.ts` freezes public BIP-39 fixture outputs
  from independent engine 9.7.0 (git `31bf5bb3dbceea284832f0a326a616bdfc8dd191`).
  Alpha.22 and alpha.30 agree when given the same keys. Public spending/viewing
  keys and addresses are tested; expected values must never be regenerated from
  the implementation under test. Test-only engine projection resolves through
  the locked wallet dependency, not stale extraneous root node_modules.
- `tests/railgunWalletCompatibility.spec.ts` exercises real encrypted browser
  storage, old unstamped records, round trips, and failed-import preservation.
- Cache v2 includes address, provider, derivation version, and chain. Discarding
  old display-only cache is allowed; wallet secrets/metadata must survive.
- Unsupported public derivation metadata retains addresses and passkeys in a
  blocked state. Creation and unconfirmed phrase imports use atomic IndexedDB
  `add` so missing metadata or competing tabs cannot overwrite stored keys.
  JSON imports inspect encrypted storage even when public metadata is absent,
  require confirmation before replacement/deletion, and compare the reviewed
  record revision inside the write transaction. A changed record requires fresh
  review. Explicit wipe/regenerate still clears first.
- Readiness verifies local secret/address/provider/format/chain consistency.
  Shield repeats that check before deployment/RPC; a key-store marker is not
  recovery proof. Invalidate balance requests when wallet/format/policy changes
  and match both live and cached balances to the current wallet before painting.
  Block create/import/replace/reset during submission and recheck active funding
  and shielded identities after preparation, immediately before signing/sending.
  `tests/walletSafety.spec.ts` covers late sync after import and corruption after
  readiness with controlled local fixtures and no real outbound wallet traffic.

`railgunWallet.ts` stores AES-GCM encrypted phrases under a non-extractable
browser-local WebCrypto key in IndexedDB `bindle-railgun-wallet-secrets`.
localStorage holds only public metadata and key-store markers. Never put
mnemonics, spending/viewing keys, WebAuthn private material, or service secrets
there or in logs. This encryption does not defend against compromised same-origin
code/devices. Passkey-backed wrapping remains pending. A repair/reset creates a
new wallet and does not recover funds at the old address.

## Kohaku and broadcaster integration constraints

- Import the generated binding from `@kohaku-eth/railgun/dist/pkg/index.js`.
  Initialize WASM then `initLogging()` once per session; repeating logging init
  panics. Package-root plugin imports previously pulled incompatible browser
  dependencies. Revisit only with a verified build.
- Do not call `createRailgunPlugin()` with hidden RPC/indexer/POI defaults.
  Build the provider explicitly. Alpha.30 accepts a plain ChainConfig; override
  `subsquidEndpoint` with the exact visible HTTP(S) URL, including custom mirrors.
  Empty/unhealthy indexers use explicit RPC fallback. RPC-only log sync uses
  bounded batches and may still hit provider limits.
- Alpha.30 `balance()` returns `BalanceEntry[]`, not tuple pairs. Respect each
  entry's POI status and do not inflate spendable balances from non-valid notes.
- Rust builder methods may consume their WASM wrappers. Retain returned
  wrappers and never free/reuse a consumed builder. Tests cover this ownership.
- The prover's compiled GitHub artifact base is redirected by the controlling
  service worker to `/railgun-artifacts/`. Require proxy readiness before
  proving; custom origins remain blocked until a configurable loader exists.
- `RailgunBroadcasterTransport` is the sole production transport. DNS ENR trees,
  DNS JSON resolvers, secure WebSocket direct peers, shard, fee token, optional
  trusted signer, POI lists, and enable switches all come from visible policy.
- Default Waku is off. Its preset values include Rooted in Privacy discovery
  and Cloudflare DNS JSON. Privacy max clears hosted values and automatic startup.
  Discovery/peer exchange can contact peers learned from the selected network.
- The visible POI list-key preset matches the published Kohaku mainnet list and
  is only a broadcaster compatibility filter. Aggregator URLs remain empty;
  selecting a list does not enable unsupported private-payment proofs or cause
  a POI host call.
- Pinned patches honor DNS-off and empty peer lists, disable implicit bootstrap,
  inject visible resolvers, expose fresh fee observations, stop polling timers,
  and avoid a second-engine nullifier lookup. Do not remove patches until
  upstream supplies equivalent behavior. Signature verification stays enabled.
- Narrow Buffer/stream browser compatibility is justified by actual upstream
  imports. Do not restore broad crypto/Node polyfill bundles by default.
- `wakuFeeAds.ts` is independent diagnostic parsing only. Relay registry rows
  and raw ads never authorize spend. Refresh the official cache, obtain a fresh
  selection, bind quote/policy to the operation, and revalidate before submit.
- `privateTransactionBridge.ts` validates chain/target/calldata, nullifiers,
  proof-bound parameters, fees, POI, and RelayAdapt metadata. Structural success
  does not prove cryptographic readiness. `kohakuPrivateBuilder.ts` is prove-only.
- Private Send/unshield/Pay remain blocked: alpha.30 has no pre-transaction POI
  export, broadcaster fee-output binding, configurable proof-bound min gas price,
  or supported native-ETH RelayAdapt/RelayAdapt7702 construction path. Its POI
  processing happens after transactions are indexed. Do not fabricate missing
  proofs/fees or enable submit merely because proof APIs exist.
- A no-spend diagnostic reports capabilities and infrastructure independently.
  It does not load user wallets, produce fake transaction hashes, or broadcast.
  Do not make deterministic tests depend on public network uptime.

## Public funding and passkeys

`smartAccountAdapter.ts` uses Viem Coinbase Smart Wallet support for public
funding/deposit operations via visible RPC/bundler policy. Resolve deployed owner
indexes rather than assuming slot zero. Try saved public credential candidates.
Do not force `internal` transport hints: synced passkeys may otherwise appear
unavailable. USB/NFC/BLE hints belong only to explicit security-key mode; retry
without hints when appropriate. An unavailable credential does not mean Bindle
ever had its private material.

Shield deploys a counterfactual funding account if needed, then deposits the
spendable public ETH after explicit review. Reserve ERC-4337 gas unless a visible
paymaster sponsors it; exact zero-balance sweep otherwise is not promised.
Invalidate shielded sync and retry after mining because note/indexer state may
lag. Account exports cannot recover the public smart account without the same
passkey/RP ID or a previously established on-chain recovery path.

## PWA lifecycle

`registerServiceWorker.ts` owns discovery and persistent Approve/Ask/Reject;
Ask is default. `useAppUpdates` defers install/reload during wallet actions and
phrase review. Header version and Settings show current/pending version, full
source commit, and build timestamp. Updates are same-origin and preserve wallets.

From 0.1.5 onward, `/service-worker.js` is a byte-stable update controller.
Ordinary releases change `release.json` and hashed app assets; they must never
change the controller. The build verifies its frozen SHA-256. A future controller
migration requires a content-addressed, append-only URL and separate approval.
Builds write matching `build.json` and `release.json` metadata and hash every
shell asset, including lazy JS/WASM. Missing/mismatched assets fail staging;
proving artifacts stay on demand. Keep the approved shell pointer in `bindle-release-selection-v1`
independent of worker activation: closing all windows can activate a waiting
worker without user approval. Never initialize approval during activation.
A fresh install may select its release; upgrades with missing selection must
preserve the sole previous shell or fail closed when missing/ambiguous. Never
fall back to a new network shell. Never restore unconditional `skipWaiting`,
controller-change reloads, or network-first shell navigation. Cache only
same-origin GET resources, never sensitive RPC/broadcaster/provider POSTs.

Missing artifact-proxy readiness directs users to Version settings; never
silently unregister/upgrade the worker. Artifact-cache repair clears artifacts
only. Storage eviction or an explicit site-data wipe removes the cached-release
guarantee. `pnpm build` then `pnpm test:e2e tests/pwaUpdates.spec.ts` verifies
real two-release lifecycle fixtures, restarts, offline launch, multiple windows,
incomplete downloads, deferral, and localStorage/IndexedDB preservation.
`pnpm test:pwa-worker` additionally covers controller lifecycle without a browser.
The stable controller narrows ordinary candidate-code updates but cannot defend
against a malicious origin replacing the stable URL or clearing storage. The
one-time 0.1.4-to-0.1.5 migration executes candidate install code before approval.
`SECURITY.md` is the canonical PWA threat model; preserve those caveats.

## Build, test, preview, and deploy

```bash
corepack enable
pnpm --version # must resolve 10.34.1, including nested build/test commands
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:pwa-worker
pnpm test:e2e
pnpm build
pnpm dev
pnpm preview
pnpm scan:railgun
pnpm --silent scan:railgun -- --json
pnpm scan:waku -- --json
```

Playwright includes unit/integration tests; there is no separate `pnpm test`.
The scan aliases use a local browser wrapper for the actual browser integration,
and stop before any live transaction. Inspect JSON capability failures separately
from external DNS/peer/broadcaster unavailability.

`pnpm build` writes `docs/`. Its default timestamp is the source commit time to
avoid reproducibility churn; set `BINDLE_BUILD_TIME` only for an intended override.
`pnpm icons` regenerates public assets from `assets/bindle-logo-source.png`;
`pnpm logo` first rebuilds that rose-paisley raster source. Keep source/generated
output synchronized. Public source markdown is copied into docs by the build.

```bash
git status --short --branch
git add <completed-files>
git commit -m "Describe the change"
git push origin main
curl -sS -I https://bindle.cash/
curl -sS https://bindle.cash/build.json
```

Verify source commit/build metadata, served assets, and browser behavior; a push
alone does not prove deployment. Use HTTPS remote
`https://github.com/pierce403/bindle.git`. Git metadata writes may need sandbox
escalation; the snap GitHub CLI may fail SSH. Workflow-file pushes require
workflow scope; branch publishing avoids requiring an Actions deploy workflow.

Tooling lessons:

- pnpm is pinned to `10.34.1`; npm/yarn installs are blocked. A runtime fallback
  pnpm 11 may trigger an unwanted install/SQLite store failure. Use Corepack or
  the cached pinned executable and ensure nested `pnpm` commands resolve a real
  wrapper for it, not just a directory containing `pnpm.cjs`.
  This session verified `/tmp/bindle-tools/pnpm` symlinked to
  `/home/pierce/.cache/node/corepack/v1/pnpm/10.34.1/bin/pnpm.cjs`, with
  `/tmp/bindle-tools` first in PATH, for nested build/test invocations.
- Dependency lifecycle scripts are disabled; `minimumReleaseAge: 1440` holds
  releases for 24 hours. Keep reviewed ignored build scripts and pinned security
  overrides in sync with the actual lockfile. Do not run force audit fixes.
- Playwright uses `localhost:5178`; WebAuthn rejects `127.0.0.1` as RP domain.
  One worker avoids Chrome Crash Reports lock collisions. It prefers local
  Chrome, then snap Chromium, then a managed browser. Browser/localhost access
  may require command sandbox escalation.
- Close Send/Pay modal backdrops before clicking navigation. Open Receive for
  address assertions; addresses are intentionally absent from the home balance.
- Use `rg`, `apply_patch`, strict TypeScript, and primary upstream sources.
  Keep changes scoped. No `any` escape hatches at protocol boundaries.

## Future boundaries and harness compatibility

Helios is unimplemented. Any future adapter must expose execution RPC,
consensus/checkpoint endpoints and trust choices. It reduces RPC-response trust,
not endpoint metadata leakage. Product gaps stay in `FEATURES.md`.

`AGENTS.md` is canonical. Other harness files should be symlinks only when
needed (`ln -s AGENTS.md CLAUDE.md`, likewise GEMINI.md). No project-local memory
or skill directory exists. Add a compact index before introducing one.
