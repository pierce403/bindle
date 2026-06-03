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
- [ ] Add explicit artifact download origin policy before downloading RAILGUN
      proving artifacts.
- [ ] Add explicit provider resolver and broadcaster policy for outgoing
      decloaked routes.
- [ ] Add Kohaku custom POI endpoint wiring only when endpoints are
      user/operator configured.
- [ ] Add Helios as a future provider adapter behind `ConnectionPolicy`.
- [ ] Test Kohaku/RAILGUN provider calls against Helios before enabling it.

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
