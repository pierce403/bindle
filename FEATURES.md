# Bindle Feature Backlog

This file is the canonical TODO list for product and protocol work. Keep items
honest: no fake balances, fake `0zk` addresses, simulated activity, seeded
contacts, hidden endpoints, analytics, silent phone-home, or unlabelled hosted
infrastructure.

## Done

- [x] Make mobile PWA onboarding default to a passkey-backed smart wallet,
      not a seed phrase or browser extension.
- [x] Evaluate Kohaku's smart-wallet/account path for passkey-backed accounts
      before adding direct lifecycle state around the legacy RAILGUN Wallet SDK.
- [x] Implement local wallet/intents state above the privacy toolkit boundary.
- [x] Track real wallet status, smart-wallet address, real `0zk` address,
      created/imported timestamp, passkey-present boolean,
      mnemonic-present boolean, and last error.
- [x] Persist only appropriate local metadata, with the storage boundary
      documented in code.
- [x] Add explicit ERC-4337 bundler and paymaster policy before any
      smart-wallet flow can submit transactions through those services.
- [x] First-run PWA flow presents "Create Bindle with passkey" as the primary
      wallet creation action.
- [x] Show a public information/install page outside PWA display mode and mount
      the wallet only inside the installed PWA.
- [x] Add a wallet-tab onboarding wizard that detects incomplete local setup and
      steps through passkey, endpoint configuration, toolkit startup, and
      shielded-wallet creation/import.
- [x] Add passkey availability detection and a clear fallback for unsupported
      browsers without silently changing the custody model.
- [x] Show smart-wallet address and shielded `0zk` address as distinct things
      when both exist or are pending.
- [x] Add copy controls that render only for real wallet addresses.
- [x] Add endpoint disclosure/preflight groundwork for send review.
- [x] Gate Review on wallet presence, toolkit readiness, configured RPC,
      valid recipient, valid amount, and required endpoint readiness.
- [x] Add Viem Coinbase Smart Wallet adapter for passkey-backed ERC-4337
      funding address derivation on Ethereum mainnet.
- [x] Add public ETH smart-wallet payment submission through explicit
      RPC/bundler endpoints with optional configured paymaster.
- [x] Add a Receive Public funding flow that can create and copy the real
      smart-wallet funding address.
- [x] Add explicit public ETH balance sync for the smart-wallet funding address
      through the selected visible Ethereum RPC.
- [x] Refresh public ETH balance on app load when a visible Ethereum RPC is
      configured.
- [x] Show recent top-level public native ETH funding transfers in Activity by
      scanning real Ethereum blocks through the selected visible RPC.
- [x] Reserve the top headline balance for shielded balance in USD instead of
      showing unshielded funding ETH as the primary wallet balance.
- [x] Add explicit shielded ETH balance sync through Kohaku using local RAILGUN
      keys and the selected visible Ethereum RPC.
- [x] Price the synced shielded ETH headline in USD via Chainlink ETH/USD over
      the same visible Ethereum RPC.
- [x] Add shield/unshield readiness tests that keep funded public ETH blocked
      until recoverable `0zk` wallet state, sync, and the relevant visible
      submission prerequisites exist.
- [x] Add a Kohaku native ETH shield-call builder behind the local RAILGUN
      boundary, without using Kohaku's hidden default Subsquid helper.
- [x] Add recoverable RAILGUN spending/viewing key lifecycle using Kohaku
      derivation paths and encrypted local recovery phrase storage.
- [x] Build RAILGUN wallet create/import around Kohaku low-level RAILGUN
      primitives instead of direct app state around the legacy Wallet SDK.
- [x] Store the RAILGUN recovery phrase encrypted in IndexedDB under a
      browser-local WebCrypto key; localStorage stores only non-secret public
      metadata.
- [x] Show the real `0zk` address in Balance and Receive once created/imported.
- [x] Add a local reset path that clears wallet metadata and Bindle-owned
      encrypted RAILGUN secrets.
- [x] Add visible endpoint presets for Bindle default, Privacy max, Custom, and
      Local dev.
- [x] Persist explicit user/operator endpoint settings locally while preserving
      preset selection.
- [x] Label each outbound connection as default, custom, local, or off.
- [x] Add preflight disclosure rows that include endpoint source and value.
- [x] Add same-origin static RAILGUN proving artifacts to `ConnectionPolicy`,
      Connections, and Pay preflight disclosure.
- [x] Mirror Kohaku's compressed RAILGUN `.br` proving artifacts into the static
      site and proxy Kohaku's compiled artifact URL to `/railgun-artifacts/`
      through the PWA service worker.
- [x] Validate decimal ETH amount as greater than zero.
- [x] Validate recipient shape for `0zk`, `0x`, and `.eth`.
- [x] Add tests that verify default endpoints are visible, Privacy max clears
      hosted endpoints, Custom preserves user values, and disclosure covers
      every audited outbound class.
- [x] Submit native ETH shield transactions from the passkey smart wallet using
      Kohaku shield-call data and visible ERC-4337 RPC/bundler policy.
- [x] Use visible Pimlico bundler gas-price RPC for ERC-4337 User Operation
      fee fields so default bundler submissions are not underpriced.
- [x] Prompt users to replace missing or password-era local RAILGUN key records
      with a fresh browser-local `0zk` while preserving the passkey funding
      wallet.
- [x] Convert Kohaku RAILGUN WASM traps into persistent, readable toolkit
      errors with an explicit RAILGUN Wallet SDK fallback action.
- [x] Add a browser-local Debug tab with persistent wallet/toolkit error logs
      and stack traces for transient RAILGUN/Kohaku failures.
- [x] Guard Kohaku RAILGUN WASM initialization so `initLogging` runs once per
      PWA session instead of trapping during shield prep after wallet creation.
- [x] Auto-start the privacy toolkit after a real `0zk` wallet exists when the
      selected visible preset allows it.
- [x] Classify RAILGUN shielded-sync `eth_getLogs` browser fetch failures as
      visible RPC capability/connectivity problems and route users back to
      Connections instead of the wallet key repair flow.
- [x] Add Settings account export/import JSON for local wallet metadata and
      RAILGUN recovery phrase recovery, while documenting that WebAuthn passkey
      private material cannot be exported.
- [x] Add account-export reclaim metadata that distinguishes full shielded
      `0zk` recovery from public smart-account recovery that requires the same
      synced passkey credential.
- [x] Replace the CSS/SVG-style paisley approximation with a rose-forward
      monochrome raster paisley texture that CSS tints red, blue, or white per
      theme.
- [x] Add `passkeyRpId` wallet metadata so migrated `bindle.me` passkeys can be
      used from `bindle.cash` through Related Origin Requests.
- [x] Scaffold a separate `bindle-migration` static bridge app for `bindle.me`
      that imports account exports, creates replacement passkeys, and submits
      explicit add-owner UserOperations.
- [x] Add a Pay intent builder for mainnet ETH/USDC with local asset search,
      payment request QR/paste import, route review, and endpoint preflight
      disclosure.
- [x] Present Pay route review, proof progress, blockers, and submit state in a
      modal sheet instead of inserting the review below the form.
- [x] Add explicit Private Pay route handling for USDC on Ethereum mainnet:
      classify the source as `railgun-private`, disclose RAILGUN 0zk source,
      broadcaster/Waku status, fee token/fee, Uniswap v4 route provider, target
      token, recipient, and chain, and fail closed instead of submitting the
      private leg through ERC-4337.

## Now

- [ ] Keep mnemonic import as an advanced compatibility/recovery path rather
      than the primary first-run flow.
- [x] Use the legacy RAILGUN Wallet SDK only for lifecycle paths Kohaku does not
      currently support.
- [x] Persist a non-secret local setup-complete flag after public smart-account
      metadata and browser-local RAILGUN key storage are both present, so the
      onboarding wizard does not flash during toolkit auto-start on later PWA
      launches.
- [ ] Replace the interim browser-local RAILGUN key encryption with
      passkey-backed wrapping when WebAuthn PRF support is usable across target
      browsers.
- [x] Add a visible RAILGUN sync-indexer default and use Kohaku chained
      Subsquid-plus-RPC sync when that visible endpoint matches the chain config.
- [ ] Add fully configurable custom RAILGUN indexer routing once Kohaku exposes
      a browser API for non-default sync URLs.
- [ ] Replace the service-worker artifact proxy with a direct custom artifact
      loader once Kohaku exposes a browser API for artifact origins.
- [ ] Add a Kohaku-compatible browser smart-account adapter once `pq-account` or
      equivalent passkey ERC-4337 address derivation is available.
- [ ] Reproduce and report/fix the upstream Kohaku RAILGUN WASM initialization
      `unreachable` trap so the default adapter can start reliably.

## Privacy And Connectivity

- [ ] Keep all outbound endpoints visible in `ConnectionPolicy`.
- [ ] Add an outbound connection audit view that shows every configured endpoint
      and which wallet action can use it.
- [ ] Keep Privacy max startup at zero configured hosted endpoints.
- [ ] Add per-endpoint enable/disable controls so configured endpoints are not
      automatically active in every flow.
- [ ] Show a preflight disclosure summary before any action that can reveal a
      public address, RPC URL, resolver query, broadcaster request, or provider
      route.
- [x] Add explicit artifact download origin policy before downloading RAILGUN
      proving artifacts.
- [ ] Add explicit provider resolver and broadcaster policy for outgoing
      decloaked routes.
- [ ] Add Kohaku custom POI endpoint wiring only when endpoints are visible in
      the selected preset or user/operator configured.
- [ ] Add Helios provider adapter behind `ConnectionPolicy`.
- [ ] Test Kohaku/RAILGUN provider calls against Helios before enabling it.
- [ ] Add explicit default Helios consensus RPC and checkpoint presets only
      after their network dependencies and privacy tradeoffs are visible in
      Connections and preflight disclosure.

## Security And Privacy Features

- [ ] Write a concise threat model covering static hosting, browser storage,
      RPC metadata, RAILGUN note data, artifact downloads, and clipboard risk.
- [x] Keep mnemonic material out of localStorage and document where SDKs persist
      encrypted wallet/provider state.
- [ ] Document the storage threat model for WebAuthn credential IDs and
      smart-wallet metadata; keep RAILGUN viewing/spending material out of
      localStorage.
- [ ] Document that platform passkeys may sync through Apple, Google, Microsoft,
      or other account providers depending on device settings.
- [ ] Prefer user-verifying passkeys and disclose when a platform only offers a
      weaker or roaming-authenticator path.
- [x] Add browser-local encryption for Bindle-owned wallet metadata that
      becomes sensitive, without user-entered passwords.
- [ ] Add wallet lock, unlock, and local session timeout controls.
- [x] Add a local-only wipe flow for Bindle-owned metadata and IndexedDB stores.
- [ ] Add a service-worker cache audit so wallet RPC, broadcaster, resolver,
      quote, and other sensitive POST traffic cannot be cached.
- [ ] Add Content Security Policy guidance for static hosting, including
      avoiding third-party scripts, fonts, frames, and image beacons.
- [ ] Add dependency and supply-chain review gates for wallet, Kohaku, RAILGUN,
      proof, and WASM packages.
- [ ] Pin privacy-critical packages and document why each version changes.
- [ ] Verify downloaded proving artifacts by SDK-supported hash checks before
      use.
- [ ] Add tests that fail if the app renders fake balances, fake `0zk`
      addresses, seeded contacts, or simulated activity.
- [ ] Add an explicit import warning that browser malware, extensions, and
      compromised devices can still read user-entered secrets.
- [ ] Add copy-to-clipboard affordances that reveal exactly what is copied and
      do not auto-copy addresses.
- [ ] Add privacy-preserving error reporting guidance that favors local,
      user-exported diagnostics over automatic telemetry.

## Anti-Features

- [ ] Do not add analytics, session replay, ad pixels, conversion tracking, or
      hidden crash reporting.
- [ ] Do not add hidden hosted endpoints, unlabelled defaults, SDK helper
      defaults, CDN imports, environment-magic endpoints, or undocumented
      library defaults.
- [ ] Do not imply Bindle default, public default, or operator default endpoints
      are trustless or private.
- [ ] Do not add server-side accounts, custodial key storage, cloud seed backup,
      or hosted wallet recovery.
- [ ] Do not hide passkey sync, attestation, account-recovery, or platform
      dependency tradeoffs behind a "more secure" label.
- [ ] Do not require a browser extension, seed phrase, or EOA private key for
      the default mobile PWA onboarding path.
- [ ] Do not auto-resolve ENS, providers, contacts, avatars, prices, or metadata
      before the user takes an action that requires it.
- [ ] Do not start hidden broadcasters, provider resolvers, or network
      services on page load or PWA launch. Public Waku broadcaster defaults are
      allowed only when visible, inspectable, replaceable, and disclosed.
- [ ] Do not auto-start the privacy toolkit unless the selected policy exposes
      that behavior and a real local `0zk` wallet already exists.
- [ ] Do not preload remote images, fonts, scripts, maps, avatars, token lists,
      or marketing assets from third parties.
- [ ] Do not add push notifications, email capture, referral links, or growth
      loops to wallet flows.
- [ ] Do not use synthetic activity, seeded contacts, fake balances, demo
      liquidity, or fake `0zk` addresses to make the app look populated.
- [ ] Do not silently choose a broadcaster, paymaster, bridge, swap route, or
      provider resolver without showing the declassified routing leg.
- [ ] Do not make security state ambiguous: disabled, unsupported, unsynced,
      locked, and error states must be visibly different.
- [ ] Do not hide dependency vulnerabilities or SDK limitations behind polished
      UI.

## Wallet UX

- [ ] Keep ENS resolution as "resolved at send time" until RPC-backed
      resolution is wired.
- [ ] Keep send review as an intent review until the full RAILGUN send path is
      safely implemented.
- [ ] Show real balance sync status, not placeholder balances.
- [ ] Show activity only from real wallet history.

## Protocol Features

- [x] Submit ETH shield transactions from the passkey smart wallet using the
      Kohaku shield-call builder and visible ERC-4337 RPC/bundler policy.
- [ ] Sync shielded ETH balances from actual wallet state.
- [ ] Implement private RAILGUN transfer review and proof generation.
- [ ] Implement unshield-to-public-address review and proof generation.
- [ ] Implement RAILGUN Broadcaster discovery, fee quote, and submission only
      through explicit broadcaster policy.
- [ ] Implement provider payment routing for decloaked outbound messages.
- [ ] Implement one-shot USDC Private Pay execution for shielded ETH unshield,
      explicit ETH-to-USDC routing through Uniswap v4, final ERC-20 delivery,
      RAILGUN proof generation, v4 quote/router calldata, RAILGUN Broadcaster
      submission, and slippage controls.
- [x] Add Pay proof-path UX with honest stage status and RAILGUN proof progress
      normalization for the SDK callback once proof generation is invoked.
- [x] Default quote source to explicit `onchain:uniswap-v4` under Bindle
      default, while keeping Privacy max empty/off.
- [x] Default Pay swap review to 1% max slippage and allow leftover ETH to
      remain unshielded for a later sweep.
- [ ] Add Pay support for non-USDC output assets.
- [ ] Explore LayerZero-style Pay routing for any-network settlement.
- [ ] Add Uniswap-based Swap flow.
- [ ] Add XMTP chat or payment messaging.

## Security And Maintenance

- [ ] Decide mitigation strategy for current RAILGUN transitive dependency
      vulnerabilities.
- [ ] Keep Kohaku versions pinned until the API stabilizes.
- [ ] Revisit direct Kohaku WASM binding import when the package root no longer
      pulls browser-incompatible plugin dependencies.
- [ ] Avoid forced package-manager audit fixes without an SDK compatibility
      review.
