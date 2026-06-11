# Privacy Policy (PRIVACY.md)

This document outlines the privacy design, network connection policies, and metadata protection trade-offs implemented in Bindle.

## Core Privacy Stance

Bindle is designed to protect user financial metadata by default. Unlike traditional web wallets, Bindle does not run backend servers, track user IP addresses, deploy telemetry, or use silent third-party analytics. The application is statically hosted (GitHub Pages, `bindle.cash`) and executes entirely inside the user's local browser sandbox.

### 1. No-Silent-Third-Party-Connections Policy
* **Explicit Connection Settings**: Bindle is prohibited from initiating network connections to unlisted or unlabelled third-party servers.
* **Inspectable & Replaceable Endpoints**: Every external service (Ethereum RPC, ERC-4337 bundler, paymaster, or Railgun UTXO indexer) must be defined in the `ConnectionPolicy` registry and visible in the Connections panel.
* **Preflight Disclosures**: Before performing sensitive actions (such as shielding, sending, or checking balances), Bindle presents a preflight modal disclosing every endpoint that will be contacted during the transaction.

### 2. Same-Origin Proving Artifacts
* **Local proving artifacts**: Railgun private transactions require compiling zk-SNARK proving keys. Instead of pulling these large files from external unvetted CDNs or raw GitHub repositories, Bindle hosts these compressed `.br` artifacts directly on-origin under `/railgun-artifacts/`.
* **Service Worker Rewriting**: The local service worker intercepts outbound SDK requests for artifacts and routes them exclusively to the same-origin static path, preventing IP metadata leakage to third-party CDNs.

### 3. Installed PWA Boundary
* **Informational Browser Mode**: To prevent accidental balance exposure or metadata leakage from casual browser visits, Bindle's wallet dashboard, onboarding wizard, and settings panels are entirely inaccessible in ordinary browser mode.
* **Display Mode Gate**: The interface operates only when installed as a Progressive Web App (PWA) and launched in standalone display mode.

---

## The Waku Relayer Transition & Privacy Trade-off

### Background: Waku Broadcasters vs. Direct Submission
In a standard RAILGUN setup, private transactions are broadcasted to the peer-to-peer Waku network, where independent Waku Broadcasters pick them up and submit them to the blockchain. Because the Broadcaster pays the on-chain gas fee (reimbursed by the user in WETH or USDC from their private balance), there is no on-chain link between the user's public Ethereum address and the private transaction.

### The Problem
The public Waku relayer network and its fee advertisement system have proven highly unreliable. Peer discovery is slow, fee ads expire frequently, and the Kohaku manager struggles to select a valid `JsBroadcaster`. This results in transaction submission failures where users cannot send or unshield their funds.

### The Solution: Direct Smart-Wallet Submission
To ensure Bindle remains functional and reliable, we have re-wired the private transaction submission pipeline to match the direct submission approach used by reference tools like `kohaku-cli`. 

When you submit a private send or unshield:
1. The zk-SNARK proof is generated locally by Kohaku in your browser.
2. Instead of broadcasting the payload to Waku, Bindle submits the transaction data directly via your public Coinbase Smart Wallet (using the visible ERC-4337 bundler).
3. The transaction is executed on-chain with zero relayer fees deducted from your private balance.

### Privacy Trade-off & Metadata Disclosure
By submitting private operations directly through your public smart wallet, you accept the following privacy characteristics:

* **No Sender-Recipient Unlinkability**: The on-chain transaction will be submitted by your public smart-wallet contract address. Any observer monitoring the blockchain can link your public smart wallet to the Railgun private transfer or unshield.
* **What Remains Shielded**: Your internal Railgun pool balance, UTXO history, and exact source notes remain protected by zk-SNARKs. Only the final on-chain submission origin (your public Coinbase Smart Wallet address) is linked.
* **No Relayer Fees**: Bypassing Waku broadcasters eliminates the need to pay high relayer gas fee premiums in WETH or USDC. You only pay standard ERC-4337 gas fees through your smart wallet.

This design favors functional success, speed, and cost efficiency over absolute sender anonymity. Users who require maximum metadata anonymity should utilize local command-line tools like `kohaku-cli` configured with local/tor relayer infrastructure.
