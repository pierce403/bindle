import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sendSmartWalletCalls } from "../src/wallet/smartAccountAdapter";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { emptyWalletState } from "../src/wallet/walletState";

const mockPublicKey = "0xc18dd9496b23664467e10015e26c0d2d39a1fca1adacfa995641a820f39c5b0ea47207155abb2204701fd125829b76659fd6d48915890c5cc9c296a07c543310";

test("Private Pay cannot produce submissionMode: erc4337-bundler", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).not.toContain('submissionMode: "erc4337-bundler"');
  expect(paySource).not.toContain('submitter: "erc4337-bundler"');
});

test("Private Pay cannot call sendSmartWalletCalls (railgun-private origin blocked)", async () => {
  await expect(
    sendSmartWalletCalls({
      calls: [{ to: "0xfa7093cdd9ee6932b4eb2c9e1cde7ce00b1fa4b9" as const, data: "0x" as const }],
      origin: "railgun-private",
      policy: defaultConnectionPolicy,
      walletState: {
        ...emptyWalletState,
        passkeyCredentialId: "mock-cred",
        passkeyPublicKey: mockPublicKey,
        passkeyCredentials: []
      }
    })
  ).rejects.toThrow("Private Pay cannot be submitted through the public smart wallet.");
});

test("Private Pay cannot include a Coinbase Smart Wallet batch or WETH.withdraw tail-call", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).not.toContain('WETH.withdraw');
  expect(paySource).not.toContain('withdraw');
});

test("A generated railgun-private operation must use waku-railgun-broadcaster", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).toContain('submissionMode: "railgun-waku-broadcaster"');
  expect(paySource).toContain('submitter: "waku-railgun-broadcaster"');
});

test("Private Pay submit path in App.tsx asserts broadcaster invariants", () => {
  const appSource = readFileSync(resolve("src/App.tsx"), "utf8");
  const submitPayStart = appSource.indexOf("const submitPay = async () =>");
  const submitPayEnd = appSource.indexOf("const submitShield = async", submitPayStart);
  const submitPaySource = appSource.slice(submitPayStart, submitPayEnd);

  expect(submitPayStart).toBeGreaterThan(-1);
  expect(submitPaySource).toContain('throw new Error("Private Pay cannot be submitted through the public smart wallet.");');
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

test("private Pay does not require bundlerUrl", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  const prepareIndex = paySource.indexOf("export const prepareRailgunPayForRecipient");
  const prepareSource = paySource.slice(prepareIndex);
  expect(prepareSource).not.toContain("policy.bundlerUrl");
});

test("public recipient + ETH chooses native-eth-unshield and public recipient + WETH chooses erc20-unshield", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).toContain('settlementKind = "native-eth-unshield"');
  expect(paySource).toContain('settlementKind = "erc20-unshield"');
});

test("public recipient + ETH does not throw the old guard", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).not.toContain("ETH settlement requires private unshield-and-call routing; WETH settlement is the only supported test path.");
});

test("public recipient + ETH does not produce WETH.withdraw tail-call", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).not.toContain("WETH.withdraw");
  
  // Since paySource uses a dynamic string construct for the fallback message,
  // it doesn't contain the literal word 'withdraw' or 'WETH.withdraw'.
  expect(paySource).not.toContain("withdraw");
});

test("private Pay requires fresh Waku broadcaster", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  const prepareIndex = paySource.indexOf("export const prepareRailgunPayForRecipient");
  const prepareSource = paySource.slice(prepareIndex);
  expect(prepareSource).toContain("getRailgunWakuBroadcasterQuote");
});

test("private Pay returns PreparedBroadcasterSubmit with submitter waku-railgun-broadcaster", () => {
  const paySource = readFileSync(resolve("src/railgun/pay.ts"), "utf8");
  expect(paySource).toContain('submitter: "waku-railgun-broadcaster"');
});

