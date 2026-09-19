import assert from "node:assert/strict";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(process.env.BINDLE_WORKER_SOURCE ?? "public/service-worker.js", "utf8");
const selectionCache = "bindle-release-selection-v1";
const selectionKey = "/__bindle-approved-release";
const pendingKey = "/__bindle-pending-release";
const release = (id) => ({ id, version: id, commit: id, time: "2026-09-19" });
const storage = () => {
  const stores = new Map();
  return {
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
    open: async (name) => {
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      const key = (request) => typeof request === "string" ? request : new URL(request.url).pathname;
      return {
        match: async (request) => entries.get(key(request))?.clone(),
        put: async (request, response) => { entries.set(key(request), response.clone()); },
        delete: async (request) => entries.delete(key(request))
      };
    }
  };
};
const worker = (caches, build, { active = false, corrupt = false } = {}) => {
  const handlers = new Map();
  const shell = `<html>${build.id}</html>`;
  const manifest = {
    schema: 1,
    build,
    files: [{ url: "/index.html", hash: createHash("sha256").update(shell).digest("hex") }]
  };
  const self = {
    registration: { active: active ? {} : null },
    location: { origin: "https://bindle.test", href: "https://bindle.test/service-worker.js" },
    clients: { matchAll: async () => [], claim: async () => {} },
    skipWaiting: async () => {},
    addEventListener: (type, handler) => handlers.set(type, handler)
  };
  runInNewContext(source, {
    self, caches, Response, URL, crypto: webcrypto,
    fetch: async (input) => {
      const path = new URL(typeof input === "string" ? input : input.url, self.location.origin).pathname;
      if (path === "/release.json") return Response.json(manifest);
      if (path === "/index.html") return new Response(corrupt ? "partial deployment" : shell);
      return new Response("not found", { status: 404 });
    }
  });
  const dispatch = async (type, data = {}) => {
    let done;
    let response;
    handlers.get(type)({ ...data, waitUntil: (promise) => { done = promise; },
      respondWith: (promise) => { response = promise; } });
    await done;
    return response;
  };
  const message = async (data) => {
    let reply;
    await dispatch("message", { data, ports: [{ postMessage: (value) => { reply = value; } }] });
    return reply;
  };
  return {
    install: () => dispatch("install"), activate: () => dispatch("activate"),
    navigate: () => dispatch("fetch", { request: { method: "GET", mode: "navigate", url: "https://bindle.test/" } }),
    check: () => message({ type: "BINDLE_CHECK_FOR_UPDATE" }),
    approve: async () => {
      const reply = await message({ type: "BINDLE_APPROVE_UPDATE", id: build.id });
      assert.equal(reply.approved.id, build.id);
    }
  };
};
const setup = async () => {
  const caches = storage();
  const old = worker(caches, release("old"));
  await old.install();
  await old.activate();
  return { caches, old, next: worker(caches, release("new"), { active: true }) };
};

test("the update controller contains no stamped release metadata", () => {
  assert.equal(source.includes("BINDLE_BUILD_INFO"), false);
  assert.equal(source.includes("BINDLE_PRECACHE"), false);
});

test("fresh install selects its complete shell", async () => {
  const { caches } = await setup();
  const selected = await (await caches.open(selectionCache)).match(selectionKey);
  assert.equal((await selected.json()).build.id, "old");
});

test("controller activation preserves the approved shell", async () => {
  const { next } = await setup();
  await next.install();
  await next.activate();
  assert.equal(await (await next.navigate()).text(), "<html>old</html>");
  await next.approve();
  assert.equal(await (await next.navigate()).text(), "<html>new</html>");
});

test("active stable controller stages a later release without installing worker code", async () => {
  const { caches, next } = await setup();
  const reply = await next.check();
  assert.equal(reply.build.id, "new");
  const selected = await (await caches.open(selectionCache)).match(selectionKey);
  const pending = await (await caches.open(selectionCache)).match(pendingKey);
  assert.equal((await selected.json()).build.id, "old");
  assert.equal((await pending.json()).build.id, "new");
});

test("missing legacy selection preserves the sole previous shell until explicit approval", async () => {
  const { caches, next } = await setup();
  await caches.delete(selectionCache);
  await next.install();
  await next.activate();
  assert.equal(await (await next.navigate()).text(), "<html>old</html>");
  await next.approve();
  assert.equal(await (await next.navigate()).text(), "<html>new</html>");
});

test("selection lost after download fails closed during activation and navigation", async () => {
  const { caches, next } = await setup();
  await next.install();
  await caches.delete(selectionCache);
  await next.activate();
  assert.equal((await next.navigate()).status, 503);
  assert.ok((await caches.keys()).includes("bindle-shell-old"));
});

test("ambiguous previous shells cannot silently select the new release", async () => {
  const { caches, next } = await setup();
  await caches.delete(selectionCache);
  await (await caches.open("bindle-shell-other")).put("/index.html", new Response("other"));
  await assert.rejects(next.install(), /previously approved/);
});

test("an existing worker without its shell cannot be treated as a fresh install", async () => {
  const next = worker(storage(), release("new"), { active: true });
  await assert.rejects(next.install(), /previously approved/);
});

test("incomplete downloads cannot replace the approved shell", async () => {
  const { caches } = await setup();
  const next = worker(caches, release("new"), { active: true, corrupt: true });
  const reply = await next.check();
  assert.match(reply.error, /Incomplete Bindle release/);
  assert.equal(await (await next.navigate()).text(), "<html>old</html>");
});

test("missing approved shell cannot fall back to the unapproved shell", async () => {
  const { caches, next } = await setup();
  await next.install();
  await caches.delete("bindle-shell-old");
  await next.activate();
  assert.equal((await next.navigate()).status, 503);
});
