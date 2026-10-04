import { IndexedDbJobStore } from "./indexedDbStore";
import { MemoryJobStore, type JobStore } from "./store";

let store: JobStore | null = null;

/** Returns the IndexedDB store, or a memory store (flagged non-persistent) when storage is unavailable. */
export function getBrowserStore(): JobStore {
  if (store) return store;
  try {
    if (typeof indexedDB !== "undefined") {
      store = new IndexedDbJobStore();
      return store;
    }
  } catch {
    /* fall through to memory */
  }
  store = new MemoryJobStore(false);
  return store;
}

/** Asks the browser to keep this origin's data. Safe to call repeatedly. */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* some browsers throw in private mode */
  }
  return false;
}
