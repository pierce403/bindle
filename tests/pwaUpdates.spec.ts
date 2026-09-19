import { expect, test, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { enableStandalonePwa } from "./support/pwa";

// Exercise the built React app and real service worker against two local
// releases. Only release metadata differs; no wallet or payment state is faked.
const root = resolve("docs");
const current = JSON.parse(readFileSync(resolve(root, "build.json"), "utf8"));
const previous = { ...current, id: "previous-release", commit: "a".repeat(40), time: "2026-01-01T00:00:00.000Z" };
const builtWorker = readFileSync(resolve(root, "service-worker.js"), "utf8");
const builtManifest: { schema: 1; build: typeof current; files: Array<{ url: string; hash: string }> } =
  JSON.parse(readFileSync(resolve(root, "release.json"), "utf8"));
const makeRelease = (build: typeof current) => {
  const files = new Map<string, Buffer>();
  for (const entry of builtManifest.files) {
    let bytes = readFileSync(resolve(root, entry.url.slice(1)));
    if (entry.url.endsWith(".js") && build !== current) {
      let source = bytes.toString();
      for (const key of ["id", "commit", "time"]) source = source.replaceAll(current[key], build[key]);
      bytes = Buffer.from(source);
    }
    files.set(entry.url, bytes);
  }
  const manifest = [...files].map(([url, bytes]) => ({ url, hash: createHash("sha256").update(bytes).digest("hex") }));
  files.set("/service-worker.js", Buffer.from(builtWorker));
  files.set("/release.json", Buffer.from(JSON.stringify({ schema: 1, build, files: manifest })));
  files.set("/build.json", Buffer.from(JSON.stringify(build)));
  return files;
};
const oldFiles = makeRelease(previous);
const newFiles = makeRelease(current);
let server: Server;
let origin: string;
let deployed = oldFiles;
let corrupt = false;

test.beforeEach(async ({ page, context }) => {
  deployed = oldFiles;
  corrupt = false;
  server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    const body = deployed.get(path === "/" ? "/index.html" : path);
    if (!body) { response.writeHead(404).end(); return; }
    const mime = path.endsWith(".js") ? "text/javascript" : path.endsWith(".css") ? "text/css" :
      path.endsWith(".json") || path.endsWith(".webmanifest") ? "application/json" :
      path.endsWith(".png") ? "image/png" : path.endsWith(".wasm") ? "application/wasm" : "text/html";
    response.writeHead(200, { "content-type": mime, "cache-control": "no-store" });
    response.end(corrupt && path.endsWith(".css") ? "incomplete deployment" : body);
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test address");
  origin = `http://localhost:${address.port}`;
  await context.route("**/*", (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.addInitScript(() => {
    localStorage.setItem("bindle.connectionPolicy.v1", JSON.stringify({ endpointPreset: "privacy-max", wakuEnabled: false }));
  });
  await enableStandalonePwa(page);
  await page.goto(origin);
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
});

test.afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(() => done()));
});

const settings = async (page: Page) => {
  await page.getByRole("button", { name: "Settings", exact: true }).click();
  return page.locator(".version-menu");
};
const stageUpdate = async (page: Page) => {
  deployed = newFiles;
  await page.evaluate(async () => {
    const worker = navigator.serviceWorker.controller;
    if (!worker) throw new Error("Missing stable update controller");
    await new Promise<void>((resolve, reject) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = (event) => event.data?.error
        ? reject(new Error(event.data.error)) : resolve();
      worker.postMessage({ type: "BINDLE_CHECK_FOR_UPDATE" }, [channel.port2]);
    });
  });
  await expect.poll(() => page.evaluate(async () => {
    const response = await (await caches.open("bindle-release-selection-v1"))
      .match("/__bindle-pending-release");
    return response ? (await response.json()).build.id : null;
  })).toBe(current.id);
};
const expectCurrent = async (page: Page) => {
  await expect(page.getByTitle("Open version and update settings")).toContainText(current.commit.slice(0, 12));
};

test("Ask shows exact metadata, defers across reload, and installs without clearing local data", async ({ page }, testInfo) => {
  const menu = await settings(page);
  await expect(menu.getByRole("radio", { name: "Ask", exact: true })).toBeChecked();
  await page.evaluate(async () => {
    localStorage.setItem("update-test-metadata", "keep");
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open("update-test-secrets", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("secrets");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const tx = request.result.transaction("secrets", "readwrite");
        tx.objectStore("secrets").put("encrypted-test-data", "key");
        tx.oncomplete = () => { request.result.close(); resolve(); };
      };
    });
  });
  await stageUpdate(page);
  const prompt = page.getByLabel("App update available");
  await expect(prompt).toContainText(current.version);
  await expect(prompt).toContainText(current.commit);
  await expect(prompt).toContainText(current.time);
  await prompt.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("update-prompt.png") });
  await prompt.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  await settings(page);
  await menu.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("version-menu.png") });
  await menu.getByRole("button", { name: "Install update" }).click();
  await expectCurrent(page);
  expect(await page.evaluate(() => localStorage.getItem("update-test-metadata"))).toBe("keep");
  expect(await page.evaluate(() => new Promise((resolve) => {
    const request = indexedDB.open("update-test-secrets");
    request.onsuccess = () => {
      const value = request.result.transaction("secrets").objectStore("secrets").get("key");
      value.onsuccess = () => { request.result.close(); resolve(value.result); };
    };
  }))).toBe("encrypted-test-data");
});

test("Reject pins the approved version after every app window closes and allows later approval", async ({ page, context }) => {
  const menu = await settings(page);
  await menu.getByRole("radio", { name: "Reject", exact: true }).check();
  await stageUpdate(page);
  await expect(page.getByLabel("App update available")).toHaveCount(0);
  await page.close();
  const reopened = await context.newPage();
  await enableStandalonePwa(reopened);
  await reopened.goto(origin);
  await expect(reopened.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  const reopenedMenu = await settings(reopened);
  await expect(reopenedMenu.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
  await expect(reopened.getByLabel("App update available")).toHaveCount(0);
  await expect(reopenedMenu.getByRole("button", { name: "Install update" })).toHaveCount(0);
  await reopenedMenu.getByRole("radio", { name: "Ask", exact: true }).check();
  await reopened.getByLabel("App update available").getByRole("button", { name: "Install update" }).click();
  await expectCurrent(reopened);
});

test("Approve installs automatically after an open Send flow closes", async ({ page }) => {
  const menu = await settings(page);
  await menu.getByRole("radio", { name: "Approve", exact: true }).check();
  await page.getByRole("button", { name: "Wallet", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByLabel("Amount").fill("12.34");
  await stageUpdate(page);
  await expect(page.getByLabel("Amount")).toHaveValue("12.34");
  await expect(page.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  await page.getByRole("button", { name: "Close Send" }).click();
  await expectCurrent(page);
  await settings(page);
  await expect(menu.getByRole("radio", { name: "Approve", exact: true })).toBeChecked();
});

for (const preference of ["Ask", "Reject"] as const) {
  test(`${preference} survives closing all windows`, async ({ page, context }) => {
    const menu = await settings(page);
    await menu.getByRole("radio", { name: preference, exact: true }).check();
    await stageUpdate(page);
    await page.close();
    const reopened = await context.newPage();
    await enableStandalonePwa(reopened);
    await reopened.goto(origin);
    await expect(reopened.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
    const reopenedMenu = await settings(reopened);
    await expect(reopenedMenu.getByRole("radio", { name: preference, exact: true })).toBeChecked();
    if (preference === "Reject") {
      await expect(reopened.getByLabel("App update available")).toHaveCount(0);
      await reopenedMenu.getByRole("radio", { name: "Ask", exact: true }).check();
    }
    await reopened.getByLabel("App update available").getByRole("button", { name: "Install update" }).click();
    await expectCurrent(reopened);
  });
}

test("an incomplete release stays uninstalled and a later check can recover", async ({ page }) => {
  const menu = await settings(page);
  deployed = newFiles;
  corrupt = true;
  await menu.getByRole("button", { name: "Check for updates" }).click();
  await expect(menu.getByRole("alert")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel("App update available")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  corrupt = false;
  await settings(page);
  await menu.getByRole("button", { name: "Check for updates" }).click();
  await expect(page.getByLabel("App update available")).toBeVisible();
});

test("an approved version opens offline without changing the preference", async ({ page, context }) => {
  const menu = await settings(page);
  await menu.getByRole("radio", { name: "Reject", exact: true }).check();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  await settings(page);
  await expect(menu.getByRole("radio", { name: "Reject", exact: true })).toBeChecked();
});

test("losing the selection after download cannot select the staged update", async ({ page, context }) => {
  await stageUpdate(page);
  await page.evaluate(() => caches.delete("bindle-release-selection-v1"));
  await page.close();
  const reopened = await context.newPage();
  const response = await reopened.goto(origin);
  expect(response?.status()).toBe(503);
  await expect(reopened.locator("body")).toContainText("saved version is unavailable");
});

test("approval in another window defers reload until this window's Send flow closes", async ({ page, context }) => {
  const other = await context.newPage();
  await enableStandalonePwa(other);
  await other.goto(origin);
  await other.getByRole("button", { name: "Send", exact: true }).click();
  await other.getByLabel("Amount").fill("42");
  await stageUpdate(page);
  await page.getByLabel("App update available").getByRole("button", { name: "Install update" }).click();
  await expectCurrent(page);
  await expect(other.getByLabel("Amount")).toHaveValue("42");
  await expect(other.getByTitle("Open version and update settings")).toContainText(previous.commit.slice(0, 12));
  await other.getByRole("button", { name: "Close Send" }).click();
  await expectCurrent(other);
});
