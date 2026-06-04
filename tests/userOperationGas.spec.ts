import { expect, test } from "@playwright/test";
import {
  estimateVisibleUserOperationFees,
  isPimlicoBundlerUrl,
  parsePimlicoUserOperationGasPrice
} from "../src/wallet/userOperationGas";

test("detects Pimlico bundler URLs without treating local bundlers as Pimlico", () => {
  expect(isPimlicoBundlerUrl("https://public.pimlico.io/v2/1/rpc")).toBe(true);
  expect(isPimlicoBundlerUrl("https://api.pimlico.io/v2/1/rpc")).toBe(true);
  expect(isPimlicoBundlerUrl("http://127.0.0.1:4337")).toBe(false);
  expect(isPimlicoBundlerUrl("not a url")).toBe(false);
});

test("parses Pimlico User Operation gas prices from the preferred tier", () => {
  const fees = parsePimlicoUserOperationGasPrice({
    fast: {
      maxFeePerGas: "0x19cd1f1c",
      maxPriorityFeePerGas: "52281277"
    },
    standard: {
      maxFeePerGas: "0x1",
      maxPriorityFeePerGas: "0x1"
    }
  });

  expect(fees).toEqual({
    maxFeePerGas: 432_873_244n,
    maxPriorityFeePerGas: 52_281_277n
  });
});

test("requests Pimlico gas prices from the visible bundler endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ body: string; url: string }> = [];

  globalThis.fetch = async (input, init) => {
    requests.push({
      body: String(init?.body ?? ""),
      url: String(input)
    });

    return new Response(
      JSON.stringify({
        id: 1,
        jsonrpc: "2.0",
        result: {
          fast: {
            maxFeePerGas: "0x19cd1f1c",
            maxPriorityFeePerGas: "0x31dc0bd"
          }
        }
      }),
      {
        headers: {
          "content-type": "application/json"
        },
        status: 200
      }
    );
  };

  try {
    const fees = await estimateVisibleUserOperationFees({
      bundlerUrl: "https://public.pimlico.io/v2/1/rpc",
      fallbackEstimator: {
        estimateFeesPerGas: async () => {
          throw new Error("Pimlico endpoints should not use fallback fees.");
        }
      }
    });

    expect(fees).toEqual({
      maxFeePerGas: 432_873_244n,
      maxPriorityFeePerGas: 52_281_533n
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe("https://public.pimlico.io/v2/1/rpc");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual(
      expect.objectContaining({
        method: "pimlico_getUserOperationGasPrice",
        params: []
      })
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uses execution RPC fee estimates for non-Pimlico bundlers", async () => {
  const fees = await estimateVisibleUserOperationFees({
    bundlerUrl: "http://127.0.0.1:4337",
    fallbackEstimator: {
      estimateFeesPerGas: async () => ({
        maxFeePerGas: 20n,
        maxPriorityFeePerGas: 2n
      })
    }
  });

  expect(fees).toEqual({
    maxFeePerGas: 20n,
    maxPriorityFeePerGas: 2n
  });
});
