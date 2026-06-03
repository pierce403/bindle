# Bindle

Bindle is a statically hosted TypeScript wallet interface for private Ethereum payments through RAILGUN. The product direction is deliberately simple: a Venmo-like pay/feed surface, shielded balances, and outgoing intents that can disclose only the routing leg needed to reach a provider or public address.

## Current Shape

- Vite, React, and TypeScript.
- GitHub Pages-ready `docs` build output.
- `bindle.me` custom domain marker in `public/CNAME`.
- RAILGUN Wallet SDK pinned in `package.json`.
- Browser-side RAILGUN adapter with IndexedDB artifact persistence.
- Local intent routing for `0zk`, `0x`, `.eth`, and `@provider` style recipients.
- No default public RPC, quote, provider-resolution, broadcaster, or Waku endpoint.
- Default dark black/red paisley theme, with black/white and black/blue variants plus light and dark modes.

## Product Rules

- No simulated transaction feed.
- No seeded contacts.
- No fake balances, fake `0zk` addresses, or invented liquidity.
- No hard-coded third-party endpoints without explicit user or operator choice.
- Empty states are allowed only when they represent the real first-run state.

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

## RAILGUN Integration Notes

The RAILGUN docs describe the Wallet SDK as the path for generating private keys and `0zk` addresses, scanning private balances, generating deposits, and creating proofs for private sends or unshielding. The SDK requires browser storage such as `level-js`, proof artifacts that should be downloaded and persisted instead of bundled, a SnarkJS Groth16 prover for browser builds, and explicit RPC provider loading.

Bindle follows those constraints by keeping the SDK behind `startRailgunBrowserEngine()` and requiring the user or deployment operator to provide endpoints in the connection panel.

Primary references:

- https://docs.railgun.org/wiki
- https://docs.railgun.org/wiki/learn/integrating-railgun/railgun-sdks
- https://docs.railgun.org/developer-guide/wallet/getting-started
- https://github.com/Railgun-Community/wallet

## Privacy Defaults

Bindle should not silently phone home. The default connection policy leaves every external endpoint blank:

- Ethereum RPC: unset
- Private POI aggregator: unset
- Broadcaster: unset
- Provider resolver: local table
- Price quotes: manual
- Waku: off

Production work should preserve that shape: add capabilities as explicit, inspectable endpoints rather than hidden third-party defaults.

## Helios Direction

Helios is a viable candidate for reducing RPC trust because it runs as a Rust/WASM light client and exposes a local RPC surface. It does not eliminate outbound connections: it still needs an execution RPC that supports `eth_getProof`, a consensus RPC or trusted checkpoint path, and compatibility testing against the RAILGUN SDK calls Bindle needs.
