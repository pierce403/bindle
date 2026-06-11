export const registerServiceWorker = () => {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", async () => {
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", {
        scope: "/",
        updateViaCache: "none"
      });

      // Check for updates on startup
      await registration.update().catch(() => {});

      registration.addEventListener("updatefound", () => {
        const installingWorker = registration.installing;
        if (installingWorker) {
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed") {
              console.log("New service worker installed and waiting.");
            }
          });
        }
      });
    } catch (err) {
      console.warn("Service worker registration/update failed:", err);
    }
  });

  // Automatically reload once on controllerchange if updated
  let isReloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloading) return;
    isReloading = true;
    console.log("Service worker controller changed. Reloading page once.");
    window.location.reload();
  });
};
