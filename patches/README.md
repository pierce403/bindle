# Official broadcaster patches

These patches apply to the exact versions in `pnpm.patchedDependencies`.
They preserve the official client's protocol, signature verification,
address decoding, fee selection, encryption and submission implementation.
They do not initialize the RAILGUN Wallet SDK engine.

`railgun-waku-broadcaster-client-web-9.1.1.patch`:

- Honor disabled DNS and explicitly empty direct/store peer lists. Disable
  implicit SDK bootstrap peers and ENR trees.
- Require an injected DNS client when DNS discovery is enabled. Bindle supplies
  only resolvers from the visible connection policy.
- Expose observed fee messages and an explicit cache-reset/Store refresh for
  read-only diagnostics and fresh quote selection.
- Stop the status timer and Waku node; retain a failed node-stop reference for
  retry. Prevent delayed startup, observers, fee verification, historical
  responses and DNS/peer-exchange callbacks from surviving a policy change.
- Remove the development-mode signature bypass. Missing browser WebCrypto
  prevents fee acceptance.
- Replace the optional completed-transaction lookup through an initialized
  wallet engine with an explicit optional callback. Bindle supplies none;
  encrypted Waku responses remain transport receipts, not independently
  confirmed on-chain transactions.

`waku-discovery-0.0.13.patch` injects the supplied DNS client into the official
ENR discovery implementation. ENR parsing and signature validation remain
upstream code. Bindle does not derive or guess WebSocket endpoints from IP-only
ENRs.

Browser compatibility is separate from these patches. Bindle installs Buffer,
process and global aliases only when loading the broadcaster, and aliases the
required stream implementation in Vite. The production bundle guard fails if
`elliptic` or `crypto-browserify` becomes rendered code. These packages remain
transitive lockfile dependencies of the maintained wallet package.

After changing either patch, run `pnpm install` to update its lockfile hash.
Check `pnpm typecheck`, `pnpm build`, and the transport tests:

```sh
pnpm test:e2e tests/wakuBroadcaster.spec.ts tests/debugMap.spec.ts tests/relayRegistry.spec.ts tests/wakuFeeAds.spec.ts
```

The tests include installed upstream lifecycle behavior, the SDK's void-returning
`filter.unsubscribeAll()` facade, DNS cancellation, and actual browser encrypted
payload construction with all outbound requests blocked. Run `pnpm scan:railgun`
separately for read-only current network evidence. None of these checks submits a
transaction. Private submission remains blocked by the independent Kohaku
capability gate.
