const CACHE_NAME = "bindle-shell-v13";
const ARTIFACT_CACHE_NAME = "bindle-railgun-artifacts-v4";
const ARTIFACT_PROXY_VERSION = "railgun-artifacts-v4";
const KOHAKU_RAILGUN_ARTIFACT_ORIGIN = "https://github.com";
const KOHAKU_RAILGUN_ARTIFACT_PATH_PREFIX =
  "/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";
const LOCAL_RAILGUN_ARTIFACT_PATH_PREFIX = "/railgun-artifacts/";
const APP_SHELL = [
  "/",
  "/index.html",
  "/favicon-16.png",
  "/favicon-32.png",
  "/logo.png",
  "/paisley-rose-monochrome.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => {
              // Delete old shell caches
              if (key.startsWith("bindle-shell-") && key !== CACHE_NAME) {
                return true;
              }
              // Delete old artifact caches
              if (
                key.startsWith("bindle-railgun-artifacts-") &&
                key !== ARTIFACT_CACHE_NAME
              ) {
                return true;
              }
              // Delete any unrecognized keys
              if (key !== CACHE_NAME && key !== ARTIFACT_CACHE_NAME) {
                return true;
              }
              return false;
            })
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "BINDLE_ARTIFACT_PROXY_READY") {
    return;
  }

  const response = {
    type: "BINDLE_ARTIFACT_PROXY_READY",
    version: ARTIFACT_PROXY_VERSION
  };
  const messagePort = event.ports?.[0];

  if (messagePort) {
    messagePort.postMessage(response);
    return;
  }

  event.source?.postMessage(response);
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
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          const responseCopy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put("/", responseCopy));
          return networkResponse;
        })
        .catch(() =>
          caches
            .match("/")
            .then((cachedResponse) => cachedResponse || caches.match("/index.html"))
        )
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }

        const responseCopy = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseCopy));
        return networkResponse;
      });
    })
  );
});
