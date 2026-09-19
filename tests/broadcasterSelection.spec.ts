import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { sendSmartWalletCalls } from "../src/wallet/smartAccountAdapter";
import { privateSmartWalletSubmissionError } from "../src/wallet/transactionOrigin";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { emptyWalletState } from "../src/wallet/walletState";
import { getPayAsset } from "../src/intents/assets";
import { prepareRailgunPayForRecipient } from "../src/railgun/pay";
import { KOHAKU_PRIVATE_SUBMISSION_BLOCKER } from "../src/railgun/privateTransactionBridge";
import { railgunDerivationFixtures } from "./fixtures/railgunDerivation";

const mockPublicKey = "0xc18dd9496b23664467e10015e26c0d2d39a1fca1adacfa995641a820f39c5b0ea47207155abb2204701fd125829b76659fd6d48915890c5cc9c296a07c543310";

test("a private origin is rejected before the public wallet reads policy or credentials", async () => {
  const poisonPolicy = new Proxy(defaultConnectionPolicy, {
    get() { throw new Error("Public endpoint policy was accessed"); }
  });
  await expect(sendSmartWalletCalls({
    calls: [{ to: "0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9", data: "0x" }],
    origin: "railgun-private",
    policy: poisonPolicy,
    walletState: emptyWalletState
  })).rejects.toThrow(privateSmartWalletSubmissionError);
});

test("a public batch cannot smuggle a private-origin call", async () => {
  await expect(sendSmartWalletCalls({
    calls: [{ to: "0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9", data: "0x", origin: "railgun-private" }],
    origin: "public-smart-wallet",
    policy: new Proxy(defaultConnectionPolicy, { get() { throw new Error("Public policy accessed"); } }),
    walletState: emptyWalletState
  })).rejects.toThrow(privateSmartWalletSubmissionError);
});

for (const assetSymbol of ["ETH", "WETH", "USDC"]) {
  test(`private ${assetSymbol} payment fails before any outbound request or wallet unlock`, async () => {
    const originalFetch = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = async () => { requests++; throw new Error("Unexpected outbound request"); };
    try {
      await expect(prepareRailgunPayForRecipient({
        amount: "1",
        asset: getPayAsset(assetSymbol)!,
        policy: new Proxy(defaultConnectionPolicy, {
          get() { throw new Error("Endpoint policy accessed before capability gate"); }
        }),
        recipient: "0x000000000000000000000000000000000000dEaD",
        walletState: {
          ...emptyWalletState,
          railgunAddress: railgunDerivationFixtures[1].railgunAddress,
          railgunDerivationProvider: "kohaku-railgun",
          railgunDerivationVersion: "railgun-babyjubjub-v1"
        },
        onStatus: () => undefined,
        onProgress: (progress) => expect(progress.percent).toBe(0)
      })).rejects.toThrow(KOHAKU_PRIVATE_SUBMISSION_BLOCKER);
      expect(requests).toBe(0);
    } finally { globalThis.fetch = originalFetch; }
  });
}

test("the private App action has no public submitter or fabricated success path", () => {
  const source = readFileSync("src/App.tsx", "utf8");
  const start = source.indexOf("const submitPay = async");
  const end = source.indexOf("const submitShield = async", start);
  expect(start).toBeGreaterThan(-1);
  const action = source.slice(start, end);
  expect(action).toContain("prepareRailgunPayForRecipient");
  expect(action).not.toMatch(/sendSmartWalletCalls|sendTransaction|bundlerUrl|paymasterUrl|percent: 100/);
});
test("UserOp simulation errors include decoded call targets/selectors", async () => {
  const mockCalls = [
    {
      to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const,
      value: 0n,
      data: "0x2e1a7d4d0000000000000000000000000000000000000000000000000015b3e648c66e2c" as const
    }
  ];

  await expect(
    sendSmartWalletCalls({
      calls: mockCalls,
      origin: "public-smart-wallet",
      policy: {
        ...defaultConnectionPolicy,
        bundlerUrl: "http://127.0.0.1:4337"
      },
      walletState: {
        ...emptyWalletState,
        passkeyCredentialId: "mock-cred",
        passkeyPublicKey: mockPublicKey,
        passkeyCredentials: []
      }
    })
  ).rejects.toThrow(/Decoded calls: \[Call 0: target=0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2, selector=0x2e1a7d4d\]/);
});

test("Public smart-wallet actions fail before send if callGasLimit or preVerificationGas is zero", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url;
    if (url.includes("127.0.0.1:4337")) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({
          jsonrpc: "2.0",
          id: 1,
          result: {
            callGasLimit: "0x0",
            verificationGasLimit: "0x30d40",
            preVerificationGas: "0x12a50"
          }
        }),
        text: async () => JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: {
            callGasLimit: "0x0",
            verificationGasLimit: "0x30d40",
            preVerificationGas: "0x12a50"
          }
        })
      } as Response;
    }
    return originalFetch(input, init);
  };

  try {
    const mockCalls = [
      {
        to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2" as const,
        value: 0n,
        data: "0x" as const
      }
    ];

    await expect(
      sendSmartWalletCalls({
        calls: mockCalls,
        origin: "public-smart-wallet",
        policy: {
          ...defaultConnectionPolicy,
          bundlerUrl: "http://127.0.0.1:4337"
        },
        walletState: {
          ...emptyWalletState,
          passkeyCredentialId: "mock-cred",
          passkeyPublicKey: mockPublicKey,
          passkeyCredentials: []
        }
      })
    ).rejects.toThrow(/Estimated gas limit is zero: callGasLimit=0/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
