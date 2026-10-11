import { IndexedDbJobStore } from "./indexedDbStore";
import { MemoryJobStore, type JobStore, type PhotoWrite, type JobRecovery } from "./store";
import type { Job } from "./types";

/** Only initial open failure selects memory. Later failures stay visible and never fork saved jobs. */
export class BrowserJobStore implements JobStore {
  storageWarning = "";
  private selected: JobStore | null = null;
  private opening: Promise<JobStore> | null = null;
  constructor(private readonly candidate: JobStore | null) {}
  get persistent() { return this.selected?.persistent ?? false; }
  private ready(): Promise<JobStore> {
    if (!this.opening) this.opening = (async () => {
      if (this.candidate) {
        try { await this.candidate.list(); this.selected = this.candidate; }
        catch (error) { this.storageWarning = `Saved jobs on this device are currently unavailable, not deleted. ${error instanceof Error ? error.message : "Device storage could not open."}`; this.selected = new MemoryJobStore(false); }
      } else { this.storageWarning = "Device storage is unavailable. Existing saved jobs cannot be read. New jobs are kept only in this tab until it closes or refreshes."; this.selected = new MemoryJobStore(false); }
      return this.selected;
    })();
    return this.opening;
  }
  async retryPersistentStorage() {
    await this.ready();
    if (!this.candidate) throw new Error("Device storage is unavailable in this browser. Keep this tab open to retain session-only jobs.");
    if (!this.selected?.persistent && (await this.selected!.list()).length) throw new Error("Keep this tab open: it contains session-only jobs. Export their records before refreshing or changing storage.");
    await this.candidate.list();
    this.selected = this.candidate; this.opening = Promise.resolve(this.candidate); this.storageWarning = "";
  }
  async getRecovery(key: string) { return (await this.ready()).getRecovery(key); }
  async putRecovery(key: string, recovery: JobRecovery) { return (await this.ready()).putRecovery(key, recovery); }
  async deleteRecovery(key: string) { return (await this.ready()).deleteRecovery(key); }
  async list() { return (await this.ready()).list(); }
  async get(id: string) { return (await this.ready()).get(id); }
  async put(job: Job, photos?: readonly PhotoWrite[]) { return (await this.ready()).put(job, photos); }
  async putJobAndPhoto(job: Job, photoId: string, blob: Blob) { return (await this.ready()).putJobAndPhoto(job, photoId, blob); }
  async delete(id: string, expectedRevision?: number) { return (await this.ready()).delete(id, expectedRevision); }
  async putPhoto(id: string, blob: Blob) { return (await this.ready()).putPhoto(id, blob); }
  async getPhoto(id: string) { return (await this.ready()).getPhoto(id); }
  async deletePhoto(id: string) { return (await this.ready()).deletePhoto(id); }
}
let store: JobStore | null = null;
export function getBrowserStore(): JobStore {
  if (store) return store;
  let candidate: JobStore | null = null;
  try { if (typeof indexedDB !== "undefined") candidate = new IndexedDbJobStore(); }
  catch { /* Session-only storage remains usable when IndexedDB is blocked. */ }
  return store = new BrowserJobStore(candidate);
}
export async function requestPersistence(): Promise<boolean> {
  try { if (typeof navigator !== "undefined" && navigator.storage?.persist) return await navigator.storage.persist(); }
  catch { /* Some browsers throw in private mode. */ }
  return false;
}
