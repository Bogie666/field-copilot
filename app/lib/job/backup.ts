import type { PersonalNote } from "../notesStore";
import { validatePersonalNote } from "../notesStore";
import { ownedPhotoIds, type JobStore } from "./store";
import { normalizeJobExtensions, validateFinding, type Job } from "./types";

// A device backup: every job (with photo files) and personal note, in one JSON file.
// Restoring adds what is missing and never overwrites a record already on the device.

export const BACKUP_FORMAT = "field-copilot-backup";
export const BACKUP_VERSION = 1;
const MAX_JOBS = 2000;
const MAX_PHOTO_BYTES = 15_000_000;

export type BackupPhoto = { id: string; jobId: string; mime: string; data: string };
export type Backup = { format: typeof BACKUP_FORMAT; version: number; exportedAt: string; jobs: Job[]; photos: BackupPhoto[]; notes: PersonalNote[] };

export type NotesBackend = { list(): Promise<PersonalNote[]>; get(id: string): Promise<PersonalNote | null>; put(note: PersonalNote): Promise<void> };

export type RestoreReport = { jobsAdded: number; jobsKept: number; jobsInvalid: number; photosAdded: number; photosMissing: number; notesAdded: number; notesKept: number; notesInvalid: number };

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBlob(data: string, mime: string): Blob {
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function buildBackup(store: JobStore, notes: NotesBackend | null, now = new Date().toISOString()): Promise<{ backup: Backup; missingPhotos: number }> {
  const jobs: Job[] = [];
  const photos: BackupPhoto[] = [];
  let missingPhotos = 0;
  for (const summary of await store.list()) {
    const job = await store.get(summary.id);
    if (!job) continue;
    jobs.push(job);
    for (const id of ownedPhotoIds(job)) {
      const blob = await store.getPhoto(id);
      if (!blob) { missingPhotos += 1; continue; }
      const meta = job.photos.find((p) => p.id === id);
      photos.push({ id, jobId: job.id, mime: meta?.mime || blob.type || "image/jpeg", data: await blobToBase64(blob) });
    }
  }
  const noteList = notes ? await notes.list() : [];
  return { backup: { format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now, jobs, photos, notes: noteList }, missingPhotos };
}

export function backupFileName(now = new Date()): string {
  return `field-copilot-backup-${now.toISOString().slice(0, 10)}.json`;
}

/** Structural check of an untrusted job record before it may be stored. */
export function validateBackupJob(value: unknown): Job | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const j = value as Partial<Job>;
  if (typeof j.id !== "string" || !/^[\w:-]{1,80}$/.test(j.id) || typeof j.label !== "string" || j.label.length > 500) return null;
  if (typeof j.createdAt !== "string" || Number.isNaN(Date.parse(j.createdAt)) || typeof j.updatedAt !== "string" || Number.isNaN(Date.parse(j.updatedAt))) return null;
  if (!Array.isArray(j.systems) || j.systems.length === 0 || !Array.isArray(j.findings) || !Array.isArray(j.photos) || typeof j.homeNotes !== "string") return null;
  if (j.systems.some((s) => !s || typeof s !== "object" || typeof s.id !== "string" || !s.id || typeof s.name !== "string" || !s.equipment || typeof s.equipment !== "object" || typeof s.equipmentAge !== "string" || typeof s.notes !== "string")) return null;
  if (j.photos.some((p) => !p || typeof p !== "object" || typeof p.id !== "string" || !p.id || typeof p.mime !== "string" || !p.mime.startsWith("image/") || typeof p.createdAt !== "string")) return null;
  let job: Job;
  try {
    job = normalizeJobExtensions({ ...(j as Job), storageRevision: 0 });
  } catch {
    return null;
  }
  if (job.findings.some((f) => validateFinding(f, job).length > 0)) return null;
  return job;
}

export function parseBackup(text: string): { backup: Backup } | { error: string } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { return { error: "This file is not a Field Copilot backup (it is not valid JSON)." }; }
  const b = data as Partial<Backup>;
  if (!b || typeof b !== "object" || b.format !== BACKUP_FORMAT) return { error: "This file is not a Field Copilot backup." };
  if (typeof b.version !== "number" || b.version > BACKUP_VERSION) return { error: "This backup was made by a newer version of the app. Update the app and try again." };
  if (!Array.isArray(b.jobs) || !Array.isArray(b.photos) || !Array.isArray(b.notes) || b.jobs.length > MAX_JOBS) return { error: "This backup file is damaged or incomplete." };
  return { backup: b as Backup };
}

export async function restoreBackup(backup: Backup, store: JobStore, notes: NotesBackend | null): Promise<RestoreReport> {
  const report: RestoreReport = { jobsAdded: 0, jobsKept: 0, jobsInvalid: 0, photosAdded: 0, photosMissing: 0, notesAdded: 0, notesKept: 0, notesInvalid: 0 };
  const photosByJob = new Map<string, BackupPhoto[]>();
  for (const photo of backup.photos) {
    if (!photo || typeof photo.id !== "string" || typeof photo.jobId !== "string" || typeof photo.data !== "string" || typeof photo.mime !== "string" || !photo.mime.startsWith("image/")) continue;
    if (photo.data.length > (MAX_PHOTO_BYTES * 4) / 3) continue;
    photosByJob.set(photo.jobId, [...(photosByJob.get(photo.jobId) ?? []), photo]);
  }
  for (const raw of backup.jobs) {
    const job = validateBackupJob(raw);
    if (!job) { report.jobsInvalid += 1; continue; }
    if (await store.get(job.id)) { report.jobsKept += 1; continue; }
    const available = new Map((photosByJob.get(job.id) ?? []).map((p) => [p.id, p]));
    const owned = ownedPhotoIds(job);
    const current = new Set(job.photos.map((p) => p.id));
    const writes: Array<{ id: string; blob: Blob }> = [];
    const historyOnly: Array<{ id: string; blob: Blob }> = [];
    for (const id of owned) {
      const photo = available.get(id);
      if (!photo) { report.photosMissing += 1; continue; }
      let blob: Blob;
      try { blob = base64ToBlob(photo.data, photo.mime); } catch { report.photosMissing += 1; continue; }
      (current.has(id) ? writes : historyOnly).push({ id, blob });
    }
    await store.put(job, writes);
    for (const photo of historyOnly) await store.putPhoto(photo.id, photo.blob);
    report.jobsAdded += 1;
    report.photosAdded += writes.length + historyOnly.length;
  }
  if (notes) {
    for (const note of backup.notes) {
      if (!note || typeof note !== "object" || validatePersonalNote(note).length) { report.notesInvalid += 1; continue; }
      if (await notes.get(note.id)) { report.notesKept += 1; continue; }
      await notes.put(note);
      report.notesAdded += 1;
    }
  }
  return report;
}

export function describeRestore(r: RestoreReport): string {
  const parts = [`${r.jobsAdded} ${r.jobsAdded === 1 ? "job" : "jobs"} restored`];
  if (r.jobsKept) parts.push(`${r.jobsKept} already on this device (kept the device copy)`);
  if (r.photosAdded) parts.push(`${r.photosAdded} ${r.photosAdded === 1 ? "photo" : "photos"}`);
  if (r.notesAdded || r.notesKept) parts.push(`${r.notesAdded} ${r.notesAdded === 1 ? "note" : "notes"} restored${r.notesKept ? `, ${r.notesKept} already here` : ""}`);
  if (r.photosMissing) parts.push(`${r.photosMissing} photo ${r.photosMissing === 1 ? "file was" : "files were"} not in the backup`);
  if (r.jobsInvalid || r.notesInvalid) parts.push(`${r.jobsInvalid + r.notesInvalid} damaged ${r.jobsInvalid + r.notesInvalid === 1 ? "record" : "records"} skipped`);
  return `${parts.join(", ")}.`;
}
