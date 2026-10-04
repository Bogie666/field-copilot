import type { Job, JobSummary } from "./types";
import { normalizeJobExtensions, summarizeJob } from "./types";

/** Storage contract. The browser uses IndexedDB, tests use the memory implementation. */
export interface JobStore {
  /** True when data survives closing the browser. */
  readonly persistent: boolean;
  list(): Promise<JobSummary[]>;
  get(id: string): Promise<Job | null>;
  put(job: Job): Promise<void>;
  /** All-or-nothing replacement: resolve only after both job metadata and blob commit. */
  putJobAndPhoto(job: Job, photoId: string, blob: Blob): Promise<void>;
  delete(id: string): Promise<void>;
  putPhoto(id: string, blob: Blob): Promise<void>;
  getPhoto(id: string): Promise<Blob | null>;
  deletePhoto(id: string): Promise<void>;
}

export class MemoryJobStore implements JobStore {
  readonly persistent: boolean;
  private jobs = new Map<string, Job>();
  private photos = new Map<string, Blob>();

  constructor(persistent = false) {
    this.persistent = persistent;
  }

  async list() {
    return [...this.jobs.values()].map(summarizeJob).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async get(id: string) {
    const job = this.jobs.get(id);
    return job ? normalizeJobExtensions(structuredClone(job)) : null;
  }
  async put(job: Job) {
    this.jobs.set(job.id, structuredClone(job));
  }
  async putJobAndPhoto(job: Job, photoId: string, blob: Blob) {
    const copy = structuredClone(job); // Validate/clone before mutating either map.
    this.jobs.set(job.id, copy);
    this.photos.set(photoId, blob);
  }
  async delete(id: string) {
    const job = this.jobs.get(id);
    this.jobs.delete(id);
    job?.photos.forEach((p) => this.photos.delete(p.id));
  }
  async putPhoto(id: string, blob: Blob) {
    this.photos.set(id, blob);
  }
  async getPhoto(id: string) {
    return this.photos.get(id) ?? null;
  }
  async deletePhoto(id: string) {
    this.photos.delete(id);
  }
}
