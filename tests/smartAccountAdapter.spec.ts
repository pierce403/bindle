import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { sendSmartWalletCalls } from "../src/wallet/smartAccountAdapter";
import {
  privateSmartWalletSubmissionError
} from "../src/wallet/transactionOrigin";
import { emptyWalletState } from "../src/wallet/walletState";

test("sendSmartWalletCalls rejects railgun-private origins before bundler submission", async () => {
  await expect(
    sendSmartWalletCalls({
      calls: [
        {
          to: "0x000000000000000000000000000000000000dEaD",
          origin: "railgun-private"
        }
      ],
      origin: "railgun-private",
      policy: {
        ...defaultConnectionPolicy,
        bundlerUrl: "https://public.pimlico.io/v2/1/rpc"
      },
      walletState: emptyWalletState
    })
  ).rejects.toThrow(privateSmartWalletSubmissionError);
});
