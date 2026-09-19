import { expect, test, type Page } from "@playwright/test";
import { publicTestMnemonic, railgunDerivationFixtures } from "./fixtures/railgunDerivation";

test.beforeEach(async ({ page }) => {
  // No RPC, indexer, artifact CDN, relay, or other external traffic is permitted.
  await page.route(/^https?:\/\/(?!localhost:5178(?:\/|$))/, route => route.abort());
  await page.goto("/");
});

const historical = railgunDerivationFixtures[0];
const canonical = railgunDerivationFixtures[1];

/** Reproduce the pre-modernization v2 encrypted record without using new code. */
const storeHistoricalRecord = async (page: Page, provider?: string) => {
  await page.evaluate(async ({ phrase, address, provider }) => {
    const request = indexedDB.open("bindle-railgun-wallet-secrets", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("wallets", { keyPath: "id" });
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const wrappingKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey,
      new TextEncoder().encode(JSON.stringify({ version: 1, recoveryPhrase: phrase, keyIndex: 0, chainId: "1" })));
    const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
    const transaction = database.transaction("wallets", "readwrite");
    transaction.objectStore("wallets").put({
      id: "primary", version: 2, railgunAddress: address,
      ...(provider ? { derivationProvider: provider } : {}),
      keyIndex: 0, chainId: "1", createdAt: "2026-06-03T00:00:00.000Z", updatedAt: "2026-06-03T00:00:00.000Z",
      source: "created", keyStorage: "browser-local", cipher: "AES-GCM",
      iv: base64(iv), ciphertext: base64(new Uint8Array(ciphertext)), wrappingKey
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    database.close();
  }, { phrase: publicTestMnemonic, address: historical.railgunAddress, provider });
};

for (const fixture of railgunDerivationFixtures) {
  test(`imports, unlocks and exports ${fixture.derivationVersion} index ${fixture.keyIndex} without changing accounts`, async ({ page }) => {
    const result = await page.evaluate(async ({ fixture, phrase }) => {
      const wallet = await import("/src/railgun/railgunWallet.ts");
      const imported = await wallet.importEncryptedRailgunWallet({
        recoveryPhrase: phrase, keyIndex: fixture.keyIndex,
        derivationVersion: fixture.derivationVersion,
        expectedRailgunAddress: fixture.railgunAddress
      });
      const unlocked = await wallet.unlockEncryptedRailgunWallet();
      await wallet.assertRecoverableRailgunWallet({
        railgunAddress: fixture.railgunAddress, railgunDerivationProvider: "kohaku-railgun",
        railgunDerivationVersion: fixture.derivationVersion
      });
      const exported = await wallet.exportEncryptedRailgunWallet();
      if (!exported) throw new Error("Export missing");
      await wallet.clearEncryptedRailgunWallet();
      const restored = await wallet.importEncryptedRailgunWallet({
        ...exported, chainId: BigInt(exported.chainId), expectedRailgunAddress: exported.railgunAddress
      });
      return {
        address: imported.railgunAddress,
        unlockedAddress: unlocked.railgunAddress,
        restoredAddress: restored.railgunAddress,
        version: exported.derivationVersion,
        phraseUnchanged: exported.recoveryPhrase === phrase,
        provider: restored.derivationProvider
      };
    }, { fixture, phrase: publicTestMnemonic });
    expect(result).toEqual({
      address: fixture.railgunAddress,
      unlockedAddress: fixture.railgunAddress,
      restoredAddress: fixture.railgunAddress,
      version: fixture.derivationVersion,
      phraseUnchanged: true,
      provider: "kohaku-railgun"
    });
  });
}

for (const provider of [undefined, "kohaku-railgun", "kohaku-railgun-alpha"]) {
  test(`opens an unstamped historical record (${provider ?? "missing provider"}) at its original address`, async ({ page }) => {
    await storeHistoricalRecord(page, provider);
    const result = await page.evaluate(async () => {
      const wallet = await import("/src/railgun/railgunWallet.ts");
      const unlocked = await wallet.unlockEncryptedRailgunWallet();
      const exported = await wallet.exportEncryptedRailgunWallet();
      return { address: unlocked.railgunAddress, version: exported?.derivationVersion, provider: unlocked.derivationProvider };
    });
    expect(result).toEqual({ address: historical.railgunAddress, version: historical.derivationVersion, provider: "kohaku-railgun" });
  });
}

test("a wrong-format recovery cannot overwrite an existing encrypted wallet", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const result = await page.evaluate(async ({ phrase, historicalAddress }) => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    let message = "";
    try {
      await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase,
        derivationVersion: "railgun-babyjubjub-v1", expectedRailgunAddress: historicalAddress });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    const retained = await wallet.unlockEncryptedRailgunWallet();
    return { message, address: retained.railgunAddress, version: retained.derivationVersion };
  }, { phrase: publicTestMnemonic, historicalAddress: historical.railgunAddress });
  expect(result.message).toContain("Existing wallet data was not changed");
  expect(result.address).toBe(historical.railgunAddress);
  expect(result.version).toBe(historical.derivationVersion);
});

test("newly created wallets use the explicitly stamped canonical format", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const created = await wallet.createEncryptedRailgunWallet();
    const exported = await wallet.exportEncryptedRailgunWallet();
    return { version: created.derivationVersion, exportVersion: exported?.derivationVersion, sameAddress: exported?.railgunAddress === created.railgunAddress };
  });
  expect(result).toEqual({ version: canonical.derivationVersion, exportVersion: canonical.derivationVersion, sameAddress: true });
});

test("inconsistent record and encrypted derivation versions fail closed", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const message = await page.evaluate(async () => {
    const open = indexedDB.open("bindle-railgun-wallet-secrets", 1);
    const database = await new Promise<IDBDatabase>(resolve => { open.onsuccess = () => resolve(open.result); });
    const transaction = database.transaction("wallets", "readwrite");
    const store = transaction.objectStore("wallets");
    const get = store.get("primary");
    get.onsuccess = () => store.put({ ...get.result, derivationVersion: "railgun-babyjubjub-v1" });
    await new Promise<void>(resolve => { transaction.oncomplete = () => resolve(); });
    database.close();
    const wallet = await import("/src/railgun/railgunWallet.ts");
    try { await wallet.unlockEncryptedRailgunWallet(); return "unexpected success"; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  });
  expect(message).toContain("derivation metadata does not match");
});

test("unsupported public metadata retains accounts and cannot replace existing encrypted keys", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const result = await page.evaluate(async (address) => {
    const state = await import("/src/wallet/walletState.ts");
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const retained = [];
    for (const version of ["future-railgun-format-v2", null, 42]) {
      localStorage.setItem("bindle.wallet.metadata.v1", JSON.stringify({
        ...state.emptyWalletState, railgunAddress: address, railgunKeyStore: "encrypted-local",
        railgunDerivationProvider: "kohaku-railgun", railgunDerivationVersion: version,
        smartWalletAddress: "0x000000000000000000000000000000000000dEaD",
        passkeyPresent: true, passkeyCredentialId: "public-test-credential", passkeyPublicKey: "0x1234"
      }));
      const loaded = state.loadWalletState();
      const saved = state.saveWalletState(loaded);
      retained.push({ address: saved.railgunAddress, credential: saved.passkeyCredentialId,
        smartAddress: saved.smartWalletAddress, version: saved.railgunDerivationVersion,
        status: saved.status, error: saved.lastError });
    }
    let createError = "";
    try { await wallet.createEncryptedRailgunWallet(); }
    catch (error) { createError = error instanceof Error ? error.message : String(error); }
    return { retained, createError, retainedAddress: (await wallet.unlockEncryptedRailgunWallet()).railgunAddress };
  }, historical.railgunAddress);
  for (const record of result.retained) {
    expect(record).toMatchObject({ address: historical.railgunAddress, credential: "public-test-credential",
      smartAddress: "0x000000000000000000000000000000000000dEaD", version: null, status: "error" });
    expect(record.error).toContain("unsupported");
  }
  expect(result.createError).toContain("Existing keys were not changed");
  expect(result.retainedAddress).toBe(historical.railgunAddress);
});

test("concurrent wallet creation only stores one wallet and explicit clearing permits replacement", async ({ page }) => {
  const result = await page.evaluate(async () => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const attempts = await Promise.allSettled([wallet.createEncryptedRailgunWallet(), wallet.createEncryptedRailgunWallet()]);
    const accepted = attempts.filter(result => result.status === "fulfilled").map(result => result.value.railgunAddress);
    const storedAddress = (await wallet.unlockEncryptedRailgunWallet()).railgunAddress;
    await wallet.clearEncryptedRailgunWallet();
    const replacement = await wallet.createEncryptedRailgunWallet();
    return { accepted, storedAddress, replacementAddress: replacement.railgunAddress };
  });
  expect(result.accepted).toEqual([result.storedAddress]);
  expect(result.replacementAddress).not.toBe(result.storedAddress);
});

test("local funding guard rejects mismatched address, format, provider and chain without changing keys", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const result = await page.evaluate(async ({ historical, canonical }) => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const expected = { railgunAddress: historical.railgunAddress,
      railgunDerivationProvider: "kohaku-railgun", railgunDerivationVersion: historical.derivationVersion };
    const errors = [];
    for (const [metadata, chain] of [
      [{ ...expected, railgunAddress: canonical.railgunAddress }, 1n],
      [{ ...expected, railgunDerivationVersion: canonical.derivationVersion }, 1n],
      [{ ...expected, railgunDerivationProvider: "legacy-noncanonical" }, 1n],
      [{ ...expected, railgunDerivationVersion: null }, 1n],
      [expected, 2n]
    ] as const) {
      try { await wallet.assertRecoverableRailgunWallet(metadata, chain); errors.push("unexpected success"); }
      catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    }
    return { errors, retainedAddress: (await wallet.unlockEncryptedRailgunWallet()).railgunAddress };
  }, { historical, canonical });
  expect(result.errors).toHaveLength(5);
  for (const error of result.errors) expect(error).not.toBe("unexpected success");
  expect(result.retainedAddress).toBe(historical.railgunAddress);
});

test("an unconfirmed phrase import preserves an orphaned encrypted wallet", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const result = await page.evaluate(async ({ phrase, fixture }) => {
    localStorage.removeItem("bindle.wallet.metadata.v1");
    const wallet = await import("/src/railgun/railgunWallet.ts");
    let error = "";
    try { await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase, derivationVersion: fixture.derivationVersion }); }
    catch (caught) { error = caught instanceof Error ? caught.message : String(caught); }
    return { error, address: (await wallet.unlockEncryptedRailgunWallet()).railgunAddress };
  }, { phrase: publicTestMnemonic, fixture: canonical });
  expect(result.error).toContain("Existing keys were not changed");
  expect(result.address).toBe(historical.railgunAddress);
});

test("reviewed imports and metadata-only deletion cannot overwrite a newer stored revision", async ({ page }) => {
  await storeHistoricalRecord(page, "kohaku-railgun");
  const result = await page.evaluate(async ({ phrase, historical, canonical }) => {
    const wallet = await import("/src/railgun/railgunWallet.ts");
    const reviewedRevision = await wallet.getEncryptedRailgunWalletRevision();
    // Simulates another tab replacing the reviewed record before our write.
    await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase,
      derivationVersion: canonical.derivationVersion, expectedStoredRevision: reviewedRevision });
    const errors = [];
    try { await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase,
      derivationVersion: historical.derivationVersion, expectedStoredRevision: reviewedRevision }); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await wallet.clearEncryptedRailgunWallet(reviewedRevision); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    const retainedCanonical = (await wallet.unlockEncryptedRailgunWallet()).railgunAddress;
    const currentRevision = await wallet.getEncryptedRailgunWalletRevision();
    await wallet.clearEncryptedRailgunWallet(currentRevision);
    const emptyRevision = await wallet.getEncryptedRailgunWalletRevision();
    await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase, derivationVersion: historical.derivationVersion });
    try { await wallet.clearEncryptedRailgunWallet(emptyRevision); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    try { await wallet.importEncryptedRailgunWallet({ recoveryPhrase: phrase,
      derivationVersion: canonical.derivationVersion, expectedStoredRevision: emptyRevision }); }
    catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
    return { errors, retainedCanonical, retainedHistorical: (await wallet.unlockEncryptedRailgunWallet()).railgunAddress };
  }, { phrase: publicTestMnemonic, historical, canonical });
  expect(result.errors).toHaveLength(4);
  for (const error of result.errors) expect(error).toContain("Existing keys were not changed");
  expect(result.retainedCanonical).toBe(canonical.railgunAddress);
  expect(result.retainedHistorical).toBe(historical.railgunAddress);
});
