// This update controller is intentionally byte-stable across Bindle releases.
// Releases are data in /release.json; publishing one must not execute new worker
// code or change the approved shell.
const RELEASE_CACHE = "bindle-release-selection-v1";
const RELEASE_KEY = "/__bindle-approved-release";
const PENDING_KEY = "/__bindle-pending-release";
const RELEASE_MANIFEST_URL = "/release.json";
const releaseCacheName = (id) => `bindle-shell-${id}`;
const readRecord = async (key) => {
  const response = await (await caches.open(RELEASE_CACHE)).match(key);
  return response ? response.json() : null;
};
const readRelease = async () => {
  return readRecord(RELEASE_KEY);
};
const readPendingRelease = async () => {
  return readRecord(PENDING_KEY);
};
const writeRecord = async (key, value) => {
  await (await caches.open(RELEASE_CACHE)).put(key, Response.json(value));
};
const isReleaseManifest = (value) => {
  if (!value || typeof value !== "object" || value.schema !== 1 ||
      !value.build || typeof value.build !== "object" || !Array.isArray(value.files)) return false;
  if (!["id", "version", "commit", "time"].every((key) =>
    typeof value.build[key] === "string" && value.build[key])) return false;
  const urls = new Set();
  for (const entry of value.files) {
    const parsedUrl = typeof entry?.url === "string"
      ? new URL(entry.url, self.location.origin) : null;
    if (!entry || typeof entry.url !== "string" || typeof entry.hash !== "string" ||
        !/^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(entry.url) ||
        parsedUrl.origin !== self.location.origin || parsedUrl.pathname !== entry.url ||
        !/^[a-f0-9]{64}$/.test(entry.hash) || urls.has(entry.url) ||
        entry.url === "/service-worker.js" || entry.url === RELEASE_MANIFEST_URL ||
        entry.url === "/build.json" || entry.url.startsWith("/railgun-artifacts/")) return false;
    urls.add(entry.url);
  }
  return urls.has("/index.html");
};
const fetchReleaseManifest = async () => {
  const response = await fetch(RELEASE_MANIFEST_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Unable to fetch the Bindle release manifest: ${response.status}`);
  const manifest = await response.json();
  if (!isReleaseManifest(manifest)) throw new Error("The Bindle release manifest is invalid.");
  return manifest;
};
const cacheRelease = async (manifest) => {
  const cacheName = releaseCacheName(manifest.build.id);
  const cache = await caches.open(cacheName);
  for (const { url, hash } of manifest.files) {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok || await sha256Hex(await response.clone().arrayBuffer()) !== hash) {
      throw new Error(`Incomplete Bindle release: ${url}`);
    }
    await cache.put(url, response);
  }
  return { build: manifest.build, cacheName, files: manifest.files };
};
const verifyCachedRelease = async (release) => {
  if (!release?.cacheName || !Array.isArray(release.files)) return false;
  const cache = await caches.open(release.cacheName);
  for (const { url, hash } of release.files) {
    const response = await cache.match(url);
    if (!response || await sha256Hex(await response.arrayBuffer()) !== hash) return false;
  }
  return true;
};
const stageLatestRelease = async () => {
  const manifest = await fetchReleaseManifest();
  const approved = await readRelease();
  if (approved?.build?.id === manifest.build.id) {
    await (await caches.open(RELEASE_CACHE)).delete(PENDING_KEY);
    return approved;
  }
  const staged = await cacheRelease(manifest);
  await writeRecord(PENDING_KEY, staged);
  return staged;
};
const approveRelease = async (release) => {
  const previous = await readRelease();
  await writeRecord(RELEASE_KEY, {
    ...release,
    previousCacheName: previous?.cacheName === release.cacheName
      ? previous.previousCacheName : previous?.cacheName
  });
  await (await caches.open(RELEASE_CACHE)).delete(PENDING_KEY);
};
const initializeRelease = async (staged) => {
  if (await readRelease()) return;
  const previousShells = [];
  for (const name of await caches.keys()) {
    if (name.startsWith("bindle-shell-") && name !== staged.cacheName &&
        await (await caches.open(name)).match("/index.html")) previousShells.push(name);
  }
  if (previousShells.length === 1) {
    // Older workers did not persist approval metadata. Preserve their shell;
    // migration and a missing selection record are not consent to upgrade.
    await writeRecord(RELEASE_KEY, {
      build: null, cacheName: previousShells[0]
    });
  } else if (previousShells.length === 0 && !self.registration.active) {
    // Only a genuinely fresh install may select itself without an approval.
    await approveRelease(staged);
  } else {
    throw new Error("Cannot determine the previously approved Bindle release.");
  }
};
const missingRelease = () => new Response(
  "Bindle's saved version is unavailable. Restore site storage or clear site data to install the current release.",
  { status: 503, headers: { "content-type": "text/plain" } }
);
const ARTIFACT_CACHE_NAME = "bindle-railgun-artifacts-v4";
const ARTIFACT_PROXY_VERSION = "railgun-artifacts-v4";
const KOHAKU_RAILGUN_ARTIFACT_ORIGIN = "https://github.com";
const KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX =
  "/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";
const LOCAL_RAILGUN_ARTIFACT_PATH_PREFIX = "/railgun-artifacts/";
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const staged = await stageLatestRelease();
    await initializeRelease(staged);
    // No skipWaiting: only the explicit approval message can activate early.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Browsers activate a waiting worker when the last window closes. Preserve
    // the approved shell independently, so closing the PWA never implies consent.
    const release = await readRelease();
    const pending = await readPendingRelease();
    const keep = [release?.cacheName, release?.previousCacheName, pending?.cacheName];
    // Keep all shells while a page may still need an older lazy-loaded chunk.
    if (release && (await self.clients.matchAll({ includeUncontrolled: true })).length === 0) {
      await Promise.all((await caches.keys())
        .filter((key) => key.startsWith("bindle-shell-") && !keep.includes(key))
        .map((key) => caches.delete(key)));
    }
    await self.clients.claim();
    const clients = await self.clients.matchAll();
    for (const client of clients) {
      client.postMessage({
        type: "BINDLE_SERVICE_WORKER_ACTIVATED",
        version: ARTIFACT_PROXY_VERSION
      });
    }
  })());
});

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (!type) return;

  const reply = (payload) => {
    const messagePort = event.ports?.[0];
    if (messagePort) {
      messagePort.postMessage(payload);
    } else {
      event.source?.postMessage(payload);
    }
  };

  if (type === "BINDLE_GET_RELEASE") {
    event.waitUntil(Promise.all([readRelease(), readPendingRelease()])
      .then(([release, pending]) => reply({
        build: pending?.build ?? release?.build ?? null,
        approved: release?.build ?? null
      })));
    return;
  }

  if (type === "BINDLE_CHECK_FOR_UPDATE") {
    event.waitUntil((async () => {
      const staged = await stageLatestRelease();
      const release = await readRelease();
      reply({ build: staged?.build ?? release?.build ?? null, approved: release?.build ?? null });
      for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
        client.postMessage({ type: "BINDLE_RELEASE_STAGED" });
      }
    })().catch((error) => reply({ error: error.message })));
    return;
  }

  if (type === "BINDLE_APPROVE_UPDATE") {
    event.waitUntil((async () => {
      const pending = await readPendingRelease();
      if (!pending?.build || event.data.id !== pending.build.id) {
        reply({ error: "The available release changed. Check for updates again." });
        return;
      }
      if (!await verifyCachedRelease(pending)) {
        reply({ error: "The downloaded release is incomplete. Check for updates again." });
        return;
      }
      await approveRelease(pending);
      await self.skipWaiting();
      reply({ approved: pending.build });
      for (const client of await self.clients.matchAll({ includeUncontrolled: true })) {
        client.postMessage({ type: "BINDLE_RELEASE_APPROVED" });
      }
    })().catch((error) => reply({ error: error.message })));
    return;
  }

  if (type === "BINDLE_ARTIFACT_PROXY_READY") {
    reply({
      type: "BINDLE_ARTIFACT_PROXY_READY",
      version: ARTIFACT_PROXY_VERSION,
      cacheName: null,
      artifactCacheName: ARTIFACT_CACHE_NAME,
      scriptURL: self.registration?.active?.scriptURL ?? self.location.href
    });
    return;
  }

  if (type === "BINDLE_SKIP_WAITING") {
    // Artifact-proxy repair cannot bypass the app update decision.
    reply({
      type: "BINDLE_UPDATE_APPROVAL_REQUIRED"
    });
    return;
  }

  if (type === "BINDLE_CLEAR_ARTIFACT_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => {
        const targets = keys.filter((key) => key.startsWith("bindle-railgun-artifacts-"));
        return Promise.all(targets.map((key) => caches.delete(key))).then(() => {
          reply({
            type: "BINDLE_CLEAR_ARTIFACT_CACHES_ACK",
            deletedCaches: targets
          });
        });
      })
    );
    return;
  }

  if (type === "BINDLE_CLEAR_BINDLE_CACHES") {
    event.waitUntil(
      caches.keys().then((keys) => {
        const targets = keys.filter(
          (key) => key.startsWith("bindle-shell-") || key.startsWith("bindle-railgun-artifacts-")
        );
        return Promise.all(targets.map((key) => caches.delete(key))).then(() => {
          reply({
            type: "BINDLE_CLEAR_BINDLE_CACHES_ACK",
            deletedCaches: targets
          });
        });
      })
    );
    return;
  }

  if (type === "BINDLE_SW_DIAGNOSTICS") {
    event.waitUntil(
      Promise.all([
        caches.keys(),
        self.clients.matchAll().then((clients) => clients.length)
      ]).then(([keys, clientsCount]) => {
        reply({
          type: "BINDLE_SW_DIAGNOSTICS_RESPONSE",
          artifactProxyVersion: ARTIFACT_PROXY_VERSION,
          cacheName: null,
          artifactCacheName: ARTIFACT_CACHE_NAME,
          cacheKeys: keys,
          manifestLoaded: manifestPromise !== null,
          clientsCount: clientsCount
        });
      })
    );
    return;
  }
});

const localRailgunArtifactUrl = (requestUrl) => {
  if (
    requestUrl.origin !== KOHAKU_RAILGUN_ARTIFACT_ORIGIN ||
    !requestUrl.pathname.startsWith(KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX)
  ) {
    return null;
  }

  const artifactPath = requestUrl.pathname.slice(
    KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX.length
  );

  return new URL(
    `${LOCAL_RAILGUN_ARTIFACT_PATH_PREFIX}${artifactPath}`,
    self.location.origin
  );
};

let manifestPromise = null;
const getManifest = () => {
  manifestPromise ??= fetch("/railgun-artifacts/manifest.json")
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Status ${res.status.toString()}`);
      }
      return res.json();
    })
    .catch((err) => {
      manifestPromise = null; // reset to retry next time
      throw err;
    });
  return manifestPromise;
};

const sha256Hex = async (arrayBuffer) => {
  const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

const respondWithLocalRailgunArtifact = async (localUrl, artifactPath) => {
  const cache = await caches.open(ARTIFACT_CACHE_NAME);

  // 1. Get manifest
  let manifest;
  try {
    manifest = await getManifest();
  } catch (err) {
    return new Response(`Error: Unable to fetch manifest: ${err.message}`, {
      status: 502,
      statusText: "Bad Gateway"
    });
  }

  const entry = manifest.files.find((f) => f.path === artifactPath);
  if (!entry) {
    return new Response(`Error: Artifact ${artifactPath} not found in manifest.`, {
      status: 500,
      statusText: "Internal Server Error"
    });
  }

  // Use the local url from manifest
  const localTargetUrl = new URL(entry.localPath, self.location.origin);

  // Check cache first
  let cachedResponse = await cache.match(localTargetUrl.href);
  if (cachedResponse) {
    try {
      const bytes = await cachedResponse.arrayBuffer();
      const hash = await sha256Hex(bytes);
      if (bytes.byteLength === entry.localSize && hash === entry.sha256) {
        return new Response(bytes, {
          headers: {
            "content-type": "application/octet-stream",
            "cache-control": "public, max-age=31536000, immutable",
            "x-bindle-artifact-proxy-version": ARTIFACT_PROXY_VERSION
          }
        });
      } else {
        await cache.delete(localTargetUrl.href);
      }
    } catch (err) {
      await cache.delete(localTargetUrl.href);
    }
  }

  // Fetch from same-origin
  try {
    const fetchedResponse = await fetch(localTargetUrl.href, {
      credentials: "same-origin"
    });

    if (!fetchedResponse.ok) {
      return new Response(
        `Error: Failed to fetch artifact from local host: ${fetchedResponse.status.toString()}`,
        {
          status: 502,
          statusText: "Bad Gateway"
        }
      );
    }

    const bytes = await fetchedResponse.arrayBuffer();

    // Validate size
    if (bytes.byteLength !== entry.localSize) {
      return new Response(
        `Error: Artifact validation failed: Size mismatch. Got ${bytes.byteLength.toString()}, expected ${entry.localSize.toString()}`,
        {
          status: 502,
          statusText: "Bad Gateway"
        }
      );
    }

    // Validate SHA-256
    const hash = await sha256Hex(bytes);
    if (hash !== entry.sha256) {
      return new Response(
        `Error: Artifact validation failed: Hash mismatch. Got ${hash}, expected ${entry.sha256}`,
        {
          status: 502,
          statusText: "Bad Gateway"
        }
      );
    }

    // Put valid response into the cache
    await cache.put(
      localTargetUrl.href,
      new Response(bytes, {
        status: fetchedResponse.status,
        statusText: fetchedResponse.statusText,
        headers: fetchedResponse.headers
      })
    );

    return new Response(bytes, {
      headers: {
        "content-type": "application/octet-stream",
        "cache-control": "public, max-age=31536000, immutable",
        "x-bindle-artifact-proxy-version": ARTIFACT_PROXY_VERSION
      }
    });
  } catch (error) {
    return new Response(`Error fetching/validating artifact: ${error.message}`, {
      status: 500,
      statusText: "Internal Server Error"
    });
  }
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  const localArtifactUrl = localRailgunArtifactUrl(requestUrl);

  if (localArtifactUrl) {
    const artifactPath = requestUrl.pathname.slice(
      KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX.length
    );
    event.respondWith(respondWithLocalRailgunArtifact(localArtifactUrl, artifactPath));
    return;
  }

  if (requestUrl.origin !== self.location.origin) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const release = await readRelease();
      if (!release) return missingRelease();
      const cache = await caches.open(release.cacheName);
      return await cache.match("/index.html") ?? missingRelease();
    })());
    return;
  }

  event.respondWith((async () => {
    const release = await readRelease();
    const isHashedAsset = requestUrl.pathname.startsWith("/assets/");
    const isReleaseAsset = release?.files?.some(({ url }) => url === requestUrl.pathname) ?? false;
    if (!isHashedAsset && !isReleaseAsset) return fetch(request);
    if (!release) return missingRelease();
    const cache = await caches.open(release.cacheName);
    const saved = await cache.match(request);
    if (saved) return saved;
    // Hashed assets from older open windows remain valid across approval.
    if (isHashedAsset) {
      for (const name of await caches.keys()) {
        if (!name.startsWith("bindle-shell-")) continue;
        const older = await (await caches.open(name)).match(request);
        if (older) return older;
      }
    }
    return missingRelease();
  })());
});
