# Bindle

Bindle is a statically hosted TypeScript wallet interface for private Ethereum payments through RAILGUN. The product direction is deliberately simple: a Venmo-like pay/feed surface, shielded balances, and outgoing intents that can disclose only the routing leg needed to reach a provider or public address.

The target onboarding flow is passkey-first: on phones, the PWA should default
to creating a passkey-backed smart wallet, then use the privacy toolkit boundary
to connect that wallet to RAILGUN shielded ETH. Today, the public funding
account is passkey-backed while the RAILGUN shielded account uses an encrypted
local recovery phrase as an interim recoverable key path. EOA imports and
legacy noncanonical RAILGUN wallet records are compatibility or recovery
concerns, not the default first-run experience.

## Current Shape

- Vite, React, and TypeScript.
- GitHub Pages-ready `docs` build output.
- `bindle.cash` custom domain marker in `public/CNAME`.
- Browser visits show a public information and install page; the actual wallet
  UI mounts only when the app is running in installed PWA display mode.
- Kohaku-first privacy toolkit boundary in `src/privacy/toolkit.ts`.
- Kohaku RAILGUN alpha packages pinned in `package.json`.
- Browser-side Kohaku RAILGUN adapter that starts from visible
  `ConnectionPolicy` endpoints only.
- Legacy RAILGUN Wallet SDK code and dependencies have been removed; old
  noncanonical derivation metadata is normalized only so it can stay blocked
  safely.
- The privacy toolkit can auto-start after a real local `0zk` wallet exists
  when the selected visible preset allows it.
- Local wallet metadata state for passkey-first onboarding, with no private key
  or mnemonic storage in localStorage.
- Encrypted local RAILGUN recovery phrase storage in IndexedDB. Bindle derives
  Kohaku RAILGUN spending/viewing keys from the phrase locally to display a
  real `0zk` address.
- Settings can export a local account JSON file and import it later. When a
  RAILGUN wallet exists, the export includes the RAILGUN recovery phrase so it
  can be re-encrypted into another Bindle PWA session. WebAuthn/passkey private
  material is never exportable; reclaiming the same public smart account on a
  new device requires the same platform passkey to exist or sync through the
  user's passkey provider. Enrolling a new passkey creates a new owner path; it
  does not recover the old public smart account unless an on-chain owner
  rotation/recovery flow was set up first.
- A stale `0zk` repair prompt appears when saved RAILGUN metadata points at
  missing or password-era local key storage. It can wipe only the incompatible
  RAILGUN local state, preserve the passkey funding wallet, and generate a new
  browser-local `0zk` target.
- Wallet-tab onboarding wizard that appears while local setup is incomplete and
  advances through passkey, visible endpoints, funding address creation,
  and shielded wallet creation/import. After both public smart-account metadata
  and browser-local RAILGUN key storage are present, Bindle persists a
  non-secret local setup-complete flag so the wizard does not flash during
  toolkit auto-start on later launches.
- Viem Coinbase Smart Wallet adapter for passkey-backed ERC-4337 funding
  addresses and public ETH user operations through visible RPC/bundler
  endpoints.
- Receive Public gives a direct funding-address path: configure RPC, create
  the funding address, then copy it for mainnet ETH deposits.
- Public funding balance sync uses the visible Ethereum RPC from Connections.
  Bindle refreshes it on load when that RPC is configured, and still shows the
  endpoint that may receive the public smart-wallet address.
- Shield review defaults to sweeping the exact synced ETH balance from the
  public funding address into the user's RAILGUN `0zk` address. It does not
  reserve ETH for EOA gas, but ERC-4337 execution is not free: the visible
  bundler/paymaster policy must cover the operation or the sweep can fail.
- Passkey enrollment stores non-secret credential id and public P-256 metadata;
  WebAuthn private material stays inside the platform authenticator.
- Send Review stays disabled until wallet, toolkit, RPC, recipient, amount, and
  required endpoint preflight checks pass.
- Local intent routing for `0zk`, `0x`, `.eth`, and `@provider` style recipients.
- Debug includes a user-triggered Map section for no-spend RAILGUN/Waku
  broadcaster discovery and separate public-edge checks for configured RPC,
  ERC-4337 bundler, paymaster, and RAILGUN sync endpoints. Waku scanning does
  not run on app load and does not create proofs, submit transactions, or touch
  the public smart wallet.
- `pnpm scan:waku` runs the same kind of no-spend RAILGUN relay scan from the
  terminal. Use `pnpm --silent scan:waku -- --json` for machine-readable
  output. It starts a Waku light node with visible direct peers, reports raw
  current WETH/USDC broadcaster fee ads separately from Kohaku manager
  selections, then stops without creating proofs, submitting transactions,
  calling Pimlico, or touching the smart wallet.
- Pay has a USDC route-review UX for Ethereum mainnet: asset search,
  recipient/amount entry, QR or pasted payment request import, endpoint
  preflight disclosure, modal route review, RAILGUN proof-progress disclosure,
  and route disclosure. Because this Pay route spends from private RAILGUN
  balance, proof generation remains deliberately disabled until Bindle can
  build the proved Kohaku private operation with private change returned to
  `0zk` and hand it to a selectable Waku broadcaster. Raw public Waku fee ads
  are visible in Debug/`pnpm scan:waku`, but the installed Kohaku alpha.12
  manager currently does not expose a selectable `JsBroadcaster` from those ads.
  Private Pay never uses the user's passkey smart account, Pimlico bundler,
  paymaster, or EOA for the private leg.
- Endpoint presets are visible in Connections. Bindle default currently uses a
  labelled public Ethereum RPC, RAILGUN sync indexer, visible public Waku
  RAILGUN broadcaster policy with direct peers, and public ERC-4337 bundler,
  plus same-origin static RAILGUN proving artifacts at `/railgun-artifacts/` and
  `onchain:uniswap-v4` quote source; Privacy max starts with hosted endpoints
  empty/off.
- Endpoint settings are persisted locally in the browser after the user changes
  them, so reloads do not silently remove configured RPC/bundler fields.
- Default dark black/red paisley theme, with black/white and black/blue variants plus light and dark modes.

## Product Rules

- No simulated transaction feed.
- No seeded contacts.
- No fake balances, fake `0zk` addresses, or invented liquidity.
- No hidden endpoints, silent phone-home, or unlabelled hosted infrastructure.
- Default endpoints are allowed only when they are visible in
  `ConnectionPolicy`, shown in Connections, replaceable by the user, and listed
  in preflight disclosure before sensitive actions.
- Toolkit auto-start is allowed only when it is a visible, editable
  `ConnectionPolicy` setting and a real local `0zk` wallet already exists.
- The browser surface is informational. Do not expose wallet setup, balances,
  sends, shielding, or local wallet controls outside installed PWA display mode.
- No hidden smart-wallet bundler, paymaster, passkey attestation, or recovery
  endpoint.
- Empty states are allowed only when they represent the real first-run state.

Feature TODOs live in [FEATURES.md](FEATURES.md).

## License

Bindle is licensed under the [Apache License 2.0](LICENSE).

## Development

```bash
corepack enable
pnpm install
pnpm dev
pnpm test:e2e
pnpm build
```

For GitHub Pages branch publishing, rebuild and copy the production output into
`docs` before committing:

```bash
pnpm build
cp -R dist/. docs/
```

`pnpm build` is now the normal local production build path and does not require
a third-party security-scanner account or API token.

pnpm supply-chain hardening lives in `pnpm-workspace.yaml`. `ignoreDepScripts`
is enabled so dependency `preinstall`, `install`, and `postinstall` scripts do
not execute during installs, and `minimumReleaseAge` holds newly published
package versions for 24 hours before they can enter the lockfile. Those
protections do not require a third-party API key.

## Privacy Toolkit Architecture

Bindle now routes privacy startup through a local adapter boundary:

```text
Bindle UI
  -> local wallet/intents state
  -> passkey-backed smart wallet by default
  -> privacy toolkit adapter
  -> Kohaku RAILGUN where available
  -> visible ConnectionPolicy endpoints only
```

The default adapter is `kohaku-railgun`. It uses Kohaku's low-level RAILGUN WASM bindings, an IndexedDB-backed local database, and a JSON-RPC provider created only from the active `ConnectionPolicy` endpoint shown in the Connections panel.

Important privacy constraint: Kohaku's higher-level `createRailgunPlugin()` helper wires a default Subsquid syncer. Bindle does not call that helper because hidden indexer traffic would violate the product rules. The current Kohaku adapter explicitly builds `RailgunBuilder` itself and uses the visible RAILGUN sync indexer only when that endpoint is present in `ConnectionPolicy`; otherwise it falls back to RPC-only sync.

The legacy RAILGUN Wallet SDK code path is not bundled. Old stored SDK-style
derivation labels are normalized to `legacy-noncanonical` so Bindle can keep
those records visible without treating them as Kohaku-canonical wallets.
Normal app state must not create, import, repair, or spend through the removed
SDK path.

Smart-wallet work should stay Kohaku-first as well. Bindle should prefer a
passkey-backed smart account path where Kohaku supports it, with any ERC-4337
bundler, paymaster, attestation, or recovery service exposed through
`ConnectionPolicy` and preflight disclosure before it can be used.

The current app can enroll a browser passkey, derive a counterfactual Coinbase
Smart Wallet funding address with the visible Ethereum mainnet RPC, and submit
public ETH user operations through the visible ERC-4337 bundler.
It can also explicitly sync the public ETH balance and recent top-level native
ETH funding transfers for that address through the visible RPC after disclosing
the endpoint. The headline balance is reserved for shielded balance in USD and
can be synced from local RAILGUN notes through the selected visible RPC; ETH/USD
pricing is read from the Chainlink ETH/USD mainnet feed through that same RPC.
It can create or import a recoverable local RAILGUN wallet, encrypt the recovery
phrase into IndexedDB with a browser-local WebCrypto key, derive Kohaku RAILGUN
spending/viewing keys locally, and show the resulting real `0zk` address.
Paymaster support is optional and only used when configured. Bindle can audit
shield/unshield readiness and can prepare native ETH shield call data through
Kohaku's low-level WASM binding. Shield review now builds native ETH shield
calls and defaults to a full public-funding-address sweep into the RAILGUN
`0zk` address, then submits the public deposit from the passkey smart wallet
through the visible RPC and ERC-4337 bundler.
For the visible Pimlico default bundler, Bindle requests User Operation gas
prices from that same bundler endpoint before submission so the bundler does not
reject underpriced priority fees. Pimlico is only for public smart-wallet
operations such as account deployment, public ETH payments, and public shield
deposits. The active Kohaku alpha.22 package has a bundler/delegating-signer
private broadcast helper, but Bindle does not use that path for private-origin
actions. Private Pay-to-USDC is disabled before recipient resolution, quote,
proof generation, or live submission until Bindle can build a proved
Kohaku-derived private operation whose leftover swap/change funds return
privately to `0zk`. The standalone Waku RAILGUN broadcaster transport is wired
for discovery, fee quote, and submission of prepared private operations, and
the final private submitter guard requires `waku-railgun-broadcaster`.
Standalone
unshielding, private RAILGUN sends, non-USDC Pay assets, and any-network
provider routing remain pending.

Kohaku's current alpha RAILGUN prover has
`https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/`
compiled in as its artifact base. Bindle mirrors Kohaku's compressed RAILGUN
`.br` proving artifacts under `/railgun-artifacts/` and the service worker maps
Kohaku's compiled third-party URL to that same-origin path before the request
leaves the controlled PWA. Custom artifact mirrors remain blocked for Pay until
Kohaku exposes a configurable artifact loader.

## RAILGUN Integration Notes

Kohaku is the only bundled RAILGUN backend. New normal `0zk` creation/import
uses Kohaku derivation and persists `derivationProvider = "kohaku-railgun"`.
Existing old SDK-derived or otherwise noncanonical records are normalized to
`legacy-noncanonical`; Bindle does not silently convert them to Kohaku accounts
or imply funds moved.

Current shield/unshield status:

- Public ETH funding balance sync is real and explicit.
- Recent public native ETH activity is scanned from top-level Ethereum blocks
  through the selected visible RPC. Contract-internal transfers still need an
  explicit, visible indexer or trace provider.
- Shielded ETH balance sync is real and explicit. It unlocks the local encrypted
  RAILGUN wallet, registers the local signer with Kohaku, scans RAILGUN notes
  through the visible RAILGUN sync indexer when configured, falls back to the
  visible RPC syncer, and sums the wrapped-base-token private balance as ETH.
  If the sync indexer is off, first sync can be slow and public/default RPC
  endpoints may reject or CORS-block large browser `eth_getLogs` scans.
- RAILGUN wallet creation/import is real and local. The recovery phrase is
  encrypted into IndexedDB with a non-extractable browser-local WebCrypto key;
  localStorage stores only the public `0zk` address and a key-store marker.
- Password-era or missing local RAILGUN key records are not accepted for new
  shielding. The app prompts to replace them with a fresh browser-local `0zk`;
  this does not recover or move funds already shielded to the old address.
- Native ETH shield call preparation is available through Kohaku low-level
  `ShieldBuilder.shieldNative`.
- Shield submission is wired from the passkey smart wallet through visible
  RPC/bundler policy after an explicit review of amount and contacted endpoints.
- Pimlico ERC-4337 submissions use the configured bundler's
  `pimlico_getUserOperationGasPrice` response for User Operation fee fields.
- Private Pay-to-USDC is classified as a `railgun-private` source leg plus a
  public settlement leg. Review discloses the RAILGUN 0zk source, broadcaster
  and Waku status, broadcaster fee token/fee, Uniswap v4 route provider, target
  token, amount, recipient, and chain. Bindle includes a standalone Waku
  RAILGUN broadcaster transport using the Waku-enabled Kohaku package line, but
  Private Pay remains disabled until a Kohaku-derived proved private operation
  can be built with private change returned to `0zk`. The app blocks before
  ENS/RPC recipient resolution, Uniswap quote, proof generation, or submission.
- Standalone unshield and private send flows remain blocked until their review,
  proof, unlock, and visible submission policies are implemented.

Primary references:

- https://github.com/ethereum/kohaku
- https://ethereum.github.io/kohaku/getting-started/
- https://docs.railgun.org/wiki
- https://docs.uniswap.org/contracts/v4/deployments
- https://docs.uniswap.org/contracts/universal-router/technical-reference

## Privacy Defaults

Bindle should not silently phone home. It may ship sane endpoint presets, but
no endpoint may be hidden in source code, dependency helper defaults,
environment magic, CDN imports, or undocumented library defaults.

Current presets:

- Bindle default: visible public defaults for normal use. It currently sets
  Ethereum RPC to `https://ethereum-rpc.publicnode.com`, RAILGUN sync indexer
  to `https://rail-squid.squids.live/squid-railgun-ethereum-v2/v/v1/graphql`,
  RAILGUN Waku broadcaster mode to visible Rooted in Privacy direct peers on
  `/waku/2/rs/5/1`, ERC-4337 bundler to
  `https://public.pimlico.io/v2/1/rpc`, and same-origin static RAILGUN proving
  artifacts at `/railgun-artifacts/`. It also enables toolkit auto-start after
  local `0zk` wallet creation. These services can see network metadata and must
  not be presented as trustless or private. The current Waku SDK version cannot
  consume custom DNS ENR trees, so Bindle disables SDK DNS discovery and only
  dials direct peers listed in `ConnectionPolicy`.
- Privacy max: all hosted endpoints empty/off for users bringing local or
  self-hosted infrastructure. Toolkit auto-start is off.
- Custom: preserves user-entered values while editing individual endpoints.
- Local dev: localhost-style RPC and bundler endpoints for development.

Every preset is shown in Connections. Each outbound row is labelled as
`default`, `custom`, `local`, or `off`, and preflight disclosure lists the
endpoints that may be contacted before sensitive actions.

## Helios Direction

Helios is a viable candidate for reducing RPC trust because it runs as a Rust/WASM light client and exposes a local RPC surface. It does not eliminate outbound connections: it still needs an execution RPC that supports `eth_getProof`, a consensus RPC or trusted checkpoint path, and compatibility testing against the RAILGUN calls Bindle needs.

Helios fields live in `ConnectionPolicy` now, but the Helios adapter is not
wired yet. Selecting Helios mode fails closed until execution RPC, consensus
RPC, checkpoint, and RAILGUN compatibility are implemented without relying on
hidden library defaults.
