import { expect, test } from "@playwright/test";
import {
  createKohakuWasmTrapError,
  describeToolkitStartFailure,
  isKohakuRpcFetchFailure,
  isWasmUnreachableTrap
} from "../src/privacy/toolkitErrors";

test("Kohaku WASM unreachable traps become actionable toolkit failures", () => {
  const trap = new WebAssembly.RuntimeError("unreachable");
  const error = createKohakuWasmTrapError(
    "initializing the Kohaku RAILGUN WASM module",
    trap
  );
  const failure = describeToolkitStartFailure(
    "Initializing Kohaku RAILGUN WASM",
    error
  );

  expect(isWasmUnreachableTrap(trap)).toBe(true);
  expect(failure.message).toContain(
    "Initializing Kohaku RAILGUN WASM: The Kohaku RAILGUN WASM module trapped with `unreachable`."
  );
  expect(failure.message).toContain(
    "not caused by the shielded wallet password repair flow"
  );
  expect(failure.action).toEqual({
    kind: "switch-privacy-toolkit",
    toolkit: "railgun-wallet-sdk",
    label: "Use RAILGUN Wallet SDK fallback"
  });
});

test("ordinary toolkit errors keep their current startup step", () => {
  const failure = describeToolkitStartFailure(
    "Connecting configured Ethereum RPC",
    new Error("RPC request failed")
  );

  expect(failure).toEqual({
    message: "Connecting configured Ethereum RPC: RPC request failed",
    action: undefined
  });
});

test("Kohaku RAILGUN RPC fetch failures point users at the visible RPC", () => {
  const rawError = new Error(
    "Utxo indexer error: Syncer error: RPC error: JsValue(TypeError: Failed to fetch)"
  );
  const error = createKohakuWasmTrapError(
    "syncing RAILGUN shielded notes",
    rawError
  );
  const failure = describeToolkitStartFailure("", error);

  expect(isKohakuRpcFetchFailure(rawError)).toBe(true);
  expect(failure.message).toContain(
    "Configured Ethereum RPC failed during syncing RAILGUN shielded notes"
  );
  expect(failure.message).toContain("browser-accessible eth_getLogs");
  expect(failure.message).toContain(
    "not caused by the shielded wallet password repair flow"
  );
  expect(failure.action).toBeUndefined();
});
