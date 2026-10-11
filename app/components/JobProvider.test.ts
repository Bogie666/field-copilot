import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { MemoryJobStore } from "../lib/job/store";
import { getJobSession } from "../lib/job/jobSession";
import { createJob } from "../lib/job/types";
import { makeFinding } from "../lib/job/fixtures";
import { JobProvider, type JobApi } from "./JobProvider";

const host = vi.hoisted(() => ({ effects: [] as Array<() => unknown> }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (fn: () => unknown) => fn(), useCallback: (fn: unknown) => fn,
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (fn: () => unknown) => { host.effects.push(fn); },
  useState: (initial: unknown) => [typeof initial === "function" ? initial() : initial, () => undefined],
}));
vi.mock("../lib/photoCompress", () => ({ MAX_PHOTOS_PER_SYSTEM: 12, compressImage: async (blob: Blob) => blob }));
vi.mock("../lib/job/persistenceStatus", () => ({ setPersistenceState: vi.fn() }));
async function opened(store: MemoryJobStore) {
  vi.stubGlobal("React", React);
  const element = JobProvider({ jobId: "j", children: null, store });
  host.effects[0](); await getJobSession(store, "j").load();
  return element.props.value as JobApi;
}
const now = "2026-10-04T00:00:00.000Z";
const scope = { kind: "system", systemId: "s", componentId: "s:condenser" } as const;
function base() {
  const job = createJob("x", now, { jobId: "j", systemId: "s" });
  job.photos = [{ id: "p", systemId: "s", componentId: scope.componentId, caption: "", bytes: 3, mime: "image/jpeg", createdAt: now }];
  return job;
}
beforeEach(() => { host.effects = []; vi.restoreAllMocks(); });

describe("provider save boundaries", () => {
  it.each([undefined, [], ["missing"], ["foreign"], ["other-system"]].map(photoIds => ({ photoIds })))("rejects absent or unowned safety attachments $photoIds", async ({ photoIds }) => {
    const store = new MemoryJobStore(true), job = base(); job.photos.push({ ...job.photos[0], id: "other-system", systemId: "other" });
    await store.put(job); const api = await opened(store);
    expect((await api.saveFinding(makeFinding({ scope, severity: "safety", safetyAction: "Stopped", requiresPhotoForSafety: true, photoIds }))).ok).toBe(false);
  });
  it("does not report annotation success on failure; retry commits both blob and metadata", async () => {
    const store = new MemoryJobStore(true), job = await store.put(base()); await store.putPhoto("p", new Blob(["old"]));
    const api = await opened(store);
    const write = vi.spyOn(store, "putJobAndPhoto").mockRejectedValueOnce(new Error("jobs write failed"));
    await expect(api.replacePhotoBlob("p", new Blob(["newdata"], { type: "image/png" }))).rejects.toThrow("jobs write failed");
    expect(await store.get("j")).toEqual(job); expect((await store.getPhoto("p"))?.size).toBe(3);
    await api.replacePhotoBlob("p", new Blob(["newdata"], { type: "image/png" }));
    expect(write).toHaveBeenCalledTimes(2);
    expect((await store.get("j"))?.photos[0]).toMatchObject({ bytes: 7, mime: "image/png" });
  });
  it("adds metadata and blob together with component scope and rejects unknown components", async () => {
    const store = new MemoryJobStore(true); await store.put(base()); const api = await opened(store);
    const saved = await api.addPhoto(new Blob(["abc"]), "s", "Evidence", "s:furnace");
    expect(saved.ok).toBe(true);
    if (saved.ok) { expect((await store.get("j"))?.photos.find(p => p.id === saved.photo.id)?.componentId).toBe("s:furnace"); expect(await store.getPhoto(saved.photo.id)).not.toBeNull(); }
    expect((await api.addPhoto(new Blob(["abc"]), "s", "", "missing")).ok).toBe(false);
  });
  it("surfaces photo deletion failure without removing metadata or blob", async () => {
    const store = new MemoryJobStore(true); await store.put(base()); await store.putPhoto("p", new Blob(["old"])); const api = await opened(store);
    vi.spyOn(store, "put").mockRejectedValueOnce(new Error("Delete failed"));
    expect(await api.removePhoto("p")).toEqual({ ok: false, error: "Delete failed" });
    expect((await store.get("j"))?.photos).toHaveLength(1); expect(await store.getPhoto("p")).not.toBeNull();
    expect((await api.removePhoto("p")).ok).toBe(true); expect(await store.getPhoto("p")).toBeNull();
  });
  it("does not remove or replace historically referenced evidence", async () => {
    const store = new MemoryJobStore(true), job = base(); job.findingHistory = [makeFinding({ scope, photoIds: ["p"] })]; await store.put(job);
    const api = await opened(store);
    expect((await api.removePhoto("p")).error).toMatch(/previous finding/);
    await expect(api.replacePhotoBlob("p", new Blob(["new"]))).rejects.toThrow(/previous finding/);
  });
});
