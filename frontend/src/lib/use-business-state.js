import { createContext, useContext, useCallback, useMemo, useSyncExternalStore } from "react";
import { businessStorage, subscribeBusinessState, getCloudSyncStatus } from "./cloud.js";

// A training subtree supplies an isolated adapter. The rest of the app retains
// its normal cloud-backed storage; there is no global "training" switch.
export const BusinessStateContext = createContext({ storage: businessStorage, subscribe: subscribeBusinessState });
export const useBusinessStorage = () => useContext(BusinessStateContext).storage;

// The snapshot is the stored JSON string so React sees a stable identity.
// A remote save updates mounted screens without reloading or losing drafts.
export function useBusinessState(key, initial) {
  const { storage, subscribe } = useContext(BusinessStateContext);
  const fallback = useMemo(() => typeof initial === "function" ? initial() : initial, [key, storage]);
  const read = useCallback(() => key ? storage.getItem(key) : null, [key, storage]);
  const raw = useSyncExternalStore(subscribe, read);
  const value = useMemo(() => raw === null ? fallback : JSON.parse(raw), [raw, fallback]);
  const writeValue = useCallback((update, options) => {
    if (!key) return;
    const currentRaw = storage.getItem(key);
    const current = currentRaw === null ? fallback : JSON.parse(currentRaw);
    storage.setItem(key, JSON.stringify(typeof update === "function" ? update(current) : update), options);
  }, [key, fallback, storage]);
  const setValue = useCallback((update) => writeValue(update), [writeValue]);
  const setLocalValue = useCallback((update) => writeValue(update, { preserveWhileLoading: true }), [writeValue]);
  return [value, setValue, setLocalValue];
}
export const useCloudSyncStatus = () => useSyncExternalStore(subscribeBusinessState, getCloudSyncStatus);
