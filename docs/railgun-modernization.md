# RAILGUN / Waku modernization: Bindle 0.2.0

Validated September 19, 2026. This release replaces the split Kohaku/Waku stack,
preserves existing wallet addresses, and removes the public-account fallback
for private payments. **Private Send, unshield, and Pay remain disabled** because
required upstream proof interfaces are missing. No real funds were spent.

## Dependencies and ownership

| Component | Pinned version | Responsibility |
| --- | --- | --- |
| Kohaku RAILGUN | `0.0.1-alpha.30` | Wallet, UTXO state, transaction/proof WASM |
| Kohaku provider / plugins | `0.1.0-alpha.9` / `0.0.1-alpha.13` | Explicit provider support |
| RAILGUN broadcaster client | `9.1.1` | Waku, discovery, signed fees, selection, encrypted submission |
| RAILGUN wallet / shared-models | `10.9.1` / `8.0.1` | Broadcaster crypto helpers and wire types |
| Transitive Waku SDK / discovery | `0.0.36` / `0.0.13` | Official client's networking |

The old `@kohaku-eth/railgun-waku` alias is removed. Bindle neither constructs a
second Waku node nor initializes the broadcaster dependency's wallet engine.
Shared-models 8.1.0 was excluded by the repository's 24-hour release-age policy;
the compatible 8.0.1 remains pinned. No lifecycle-script or age guard was relaxed.

Bindle's `RailgunBroadcasterTransport` owns policy validation and narrow typed
start/stop/refresh/select/prepare/submit methods. The upstream client owns the
protocol, fee verification, encryption, and transport. The saved relay registry
and independent parser are observations only. Selections require fresh client
state; prepared submissions recheck policy, fee expiry, identity, and availability.

Pinned patches honor disabled DNS and explicitly empty peers, inject only visible
DNS resolvers, cancel old-policy callbacks, stop timers/nodes, expose fresh fee
observations, remove a development signature bypass, and avoid a hidden lookup
through a second wallet engine. See
[patch rationale](https://github.com/pierce403/bindle/blob/main/patches/README.md).

The official wallet dependency adds substantial transitive code, including
deprecated packages and installed `elliptic`/`crypto-browserify` dependencies.
A production build guard rejects either crypto package in rendered browser code.
Only demonstrated Buffer/process/stream compatibility shims are included.
Large bundle warnings remain; successful builds are not a dependency security audit.

## Wallet derivation and recovery

The pre-upgrade safety fixtures exposed a real mismatch: historical Bindle used
ethers' secp256k1 BIP32 tree with RAILGUN path names. Reference RAILGUN uses the
`babyjubjub seed` hardened hash tree. The same phrase produces different accounts.
This matches [Kohaku issue 243](https://github.com/ethereum/kohaku/issues/243).

Four fixed, deliberately public and unfunded vectors cover indices 0/1 in both
schemes, with addresses and spending/viewing public outputs. They were committed
before dependency changes. Alpha.22 and alpha.30 agree for the same supplied keys;
the mnemonic algorithm, not an automatic WASM migration, determines the account.

- Existing records and exports without a version keep
  `bindle-ethers-bip32-v1` and their original address.
- New accounts use reference `railgun-babyjubjub-v1`.
- Bare phrase recovery exposes both formats; JSON exports preserve the format
  and verify the expected address before replacing keys.
- Unknown/inconsistent versions stay blocked without discarding public wallet
  metadata or passkeys. No funds are automatically migrated.
- Atomic creation/import guards preserve existing encrypted records, including
  orphaned records whose public metadata is missing. Explicit replacement must
  still match the stored record reviewed by the user.
- Balance caches include address/provider/format/chain; late sync responses cannot
  paint a different wallet. Shield verifies recoverable local keys against the
  destination and rechecks active identity before deployment and submission.

The funding passkey wallet remains separate. Shielding UI warns that private
spending/unshielding is currently unavailable.

## Live no-spend evidence

[Machine-readable evidence](railgun-modernization-evidence.json) records the final
isolated Chrome runs, policies, timestamps, network counts, and signed ENR
observations. Counts are September 19 snapshots, not ongoing availability claims.

| Mode | Peer connections | Compatible broadcaster addresses | Current fee offers | Result |
| --- | ---: | ---: | ---: | --- |
| Local, outbound blocked | 0 | 0 | 0 | Local checks passed; zero external requests |
| Direct peers, DNS disabled | 3 | 23 | 104 | All three configured peer IDs matched; WETH selected |
| DNS plus direct peers | 3 | 47 | 343 | DNS resolved; WETH selected |
| DNS only | 0 | 0 | 0 | DNS resolved; browser connection timed out and cleaned up |

Connected peers advertised Filter, LightPush, and Store support. Live direct/mixed
runs had no diagnostic errors, browser exceptions, or unexpected requests.
DNS-only failure is explained by three independently decoded, signature-checked
ENRs: cluster 5/shard 1, IP TCP/UDP port 30304, **no browser WebSocket addresses**.
Bindle does not invent endpoints from those records. Explicit visible WSS peers
provide the working browser bootstrap path.

The diagnostic uses a fresh ephemeral profile and a blank local page. It never
opens saved wallets or requests wallet RPC, bundler, proving, or POI services.
Local checks exercise real alpha.30 WASM, isolated IndexedDB set/get/delete, four
derivation vectors, real UTXO sync against a controlled empty-log fixture, and
native ETH ShieldBuilder calldata for one wei to an unfunded public fixture.
No call is signed or submitted.

```sh
pnpm --silent scan:railgun -- --json
pnpm --silent scan:railgun -- --local --json
pnpm --silent scan:railgun -- --direct-only --json
pnpm --silent scan:railgun -- --dns-only --timeout 25000 --json
```

Waku remains off in the default app preset. DNS trees, HTTPS JSON resolvers,
direct peers, shard, fee token, and POI compatibility lists remain editable in
Connections. The mainnet POI list is only a discovery filter; no default POI
aggregator is enabled. Custom visible indexers override Kohaku's compiled URL,
with explicit RPC fallback.

## Transaction bridge and genuine upstream blockers

The normalized bridge preserves and checks the mainnet target, canonical
calldata, nullifiers, chain, proof-bound parameters, gas/fee metadata, POI
structure, and RelayAdapt metadata. Tests cover malformed fields, mismatches,
stale selection, disappearance, and public-submit invariants. Actual browser
ECIES payload construction works with a synthetic fixture and zero outbound
requests; that is not a valid private transaction or proof.

The prove-only helper handles Kohaku's consuming WASM builders for transfer and
ERC-20 unshield. Public `RailgunProvider.build` exists, but real proof generation
was not executed: the diagnostic has no spendable notes and does not fabricate
them. The following prevent safe final submission:

1. **Pre-transaction POI:** alpha.30 exposes post-indexing POI processing, not the
   pre-transaction POI proof export required in broadcaster payloads.
2. **Broadcaster payment:** the public API does not provide verified binding of
   the reviewed fee recipient/token/amount into the proved outputs.
3. **Gas price:** Kohaku constructs proof-bound `minGasPrice = 0`; its exposed
   builder cannot set the nonzero broadcaster minimum. Editing proved calldata
   afterward would invalidate the proof binding.
4. **Native ETH route:** the exposed private builder has no supported native ETH
   RelayAdapt construction path. Stable broadcaster 9.1.1 also lacks
   RelayAdapt7702 submission support.

These are explicit capability gates before secret access or spending, including
the final transport submit method. Private operations cannot use Coinbase Smart
Wallet, a public EOA, Pimlico, ERC-4337, a paymaster, or a funding address instead.
Production mock success and fabricated submission progress are removed.

Primary source inspection used the published
[Kohaku revision](https://github.com/ethereum/kohaku/tree/bec944afef87059f0bc7848fe63f4e211ca6ef6e),
including its
[transaction builder](https://github.com/ethereum/kohaku/blob/bec944afef87059f0bc7848fe63f4e211ca6ef6e/crates/railgun/src/transact/transaction_builder.rs),
[POI provider](https://github.com/ethereum/kohaku/blob/bec944afef87059f0bc7848fe63f4e211ca6ef6e/crates/railgun/src/poi/provider.rs),
and [chain configuration](https://github.com/ethereum/kohaku/blob/bec944afef87059f0bc7848fe63f4e211ca6ef6e/crates/railgun/src/chain_config.rs),
plus installed official broadcaster 9.1.1 source/types. Capability presence is
reported separately from successful execution.

## Validation and release

Baseline: pinned install, typecheck, and build passed; 126 tests passed with one
pre-existing real-spend acceptance test skipped.

Final merged validation: frozen pnpm 10.34.1 install, TypeScript, and production
build passed; **192 combined deterministic/integration/Chrome tests passed**,
with the one pre-existing real-spend acceptance case intentionally skipped.
**All 10 stable-controller lifecycle tests passed.** The suite covers browser
onboarding, recovery compatibility, orphaned/concurrent key protection,
private-submit invariants, transport lifecycle, bridge validation, and real
two-release PWA behavior. The build verified 81 mirrored proving artifacts and
23 release-shell assets. Upstream annotation/externalization and bundle-size
warnings remain; no browser runtime exceptions occurred in final diagnostics.

The concurrent 0.1.5 PWA controller hardening is preserved: ordinary releases
update `release.json`, never the byte-stable controller. Approve/Ask/Reject,
version/source-commit/build-time display, and wallet-storage preservation remain
covered by tests. See
[SECURITY.md](https://github.com/pierce403/bindle/blob/main/SECURITY.md)
for the origin trust boundary.

Source report: `public/railgun-modernization.md`; builds copy it to
`docs/railgun-modernization.md`. GitHub Pages continues publishing `main:/docs`.
