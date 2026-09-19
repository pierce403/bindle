import { expect, test } from "@playwright/test";
import { defaultConnectionPolicy } from "../src/privacy/connectionPolicy";
import { publicTestMnemonic, railgunDerivationFixtures } from "./fixtures/railgunDerivation";

test("local diagnostic exercises real browser WASM without external traffic or saved wallet state", async ({ page }) => {
  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") {
      externalRequests.push(url.href);
      return route.abort();
    }
    if (url.pathname === "/__diagnostic-fixture") {
      return route.fulfill({ contentType: "text/html", body: "<!doctype html><title>No-spend diagnostic test</title>" });
    }
    return route.continue();
  });
  await page.goto("/__diagnostic-fixture");
  const result = await page.evaluate(async ({ policy, fixtures }) => {
    const { runNoSpendRailgunDiagnostic } = await import("/src/railgun/noSpendDiagnostic.ts");
    return runNoSpendRailgunDiagnostic({
      policy,
      localOnly: true,
      publicDerivationFixtures: fixtures
    });
  }, {
    policy: defaultConnectionPolicy,
    fixtures: railgunDerivationFixtures.map((fixture) => ({
      recoveryPhrase: publicTestMnemonic,
      keyIndex: fixture.keyIndex,
      derivationVersion: fixture.derivationVersion,
      expectedAddress: fixture.railgunAddress
    }))
  });

  expect(result.errors).toEqual([]);
  expect(result.localChecksPassed).toBe(true);
  expect(result.kohaku.status).toBe("ready");
  expect(result.walletIndependentInitialization.status).toBe("ready");
  expect(result.utxoSync.status).toBe("pass-controlled-empty-state");
  expect(result.indexedDb.status).toBe("pass-isolated-database");
  expect(result.nativeEthShieldConstruction.status).toBe("pass-no-submission");
  expect(result.derivationCompatibility.status).toBe("pass");
  expect(result.proofApi.status).toBe("available-not-executed");
  expect(result.poiApi.status).toBe("blocked");
  expect(result.submissionPayload.status).toBe("blocked");
  expect(result.liveSubmission).toBe("intentionally-not-attempted");
  expect(result.waku.status).toBe("not-attempted-local-mode");
  expect(result.wakuProtocols.status).toBe("not-attempted-local-mode");
  expect(result.snapshot).toBeNull();
  expect(result.selected).toBeNull();
  expect(externalRequests).toEqual([]);
  expect(await page.evaluate(async () => ({
    databases: (await indexedDB.databases()).map((database) => database.name),
    metadataCount: localStorage.length,
    workers: (await navigator.serviceWorker.getRegistrations()).length
  }))).toEqual({ databases: [], metadataCount: 0, workers: 0 });
});
