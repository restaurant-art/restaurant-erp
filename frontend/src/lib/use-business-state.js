import { useCallback, useMemo, useSyncExternalStore } from "react";
import { businessStorage, subscribeBusinessState, getCloudSyncStatus } from "./supabase.js";

// The snapshot is the stored JSON string so React sees a stable identity.
// A remote save updates mounted screens without reloading or losing drafts.
export function useBusinessState(key, initial) {
  const fallback = useMemo(() => typeof initial === "function" ? initial() : initial, [key]);
  const read = useCallback(() => key ? businessStorage.getItem(key) : null, [key]);
  const raw = useSyncExternalStore(subscribeBusinessState, read);
  const value = useMemo(() => raw === null ? fallback : JSON.parse(raw), [raw, fallback]);
  const setValue = useCallback((update) => {
    if (!key) return;
    const currentRaw = businessStorage.getItem(key);
    const current = currentRaw === null ? fallback : JSON.parse(currentRaw);
    businessStorage.setItem(key, JSON.stringify(typeof update === "function" ? update(current) : update));
  }, [key, fallback]);
  return [value, setValue];
}
export const useCloudSyncStatus = () => useSyncExternalStore(subscribeBusinessState, getCloudSyncStatus);
