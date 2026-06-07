export const postShieldBalanceRefreshDelaysMs = [15_000, 45_000] as const;

export const shouldStartShieldedBalanceAutoSync = ({
  previousSyncKey,
  shieldedBalanceStatus,
  syncKey
}: {
  previousSyncKey: string | null;
  shieldedBalanceStatus: string;
  syncKey: string;
}): boolean =>
  previousSyncKey !== syncKey || shieldedBalanceStatus === "idle";
