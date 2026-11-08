import { describe, expect, it } from "vitest";
import type { PersonalNote } from "../notesStore";
import { buildBackup, parseBackup, restoreBackup, type NotesBackend } from "./backup";
import { makeFinding } from "./fixtures";
import { MemoryJobStore } from "./store";
import { createJob } from "./types";

const now = "2026-11-08T00:00:00.000Z";
const scope = { kind: "system", systemId: "s", componentId: "s:condenser" } as const;
const photoMeta = (id: string) => ({ id, systemId: "s", componentId: "s:condenser", caption: "", bytes: 3, mime: "image/jpeg", createdAt: now });

class MemoryNotes implements NotesBackend {
  notes = new Map<string, PersonalNote>();
  async list() { return [...this.notes.values()]; }
  async get(id: string) { return this.notes.get(id) ?? null; }
  async put(note: PersonalNote) { this.notes.set(note.id, note); }
}
const note = (id: string): PersonalNote => ({ id, title: "t", body: "b", inkPng: "", pinned: false, createdAt: now, updatedAt: now, source: "typed" });

async function seeded() {
  const store = new MemoryJobStore(true);
  const job = createJob("Oak Lane", now, { jobId: "a", systemId: "s" });
  job.photos = [photoMeta("p1")];
  job.findings = [makeFinding({ scope, photoIds: ["p1"] })];
  await store.put(job, [{ id: "p1", blob: new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }) }]);
  await store.put(createJob("Elm St", now, { jobId: "b", systemId: "s" }));
  const notes = new MemoryNotes();
  await notes.put(note("n1"));
  return { store, notes };
}

describe("backup", () => {
  it("round-trips jobs, photos and notes into an empty device", async () => {
    const { store, notes } = await seeded();
    const { backup, missingPhotos } = await buildBackup(store, notes, now);
    expect(missingPhotos).toBe(0);
    const parsed = parseBackup(JSON.stringify(backup));
    expect("backup" in parsed).toBe(true);
    if (!("backup" in parsed)) return;
    const target = new MemoryJobStore(true);
    const targetNotes = new MemoryNotes();
    const report = await restoreBackup(parsed.backup, target, targetNotes);
    expect(report).toMatchObject({ jobsAdded: 2, jobsKept: 0, photosAdded: 1, notesAdded: 1 });
    expect((await target.get("a"))?.findings[0].photoIds).toEqual(["p1"]);
    const blob = await target.getPhoto("p1");
    expect(new Uint8Array(await blob!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(await targetNotes.get("n1")).toEqual(note("n1"));
  });

  it("never overwrites a job or note already on the device", async () => {
    const { store, notes } = await seeded();
    const { backup } = await buildBackup(store, notes, now);
    const device = new MemoryJobStore(true);
    await device.put(createJob("Device copy", now, { jobId: "a", systemId: "s" }));
    const deviceNotes = new MemoryNotes();
    await deviceNotes.put({ ...note("n1"), body: "device" });
    const report = await restoreBackup(backup, device, deviceNotes);
    expect(report).toMatchObject({ jobsAdded: 1, jobsKept: 1, notesKept: 1, notesAdded: 0 });
    expect((await device.get("a"))?.label).toBe("Device copy");
    expect((await deviceNotes.get("n1"))?.body).toBe("device");
  });

  it("rejects foreign or damaged files and skips invalid records", async () => {
    expect(parseBackup("nope")).toHaveProperty("error");
    expect(parseBackup(JSON.stringify({ format: "other" }))).toHaveProperty("error");
    expect(parseBackup(JSON.stringify({ format: "field-copilot-backup", version: 99, jobs: [], photos: [], notes: [] }))).toHaveProperty("error");
    const report = await restoreBackup({ format: "field-copilot-backup", version: 1, exportedAt: now, jobs: [{ id: "x" } as never], photos: [], notes: [{ id: "n" } as never] }, new MemoryJobStore(true), new MemoryNotes());
    expect(report).toMatchObject({ jobsInvalid: 1, notesInvalid: 1, jobsAdded: 0 });
  });
});
