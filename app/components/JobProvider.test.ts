import { beforeEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { MemoryJobStore } from "../lib/job/store";
import { createJob } from "../lib/job/types";
import { makeFinding } from "../lib/job/fixtures";
import { JobProvider, type JobApi } from "./JobProvider";

// No DOM dependency: exercise real provider callbacks/store; only the hook host is replaced.
const host = vi.hoisted(() => ({ effects: [] as Array<() => unknown>, pending: [] as Array<(previous: unknown) => unknown>, states: [] as unknown[] }));
vi.mock("react", async importOriginal => ({
  ...await importOriginal<typeof import("react")>(),
  useMemo: (fn: () => unknown) => fn(),
  useCallback: (fn: unknown) => fn,
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (fn: () => unknown) => { host.effects.push(fn); },
  useState: (initial: unknown) => [initial, (value: unknown) => { if (typeof value === "function") host.pending.push(value as (previous: unknown) => unknown); else host.states.push(value); }],
}));
vi.mock("../lib/photoCompress", () => ({ MAX_PHOTOS_PER_SYSTEM: 12, compressImage: async (blob: Blob) => blob }));
vi.mock("../lib/job/persistenceStatus", () => ({ setPersistenceState: vi.fn() }));

async function opened(store: MemoryJobStore) {
  // Vitest's standalone TSX transform may use classic JSX, unlike Next's automatic runtime.
  vi.stubGlobal("React", React);
  const element = JobProvider({ jobId: "j", children: null, store });
  host.effects[0]();
  await Promise.resolve();
  host.pending = [];
  return element.props.value as JobApi;
}
const now = "2026-10-04T00:00:00.000Z";
function base() {
  const job = createJob("x", now, { jobId: "j", systemId: "s" });
  job.photos = [{ id: "p", systemId: "s", caption: "", bytes: 3, mime: "image/jpeg", createdAt: now }];
  return job;
}
beforeEach(() => { host.effects = []; host.pending = []; host.states = []; vi.restoreAllMocks(); });

describe("provider save boundaries", () => {
  it.each([undefined, [], ["missing"], ["foreign"], ["other-system"]].map(photoIds => ({ photoIds })))("saveFinding rejects absent or unowned safety attachments $photoIds", async ({ photoIds }) => {
    const store = new MemoryJobStore(true);
    const job = base();
    job.photos.push({ ...job.photos[0], id: "other-system", systemId: "other" });
    await store.put(job);
    const api = await opened(store);
    const finding = makeFinding({ scope: { kind: "system", systemId: "s" }, severity: "safety", safetyAction: "Stopped", requiresPhotoForSafety: true, photoIds });
    expect(api.saveFinding(finding).ok).toBe(false);
    expect(host.pending).toHaveLength(0);
  });
  it("queues a pagehide save behind annotation commit so old metadata cannot overwrite it", async () => {
    const store = new MemoryJobStore(true);
    const job = base();
    await store.put(job);
    await store.putPhoto("p", new Blob(["old"]));
    const api = await opened(store);
    let flush: (() => void) | undefined;
    vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("window", { addEventListener: (event: string, fn: () => void) => { if (event === "pagehide") flush = fn; }, removeEventListener: vi.fn() });
    host.effects[2]();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const original = store.putJobAndPhoto.bind(store);
    vi.spyOn(store, "putJobAndPhoto").mockImplementation(async (...args) => { await gate; await original(...args); });
    const normalWrite = vi.spyOn(store, "put");
    const saving = api.replacePhotoBlob("p", new Blob(["newdata"]));
    await Promise.resolve();
    await Promise.resolve();
    api.dispatch({ type: "setHomeNotes", notes: "Edited during annotation" });
    host.pending.pop()!(job);
    flush!();
    try { expect(normalWrite).not.toHaveBeenCalled(); }
    finally { release(); }
    await saving;
    await Promise.resolve();
    await Promise.resolve();
    expect((await store.get("j"))?.photos[0].bytes).toBe(7);
    expect((await store.get("j"))?.homeNotes).toBe("Edited during annotation");
  });
  it("does not report annotation success when the job-and-photo write fails; retry commits both", async () => {
    const store = new MemoryJobStore(true);
    const job = base();
    await store.put(job);
    await store.putPhoto("p", new Blob(["old"]));
    const api = await opened(store);
    const write = vi.spyOn(store, "putJobAndPhoto").mockRejectedValueOnce(new Error("jobs write failed"));
    await expect(api.replacePhotoBlob("p", new Blob(["newdata"], { type: "image/png" }))).rejects.toThrow("jobs write failed");
    expect(await store.get("j")).toEqual(job);
    expect((await store.getPhoto("p"))?.size).toBe(3);
    expect(host.pending).toHaveLength(0);
    await api.replacePhotoBlob("p", new Blob(["newdata"], { type: "image/png" }));
    expect(write).toHaveBeenCalledTimes(2);
    expect((await store.get("j"))?.photos[0]).toMatchObject({ bytes: 7, mime: "image/png" });
    expect((await store.getPhoto("p"))?.size).toBe(7);
  });
});
