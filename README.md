# Bindle

Bindle is a statically hosted TypeScript wallet interface for private Ethereum payments through RAILGUN. The product direction is deliberately simple: a Venmo-like pay/feed surface, shielded balances, and outgoing intents that can disclose only the routing leg needed to reach a provider or public address.

The target onboarding flow is passkey-first: on phones, the PWA should default
to creating a passkey-backed smart wallet, then use the privacy toolkit boundary
to connect that wallet to RAILGUN shielded ETH. Seed phrases, EOA imports, and
legacy RAILGUN Wallet SDK lifecycle paths are compatibility or recovery flows,
not the default first-run experience.

## Current Shape

- Vite, React, and TypeScript.
- GitHub Pages-ready `docs` build output.
- `bindle.me` custom domain marker in `public/CNAME`.
- Kohaku-first privacy toolkit boundary in `src/privacy/toolkit.ts`.
- Kohaku RAILGUN alpha packages pinned in `package.json`.
- Browser-side Kohaku RAILGUN adapter that starts from visible
  `ConnectionPolicy` endpoints only.
- RAILGUN Wallet SDK remains isolated behind an explicit fallback adapter.
- Browser-side legacy RAILGUN adapter with IndexedDB artifact persistence.
- Local wallet metadata state for passkey-first onboarding, with no private key
  or mnemonic storage.
- Wallet-tab onboarding wizard that appears while local setup is incomplete and
  advances through passkey, visible endpoints, toolkit startup, and pending
  shielded-wallet work.
- Viem Coinbase Smart Wallet adapter for passkey-backed ERC-4337 funding
  addresses and public ETH user operations through visible RPC/bundler
  endpoints.
- Receive Public gives a direct funding-address path: configure RPC, create
  the funding address, then copy it for mainnet ETH deposits.
- Public funding balance sync is explicit: the user taps Sync after seeing the
  Ethereum RPC endpoint that may receive the public smart-wallet address.
- Passkey enrollment stores non-secret credential id and public P-256 metadata;
  WebAuthn private material stays inside the platform authenticator.
- Send Review stays disabled until wallet, toolkit, RPC, recipient, amount, and
  required endpoint preflight checks pass.
- Local intent routing for `0zk`, `0x`, `.eth`, and `@provider` style recipients.
- Endpoint presets are visible in Connections. Bindle default currently uses a
  labelled public Ethereum RPC and public ERC-4337 bundler; Privacy max starts
  with hosted endpoints empty/off.
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
SOCKET_SECURITY_API_TOKEN=... pnpm build
cp -R dist/. docs/
```

`pnpm build` is the protected build path. It runs `socket ci` first and fails if
Socket.dev reports that the dependency snapshot violates the configured Socket
security or license policy. Use `pnpm build:app` only for local no-network
compilation when a Socket API token is unavailable.

pnpm supply-chain hardening lives in `pnpm-workspace.yaml`. `ignoreDepScripts`
is enabled so dependency `preinstall`, `install`, and `postinstall` scripts do
not execute during installs, and `minimumReleaseAge` holds newly published
package versions for 24 hours before they can enter the lockfile.

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

Important privacy constraint: Kohaku's higher-level `createRailgunPlugin()` helper currently wires a default Subsquid syncer. Bindle does not call that helper because hidden indexer traffic would violate the product rules. The current Kohaku adapter explicitly builds `RailgunBuilder` with `UtxoSyncer.rpc(...)` only.

The `railgun-wallet-sdk` adapter remains as an explicit fallback for paths Kohaku does not cover yet, such as the older browser Wallet SDK engine and artifact store. App state should not talk to `@railgun-community/wallet` directly.

Smart-wallet work should stay Kohaku-first as well. Bindle should prefer a
passkey-backed smart account path where Kohaku supports it, with any ERC-4337
bundler, paymaster, attestation, or recovery service exposed through
`ConnectionPolicy` and preflight disclosure before it can be used.

The current app can enroll a browser passkey, derive a counterfactual Coinbase
Smart Wallet funding address with the visible Ethereum mainnet RPC, and submit
public ETH user operations through the visible ERC-4337 bundler.
It can also explicitly sync the public ETH balance for that funding address
through the visible RPC after disclosing the endpoint. Paymaster support is
optional and only used when configured. Bindle can audit shield/unshield
readiness and can prepare native ETH shield call data through Kohaku's low-level
WASM binding, but the Shield button remains disabled until a recoverable
RAILGUN spending/viewing key lifecycle creates or imports a real `0zk` address.
Shielded balance sync, unshielding, and private RAILGUN sends remain pending.

## RAILGUN Integration Notes

The RAILGUN Wallet SDK remains available as a fallback path for generating private keys and `0zk` addresses, scanning private balances, generating deposits, and creating proofs for private sends or unshielding where Kohaku is not yet usable. The SDK requires browser storage such as `level-js`, proof artifacts that should be downloaded and persisted instead of bundled, a SnarkJS Groth16 prover for browser builds, and explicit RPC provider loading.

Current shield/unshield status:

- Public ETH funding balance sync is real and explicit.
- Native ETH shield call preparation is available through Kohaku low-level
  `ShieldBuilder.shieldNative`.
- Shield submission is intentionally blocked because Bindle has not yet wired a
  recoverable `0zk` wallet key lifecycle.
- Unshield is blocked until recoverable RAILGUN keys, shielded balance sync,
  proof generation, and a visible broadcaster path are implemented.

Primary references:

- https://github.com/ethereum/kohaku
- https://ethereum.github.io/kohaku/getting-started/
- https://docs.railgun.org/wiki
- https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks
- https://docs.railgun.org/developer-guide/wallet/getting-started
- https://github.com/Railgun-Community/wallet

## Privacy Defaults

Bindle should not silently phone home. It may ship sane endpoint presets, but
no endpoint may be hidden in source code, SDK helper defaults, environment
magic, CDN imports, or undocumented library defaults.

Current presets:

- Bindle default: visible public defaults for normal use. It currently sets
  Ethereum RPC to `https://ethereum-rpc.publicnode.com` and ERC-4337 bundler to
  `https://public.pimlico.io/v2/1/rpc`. These services can see network
  metadata and must not be presented as trustless or private.
- Privacy max: all hosted endpoints empty/off for users bringing local or
  self-hosted infrastructure.
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
