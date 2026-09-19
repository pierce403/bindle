// This worker is bundled in the signed Android APK. It proxies Kohaku's
// compiled artifact URL to the APK's verified, same-origin artifact bundle.
// It deliberately does not cache or update the application shell.
const ARTIFACT_CACHE_NAME = "bindle-railgun-artifacts-v4";
const ARTIFACT_PROXY_VERSION = "railgun-artifacts-v4";
const KOHAKU_ARTIFACT_ORIGIN = "https://github.com";
const KOHAKU_ARTIFACT_PATH =
  "/Robert-MacWha/privacy-protocol-artifacts/raw/refs/heads/main/artifacts/";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const replyTo = (event, payload) => {
  const port = event.ports?.[0];
  if (port) port.postMessage(payload);
  else event.source?.postMessage(payload);
};

self.addEventListener("message", (event) => {
  const type = event.data?.type;
  if (type === "BINDLE_ARTIFACT_PROXY_READY") {
    replyTo(event, {
      type,
      version: ARTIFACT_PROXY_VERSION,
      cacheName: null,
      artifactCacheName: ARTIFACT_CACHE_NAME,
      scriptURL: self.registration?.active?.scriptURL ?? self.location.href
    });
    return;
  }

  if (type === "BINDLE_CLEAR_ARTIFACT_CACHES" || type === "BINDLE_CLEAR_BINDLE_CACHES") {
    event.waitUntil(caches.keys().then(async (keys) => {
      const targets = keys.filter((key) => key.startsWith("bindle-railgun-artifacts-"));
      await Promise.all(targets.map((key) => caches.delete(key)));
      replyTo(event, {
        type: type === "BINDLE_CLEAR_ARTIFACT_CACHES"
          ? "BINDLE_CLEAR_ARTIFACT_CACHES_ACK"
          : "BINDLE_CLEAR_BINDLE_CACHES_ACK",
        deletedCaches: targets
      });
    }));
    return;
  }

  if (type === "BINDLE_SW_DIAGNOSTICS") {
    event.waitUntil(Promise.all([
      caches.keys(),
      self.clients.matchAll().then((clients) => clients.length)
    ]).then(([cacheKeys, clientsCount]) => replyTo(event, {
      type: "BINDLE_SW_DIAGNOSTICS_RESPONSE",
      artifactProxyVersion: ARTIFACT_PROXY_VERSION,
      cacheName: null,
      artifactCacheName: ARTIFACT_CACHE_NAME,
      cacheKeys,
      manifestLoaded: manifestPromise !== null,
      clientsCount
    })));
  }
});

const localArtifact = (requestUrl) => {
  if (requestUrl.origin !== KOHAKU_ARTIFACT_ORIGIN ||
      !requestUrl.pathname.startsWith(KOHAKU_ARTIFACT_PATH)) return null;
  return requestUrl.pathname.slice(KOHAKU_ARTIFACT_PATH.length);
};

let manifestPromise = null;
const getManifest = () => {
  manifestPromise ??= fetch("/railgun-artifacts/manifest.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Status ${response.status.toString()}`);
      return response.json();
    })
    .catch((error) => {
      manifestPromise = null;
      throw error;
    });
  return manifestPromise;
};

const sha256Hex = async (bytes) => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const artifactError = (message, status = 502) => new Response(`Error: ${message}`, {
  status,
  headers: { "content-type": "text/plain" }
});

const verifiedArtifactResponse = (bytes) => new Response(bytes, {
  headers: {
    "content-type": "application/octet-stream",
    "cache-control": "public, max-age=31536000, immutable",
    "x-bindle-artifact-proxy-version": ARTIFACT_PROXY_VERSION
  }
});

const validArtifact = async (bytes, entry) =>
  bytes.byteLength === entry.localSize && await sha256Hex(bytes) === entry.sha256;

const respondWithLocalArtifact = async (artifactPath) => {
  let manifest;
  try {
    manifest = await getManifest();
  } catch (error) {
    return artifactError(`Unable to load the bundled manifest: ${error.message}`);
  }

  const entry = manifest.files?.find((candidate) => candidate.path === artifactPath);
  if (!entry || typeof entry.localPath !== "string" ||
      !entry.localPath.startsWith("/railgun-artifacts/") ||
      !Number.isSafeInteger(entry.localSize) || !/^[a-f0-9]{64}$/.test(entry.sha256)) {
    return artifactError(`Artifact ${artifactPath} is absent or invalid.`, 500);
  }
  const url = new URL(entry.localPath, self.location.origin);
  if (url.origin !== self.location.origin || url.pathname !== entry.localPath) {
    return artifactError(`Artifact ${artifactPath} has an invalid local path.`, 500);
  }

  const cache = await caches.open(ARTIFACT_CACHE_NAME);
  const cached = await cache.match(url.href);
  if (cached) {
    const bytes = await cached.arrayBuffer();
    if (await validArtifact(bytes, entry)) return verifiedArtifactResponse(bytes);
    await cache.delete(url.href);
  }

  try {
    const response = await fetch(url.href, { credentials: "same-origin" });
    if (!response.ok) return artifactError(`Bundled artifact returned ${response.status}.`);
    const bytes = await response.arrayBuffer();
    if (!await validArtifact(bytes, entry)) {
      return artifactError(`Artifact ${artifactPath} failed integrity validation.`);
    }
    await cache.put(url.href, new Response(bytes));
    return verifiedArtifactResponse(bytes);
  } catch (error) {
    return artifactError(`Unable to read bundled artifact: ${error.message}`, 500);
  }
};

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const artifactPath = localArtifact(new URL(event.request.url));
  if (artifactPath) event.respondWith(respondWithLocalArtifact(artifactPath));
});
