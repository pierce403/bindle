# Bindle

Bindle is a static mobile PWA wallet interface for Ethereum payments through
RAILGUN. Its home screen has one shielded balance, Receive/Send/Pay/Swap actions,
and real activity. Ordinary browser visits show an information/install page.
Unimplemented actions remain visibly disabled.

The public funding account uses a platform passkey and Coinbase Smart Wallet.
The shielded RAILGUN account currently uses a recovery phrase encrypted in
IndexedDB under a non-extractable browser-local WebCrypto key. Passkey-backed
wrapping of the shielded secret remains future work.

**Private Send, unshield, and Private Pay remain fail-closed.** Kohaku's current
browser API cannot supply all proof-bound broadcaster prerequisites. No private
operation falls back to the public smart wallet, Pimlico, an ERC-4337 bundler,
paymaster, or EOA. This modernization was validated without spending real funds.

## Architecture

```text
Bindle UI, connection policy, recovery formats, diagnostics
  +-- Kohaku RAILGUN: wallet, UTXO state, transaction/proof APIs
  +-- Official RAILGUN broadcaster client: Waku, discovery, fees, submission
       ^ normalized, validated Bindle private transaction boundary
```

| Package | Version | Role |
| --- | --- | --- |
| `@kohaku-eth/railgun` | `0.0.1-alpha.30` | Wallet/state/proof WASM |
| `@kohaku-eth/provider` | `0.1.0-alpha.9` | Explicit provider boundary |
| `@kohaku-eth/plugins` | `0.0.1-alpha.13` | Kohaku types/support |
| `@railgun-community/waku-broadcaster-client-web` | `9.1.1` | Broadcaster protocol and Waku lifecycle |
| `@railgun-community/wallet` | `10.9.1` | Upstream broadcaster cryptographic/protocol helpers |
| `@railgun-community/shared-models` | `8.0.1` | Compatible broadcaster wire types |

The old Kohaku Waku alias is removed. Bindle does not initialize a second wallet
engine through the broadcaster's wallet dependency. That dependency still brings
a substantial transitive graph and needs review when upgraded. The broadcaster
currently owns its transitive Waku SDK `0.0.36`; Bindle does not construct a
separate Waku node.

Kohaku loads through its generated WASM binding, avoiding convenience helpers
with hidden service defaults. Note sync uses the exact visible Subsquid endpoint
when configured and healthy, including custom HTTP(S) mirrors, with explicit RPC
fallback. Clearing the indexer selects RPC-only sync.

## Wallet compatibility

Bindle before v0.2 used ethers' secp256k1 BIP32 key tree with RAILGUN path names.
Reference RAILGUN instead uses a `babyjubjub seed` HMAC domain and hardened
hash chaining. The same phrase therefore produces different shielded accounts.
Older documentation calling Bindle's historical derivation canonical was
incorrect. [Upstream issue](https://github.com/ethereum/kohaku/issues/243).

- Existing unstamped records and exports continue using
  `bindle-ethers-bip32-v1`, preserving their original address.
- New wallets use `railgun-babyjubjub-v1`, the reference RAILGUN format.
- Recovery imports expose **Standard RAILGUN** and **Bindle before v0.2**.
  Account JSON exports retain the format automatically. Keep that metadata with
  the phrase; importing another format does not migrate funds.
- Export imports verify the expected address before replacing existing secrets.
  Unknown algorithms and inconsistent encrypted metadata fail closed.
- Unsupported metadata retains the existing public account and passkeys. Wallet
  creation and unconfirmed imports cannot overwrite a stored secret, even when
  public metadata is missing. JSON replacement checks the reviewed record has
  not changed; Shield verifies the local
  keys match the address, recovery format, and chain before funding.
- `derivationProvider` identifies the Kohaku adapter; `derivationVersion`
  identifies the mnemonic algorithm. Old unsupported SDK records remain
  quarantined rather than being relabelled as recovered wallets.

Fixed public test vectors pin both schemes' addresses and public keys across
Kohaku versions. No fixture represents a user wallet. Settings shows the active
recovery format. Cached balances are isolated by address, provider, format, and
chain; discarding an old display cache does not touch wallet secrets or funds.

## Broadcasters and private transaction readiness

`RailgunBroadcasterTransport` wraps the official client. It supports explicit
DNS ENR trees and secure WebSocket direct peers, with visible DNS-over-HTTPS
resolvers. DNS can be disabled independently. Peer exchange may discover peers
through the configured network; selecting a network discloses that activity.
The relay registry is observational UI state, never spending authority.

Before private submission, transport selection must refresh the official fee
cache, validate fresh compatible advertisements, bind the fee quote and policy
to the prepared operation, and recheck the selected broadcaster. Raw diagnostic
ads and saved localStorage rows cannot authorize submission.

The normalized bridge checks mainnet contract/calldata, nullifiers, proof-bound
parameters, minimum gas price, POI, RelayAdapt metadata, and the reviewed fee.
Structural validation does not create missing proofs. Current blockers are:

1. Kohaku exposes post-transaction POI processing, but no pre-transaction POI
   proof export required by the broadcaster payload.
2. The public API lacks broadcaster fee-output binding and configurable
   proof-bound minimum gas price.
3. Native ETH unshield needs RelayAdapt; the exposed builder supports shielded
   transfer and ERC-20 unshield, without a supported RelayAdapt/RelayAdapt7702
   construction path.

The prove-only builder and fixture bridge tests establish API handling, not a
funded transaction's proof or successful live submission. Private actions remain
blocked until every prerequisite exists. Public smart-wallet funding and native
ETH shield-deposit call preparation remain separate paths.

## Connections and storage

All outbound services must be labelled, inspectable, replaceable, and disclosed
through `ConnectionPolicy`. Bindle default includes visible PublicNode RPC,
chain-default RAILGUN sync, Pimlico bundler, same-origin proving artifacts, and
onchain Uniswap v4 quoting. Waku starts **off**; its editable presets include
Rooted in Privacy ENR/direct peers and a Cloudflare DNS JSON resolver. POI
aggregators are empty by default. The visible POI list-key preset matches Kohaku's
published mainnet list and filters broadcaster compatibility; it does not enable
POI requests or proofs. Privacy max
clears hosted endpoints and disables automatic toolkit/network startup.

Public RPC/indexer/DNS/relay services and the static host can observe network
metadata. Platform passkeys may sync through a device account provider. See
[PRIVACY.md](PRIVACY.md) for the trust and storage boundaries.

Settings can export/import account JSON. Exports containing a RAILGUN phrase
are sensitive; passkey private keys are never exported. Recovering the public
smart account requires the same passkey and RP ID or a previously established
on-chain recovery path. Resetting a stale local shielded record creates a new
wallet and does not recover funds at the old address.

## Development and validation

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test:e2e
pnpm build
pnpm dev
```

The Playwright suite contains deterministic unit/integration and browser tests;
there is no separate `pnpm test` script. Tests use localhost and one Chrome
worker. Live discovery is an optional no-spend diagnostic:

```bash
pnpm scan:railgun
pnpm --silent scan:railgun -- --json
pnpm scan:waku -- --json
```

The diagnostic launches a local browser to exercise the real browser packages.
It reports wallet-independent Kohaku loading, public fixture compatibility,
proof/POI API capabilities, DNS/direct-peer discovery, advertisements, selection,
and submission blockers. It does not open user wallets or submit a transaction.
Third-party outages are reported separately from local capability failures.

Dependency lifecycle scripts are disabled and releases are held for 24 hours
by `pnpm-workspace.yaml`. Reviewed patches under `patches/` remove implicit
broadcaster discovery/resolver defaults, permit fresh fee observations, avoid a
second-engine transaction lookup, and stop client polling on teardown. Narrow
browser Buffer/stream compatibility supports actual upstream imports; avoid
broad Node polyfills without a demonstrated requirement.

## Deployment and updates

`pnpm build` writes `docs/`, published by GitHub Pages from `main:/docs` at
[bindle.cash](https://bindle.cash/). Commit generated output with source and push
`main`. Build metadata defaults to the source commit time; `BINDLE_BUILD_TIME`
can explicitly override it. Engineering notes belong in `AGENTS.md`; the
backlog is [FEATURES.md](FEATURES.md).

The version menu shows version, full source commit, and build timestamp. Ask is
the default update policy, with persistent Approve and Reject options. The
approved cached release survives restarts and offline launch; wallet actions
and recovery review defer installation. Updates do not clear wallet storage.
Browser eviction or site-data removal can remove the cached-release guarantee.

Modernization evidence and limitations are in
[the modernization report](public/railgun-modernization.md), copied to
`docs/railgun-modernization.md` by the build.

Licensed under [Apache License 2.0](LICENSE).
