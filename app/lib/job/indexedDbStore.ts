import { checkPhotoChanges, JobConflictError, revisionOf, nextRevision, ownedPhotoIds, type JobStore, type PhotoWrite, type JobRecovery } from "./store";
import type { Job, JobSummary } from "./types";
import { normalizeJobExtensions, summarizeJob } from "./types";

const DB_NAME = "field-copilot";
const DB_VERSION = 2;
const JOBS = "jobs", PHOTOS = "photos", OWNERS = "photoOwners", DELETED = "deletedJobs", RECOVERY = "jobRecovery";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB request failed."));
  });
}
function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
  });
}

export class IndexedDbJobStore implements JobStore {
  readonly persistent = true;
  private dbPromise: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory = indexedDB) {}
  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        let blocked = false;
        const open = this.factory.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(JOBS)) db.createObjectStore(JOBS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
          if (!db.objectStoreNames.contains(OWNERS)) db.createObjectStore(OWNERS, { keyPath: "id" }).createIndex("jobId", "jobId");
          if (!db.objectStoreNames.contains(RECOVERY)) db.createObjectStore(RECOVERY).createIndex("jobId", "job.id");
          if (!db.objectStoreNames.contains(DELETED)) db.createObjectStore(DELETED);
          // Existing photo IDs, including historical references, establish ownership on upgrade.
          const cursor = open.transaction!.objectStore(JOBS).openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            for (const id of ownedPhotoIds(row.value as Job)) open.transaction!.objectStore(OWNERS).put({ id, jobId: row.key });
            row.continue();
          };
        };
        open.onsuccess = () => {
          const db = open.result;
          if (blocked) { db.close(); return; }
          db.onversionchange = () => { db.close(); this.dbPromise = null; };
          resolve(db);
        };
        open.onerror = () => reject(open.error ?? new Error("Could not open local storage."));
        open.onblocked = () => { blocked = true; reject(new Error("Local storage needs an upgrade. Close other Field Copilot tabs and retry.")); };
      });
      this.dbPromise.catch(() => { this.dbPromise = null; });
    }
    return this.dbPromise;
  }
  async getRecovery(key: string): Promise<JobRecovery | null> {
    const db = await this.db();
    return (await request<JobRecovery | undefined>(db.transaction(RECOVERY).objectStore(RECOVERY).get(key))) ?? null;
  }
  async putRecovery(key: string, recovery: JobRecovery): Promise<void> {
    const db = await this.db(); const tx = db.transaction(RECOVERY, "readwrite");
    const committed = done(tx); tx.objectStore(RECOVERY).put(recovery, key); await committed;
  }
  async deleteRecovery(key: string): Promise<void> {
    const db = await this.db(); const tx = db.transaction(RECOVERY, "readwrite");
    const committed = done(tx); tx.objectStore(RECOVERY).delete(key); await committed;
  }
  async list(): Promise<JobSummary[]> {
    const db = await this.db();
    const jobs = await request<Job[]>(db.transaction(JOBS).objectStore(JOBS).getAll());
    return jobs.map(summarizeJob).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string): Promise<Job | null> {
    const db = await this.db();
    const job = await request<Job | undefined>(db.transaction(JOBS).objectStore(JOBS).get(id));
    return job ? normalizeJobExtensions(job) : null;
  }
  async put(job: Job, writes: readonly PhotoWrite[] = []): Promise<Job> {
    const db = await this.db();
    const tx = db.transaction([JOBS, PHOTOS, OWNERS, DELETED], "readwrite");
    const committed = done(tx);
    // Attach rejection immediately: request failures and aborts otherwise race an unhandled rejection.
    void committed.catch(() => undefined);
    try {
      const jobs = tx.objectStore(JOBS), owners = tx.objectStore(OWNERS);
      const [existing, deleted, recorded] = await Promise.all([
        request<Job | undefined>(jobs.get(job.id)), request(tx.objectStore(DELETED).get(job.id)),
        request<Array<{ id: string; jobId: string }>>(owners.index("jobId").getAll(job.id)),
      ]);
      const next = nextRevision(job, existing, Boolean(deleted));
      checkPhotoChanges(existing, next, writes);
      const retained = ownedPhotoIds(next);
      const ownerRecords = await Promise.all([...retained].map(id => request<{ id: string; jobId: string } | undefined>(owners.get(id))));
      if (ownerRecords.some(owner => owner && owner.jobId !== job.id)) throw new Error("A photo cannot belong to two jobs.");
      const previous = new Set([...ownedPhotoIds(existing), ...recorded.map(p => p.id)]);
      for (const id of previous) if (!retained.has(id)) { tx.objectStore(PHOTOS).delete(id); owners.delete(id); }
      for (const id of retained) owners.put({ id, jobId: job.id });
      for (const { id, blob } of writes) tx.objectStore(PHOTOS).put(blob, id);
      jobs.put(next);
      await committed;
      return next;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted/completed. */ }
      await committed.catch(() => undefined);
      throw error;
    }
  }
  putJobAndPhoto(job: Job, photoId: string, blob: Blob): Promise<Job> { return this.put(job, [{ id: photoId, blob }]); }
  async delete(id: string, expectedRevision?: number): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([JOBS, PHOTOS, OWNERS, DELETED, RECOVERY], "readwrite");
    const committed = done(tx);
    void committed.catch(() => undefined);
    try {
      const [existing, records, recoveries] = await Promise.all([
        request<Job | undefined>(tx.objectStore(JOBS).get(id)),
        request<Array<{ id: string }>>(tx.objectStore(OWNERS).index("jobId").getAll(id)),
        request(tx.objectStore(RECOVERY).index("jobId").getAllKeys(id)),
      ]);
      if (expectedRevision !== undefined && (!existing || revisionOf(existing) !== expectedRevision)) throw new JobConflictError(id, !existing);
      for (const photoId of new Set([...ownedPhotoIds(existing), ...records.map(p => p.id)])) {
        tx.objectStore(PHOTOS).delete(photoId); tx.objectStore(OWNERS).delete(photoId);
      }
      for (const key of recoveries) tx.objectStore(RECOVERY).delete(key);
      tx.objectStore(JOBS).delete(id);
      tx.objectStore(DELETED).put(true, id);
      await committed;
    } catch (error) {
      try { tx.abort(); } catch { /* Already aborted. */ }
      await committed.catch(() => undefined);
      throw error;
    }
  }
  async putPhoto(id: string, blob: Blob): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(PHOTOS, "readwrite");
    const committed = done(tx); tx.objectStore(PHOTOS).put(blob, id); await committed;
  }
  async getPhoto(id: string): Promise<Blob | null> {
    const db = await this.db();
    return (await request<Blob | undefined>(db.transaction(PHOTOS).objectStore(PHOTOS).get(id))) ?? null;
  }
  async deletePhoto(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(PHOTOS, "readwrite");
    const committed = done(tx); tx.objectStore(PHOTOS).delete(id); await committed;
  }
}
