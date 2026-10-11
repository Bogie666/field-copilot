import type { Job, JobSummary } from "./types";
import { normalizeJobExtensions, summarizeJob } from "./types";

export type JobRecovery = { job: Job; proposedJob: Job; error: string; conflict: boolean; recordedAt: string };
export type PhotoWrite = { id: string; blob: Blob };
export type RevisionedJob = Job & { storageRevision?: number };
export const revisionOf = (job: Job): number => (job as RevisionedJob).storageRevision ?? 0;

export class JobConflictError extends Error {
  constructor(readonly jobId: string, readonly deleted = false) {
    super(deleted ? "This job was deleted in another tab. Your unsaved edits are still available here." : "This job changed in another tab. Your unsaved edits are still available here; the saved version has not been overwritten.");
    this.name = "JobConflictError";
  }
}

/** Legacy records start at revision zero. A missing record is only creatable with revision zero. */
export function nextRevision(job: Job, existing: Job | undefined, deleted = false): Job {
  if (deleted || (!existing && revisionOf(job) !== 0) || (existing && revisionOf(existing) !== revisionOf(job))) throw new JobConflictError(job.id, deleted || !existing);
  return { ...job, storageRevision: revisionOf(job) + 1 } as Job;
}

/** History is immutable evidence: delete the owning system/job to remove its retained evidence. */
function historicalPhotoIds(job: Job | undefined): string[] {
  if (!Array.isArray(job?.findingHistory)) return [];
  return job.findingHistory.flatMap(f => Array.isArray(f?.photoIds) ? f.photoIds.filter((id): id is string => typeof id === "string" && id.length > 0) : []);
}
export function checkPhotoChanges(existing: Job | undefined, next: Job, writes: readonly PhotoWrite[]) {
  const ids = new Set(next.photos.map(p => p.id));
  for (const write of writes) {
    if (!ids.has(write.id)) throw new Error("A photo must have matching job metadata.");
    if (historicalPhotoIds(existing).includes(write.id)) throw new Error("This photo is retained by a previous finding. Add a new photo instead of changing historical evidence.");
  }
  for (const photo of existing?.photos ?? []) {
    if (!ids.has(photo.id) && historicalPhotoIds(next).includes(photo.id)) throw new Error("This photo is retained by a previous finding. Delete its system or job to remove that history.");
  }
}

/** Includes legacy history-only evidence so full deletion also cleans previously orphaned blobs. */
export function ownedPhotoIds(job: Job | undefined): Set<string> {
  return new Set([...(job?.photos ?? []).map(p => p.id), ...historicalPhotoIds(job)]);
}

/** Every job write is a revision-checked transaction, including photo additions/removals. */
export interface JobStore {
  readonly persistent: boolean;
  readonly storageWarning?: string;
  retryPersistentStorage?(): Promise<void>;
  getRecovery(key: string): Promise<JobRecovery | null>;
  putRecovery(key: string, recovery: JobRecovery): Promise<void>;
  deleteRecovery(key: string): Promise<void>;
  list(): Promise<JobSummary[]>;
  get(id: string): Promise<Job | null>;
  /** Returns the committed revision. Callers must use it as the base of their next edit. */
  put(job: Job, photos?: readonly PhotoWrite[]): Promise<Job>;
  putJobAndPhoto(job: Job, photoId: string, blob: Blob): Promise<Job>;
  delete(id: string, expectedRevision?: number): Promise<void>;
  /** Legacy/import helpers; interactive changes use put with metadata in the same transaction. */
  putPhoto(id: string, blob: Blob): Promise<void>;
  getPhoto(id: string): Promise<Blob | null>;
  deletePhoto(id: string): Promise<void>;
}

export class MemoryJobStore implements JobStore {
  readonly persistent: boolean;
  private jobs = new Map<string, Job>();
  private photos = new Map<string, Blob>();
  private owners = new Map<string, string>();
  private deleted = new Set<string>();
  private recoveries = new Map<string, JobRecovery>();

  constructor(persistent = false) { this.persistent = persistent; }
  async getRecovery(key: string) { const value = this.recoveries.get(key); return value ? structuredClone(value) : null; }
  async putRecovery(key: string, recovery: JobRecovery) { this.recoveries.set(key, structuredClone(recovery)); }
  async deleteRecovery(key: string) { this.recoveries.delete(key); }
  async list() { return [...this.jobs.values()].map(summarizeJob).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)); }
  async get(id: string) {
    const job = this.jobs.get(id);
    return job ? normalizeJobExtensions(structuredClone(job)) : null;
  }
  async put(job: Job, writes: readonly PhotoWrite[] = []): Promise<Job> {
    const existing = this.jobs.get(job.id);
    const next = structuredClone(nextRevision(job, existing, this.deleted.has(job.id)));
    checkPhotoChanges(existing, next, writes);
    const retained = ownedPhotoIds(next);
    for (const id of retained) {
      const owner = this.owners.get(id);
      if (owner && owner !== job.id) throw new Error("A photo cannot belong to two jobs.");
    }
    // Validate everything before changing either map.
    const previous = new Set([...ownedPhotoIds(existing), ...[...this.owners].filter(([, owner]) => owner === job.id).map(([id]) => id)]);
    for (const id of previous) if (!retained.has(id)) { this.photos.delete(id); this.owners.delete(id); }
    for (const id of retained) this.owners.set(id, job.id);
    for (const { id, blob } of writes) this.photos.set(id, blob);
    this.jobs.set(job.id, next);
    return structuredClone(next);
  }
  putJobAndPhoto(job: Job, photoId: string, blob: Blob) { return this.put(job, [{ id: photoId, blob }]); }
  async delete(id: string, expectedRevision?: number) {
    const existing = this.jobs.get(id);
    if (expectedRevision !== undefined && (!existing || revisionOf(existing) !== expectedRevision)) throw new JobConflictError(id, !existing);
    const ids = new Set([...ownedPhotoIds(this.jobs.get(id)), ...[...this.owners].filter(([, owner]) => owner === id).map(([photoId]) => photoId)]);
    this.jobs.delete(id);
    for (const [key, recovery] of this.recoveries) if (recovery.job.id === id) this.recoveries.delete(key);
    this.deleted.add(id); // A stale tab must never resurrect a deleted job, including legacy rev 0.
    for (const photoId of ids) { this.photos.delete(photoId); this.owners.delete(photoId); }
  }
  async putPhoto(id: string, blob: Blob) { this.photos.set(id, blob); }
  async getPhoto(id: string) { return this.photos.get(id) ?? null; }
  async deletePhoto(id: string) { this.photos.delete(id); }
}
