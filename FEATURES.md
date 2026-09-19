# Bindle feature backlog

This is the canonical product/protocol TODO list. Empty real states are better
than fake balances, invented addresses, simulated activity, or seeded contacts.
Completed implementation does not imply a funded mainnet transaction was tested.
See [modernization evidence](public/railgun-modernization.md) for validation.

## Implemented

- [x] Installed-PWA wallet boundary with an informational browser landing page.
- [x] Passkey-first onboarding with real credential/public-key metadata,
      funding-address creation, shielded-wallet creation/import, and a persisted
      setup-complete flag. Advanced recovery remains separate from normal setup.
- [x] Coinbase Smart Wallet funding address, deployed-owner lookup, multiple
      passkey candidates, related-origin RP metadata, and security-key controls.
- [x] Public funding balance and recent top-level native ETH activity through
      the visible RPC; shielded headline balance and Chainlink USD pricing.
- [x] Encrypted browser-local RAILGUN recovery phrases in IndexedDB, public-only
      localStorage metadata, account JSON recovery, and explicit local reset.
- [x] Recovery-format versioning: existing unstamped Bindle accounts preserve
      `bindle-ethers-bip32-v1`; new wallets use reference
      `railgun-babyjubjub-v1`. Bare phrase imports choose the original format;
      JSON imports validate the expected address before replacing secrets.
- [x] Fixed public address/spending/viewing vectors, historical encrypted-record
      opening, import/export round trips, invalid-version rejection, and
      failed-import data preservation tests.
- [x] Balance-cache isolation by address, provider, derivation version, and chain.
- [x] Unsupported wallet metadata stays visible and blocked; atomic creation
      preserves existing keys, stale sync results are discarded, and Shield
      verifies secret/address/format/chain consistency before any funding call.
- [x] Explicit warning and repair path for missing/password-era shielded local
      records, preserving the passkey wallet without claiming fund recovery.
- [x] Public native-ETH shield call preparation through Kohaku and reviewed
      public smart-wallet submission; deploy counterfactual accounts first and
      reserve ERC-4337 fees unless a visible paymaster sponsors the sweep.
- [x] Post-shield note-sync retries and meaningful sync/error states.
- [x] Visible Bindle default, Privacy max, Custom, and Local dev presets;
      endpoint persistence, labels, action disclosure, and connection audit rows.
- [x] Explicit RPC and custom HTTP(S) indexer note sync with RPC fallback;
      the exact visible endpoint overrides Kohaku's compiled Subsquid default.
- [x] Same-origin proving artifacts, artifact-proxy readiness checks, and repair
      that does not clear wallet data or silently approve an app update.
- [x] PWA version/full source commit/build time display, Approve/Ask/Reject,
      persistent approved-release shell, offline/restart behavior, update
      deferral during sensitive wallet work, and integrity-checked shell assets.
- [x] Preserve the 0.1.5 byte-stable update controller and release manifest;
      ordinary application releases do not replace controller code. Document
      the migration and origin-trust caveats in SECURITY.md.
- [x] Signed, non-Play-Store Android APK with embedded application assets,
      certificate-bound passkeys, manual-only APK download/install, a strict
      release discovery manifest, and no PWA shell updater inside the APK.
- [x] One Kohaku RAILGUN generation (`alpha.30`); remove the old Waku alias.
- [x] Official broadcaster client owns Waku lifecycle, signed fee handling,
      selection, and prepared submission; no second RAILGUN wallet engine starts.
- [x] Visible DNS ENR discovery plus direct peers and explicit DNS JSON resolver
      policy, including DNS-disabled and no-default-bootstrap behavior.
- [x] Keep relay registry/raw ads observational; fresh official fee state,
      compatibility checks, and quote revalidation govern selection.
- [x] Normalized Kohaku-to-broadcaster transaction boundary preserving contract,
      calldata, nullifiers, POI, gas/fee, chain, and RelayAdapt metadata, with
      strict validation and no public-account submission fallback.
- [x] Prove-only transfer/ERC-20-unshield builder using public Kohaku APIs and
      correct ownership of consumed WASM wrappers. API tests are not live proofs.
- [x] Precise private readiness gate for missing pre-transaction POI export,
      fee-output binding, proof-bound gas-price control, and native RelayAdapt.
- [x] Browser-based `scan:railgun` / `scan:waku` no-spend diagnostic with JSON,
      capability/fixture checks and independently reported live discovery status.
- [x] Privacy invariant and deterministic transport/bridge tests, separate from
      optional live infrastructure checks. Production mock-success paths removed.
- [x] Private Pay route review: asset search, QR/paste request parsing, endpoint
      disclosure, proof progress, slippage, and private/ephemeral change policy.
- [x] Explicit onchain Uniswap v4 quote source and review of non-USDC targets.
- [x] Local diagnostic logs, readable WASM/RPC errors, and theme/PWA assets.

## Required before private spending can be enabled

- [ ] Expose and validate Kohaku pre-transaction POI proofs required by the
      official broadcaster, with explicit POI list and aggregator policy.
- [ ] Bind the reviewed broadcaster fee recipient, amount, and fee token into
      the proved outputs; verify the binding rather than trusting metadata.
- [ ] Set and validate the proof-bound minimum gas price required by the
      broadcaster without modifying proved calldata after construction.
- [ ] Provide a supported RelayAdapt/RelayAdapt7702 builder for native ETH
      unshield and settlement, preserving nullifiers and proof-bound fields.
- [ ] Complete real local proof/POI generation and a complete validated
      submission payload from safe test fixtures; do not equate API presence
      with successful proof construction.
- [ ] Enable reviewed private transfer/unshield only after every prerequisite
      is implemented. A real mainnet spend needs separate explicit authorization.
- [ ] Implement full Private Pay settlement and swap execution, fee selection,
      transaction tracking, slippage bounds, and private/ephemeral change return.
- [ ] Implement generic ERC-20 quotes/execution beyond current route-review and
      limited quote/calldata helpers. Do not imply invented liquidity.

## Recovery, privacy, and reliability

- [ ] Add passkey-backed RAILGUN secret wrapping when WebAuthn PRF works across
      target browsers, without losing the existing recovery path.
- [ ] Add wallet lock/unlock and local session timeout controls.
- [ ] Add a Kohaku-compatible passkey smart-account adapter when a usable
      public account API replaces the current Viem funding adapter.
- [ ] Replace artifact URL interception with a configurable upstream loader.
- [ ] Verify the complete proving-artifact set against independently trusted
      upstream digests; shell integrity and a mirror self-test are separate.
- [ ] Audit local diagnostic exports for secret/identifier exposure and provide
      user-controlled redaction. Never add automatic telemetry.
- [ ] Extend clipboard/import warnings for compromised browsers, extensions,
      devices, and phrase exports; keep the recovery format with each backup.
- [ ] Add CSP guidance compatible with static hosting and required WASM.
- [ ] Track vulnerabilities and bundle size in the broadcaster wallet/engine
      dependency graph; keep lifecycle scripts disabled and versions pinned.
- [ ] Upstream or retire narrowly pinned broadcaster/discovery/browser patches
      when supported APIs preserve the same privacy and lifecycle guarantees.
- [ ] Broaden service-worker audits while keeping sensitive network requests
      uncached and wallet data independent of release installation.
- [ ] Validate target physical-device/browser passkey, WASM, memory, and storage
      behavior beyond virtual-authenticator browser tests.
- [ ] Validate APK install, certificate-bound passkey create/sign, upgrade data
      preservation, large proving-artifact reads, and manual update UX on a
      physical Android device before treating the APK as production-hardened.

## Future product and protocol work

- [ ] Add provider resolution and any-network payment settlement with explicit
      endpoints and disclosure of the public routing leg.
- [ ] Add Uniswap Swap as a real end-to-end flow.
- [ ] Add XMTP chat/payment messaging with explicit network policy.
- [ ] Add contract-internal public transfers through an explicit trace/indexer
      service; current top-level block scans are incomplete by design.
- [ ] Implement and test Helios behind visible execution/consensus/checkpoint
      policy; reducing RPC trust does not hide network metadata.
- [ ] Evaluate Portal Network behind the same visible peer/network boundary.

## Permanent constraints

- No analytics, session replay, ad pixels, hidden crash reporting, remote font
  or avatar prefetches, cloud seed backup, custodial recovery, or growth prompts.
- No hidden RPC, indexer, proving host, POI service, resolver, Waku bootstrap,
  bundler, paymaster, passkey attestation, or recovery service.
- No fake transactions, successful mock broadcasts, fake balances, addresses,
  liquidity, or contacts in product flows. Mocks belong only in tests.
- Never use Coinbase Smart Wallet, an EOA, ERC-4337, Pimlico, a paymaster, or a
  durable funding account as the final submitter of a private-origin operation.
- Never treat saved relay observations, raw ads, successful local decoding, or
  a present proof API as authority for private spending.
- Never silently change a stored wallet's derivation format or claim that
  changing metadata/importing a phrase migrated funds.
- Keep disabled, unsupported, unsynced, locked, and error states distinct;
  keep security limitations and remaining gates visible.
