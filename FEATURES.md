# Bindle Feature Backlog

This file is the canonical TODO list for product and protocol work. Keep items
honest: no fake balances, fake `0zk` addresses, simulated activity, seeded
contacts, hidden endpoints, analytics, default hosted RPC, default broadcaster,
or default Waku connection.

## Now

- [ ] Implement local wallet/intents state above the privacy toolkit boundary.
- [ ] Build wallet create/import around Kohaku RAILGUN where usable.
- [ ] Use the legacy RAILGUN Wallet SDK only for lifecycle paths Kohaku does not
      currently support.
- [ ] Track real wallet status, real `0zk` address, created/imported timestamp,
      mnemonic-present boolean, and last error.
- [ ] Persist only appropriate local metadata, with the storage boundary
      documented in code.
- [ ] Show the real `0zk` address in Receive and Balance once created/imported.
- [ ] Add copy controls for real wallet addresses.

## Privacy And Connectivity

- [ ] Keep default startup at zero configured outbound endpoints.
- [ ] Keep all outbound endpoints visible in `ConnectionPolicy`.
- [ ] Add an outbound connection audit view that shows every configured endpoint
      and which wallet action can use it.
- [ ] Add per-endpoint enable/disable controls so configured endpoints are not
      automatically active in every flow.
- [ ] Show a preflight disclosure summary before any action that can reveal a
      public address, RPC URL, resolver query, broadcaster request, or provider
      route.
- [ ] Add explicit artifact download origin policy before downloading RAILGUN
      proving artifacts.
- [ ] Add explicit provider resolver and broadcaster policy for outgoing
      decloaked routes.
- [ ] Add Kohaku custom POI endpoint wiring only when endpoints are
      user/operator configured.
- [ ] Add Helios as a future provider adapter behind `ConnectionPolicy`.
- [ ] Test Kohaku/RAILGUN provider calls against Helios before enabling it.

## Security And Privacy Features

- [ ] Write a concise threat model covering static hosting, browser storage,
      RPC metadata, RAILGUN note data, artifact downloads, and clipboard risk.
- [ ] Keep mnemonic material out of localStorage and document where SDKs persist
      encrypted wallet/provider state.
- [ ] Add optional local passphrase encryption for any Bindle-owned wallet
      metadata that becomes sensitive.
- [ ] Add wallet lock, unlock, and local session timeout controls.
- [ ] Add a local-only wipe flow for Bindle-owned metadata and IndexedDB stores.
- [ ] Add a service-worker cache audit so wallet RPC, broadcaster, resolver,
      quote, and other sensitive POST traffic cannot be cached.
- [ ] Add Content Security Policy guidance for static hosting, including
      avoiding third-party scripts, fonts, frames, and image beacons.
- [ ] Add dependency and supply-chain review gates for wallet, Kohaku, RAILGUN,
      proof, and WASM packages.
- [ ] Pin privacy-critical packages and document why each version changes.
- [ ] Verify downloaded proving artifacts by SDK-supported hash checks before
      use.
- [ ] Add tests that fail if default `ConnectionPolicy` grows a hosted endpoint.
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
- [ ] Do not add a default hosted Ethereum RPC, indexer, Subsquid, resolver,
      broadcaster, quote API, Waku peer, IPFS gateway, or telemetry endpoint.
- [ ] Do not add server-side accounts, custodial key storage, cloud seed backup,
      or hosted wallet recovery.
- [ ] Do not auto-resolve ENS, providers, contacts, avatars, prices, or metadata
      before the user takes an action that requires it.
- [ ] Do not auto-start network services on page load or PWA launch.
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

- [ ] Enable Review only when wallet exists, toolkit is ready, RPC is connected,
      recipient is valid, and amount is valid.
- [ ] Validate decimal amount as greater than zero.
- [ ] Validate recipient shape for `0zk`, `0x`, and `.eth`.
- [ ] Keep ENS resolution as "resolved at send time" until RPC-backed
      resolution is wired.
- [ ] Keep send review as an intent review until the full RAILGUN send path is
      safely implemented.
- [ ] Show real balance sync status, not placeholder balances.
- [ ] Show activity only from real wallet history.

## Protocol Features

- [ ] Generate ETH shield transactions.
- [ ] Sync shielded ETH balances from actual wallet state.
- [ ] Implement private RAILGUN transfer review and proof generation.
- [ ] Implement unshield-to-public-address review and proof generation.
- [ ] Implement broadcaster submission only through explicit broadcaster policy.
- [ ] Implement provider payment routing for decloaked outbound messages.
- [ ] Explore LayerZero-style Pay routing for any-network settlement.
- [ ] Add Uniswap-based Swap flow.
- [ ] Add XMTP chat or payment messaging.

## Security And Maintenance

- [ ] Decide mitigation strategy for current RAILGUN transitive dependency
      vulnerabilities.
- [ ] Keep Kohaku versions pinned until the API stabilizes.
- [ ] Revisit direct Kohaku WASM binding import when the package root no longer
      pulls browser-incompatible plugin dependencies.
- [ ] Avoid `npm audit fix --force` without an SDK compatibility review.
