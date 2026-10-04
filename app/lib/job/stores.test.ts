import "fake-indexeddb/auto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbJobStore } from "./indexedDbStore";
import { makeFinding } from "./fixtures";
import { MemoryJobStore, type JobStore } from "./store";
import { jobReducer } from "./reducer";
import { createJob } from "./types";
import { composeExplanationInput } from "./compose";

it("rolls back the annotation blob when the jobs store aborts, then retries successfully", async () => {
  const store = new IndexedDbJobStore(new IDBFactory());
  const job = createJob("x", "2026-10-04T00:00:00.000Z", { jobId: "a", systemId: "s" });
  job.photos = [{ id: "p", systemId: "s", caption: "", bytes: 3, mime: "image/jpeg", createdAt: job.createdAt }];
  await store.put(job);
  await store.putPhoto("p", new Blob(["old"]));
  const next = { ...job, photos: job.photos.map(p => ({ ...p, bytes: 7 })) };
  const original = IDBObjectStore.prototype.put;
  const failure = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(function(this: IDBObjectStore, value, key) {
    const request = original.call(this, value, key);
    if (this.name === "jobs") this.transaction.abort();
    return request;
  });
  try { await expect(store.putJobAndPhoto(next, "p", new Blob(["newdata"]))).rejects.toThrow(); }
  finally { failure.mockRestore(); }
  expect(await store.get("a")).toEqual(job);
  expect((await store.getPhoto("p"))?.size).toBe(3);
  await store.putJobAndPhoto(next, "p", new Blob(["newdata"]));
  expect(await store.get("a")).toEqual(next);
  expect((await store.getPhoto("p"))?.size).toBe(7);
});

const makers: Array<[string, () => JobStore]> = [
  ["memory", () => new MemoryJobStore(true)],
  ["indexeddb", () => new IndexedDbJobStore(new IDBFactory())],
];

describe.each(makers)("%s job store", (_name, make) => {
  it("round-trips drafts, stale evidence and previous confirmations without affecting another job", async () => {
    const store = make();
    const now = "2026-10-04T00:00:00.000Z";
    const scope = { kind: "system", systemId: "s" } as const;
    let job = createJob("test", now, { jobId: "a", systemId: "s" });
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s", equipment: { rla: "15" }, now });
    const stale = job;
    await store.put(stale);
    expect((await store.get("a"))?.findings[0].staleAt).toBe(now);
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope, title: "Rechecked" }), now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope, inputs: { lineVoltage: "2" }, now });
    await store.put(job);
    const other = createJob("other", now, { jobId: "b", systemId: "s" });
    await store.put(other);
    expect(await store.get("a")).toEqual(job);
    expect((await store.get("a"))?.findingHistory?.[0]).toEqual(stale.findings[0]);
    expect((await store.get("b"))?.drafts).toBeUndefined();
  });
  it.each(["missing", "wrong-system", "home-photo"])("marks legacy orphan safety evidence stale on hydration: %s", async (photoId) => {
    const store = make();
    const job = createJob("x", "2026-10-04T00:00:00.000Z", { jobId: "a", systemId: "s" });
    job.photos = [
      { id: "wrong-system", systemId: "other", caption: "", mime: "image/jpeg", bytes: 1, createdAt: job.createdAt },
      { id: "home-photo", systemId: null, caption: "", mime: "image/jpeg", bytes: 1, createdAt: job.createdAt },
    ];
    job.findings = [makeFinding({ scope: { kind: "system", systemId: "s" }, severity: "safety", safetyAction: "Stopped", requiresPhotoForSafety: true, photoIds: [photoId] })];
    await store.put(job);
    const loaded = await store.get("a");
    expect(loaded?.findings[0].staleReason).toMatch(/photo/i);
    expect(composeExplanationInput(loaded!.findings).input).toBeNull();
    expect(loaded?.findings[0].photoIds).toEqual([photoId]); // Historical record is retained, not promoted.
  });
  it("ignores malformed persisted drafts and history while retaining valid old-job data", async () => {
    const store = make();
    const job = createJob("x", "2026-10-04T00:00:00.000Z", { jobId: "a", systemId: "s" });
    const valid = makeFinding({ scope: { kind: "system", systemId: "s" } });
    await store.put({ ...job, drafts: [null, { toolId: "furnace", slot: "review", inputs: {}, updatedAt: job.updatedAt }, { toolId: "furnace", scope: { kind: "system", systemId: "foreign" }, slot: "review", inputs: {}, updatedAt: job.updatedAt }], findingHistory: [null, {}, { ...valid, recommendation: {} }, { ...valid, staleReason: {} }, valid] } as unknown as typeof job);
    const loaded = await store.get("a");
    expect(loaded?.drafts).toEqual([]);
    expect(loaded?.findingHistory).toEqual([valid]);
    await store.put({ ...job, drafts: "broken", findingHistory: {} } as unknown as typeof job);
    expect((await store.get("a"))?.drafts).toEqual([]);
    expect((await store.get("a"))?.findingHistory).toEqual([]);
  });
  it("round-trips a job and lists newest first", async () => {
    const store = make();
    const older = createJob("older", "2026-10-01T00:00:00.000Z", { jobId: "a", systemId: "s" });
    const newer = createJob("newer", "2026-10-02T00:00:00.000Z", { jobId: "b", systemId: "s" });
    newer.findings.push(makeFinding({ scope: { kind: "system", systemId: "s" } }));
    await store.put(older);
    await store.put(newer);
    expect((await store.list()).map((j) => j.id)).toEqual(["b", "a"]);
    expect((await store.list())[0].findingCount).toBe(1);
    expect(await store.get("b")).toEqual(newer);
    expect(await store.get("missing")).toBeNull();
  });

  it("overwrites on put and removes on delete, including photos", async () => {
    const store = make();
    const job = createJob("x", "2026-10-01T00:00:00.000Z", { jobId: "a", systemId: "s" });
    job.photos.push({ id: "p1", systemId: "s", caption: "", mime: "image/jpeg", bytes: 3, createdAt: job.createdAt });
    await store.put(job);
    await store.putPhoto("p1", new Blob(["abc"], { type: "image/jpeg" }));
    expect(await store.getPhoto("p1")).not.toBeNull();
    await store.put({ ...job, label: "renamed" });
    expect((await store.get("a"))!.label).toBe("renamed");
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
    expect(await store.getPhoto("p1")).toBeNull();
  });

  it("atomically replaces a photo with its job metadata", async () => {
    const store = make();
    const job = createJob("x", "2026-10-04T00:00:00.000Z", { jobId: "a", systemId: "s" });
    job.photos = [{ id: "p", systemId: "s", caption: "", bytes: 3, mime: "image/jpeg", createdAt: job.createdAt }];
    await store.put(job);
    await store.putPhoto("p", new Blob(["old"], { type: "image/jpeg" }));
    const next = { ...job, photos: job.photos.map(p => ({ ...p, bytes: 7 })) };
    await store.putJobAndPhoto(next, "p", new Blob(["newdata"], { type: "image/jpeg" }));
    expect(await store.get("a")).toEqual(next);
    expect((await store.getPhoto("p"))?.size).toBe(7);
  });
  it("keeps original photo and metadata when replacement job cannot be cloned", async () => {
    const store = make();
    const job = createJob("x", "2026-10-04T00:00:00.000Z", { jobId: "a", systemId: "s" });
    await store.put(job);
    await store.putPhoto("p", new Blob(["old"]));
    const invalid = { ...job, invalid: () => null };
    await expect(store.putJobAndPhoto(invalid, "p", new Blob(["newdata"]))).rejects.toThrow();
    expect(await store.get("a")).toEqual(job);
    expect((await store.getPhoto("p"))?.size).toBe(3);
  });
  it("deletes a single photo", async () => {
    const store = make();
    await store.putPhoto("p1", new Blob(["abc"]));
    await store.deletePhoto("p1");
    expect(await store.getPhoto("p1")).toBeNull();
  });
});
