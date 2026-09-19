# Bindle privacy and trust boundaries

Bindle runs as a static PWA served by GitHub Pages at `bindle.cash`. It does not
add analytics, session replay, or automatic crash reporting. Static hosting and
the external services chosen in Connections can still observe IP addresses,
request timing, and other network metadata. Static hosting is not anonymity.

## Visible connections

Every network service must be represented in `ConnectionPolicy`, visible in
Connections, replaceable by the user, and included in the relevant action's
preflight disclosure. Defaults may be convenient but may not be hidden.

| Connection | Information it can observe |
| --- | --- |
| Ethereum RPC | Network metadata, chain-state requests, public funding addresses, transaction queries |
| RAILGUN indexer | Network metadata and note-sync requests |
| ERC-4337 bundler/paymaster | Public smart-account operations and funding/deposit activity |
| Waku DNS resolver | Network metadata and queried ENR tree names |
| Waku peers/broadcasters | Connections, timing, protocol messages, broadcaster requests |
| Explicit POI services | Proof requests/submissions and associated protocol metadata |
| Static host | App, update, and proving-artifact downloads |

Public funding balance refresh and toolkit startup can occur automatically when
the visible policy permits them. Waku discovery is off in the default preset.
Enabling it allows no-spend advertisement watching in the installed PWA. The
editable preset lists Rooted in Privacy ENR trees/direct peers and a Cloudflare
DNS JSON resolver; neither the official broadcaster client nor its Waku SDK
may silently introduce different bootstrap/resolver defaults. DNS can be turned
off while retaining explicit direct peers. Discovery and peer exchange can
contact peers learned from the chosen network, not just the initial peers.

Privacy max clears hosted services and disables automatic toolkit/network
startup. Local or self-hosted services reduce dependence on third parties but
still have network and device trust boundaries. RPC trust reduction through
Helios remains unimplemented and does not imply metadata protection.

The visible mainnet POI list key filters broadcaster compatibility only. POI
aggregator URLs are empty by default, and private-payment proofs for these lists
are not yet supported. A selected list does not trigger a POI service request.

## Private submission must fail closed

Kohaku owns RAILGUN wallet/state and proof APIs. The official RAILGUN broadcaster
client owns Waku discovery, signed fee advertisements, selection, and encrypted
submission. Bindle validates the policy and normalized transaction between them.
The upstream wallet package is present only for broadcaster protocol/crypto
helpers; Bindle does not start a second wallet engine.

Private Send, unshield, and Private Pay cannot currently be submitted. Kohaku
alpha.30 does not expose the required pre-transaction POI proof export,
broadcaster fee-output binding, or configurable proof-bound minimum gas price.
Native ETH unshield additionally lacks the exposed RelayAdapt construction
path. Existing transaction/proof APIs and synthetic test payloads do not prove
that these missing prerequisites are ready.

Private-origin operations must never fall back to the public Coinbase Smart
Wallet, ERC-4337, Pimlico, a paymaster, an EOA, or a durable funding address.
Using those accounts would link the public submitter to the private operation.
The former direct-submission fallback has been removed. Only public funding,
account deployment, and reviewed shield deposits may use the public smart-wallet
path. No real private transaction was broadcast during modernization testing.

The local relay registry contains observations, not authority to spend. A future
enabled private submission must obtain fresh compatible signed fees, review
the selected broadcaster and fee, bind them to the proved transaction, and
revalidate availability immediately before submission. Stale cached entries or
unverified/raw advertisement parsing cannot substitute for that process.

Even a correct broadcaster path does not promise absolute anonymity. RPC and
network metadata, recipients, public settlement legs, timing, and user actions
can reveal information. Swap change may remain private or in an explicitly
reviewed fresh settlement account; it must not silently return to a public
funding wallet, recipient, or provider.

## Recovery and local storage

- localStorage contains public wallet/passkey metadata, connection preferences,
  update preferences, local diagnostic observations, and display-only cached
  balances. Public addresses and cached amounts remain sensitive to anyone
  with access to the browser profile, despite not being signing keys.
- Bindle-owned RAILGUN phrases are AES-GCM encrypted in
  `bindle-railgun-wallet-secrets` IndexedDB under a non-extractable local
  WebCrypto key. Runtime code unlocks spending/viewing material only when
  required. It must never be written into localStorage or diagnostic logs.
- Browser-local encryption does not defend against malicious same-origin code,
  browser compromise, extensions with sufficient access, or a compromised
  device. Passkey-backed RAILGUN wrapping and session lock controls are pending.
- WebAuthn private material remains with the authenticator. Platform passkeys
  may sync through Apple, Google, Microsoft, or another account provider,
  depending on device settings. Public credential IDs, RP IDs, and public keys
  are stored for account reconstruction.
- Account JSON exports containing recovery phrases are sensitive. They cannot
  export a passkey private key. Public smart-account recovery still requires
  the same credential/RP ID or a previously established on-chain recovery path.

Wallet derivation is explicitly versioned. Historical Bindle accounts use
`bindle-ethers-bip32-v1`; new canonical accounts use `railgun-babyjubjub-v1`.
The same phrase produces different addresses between these formats. Missing
old record/export versions stay historical. Imports preserve the selected
format and verify an exported address before replacing secrets. There is no
automatic fund migration. Old unsupported records remain blocked.

Balances are cached separately by address, provider, derivation version, and
chain. Discarding a display cache does not change the wallet. Explicit local
reset removes local recovery data and does not recover on-chain funds; save
the phrase and its format before funding or clearing browser storage.

## Proving artifacts and app updates

Proving artifacts are mirrored at same-origin `/railgun-artifacts/`. Kohaku's
compiled external artifact URL is intercepted by the approved controlling
service worker and mapped to the mirror. Proof readiness requires that worker;
an unavailable worker or unsupported custom artifact origin blocks the flow.
There is no permitted fallback to an undisclosed external artifact host.

App updates check and download from the same origin. The version menu exposes
version, full source commit, and build time, with Approve/Ask/Reject preferences.
An approved release's cached shell remains selected across restarts; activating
a waiting worker by closing the app is not update consent. Updates defer during
wallet operations/recovery review and preserve wallet storage. Site-data removal
or browser eviction can remove the cached-release guarantee.

The worker caches only same-origin GET resources, never sensitive RPC,
broadcaster, resolver, or provider POST traffic. Installing as a PWA gates the
wallet UI, but display mode is a usability boundary rather than protection from
malicious browser code or scripts served by a compromised host.
