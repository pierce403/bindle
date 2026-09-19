import { expect, test, type Page } from "@playwright/test";
import { enableStandalonePwa } from "./support/pwa";
import { publicTestMnemonic, railgunDerivationFixtures } from "./fixtures/railgunDerivation";

const historical = railgunDerivationFixtures[0];
const canonical = railgunDerivationFixtures[1];

const prepareFixtureWallet = async (page: Page, withFundingAddress = false) => {
  await page.route(/^https?:\/\/(?!localhost:5178(?:\/|$))/, route => route.abort());
  // Delayed test doubles make completion ordering controllable, without starting
  // a provider or scanning a real wallet. All wallet encryption remains real.
  await page.route("**/src/privacy/toolkit.ts", route => route.fulfill({ contentType: "text/javascript", body:
    "export const privacyToolkitOptions = []; export const startPrivacyToolkit = () => new Promise(() => {});" }));
  await page.route("**/src/railgun/shieldedBalance.ts", route => route.fulfill({ contentType: "text/javascript", body:
    "window.pendingFixtureSyncs = []; export const fetchShieldedEthBalance = () => new Promise(resolve => window.pendingFixtureSyncs.push(resolve));" }));
  await page.goto("/");
  await page.evaluate(async ({ phrase, fixture, withFundingAddress }) => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const state = await import("/src/wallet/walletState.ts");
    const policy = await import("/src/privacy/connectionPolicyState.ts");
    const { defaultConnectionPolicy } = await import("/src/privacy/connectionPolicy.ts");
    await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase, derivationVersion: fixture.derivationVersion,
      expectedRailgunAddress: fixture.railgunAddress });
    state.markRailgunWalletReady({ ...state.emptyWalletState,
      smartWalletAddress: withFundingAddress ? "0x000000000000000000000000000000000000dEaD" : null },
    fixture.railgunAddress, "imported", "kohaku-railgun", fixture.derivationVersion);
    policy.saveConnectionPolicy({ ...defaultConnectionPolicy, endpointPreset: "custom",
      ethereumRpcUrl: "http://localhost:5178/fixture-rpc", autoStartToolkit: true,
      wakuEnabled: false, railgunBroadcasterEnabled: false });
  }, { phrase: publicTestMnemonic, fixture: historical, withFundingAddress });
  await enableStandalonePwa(page);
  await page.reload();
};

test("a sync that completes after importing another format cannot paint or cache the previous wallet's balance", async ({ page }) => {
  await prepareFixtureWallet(page);
  await page.locator(".balance-sync").click();
  await page.waitForFunction(() => (window as any).pendingFixtureSyncs.length === 1);
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.on("dialog", dialog => dialog.accept());
  await page.getByLabel("Import account export JSON").setInputFiles({
    name: "public-test-vector.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "me.bindle.account-export", version: 1,
      wallet: { railgunAddress: canonical.railgunAddress, railgunDerivationProvider: "kohaku-railgun",
        railgunDerivationVersion: canonical.derivationVersion },
      railgunWallet: { railgunAddress: canonical.railgunAddress, derivationProvider: "kohaku-railgun",
        derivationVersion: canonical.derivationVersion, recoveryPhrase: publicTestMnemonic,
        keyIndex: 0, chainId: "1", exportedFrom: "browser-local" } }))
  });
  await expect(page.getByText("Account export imported.", { exact: false }).first()).toBeVisible();
  await page.evaluate((fixture) => {
    (window as any).pendingFixtureSyncs[0]({ railgunAddress: fixture.railgunAddress,
      derivationProvider: "kohaku-railgun", derivationVersion: fixture.derivationVersion,
      chainId: 1n, wei: 1n, formattedEth: "old fixture balance", usd: "$91,234.00",
      blockNumber: 1n, syncedAt: "2026-09-19T00:00:00.000Z",
      rawBalanceCount: 1, matchedWrappedBaseTokenBalances: 1, price: null });
  }, historical);
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await expect(page.locator("#balance-heading")).toHaveText("$--");
  await expect(page.getByText("old fixture balance", { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("bindle.railgun.shieldedBalanceCache.v2"))).toBeNull();
});

test("Shield rechecks stored recovery keys before any deployment or RPC call", async ({ page }) => {
  const calls: string[] = [];
  await page.route("**/fixture-rpc", async route => {
    const requests = route.request().postDataJSON();
    const respond = (request: { id: number; method: string }) => {
      calls.push(request.method);
      const result = request.method === "eth_chainId" || request.method === "eth_blockNumber" ? "0x1"
        : request.method === "eth_getBalance" ? "0xde0b6b3a7640000"
        : request.method === "eth_getCode" ? "0x"
        : request.method === "eth_getLogs" ? [] : null;
      return { jsonrpc: "2.0", id: request.id, result };
    };
    await route.fulfill({ json: Array.isArray(requests) ? requests.map(respond) : respond(requests) });
  });
  await prepareFixtureWallet(page, true);
  const shield = page.getByRole("button", { name: "Shield", exact: true });
  await expect(shield).toBeEnabled();
  await expect.poll(() => calls.includes("eth_getCode")).toBe(true);
  await page.evaluate(async () => {
    const open = indexedDB.open("bindle-railgun-wallet-secrets", 1);
    const database = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); });
    const transaction = database.transaction("wallets", "readwrite");
    const store = transaction.objectStore("wallets");
    const get = store.get("primary");
    get.onsuccess = () => store.put({ ...get.result, derivationVersion: "railgun-babyjubjub-v1" });
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve(); });
    database.close();
  });
  const deploymentsBefore = calls.filter(method => method === "eth_getCode").length;
  await shield.click();
  await expect(page.getByText("Stored RAILGUN derivation metadata does not match", { exact: false }).first()).toBeVisible();
  await expect(shield).toBeDisabled();
  expect(calls.filter(method => method === "eth_getCode")).toHaveLength(deploymentsBefore);
  expect(calls).not.toContain("eth_sendUserOperation");
  expect(calls).not.toContain("eth_estimateUserOperationGas");
  // Importing the same public identity must trigger a fresh storage check too.
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  page.on("dialog", dialog => dialog.accept());
  await page.getByLabel("Import account export JSON").setInputFiles({
    name: "public-test-recovery.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schema: "me.bindle.account-export", version: 1,
      wallet: { smartWalletAddress: "0x000000000000000000000000000000000000dEaD",
        railgunAddress: historical.railgunAddress, railgunDerivationProvider: "kohaku-railgun",
        railgunDerivationVersion: historical.derivationVersion },
      railgunWallet: { railgunAddress: historical.railgunAddress, derivationProvider: "kohaku-railgun",
        derivationVersion: historical.derivationVersion, recoveryPhrase: publicTestMnemonic,
        keyIndex: 0, chainId: "1", exportedFrom: "browser-local" } }))
  });
  await expect(page.getByText("Account export imported.", { exact: false }).first()).toBeVisible();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page.getByLabel("Unshielded ETH balance").getByRole("button", { name: "Sync", exact: true }).click();
  await expect(shield).toBeEnabled();
});

test("Shield blocks account mutation while preparing and rechecks another window's metadata before submission", async ({ page }) => {
  await page.route(/\/src\/railgun\/shielding\.ts$/, route => route.fulfill({ contentType: "text/javascript", body: `
    export * from "/src/railgun/shielding.ts?fixture-original";
    export const prepareNativeEthShieldCalls = () => new Promise(resolve => { window.finishFixtureShield = () => resolve([]); });
  ` }));
  await page.route(/\/src\/wallet\/userOperationGas\.ts$/, route => route.fulfill({ contentType: "text/javascript", body: `
    export * from "/src/wallet/userOperationGas.ts?fixture-original";
    export const estimateVisibleUserOperationFees = async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n });
  ` }));
  await page.route(/\/src\/wallet\/smartAccountAdapter\.ts$/, route => route.fulfill({ contentType: "text/javascript", body: `
    export * from "/src/wallet/smartAccountAdapter.ts?fixture-original";
    window.fixtureSubmissions = 0;
    export const sendSmartWalletCalls = async () => { window.fixtureSubmissions++; throw new Error("Test must never submit"); };
  ` }));
  await page.route("**/fixture-rpc", async route => {
    const requests = route.request().postDataJSON();
    const respond = (request: { id: number; method: string }) => ({ jsonrpc: "2.0", id: request.id,
      result: request.method === "eth_chainId" || request.method === "eth_blockNumber" ? "0x1"
        : request.method === "eth_getBalance" ? "0xde0b6b3a7640000"
        : request.method === "eth_getCode" ? "0x00"
        : request.method === "eth_getLogs" ? [] : null });
    await route.fulfill({ json: Array.isArray(requests) ? requests.map(respond) : respond(requests) });
  });
  await prepareFixtureWallet(page, true);
  await page.getByRole("button", { name: "Shield", exact: true }).click();
  await page.waitForFunction(() => typeof (window as any).finishFixtureShield === "function");
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("button", { name: "Import account JSON", exact: true })).toBeDisabled();
  await expect(page.getByLabel("Import account export JSON")).toBeDisabled();
  await expect(page.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await page.evaluate(() => {
    const metadata = JSON.parse(localStorage.getItem("bindle.wallet.metadata.v1")!);
    // Equivalent to another window changing storage without this React state.
    localStorage.setItem("bindle.wallet.metadata.v1", JSON.stringify({ ...metadata,
      railgunDerivationVersion: "railgun-babyjubjub-v1" }));
    (window as any).finishFixtureShield();
  });
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await expect(page.getByText("The active wallet changed.", { exact: false }).first()).toBeVisible();
  expect(await page.evaluate(() => (window as any).fixtureSubmissions)).toBe(0);
});

for (const includePhrase of [true, false]) {
  test(`JSON import ${includePhrase ? "with a phrase" : "without keys"} requires confirmation for orphaned encrypted storage`, async ({ page }) => {
    await prepareFixtureWallet(page);
    await page.evaluate(() => localStorage.removeItem("bindle.wallet.metadata.v1"));
    await page.reload();
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const file = { name: "public-test-import.json", mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify({ schema: "me.bindle.account-export", version: 1,
        wallet: {}, railgunWallet: includePhrase ? {
          railgunAddress: canonical.railgunAddress, derivationProvider: "kohaku-railgun",
          derivationVersion: canonical.derivationVersion, recoveryPhrase: publicTestMnemonic,
          keyIndex: 0, chainId: "1", exportedFrom: "browser-local"
        } : null })) };
    const cancelledDialog = page.waitForEvent("dialog");
    await page.getByLabel("Import account export JSON").setInputFiles(file);
    const dialog = await cancelledDialog;
    expect(dialog.message()).toContain("encrypted RAILGUN secrets");
    await dialog.dismiss();
    await expect(page.getByText("Import cancelled.", { exact: false }).first()).toBeVisible();
    const retainedAddress = await page.evaluate(async () => {
      const wallet = await import("/src/railgun/railgunWallet.ts");
      return (await wallet.unlockEncryptedRailgunWallet()).railgunAddress;
    });
    expect(retainedAddress).toBe(historical.railgunAddress);
    expect(await page.evaluate(() => localStorage.getItem("bindle.wallet.metadata.v1"))).toBeNull();
    // The same explicit replacement is still available after review.
    const acceptedDialog = page.waitForEvent("dialog");
    await page.getByLabel("Import account export JSON").setInputFiles(file);
    await (await acceptedDialog).accept();
    await expect(page.getByText(includePhrase ? "Account export imported." : "Account metadata imported.", { exact: false }).first()).toBeVisible();
    const finalAddress = await page.evaluate(async () => {
      const wallet = await import("/src/railgun/railgunWallet.ts");
      return (await wallet.exportEncryptedRailgunWallet())?.railgunAddress ?? null;
    });
    expect(finalAddress).toBe(includePhrase ? canonical.railgunAddress : null);
  });
}
