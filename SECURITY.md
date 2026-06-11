# Security Policy (SECURITY.md)

This document outlines the security architecture, design principles, and practices followed by Bindle to protect user keys, funds, and transaction integrity.

## Core Security Stance

Bindle is designed to run entirely client-side as a statically hosted Progressive Web App (PWA). There are no backend database servers, hosted custodial services, or centralized user accounts. The security model relies on browser sandbox security, device-level hardware keys, and local cryptographic encryption.

### 1. Passkey-First Onboarding & Smart Accounts
* **Coinbase Smart Wallet (ERC-4337)**: The default funding wallet is an ERC-4337 smart account using platform-level passkeys (P-256 WebAuthn) for transaction authentication.
* **No Local Private Keys for Funding**: Private keys for the public funding wallet are never generated or stored by Bindle. The private key material stays inside the device's secure enclave (platform authenticator) and is accessed only via standard browser WebAuthn API calls.
* **Smart Account Owners**: Bindle resolves and validates smart wallet owner indexes on-chain. If multiple passkeys are enrolled, they are stored as non-secret credential metadata locally, with signature verification handled natively on-chain.

### 2. Shielded RAILGUN Wallet Security
* **IndexedDB Encrypted Secrets**: Stored RAILGUN viewing and spending keys are derived from an encrypted recovery phrase stored in IndexedDB (`bindle-railgun-wallet-secrets`).
* **Non-Extractable Keys**: The recovery phrase is encrypted using standard browser WebCrypto APIs (`AES-GCM`) with a key marked as non-extractable. This prevents other scripts in the origin from extracting the key material.
* **Clean localStorage Boundary**: Bindle strictly segregates public metadata from secrets. No mnemonics, spending/viewing keys, private keys, or seed phrases are ever saved in `localStorage`. Only non-secret public addresses, sync state, and credential markers live in `localStorage`.

### 3. Supply Chain Hardening
* **Strict Package Manager Policies**: Bindle is `pnpm`-only. We enforce strict package manager execution using `scripts/require-pnpm.mjs` and configure pnpm to block executing lifecycle scripts of dependencies via `ignoreDepScripts: true` in `pnpm-workspace.yaml`.
* **Transitive Dependency Auditing**: Vulnerable transitive dependencies are locked and patched using pnpm overrides in `package.json` (e.g., locking `underscore`, `uuid`, and `ws` versions).
* **Removed Node Polyfills**: Broad polyfill plugins (e.g., `vite-plugin-node-polyfills`) have been purged to avoid pulling in unsafe cryptographic graphs like `elliptic` or `crypto-browserify`.

### 4. Direct RPC & Bundler Boundary
* **No Silent Endpoints**: All outbound endpoints (Ethereum RPC, Pimlico ERC-4337 bundler, paymaster, or sync indexers) must be explicitly visible in the `ConnectionPolicy` settings.
* **No Hosted Backends or Telemetry**: Bindle does not host a private API, telemetry gateway, or backend service that tracks user transactions or behavior.

## Vulnerability Reporting

If you find a security vulnerability in Bindle, please report it immediately:
1. **GitHub Security Advisories**: You can submit a private report via a draft security advisory in the GitHub repository: [pierce403/bindle](https://github.com/pierce403/bindle).
2. **Direct Contact**: You can also reach out to the project maintainers directly or open a GitHub issue if the vulnerability does not require confidential disclosure.
