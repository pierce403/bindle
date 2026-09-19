import type { WalletState } from "../wallet/walletState";
import type { ConnectionPolicy } from "../privacy/connectionPolicy";
import type { ShieldedEthBalance } from "./shieldedBalance";
import type { ShieldedEthBalanceCacheContext } from "./shieldedBalanceCache";
import { parseRailgunDerivationVersion } from "./railgunDerivation";

type WalletIdentity = Pick<WalletState, "railgunAddress" | "railgunDerivationProvider" | "railgunDerivationVersion">;

export const railgunWalletIdentityKey = (wallet: WalletIdentity): string =>
  JSON.stringify([wallet.railgunAddress, wallet.railgunDerivationProvider,
    wallet.railgunDerivationVersion === undefined ? "bindle-ethers-bip32-v1" : wallet.railgunDerivationVersion]);

export const shieldedBalanceCacheContextForWallet = (wallet: WalletIdentity): ShieldedEthBalanceCacheContext | null => {
  if (!wallet.railgunAddress || wallet.railgunDerivationProvider !== "kohaku-railgun") return null;
  try {
    return {
      railgunAddress: wallet.railgunAddress,
      derivationProvider: wallet.railgunDerivationProvider,
      derivationVersion: parseRailgunDerivationVersion(wallet.railgunDerivationVersion),
      chainId: 1n
    };
  } catch {
    return null;
  }
};

export const isBalanceForWallet = (balance: ShieldedEthBalance | null, wallet: WalletIdentity): balance is ShieldedEthBalance => {
  const context = shieldedBalanceCacheContextForWallet(wallet);
  if (!balance || !context) return false;
  try {
    return balance.railgunAddress === context.railgunAddress &&
      balance.derivationProvider === context.derivationProvider &&
      parseRailgunDerivationVersion(balance.derivationVersion) === context.derivationVersion &&
      balance.chainId === context.chainId;
  } catch {
    return false;
  }
};

export const shieldedBalanceSyncContextKey = (wallet: WalletIdentity, policy: ConnectionPolicy): string =>
  JSON.stringify([railgunWalletIdentityKey(wallet), policy.ethereumRpcUrl.trim(),
    policy.railgunSyncUrl.trim(), policy.providerMode, policy.privacyToolkit]);
