// Stamped by pnpm build. The development worker does not pin Vite modules.
const BUILD_INFO = {"version":"0.1.2","commit":"ef1c695bd805a4698903697e926e6de18079b80b-dirty","time":"2026-09-19T13:08:04.199Z","id":"00d7925f65f48070ec6784e5"};
const PRECACHE = [{"url":"/.nojekyll","hash":"01ba4719c80b6fe911b091a7c05124b64eeece964e09c058ef8f9805daca546b"},{"url":"/CNAME","hash":"4e35c0e085a490b46a50c23d115a2b2d52dcee84cd8dccd6c2ea50e7b63bd46d"},{"url":"/favicon-16.png","hash":"e71f59a78448b8264c0a3e96399bbe7e60d5815474e7053007e23d88bb176d7b"},{"url":"/favicon-32.png","hash":"b5fc90d4936b1cfa6f5168d0b859d0dd3ac6a31abf2852c98b7d4d246019bab1"},{"url":"/index.html","hash":"c36eaca0dab886980e923e40989ae2d7eaa7daedb226e1538c0f6ebe64da3f4a"},{"url":"/logo.png","hash":"bb119224bf2b6c67ebc68a8daf8abb8e661254b955c54d363411eaeb352afddf"},{"url":"/manifest.webmanifest","hash":"048cf65eb8430e8b8c6512860e53847bb78b54f74b8f5f811331d0a4640af171"},{"url":"/paisley-monochrome.png","hash":"c60bb9bc1d7705fd6a8262ed2e47348da17ac81babef91c74cb13e1a4823d75a"},{"url":"/paisley-rose-monochrome.png","hash":"42e7e07b241db403d04c9352c9da6e3b62d92fff1094bed9253d91675486f7ff"},{"url":"/assets/ccip-02bd7tEp.js","hash":"57a5b650a0c698e08eae9cbba2b0ae986b9575cbec3ee5cf0751194e082bc624"},{"url":"/assets/dist-CCRklUx3.js","hash":"864938937a27022af4744b798dbd0fa738f67a24cc175997c32259b880ff42c0"},{"url":"/assets/index-BFeqMLLP.css","hash":"051f184e3e4158130b68bb6cdfae711a4b29cb89a6c7dc579801c2966228019a"},{"url":"/assets/index-DCX4pbd8.js","hash":"c071352b82351190a62d924b80836b03a099e4dbaec81ed2c5567c76aa743f3f"},{"url":"/assets/index_bg-B29YS5-Q.wasm","hash":"a122c9b3dc572805f68e3bea27f3c2bb1a0c3ee42a86cc3cfd287990e49a4b04"},{"url":"/assets/pkg-BHh18C2y.js","hash":"724a391976c0ff772189a34007c78b9fda4a9ebdc2b156b642a6817d08910566"},{"url":"/assets/railgun_rs-FG7lo5Ag.js","hash":"69d030fe12399cae31518295edee62f7c11f0cc04ac85b3b37ea6f0013d588bc"},{"url":"/assets/railgun_rs_bg-mJRSrp_z.wasm","hash":"3d7d0d556b545ef67a5e67144134931058b2fe7b887815311d16b1304d49497b"},{"url":"/assets/utils-BAL4l3fO.js","hash":"42edaea7a1f433a9b4833a15edd8da26917672f93c2c7c0d37de0aeeb2a722f2"},{"url":"/icons/icon-192.png","hash":"6f1c4c80db555703c22bc947e5fbb970ab138e482770e3604b0224548931ce46"},{"url":"/icons/icon-512.png","hash":"bb119224bf2b6c67ebc68a8daf8abb8e661254b955c54d363411eaeb352afddf"},{"url":"/icons/maskable-192.png","hash":"1450f8d17005132ee822528e6154265c8e3451abdd547aa5321b2d9fac65307f"},{"url":"/icons/maskable-512.png","hash":"84b19d3486a10725c6367240d9967394b6e3d1931fb9a38a2585e1ca858b9b1d"}];
const CACHE_NAME = `bindle-shell-${BUILD_INFO?.id ?? "dev"}`;
const RELEASE_CACHE = "bindle-release-selection-v1";
const RELEASE_KEY = "/__bindle-approved-release";
const readRelease = async () => {
  const response = await (await caches.open(RELEASE_CACHE)).match(RELEASE_KEY);
  return response ? response.json() : null;
};
const approveRelease = async () => {
  const previous = await readRelease();
  await (await caches.open(RELEASE_CACHE)).put(RELEASE_KEY, Response.json({
    build: BUILD_INFO,
    cacheName: CACHE_NAME,
    previousCacheName: previous?.cacheName === CACHE_NAME
      ? previous.previousCacheName : previous?.cacheName
  }));
};
const ARTIFACT_CACHE_NAME = "bindle-railgun-artifacts-v4";
const ARTIFACT_PROXY_VERSION = "railgun-artifacts-v4";
const KOHAKU_RAILGUN_ARTIFACT_ORIGIN = "https://github.com";
const KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX =
  "/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";
const LOCAL_RAILGUN_ARTIFACT_PATH_PREFIX = "/railgun-artifacts/";
self.addEventListener("install", (event) => {
  if (!BUILD_INFO) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // A partial/mixed deployment must never become an installable release.
    for (const { url, hash } of PRECACHE) {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok || await sha256Hex(await response.clone().arrayBuffer()) !== hash) {
        throw new Error(`Incomplete Bindle release: ${url}`);
      }
      await cache.put(url, response);
    }
    // No skipWaiting: only the explicit approval message can activate early.
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    // Browsers activate a waiting worker when the last window closes. Preserve
    // the approved shell independently, so closing the PWA never implies consent.
    if (BUILD_INFO && !(await readRelease())) await approveRelease();
    const release = await readRelease();
    const keep = [CACHE_NAME, release?.cacheName, release?.previousCacheName];
    // Keep all shells while a page may still need an older lazy-loaded chunk.
    if ((await self.clients.matchAll({ includeUncontrolled: true })).length === 0) {
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
    event.waitUntil(readRelease().then((release) => reply({
      build: BUILD_INFO, approved: release?.build ?? null
    })));
    return;
  }

  if (type === "BINDLE_APPROVE_UPDATE") {
    event.waitUntil((async () => {
      if (!BUILD_INFO || event.data.id !== BUILD_INFO.id) {
        reply({ error: "The available release changed. Check for updates again." });
        return;
      }
      await approveRelease();
      await self.skipWaiting();
      reply({ approved: BUILD_INFO });
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
      cacheName: CACHE_NAME,
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
          cacheName: CACHE_NAME,
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

  if (!BUILD_INFO) return;

  if (request.mode === "navigate") {
    event.respondWith((async () => {
      const release = await readRelease();
      const cache = await caches.open(release?.cacheName ?? CACHE_NAME);
      return await cache.match("/index.html") ?? new Response(
        "Bindle's saved version is unavailable. Restore site storage or clear site data to install the current release.",
        { status: 503, headers: { "content-type": "text/plain" } }
      );
    })());
    return;
  }

  // Only release assets are cached, never arbitrary same-origin APIs/requests.
  if (requestUrl.pathname.startsWith("/assets/") || PRECACHE.some(({ url }) => url === requestUrl.pathname)) {
    event.respondWith((async () => {
      const release = await readRelease();
      const cache = await caches.open(release?.cacheName ?? CACHE_NAME);
      const saved = await cache.match(request);
      if (saved) return saved;
      // Hashed assets from older open windows remain valid across activation.
      if (requestUrl.pathname.startsWith("/assets/")) {
        for (const name of await caches.keys()) {
          if (!name.startsWith("bindle-shell-")) continue;
          const older = await (await caches.open(name)).match(request);
          if (older) return older;
        }
      }
      return fetch(request);
    })());
  }
});
