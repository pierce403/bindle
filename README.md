# Bindle

Bindle is a statically hosted TypeScript wallet interface for private Ethereum payments through RAILGUN. The product direction is deliberately simple: a Venmo-like pay/feed surface, shielded balances, and outgoing intents that can disclose only the routing leg needed to reach a provider or public address.

The target onboarding flow is passkey-first: on phones, the PWA should default
to creating a passkey-backed smart wallet, then use the privacy toolkit boundary
to connect that wallet to RAILGUN shielded ETH. Today, the public funding
account is passkey-backed while the RAILGUN shielded account uses an encrypted
local recovery phrase as an interim recoverable key path. EOA imports and
legacy RAILGUN Wallet SDK lifecycle paths are compatibility or recovery flows,
not the default first-run experience.

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
- RAILGUN Wallet SDK remains isolated behind an explicit fallback adapter.
- Browser-side legacy RAILGUN adapter with IndexedDB artifact persistence.
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
- Passkey enrollment stores non-secret credential id and public P-256 metadata;
  WebAuthn private material stays inside the platform authenticator.
- Send Review stays disabled until wallet, toolkit, RPC, recipient, amount, and
  required endpoint preflight checks pass.
- Local intent routing for `0zk`, `0x`, `.eth`, and `@provider` style recipients.
- Pay has a real USDC route for Ethereum mainnet: asset search,
  recipient/amount entry, QR or pasted payment request import, endpoint
  preflight disclosure, modal route review, live RAILGUN proof progress,
  Uniswap v4 exact-output ETH-to-USDC calldata, and ERC-4337 submission through
  the passkey smart account. It quotes through the visible Ethereum RPC by
  default, uses a 1% max
  slippage default, and lets leftover ETH remain unshielded in the public smart
  account for a later sweep. This route uses Kohaku to build the RAILGUN WETH
  unshield transaction for the actual local `0zk` wallet, grosses up the
  unshield amount for the chain's RAILGUN unshield fee, unwraps WETH, and then
  calls Uniswap v4 from the public smart account. It does not require a RAILGUN
  broadcaster because the proved RAILGUN call is submitted by the public smart
  account.
- Endpoint presets are visible in Connections. Bindle default currently uses a
  labelled public Ethereum RPC, RAILGUN sync indexer, and public ERC-4337
  bundler, plus an explicit RAILGUN proving-artifact origin and
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

The `railgun-wallet-sdk` adapter remains as an explicit fallback for paths Kohaku does not cover yet, such as the older browser Wallet SDK engine and artifact store. App state should not talk to `@railgun-community/wallet` directly.

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
calls and submits them from the passkey smart wallet through the visible RPC and
ERC-4337 bundler.
For the visible Pimlico default bundler, Bindle requests User Operation gas
prices from that same bundler endpoint before submission so the bundler does not
reject underpriced priority fees. Pay can prepare a RAILGUN cross-contract
unshield proof for USDC output through Kohaku, route the unshielded WETH through
WETH unwrap and Uniswap v4, and submit the calls from the passkey smart
account. Standalone unshielding, private RAILGUN sends, non-USDC Pay assets,
and any-network provider routing remain pending.

Kohaku's current alpha RAILGUN prover downloads proving artifacts from
`https://github.com/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/`.
Bindle exposes that origin in `ConnectionPolicy`, Connections, and Pay
preflight. Custom artifact mirrors are blocked for Pay until Kohaku exposes a
configurable artifact loader; otherwise the app would claim one origin while the
WASM still contacted the compiled-in default.

## RAILGUN Integration Notes

The RAILGUN Wallet SDK remains available as a fallback path for generating private keys and `0zk` addresses, scanning private balances, generating deposits, and creating proofs for private sends or unshielding where Kohaku is not yet usable. The SDK requires browser storage such as `level-js`, proof artifacts that should be downloaded and persisted instead of bundled, a SnarkJS Groth16 prover for browser builds, and explicit RPC provider loading.

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
- Pay-to-USDC is wired as a Kohaku RAILGUN WETH unshield proof plus WETH unwrap
  and Uniswap v4 exact-output ETH-to-USDC route, submitted by the passkey smart
  wallet through visible RPC/bundler policy. The gross unshield amount accounts
  for the chain's RAILGUN unshield fee so the public smart account has enough
  WETH for the swap input.
- Standalone unshield and private send flows remain blocked until their review,
  proof, unlock, and visible submission policies are implemented.

Primary references:

- https://github.com/ethereum/kohaku
- https://ethereum.github.io/kohaku/getting-started/
- https://docs.railgun.org/wiki
- https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks
- https://docs.railgun.org/developer-guide/wallet/getting-started
- https://github.com/Railgun-Community/wallet
- https://docs.uniswap.org/contracts/v4/deployments
- https://docs.uniswap.org/contracts/universal-router/technical-reference

## Privacy Defaults

Bindle should not silently phone home. It may ship sane endpoint presets, but
no endpoint may be hidden in source code, SDK helper defaults, environment
magic, CDN imports, or undocumented library defaults.

Current presets:

- Bindle default: visible public defaults for normal use. It currently sets
  Ethereum RPC to `https://ethereum-rpc.publicnode.com`, RAILGUN sync indexer
  to `https://rail-squid.squids.live/squid-railgun-ethereum-v2/v/v1/graphql`,
  ERC-4337 bundler to `https://public.pimlico.io/v2/1/rpc`, and Kohaku's
  current RAILGUN proving-artifact origin. It also enables toolkit auto-start
  after local `0zk` wallet creation. These services can see network metadata
  and must not be presented as trustless or private.
- Privacy max: all hosted endpoints empty/off for users bringing local or
  self-hosted infrastructure. Toolkit auto-start is off.
- Custom: preserves user-entered values while editing individual endpoints.
- Local dev: localhost-style RPC and bundler endpoints for development.

Every preset is shown in Connections. Each outbound row is labelled as
`default`, `custom`, `local`, or `off`, and preflight disclosure lists the
endpoints that may be contacted before sensitive actions.

## Helios Direction

Helios is a viable candidate for reducing RPC trust because it runs as a Rust/WASM light client and exposes a local RPC surface. It does not eliminate outbound connections: it still needs an execution RPC that supports `eth_getProof`, a consensus RPC or trusted checkpoint path, and compatibility testing against the RAILGUN SDK calls Bindle needs.

Helios fields live in `ConnectionPolicy` now, but the Helios adapter is not
wired yet. Selecting Helios mode fails closed until execution RPC, consensus
RPC, checkpoint, and RAILGUN compatibility are implemented without relying on
hidden library defaults.
