# Official broadcaster patches

These patches apply to the exact versions in `pnpm.patchedDependencies`.
They preserve the official client's protocol, signature verification,
address decoding, fee selection, encryption and submission implementation.
They do not initialize the RAILGUN Wallet SDK engine.

`libp2p-peer-store-11.2.7.patch` backports the upstream signer/record identity
check for [GHSA-vrf4-mx87-p53w](https://github.com/libp2p/js-libp2p/security/advisories/GHSA-vrf4-mx87-p53w)
from [commit 3bf5d395](https://github.com/libp2p/js-libp2p/commit/3bf5d395cbca1488eea6e87cd771e4613b661c30)
to both published JavaScript and TypeScript. A record whose claimed peer differs
from the verified envelope signer is rejected before any store read or write.
This preserves Waku's libp2p 2.x dependency family rather than forcing a peer-store
12.x/interface 3.x upgrade. The affected method is present in the browser bundle;
the configured light-node Identify path already validates these identities
independently, and no configured caller of `consumePeerRecord` was found.
The backport protects the store API itself, including future callers. Version-only
dependency scanners may continue reporting the advisory for this patched version.
`tests/peerStoreValidation.spec.ts` tests the installed implementation using decoded
record/envelope stubs only; it creates no signed mismatched wire record and opens
no network connections.

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
pnpm test:e2e tests/wakuBroadcaster.spec.ts tests/debugMap.spec.ts tests/relayRegistry.spec.ts tests/wakuFeeAds.spec.ts tests/peerStoreValidation.spec.ts
```

The tests include installed upstream lifecycle behavior, the SDK's void-returning
`filter.unsubscribeAll()` facade, DNS cancellation, and actual browser encrypted
payload construction with all outbound requests blocked. Run `pnpm scan:railgun`
separately for read-only current network evidence. None of these checks submits a
transaction. Private submission remains blocked by the independent Kohaku
capability gate.
