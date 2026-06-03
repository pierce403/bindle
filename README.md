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
- Browser-side Kohaku RAILGUN adapter that starts from explicit RPC only.
- RAILGUN Wallet SDK remains isolated behind an explicit fallback adapter.
- Browser-side legacy RAILGUN adapter with IndexedDB artifact persistence.
- Local intent routing for `0zk`, `0x`, `.eth`, and `@provider` style recipients.
- No default public RPC, quote, provider-resolution, broadcaster, or Waku endpoint.
- Default dark black/red paisley theme, with black/white and black/blue variants plus light and dark modes.

## Product Rules

- No simulated transaction feed.
- No seeded contacts.
- No fake balances, fake `0zk` addresses, or invented liquidity.
- No hard-coded third-party endpoints without explicit user or operator choice.
- No hidden smart-wallet bundler, paymaster, passkey attestation, or recovery
  endpoint.
- Empty states are allowed only when they represent the real first-run state.

Feature TODOs live in [FEATURES.md](FEATURES.md).

## Development

```bash
npm install
npm run dev
npm run build
```

For GitHub Pages branch publishing, rebuild and copy the production output into
`docs` before committing:

```bash
npm run build
cp -R dist/. docs/
```

## Privacy Toolkit Architecture

Bindle now routes privacy startup through a local adapter boundary:

```text
Bindle UI
  -> local wallet/intents state
  -> passkey-backed smart wallet by default
  -> privacy toolkit adapter
  -> Kohaku RAILGUN where available
  -> explicit ConnectionPolicy endpoints only
```

The default adapter is `kohaku-railgun`. It uses Kohaku's low-level RAILGUN WASM bindings, an IndexedDB-backed local database, and a JSON-RPC provider created only from the Ethereum RPC URL typed into the Connections panel.

Important privacy constraint: Kohaku's higher-level `createRailgunPlugin()` helper currently wires a default Subsquid syncer. Bindle does not call that helper because hidden indexer traffic would violate the product rules. The current Kohaku adapter explicitly builds `RailgunBuilder` with `UtxoSyncer.rpc(...)` only.

The `railgun-wallet-sdk` adapter remains as an explicit fallback for paths Kohaku does not cover yet, such as the older browser Wallet SDK engine and artifact store. App state should not talk to `@railgun-community/wallet` directly.

Smart-wallet work should stay Kohaku-first as well. Bindle should prefer a
passkey-backed smart account path where Kohaku supports it, with any ERC-4337
bundler, paymaster, attestation, or recovery service exposed through
`ConnectionPolicy` before it can be used.

## RAILGUN Integration Notes

The RAILGUN Wallet SDK remains available as a fallback path for generating private keys and `0zk` addresses, scanning private balances, generating deposits, and creating proofs for private sends or unshielding where Kohaku is not yet usable. The SDK requires browser storage such as `level-js`, proof artifacts that should be downloaded and persisted instead of bundled, a SnarkJS Groth16 prover for browser builds, and explicit RPC provider loading.

Primary references:

- https://github.com/ethereum/kohaku
- https://ethereum.github.io/kohaku/getting-started/
- https://docs.railgun.org/wiki
- https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks
- https://docs.railgun.org/developer-guide/wallet/getting-started
- https://github.com/Railgun-Community/wallet

## Privacy Defaults

Bindle should not silently phone home. The default connection policy leaves every external endpoint blank:

- Privacy toolkit: Kohaku RAILGUN
- Ethereum RPC: unset
- Private POI aggregator: unset
- Broadcaster: unset
- Provider resolver: local table
- Price quotes: manual
- Waku: off

Production work should preserve that shape: add capabilities as explicit, inspectable endpoints rather than hidden third-party defaults.

Starting the default Kohaku adapter without an Ethereum RPC fails locally with a prompt to configure RPC. Starting it with RPC configured contacts only that RPC endpoint and same-origin bundled WASM assets.

## Helios Direction

Helios is a viable candidate for reducing RPC trust because it runs as a Rust/WASM light client and exposes a local RPC surface. It does not eliminate outbound connections: it still needs an execution RPC that supports `eth_getProof`, a consensus RPC or trusted checkpoint path, and compatibility testing against the RAILGUN SDK calls Bindle needs.
