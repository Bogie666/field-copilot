import type { JobStore } from "./store";
import type { Job, JobSummary } from "./types";
import { normalizeJobExtensions, summarizeJob } from "./types";

const DB_NAME = "field-copilot";
const DB_VERSION = 1;
const JOBS = "jobs";
const PHOTOS = "photos";

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
        const open = this.factory.open(DB_NAME, DB_VERSION);
        open.onupgradeneeded = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains(JOBS)) db.createObjectStore(JOBS, { keyPath: "id" });
          if (!db.objectStoreNames.contains(PHOTOS)) db.createObjectStore(PHOTOS);
        };
        open.onsuccess = () => resolve(open.result);
        open.onerror = () => reject(open.error ?? new Error("Could not open local storage."));
        open.onblocked = () => reject(new Error("Local storage is blocked by another tab."));
      });
      this.dbPromise.catch(() => {
        this.dbPromise = null;
      });
    }
    return this.dbPromise;
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

  async put(job: Job): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(JOBS, "readwrite");
    tx.objectStore(JOBS).put(job);
    await done(tx);
  }

  async putJobAndPhoto(job: Job, photoId: string, blob: Blob): Promise<void> {
    const db = await this.db();
    const tx = db.transaction([JOBS, PHOTOS], "readwrite");
    const committed = done(tx);
    try {
      tx.objectStore(PHOTOS).put(blob, photoId);
      tx.objectStore(JOBS).put(job);
    } catch (error) {
      tx.abort();
      await committed.catch(() => undefined);
      throw error;
    }
    await committed;
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    const existing = await this.get(id);
    const tx = db.transaction([JOBS, PHOTOS], "readwrite");
    tx.objectStore(JOBS).delete(id);
    existing?.photos.forEach((p) => tx.objectStore(PHOTOS).delete(p.id));
    await done(tx);
  }

  async putPhoto(id: string, blob: Blob): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(PHOTOS, "readwrite");
    tx.objectStore(PHOTOS).put(blob, id);
    await done(tx);
  }

  async getPhoto(id: string): Promise<Blob | null> {
    const db = await this.db();
    return (await request<Blob | undefined>(db.transaction(PHOTOS).objectStore(PHOTOS).get(id))) ?? null;
  }

  async deletePhoto(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(PHOTOS, "readwrite");
    tx.objectStore(PHOTOS).delete(id);
    await done(tx);
  }
}
