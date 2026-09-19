import { expect, test } from "@playwright/test";
import { androidVersionCode } from "../src/android/version";

test("Android version codes preserve semantic version ordering", () => {
  expect(androidVersionCode("0.2.2")).toBe(2002);
  expect(androidVersionCode("1.0.0")).toBe(1_000_000);
  expect(androidVersionCode("1.12.999")).toBe(1_012_999);
  expect(androidVersionCode("1.1000.0")).toBeNull();
  expect(androidVersionCode("1.2")).toBeNull();
});
