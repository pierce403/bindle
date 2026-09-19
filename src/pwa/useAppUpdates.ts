import { useEffect, useRef, useSyncExternalStore } from "react";
import { getUpdateState, installUpdate, subscribeToUpdates } from "./registerServiceWorker";

export const useAppUpdates = (busy: boolean) => {
  const updates = useSyncExternalStore(subscribeToUpdates, getUpdateState);
  const attempted = useRef<string | null>(null);
  useEffect(() => {
    if (busy) return;
    if (updates.readyToReload) { window.location.reload(); return; }
    if (updates.preference !== "approve") { attempted.current = null; return; }
    if (updates.pending && !updates.installing && attempted.current !== updates.pending.id) {
      attempted.current = updates.pending.id;
      void installUpdate();
    }
  }, [busy, updates]);
  return updates;
};
