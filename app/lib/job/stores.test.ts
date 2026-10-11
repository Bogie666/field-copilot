import "fake-indexeddb/auto";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { IndexedDbJobStore } from "./indexedDbStore";
import { makeFinding } from "./fixtures";
import { JobConflictError, MemoryJobStore, type JobStore } from "./store";
import { jobReducer } from "./reducer";
import { createJob, normalizeJobExtensions } from "./types";
import { composeExplanationInput } from "./compose";

const now = "2026-10-04T00:00:00.000Z";
const scope = { kind: "system", systemId: "s", componentId: "s:condenser" } as const;
const base = (id = "a") => createJob("x", now, { jobId: id, systemId: "s" });
const photo = (id = "p", systemId = "s") => ({ id, systemId, componentId: `${systemId}:condenser`, caption: "", bytes: 3, mime: "image/jpeg", createdAt: now });
const makers: Array<[string, () => JobStore]> = [
  ["memory", () => new MemoryJobStore(true)],
  ["indexeddb", () => new IndexedDbJobStore(new IDBFactory())],
];

describe.each(makers)("%s job store", (_name, make) => {
  it("round-trips drafts, stale evidence and previous confirmations without affecting another job", async () => {
    const store = make();
    let job = jobReducer(base(), { type: "upsertFinding", finding: makeFinding({ scope }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s", componentId: scope.componentId, equipment: { rla: "15" }, now });
    job = await store.put(job);
    const stale = job;
    expect((await store.get("a"))?.findings[0].staleAt).toBe(now);
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope, title: "Rechecked" }), now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope, inputs: { lineVoltage: "2" }, now });
    job = await store.put(job);
    await store.put(base("b"));
    expect(await store.get("a")).toEqual(normalizeJobExtensions(job));
    expect((await store.get("a"))?.findingHistory?.[0]).toEqual(stale.findings[0]);
    expect((await store.get("b"))?.drafts).toBeUndefined();
  });
  it.each(["missing", "wrong-system", "home-photo"])("marks legacy orphan safety evidence stale on hydration: %s", async photoId => {
    const store = make(), job = base();
    job.photos = [photo("wrong-system", "other"), { ...photo("home-photo"), systemId: null, componentId: undefined }];
    job.findings = [makeFinding({ scope, severity: "safety", safetyAction: "Stopped", requiresPhotoForSafety: true, photoIds: [photoId] })];
    await store.put(job);
    const loaded = await store.get("a");
    expect(loaded?.findings[0].staleReason).toMatch(/photo/i);
    expect(composeExplanationInput(loaded!.findings).input).toBeNull();
    expect(loaded?.findings[0].photoIds).toEqual([photoId]);
  });
  it("ignores malformed extensions on hydration", async () => {
    const store = make(), job = base(), valid = makeFinding({ scope });
    const saved = await store.put({ ...job, drafts: [null, {}, { toolId: "furnace", scope: { kind: "system", systemId: "foreign" }, slot: "review", inputs: {}, updatedAt: now }], findingHistory: [null, {}, { ...valid, recommendation: {} }, valid] } as unknown as typeof job);
    const loaded = await store.get("a");
    expect(loaded?.drafts).toEqual([]);
    expect(loaded?.findingHistory).toEqual([valid]);
    await store.put({ ...saved, drafts: "broken", findingHistory: {} } as unknown as typeof job);
    expect((await store.get("a"))?.drafts).toEqual([]);
    expect((await store.get("a"))?.findingHistory).toEqual([]);
  });
  it("lists newest first and returns explicit committed revisions", async () => {
    const store = make();
    const older = await store.put(base());
    const newer = await store.put({ ...base("b"), updatedAt: "2026-10-05T00:00:00.000Z", findings: [makeFinding({ scope })] });
    expect(older.storageRevision).toBe(1);
    expect((await store.list()).map(j => j.id)).toEqual(["b", "a"]);
    expect((await store.list())[0].findingCount).toBe(1);
    expect(await store.get("b")).toEqual(newer);
    expect(await store.get("missing")).toBeNull();
  });
  it("rejects two simultaneous snapshot updates rather than clobbering a winner", async () => {
    const store = make(), initial = await store.put(base());
    const results = await Promise.allSettled([store.put({ ...initial, label: "Tab A" }), store.put({ ...initial, homeNotes: "Tab B" })]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(r => r.status === "rejected")[0]).toMatchObject({ reason: expect.any(JobConflictError) });
    expect((await store.get("a"))?.storageRevision).toBe(2);
    expect((await store.get("a"))?.label).toBe("Tab A");
    expect((await store.get("a"))?.homeNotes).toBe("");
  });
  it("rejects a stale deletion confirmation without deleting newer work", async () => {
    const store = make(), job = await store.put(base());
    const newer = await store.put({ ...job, label: "Updated visit" });
    await expect(store.delete("a", job.storageRevision)).rejects.toBeInstanceOf(JobConflictError);
    expect((await store.get("a"))?.label).toBe("Updated visit");
    await store.delete("a", newer.storageRevision);
    expect(await store.get("a")).toBeNull();
  });
  it("sanitizes malformed history at the raw store boundary before photo edits", async () => {
    const store = make();
    let job = await store.put({ ...base(), photos: [photo()], findingHistory: "broken" } as unknown as ReturnType<typeof base>);
    job = await store.putJobAndPhoto({ ...job, photos: [{ ...photo(), bytes: 7 }] }, "p", new Blob(["newdata"]));
    expect((await store.getPhoto("p"))?.size).toBe(7);
    await store.put({ ...job, findingHistory: [{ photoIds: { bad: true } }, { photoIds: [null, {}, "legacy"] }] } as unknown as typeof job);
    await store.delete("a");
  });
  it("never resurrects a deleted job from a stale or legacy revision", async () => {
    const store = make(), legacy = base(), saved = await store.put(legacy);
    await store.delete("a");
    await expect(store.put(saved)).rejects.toMatchObject({ name: "JobConflictError", deleted: true });
    await expect(store.put(legacy)).rejects.toMatchObject({ name: "JobConflictError", deleted: true });
    expect(await store.get("a")).toBeNull();
  });
  it("atomically adds, updates and removes photo blobs with metadata", async () => {
    const store = make();
    let job = await store.put(base());
    job = await store.putJobAndPhoto({ ...job, photos: [photo()] }, "p", new Blob(["old"]));
    expect((await store.getPhoto("p"))?.size).toBe(3);
    job = await store.putJobAndPhoto({ ...job, photos: [{ ...photo(), bytes: 7 }] }, "p", new Blob(["newdata"]));
    expect(await store.get("a")).toEqual(job);
    expect((await store.getPhoto("p"))?.size).toBe(7);
    job = await store.put({ ...job, photos: [] });
    expect((await store.get("a"))?.photos).toEqual([]);
    expect(await store.getPhoto("p")).toBeNull();
  });
  it("does not alter a blob when stale metadata conflicts", async () => {
    const store = make();
    const job = await store.putJobAndPhoto({ ...base(), photos: [photo()] }, "p", new Blob(["old"]));
    await store.put({ ...job, label: "Newer" });
    await expect(store.putJobAndPhoto({ ...job, photos: [{ ...photo(), bytes: 7 }] }, "p", new Blob(["newdata"]))).rejects.toBeInstanceOf(JobConflictError);
    expect((await store.getPhoto("p"))?.size).toBe(3);
    expect((await store.get("a"))?.label).toBe("Newer");
  });
  it("rolls back photo changes when metadata cannot be cloned", async () => {
    const store = make();
    const job = await store.putJobAndPhoto({ ...base(), photos: [photo()] }, "p", new Blob(["old"]));
    const invalid = { ...job, invalid: () => null };
    await expect(store.putJobAndPhoto(invalid, "p", new Blob(["newdata"]))).rejects.toThrow();
    expect(await store.get("a")).toEqual(job);
    expect((await store.getPhoto("p"))?.size).toBe(3);
  });
  it("protects historical evidence but removes all system evidence on explicit system deletion", async () => {
    const store = make();
    let job = jobReducer(base(), { type: "addSystem", id: "other", name: "Other", now });
    job.photos = [photo(), photo("q", "other")];
    job.findingHistory = [makeFinding({ scope, photoIds: ["p"] })];
    job = await store.put(job, [{ id: "p", blob: new Blob(["old"]) }, { id: "q", blob: new Blob(["xyz"]) }]);
    await expect(store.put({ ...job, photos: [photo("q", "other")] })).rejects.toThrow(/previous finding/);
    await expect(store.putJobAndPhoto(job, "p", new Blob(["new"]))).rejects.toThrow(/previous finding/);
    job = jobReducer(job, { type: "removeSystem", systemId: "s", now });
    await store.put(job);
    expect((await store.get("a"))?.findingHistory).toEqual([]);
    expect(await store.getPhoto("p")).toBeNull();
    expect(await store.getPhoto("q")).not.toBeNull();
    await store.delete("a");
    expect(await store.getPhoto("q")).toBeNull();
  });
  it("cleans history-only legacy blobs and saved recovery records on full deletion", async () => {
    const store = make(), job = base();
    job.findingHistory = [makeFinding({ scope, photoIds: ["orphan"] })];
    const saved = await store.put(job);
    await store.putPhoto("orphan", new Blob(["orphan"]));
    await store.putRecovery("tab:a", { job: saved, proposedJob: saved, error: "Conflict", conflict: true, recordedAt: now });
    await store.delete("a");
    expect(await store.getPhoto("orphan")).toBeNull();
    expect(await store.getRecovery("tab:a")).toBeNull();
  });
  it("rejects sharing another job's photo ownership", async () => {
    const store = make();
    await store.putJobAndPhoto({ ...base(), photos: [photo()] }, "p", new Blob(["abc"]));
    await expect(store.put({ ...base("b"), photos: [photo()] })).rejects.toThrow(/two jobs/);
    expect(await store.get("b")).toBeNull();
  });
});

it.each(["add", "replace", "remove", "delete"])("IndexedDB %s rolls back metadata and blobs on transaction abort and permits retry", async operation => {
  const store = new IndexedDbJobStore(new IDBFactory());
  const job = await store.putJobAndPhoto({ ...base(), photos: [photo()] }, "p", new Blob(["old"]));
  const act = () => operation === "delete" ? store.delete("a") : operation === "remove" ? store.put({ ...job, photos: [] }) : store.putJobAndPhoto({ ...job, photos: operation === "add" ? [...job.photos, photo("new")] : [{ ...photo(), bytes: 7 }] }, operation === "add" ? "new" : "p", new Blob(["newdata"]));
  const method = operation === "delete" ? "delete" : "put";
  const original = IDBObjectStore.prototype[method];
  const failure = vi.spyOn(IDBObjectStore.prototype, method).mockImplementation(function(this: IDBObjectStore, ...args: unknown[]) {
    const result = Reflect.apply(original, this, args);
    if (this.name === "jobs") this.transaction.abort();
    return result;
  });
  try { await expect(act()).rejects.toThrow(); } finally { failure.mockRestore(); }
  expect(await store.get("a")).toEqual(job);
  expect((await store.getPhoto("p"))?.size).toBe(3);
  expect(await store.getPhoto("new")).toBeNull();
  await act();
  if (operation === "delete" || operation === "remove") expect(await store.getPhoto("p")).toBeNull();
  else expect((await store.getPhoto(operation === "add" ? "new" : "p"))?.size).toBe(7);
});

it("upgrades v1 jobs without changing data and cleans migrated historical photo ownership", async () => {
  const factory = new IDBFactory();
  const legacy = base();
  delete legacy.systems[0].components;
  legacy.findingHistory = [makeFinding({ scope: { kind: "system", systemId: "removed" }, photoIds: ["orphan"] }), { photoIds: { bad: true } }] as typeof legacy.findingHistory;
  await new Promise<void>((resolve, reject) => {
    const open = factory.open("field-copilot", 1);
    open.onupgradeneeded = () => { open.result.createObjectStore("jobs", { keyPath: "id" }); open.result.createObjectStore("photos"); };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, tx = db.transaction(["jobs", "photos"], "readwrite");
      tx.objectStore("jobs").put(legacy); tx.objectStore("photos").put(new Blob(["old"]), "orphan");
      tx.oncomplete = () => { db.close(); resolve(); };
    };
  });
  const store = new IndexedDbJobStore(factory);
  const loaded = (await store.get("a"))!;
  expect(loaded.storageRevision).toBeUndefined();
  const saved = await store.put({ ...loaded, label: "Upgraded" });
  expect(saved.storageRevision).toBe(1);
  await store.delete("a");
  expect(await store.getPhoto("orphan")).toBeNull();
});
