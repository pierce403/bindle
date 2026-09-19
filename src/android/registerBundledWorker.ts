export const registerBundledWorker = (): void => {
  if (!("serviceWorker" in navigator)) return;
  void navigator.serviceWorker.register("/android-service-worker.js", {
    scope: "/",
    updateViaCache: "none"
  }).catch(() => {
    // Wallet actions that require the bundled artifact proxy report readiness.
  });
};
