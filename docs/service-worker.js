const CACHE_NAME = "bindle-shell-v12";
const ARTIFACT_CACHE_NAME = "bindle-railgun-artifacts-v1";
const ARTIFACT_PROXY_VERSION = "railgun-artifacts-v1";
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
            .filter(
              (key) => key !== CACHE_NAME && key !== ARTIFACT_CACHE_NAME
            )
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

const respondWithLocalRailgunArtifact = async (localUrl) => {
  const cache = await caches.open(ARTIFACT_CACHE_NAME);
  const cachedResponse = await cache.match(localUrl.href);

  if (cachedResponse) {
    return cachedResponse;
  }

  const response = await fetch(localUrl.href, {
    cache: "force-cache",
    credentials: "same-origin"
  });

  if (response.ok) {
    await cache.put(localUrl.href, response.clone());
  }

  return response;
};

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const requestUrl = new URL(request.url);

  if (request.method !== "GET") {
    return;
  }

  const localArtifactUrl = localRailgunArtifactUrl(requestUrl);

  if (localArtifactUrl) {
    event.respondWith(respondWithLocalRailgunArtifact(localArtifactUrl));
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
