import { expect, test } from "@playwright/test";
import {
  postShieldBalanceRefreshDelaysMs,
  shouldStartShieldedBalanceAutoSync
} from "../src/railgun/shieldedBalanceRefresh";

test("shielded balance auto-sync can retry an idle state with the same wallet and RPC", () => {
  expect(
    shouldStartShieldedBalanceAutoSync({
      previousSyncKey: "same-wallet-rpc",
      shieldedBalanceStatus: "idle",
      syncKey: "same-wallet-rpc"
    })
  ).toBe(true);

  expect(
    shouldStartShieldedBalanceAutoSync({
      previousSyncKey: "same-wallet-rpc",
      shieldedBalanceStatus: "ready",
      syncKey: "same-wallet-rpc"
    })
  ).toBe(false);

  expect(
    shouldStartShieldedBalanceAutoSync({
      previousSyncKey: "old-wallet-rpc",
      shieldedBalanceStatus: "ready",
      syncKey: "new-wallet-rpc"
    })
  ).toBe(true);
});

test("post-shield balance refresh retries after short RAILGUN indexer delays", () => {
  expect(postShieldBalanceRefreshDelaysMs).toEqual([15_000, 45_000]);
});
