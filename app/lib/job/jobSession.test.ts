import { describe, expect, it, vi } from "vitest";
import { BrowserJobStore } from "./browserStore";
import { JobSession, getJobSession, forgetJobSession } from "./jobSession";
import { MemoryJobStore } from "./store";
import { createJob } from "./types";
import { makeFinding } from "./fixtures";

const now = "2026-10-11T00:00:00.000Z";
const scope = { kind: "system", systemId: "s", componentId: "s:condenser" } as const;
const base = () => createJob("Job", now, { jobId: "j", systemId: "s" });
async function setup(persistent = true) {
  const store = new MemoryJobStore(persistent);
  await store.put(base());
  const session = new JobSession(store, "j", "tab-a:j");
  await session.load();
  return { store, session };
}
const draft = (value: string, slot = "form") => ({ type: "setToolDraft", toolId: "electrical", scope, slot, inputs: { value }, now } as const);
function gate() { let release!: () => void; const pending = new Promise<void>(resolve => { release = resolve; }); return { pending, release }; }

describe("serialized job sessions", () => {
  it("retains edits when reopened in session-only storage and reports its actual guarantee", async () => {
    const { store, session } = await setup(false);
    expect(await session.change({ type: "setHomeNotes", notes: "Session notes", now })).toEqual({ ok: true, persistent: false });
    const reopened = new JobSession(store, "j", "tab-b:j"); await reopened.load();
    expect(reopened.getSnapshot().job?.homeNotes).toBe("Session notes");
  });
  it("does not publish an explicit finding or success before its commit", async () => {
    const { store, session } = await setup(); const delayed = gate();
    const original = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementation(async (...args) => { await delayed.pending; return original(...args); });
    let finished = false;
    const saving = session.apply({ type: "upsertFinding", finding: makeFinding({ scope }), now }).then(result => { finished = true; return result; });
    await Promise.resolve(); await Promise.resolve();
    expect(finished).toBe(false);
    expect(session.getSnapshot().saving).toBe(true);
    expect(session.getSnapshot().job?.findings).toEqual([]);
    delayed.release();
    expect(await saving).toEqual({ ok: true, persistent: true });
    expect(session.getSnapshot().job?.findings).toHaveLength(1);
  });
  it("retains failed explicit work for recovery and commits only after retry", async () => {
    const { store, session } = await setup();
    vi.spyOn(store, "put").mockRejectedValueOnce(new Error("Quota exceeded"));
    expect((await session.apply({ type: "upsertFinding", finding: makeFinding({ scope }), now })).ok).toBe(false);
    expect(session.getSnapshot().job?.findings).toEqual([]);
    expect(session.getRecoveryJob()?.findings).toHaveLength(1);
    expect((await store.getRecovery("tab-a:j"))?.proposedJob.findings).toHaveLength(1);
    expect((await session.retry()).ok).toBe(true);
    expect((await store.get("j"))?.findings).toHaveLength(1);
    expect(await store.getRecovery("tab-a:j")).toBeNull();
  });
  it("preserves newer same-tool form and review drafts during explicit save", async () => {
    const { store, session } = await setup();
    await session.change(draft("old")); await session.change(draft("old review", "review"));
    const delayed = gate(), original = store.put.bind(store);
    const spy = vi.spyOn(store, "put").mockImplementationOnce(async (...args) => { await delayed.pending; return original(...args); });
    const saving = session.apply({ type: "upsertFinding", finding: makeFinding({ scope }), now });
    await Promise.resolve(); await Promise.resolve();
    expect(spy).toHaveBeenCalledTimes(1);
    const editing = session.change(draft("new"));
    const review = session.change(draft("new review", "review"));
    delayed.release();
    await Promise.all([saving, editing, review]);
    expect((await store.get("j"))?.drafts?.map(d => d.inputs.value)).toEqual(["new", "new review"]);
    expect((await store.get("j"))?.findings).toHaveLength(1);
  });
  it("keeps later raw notes and committed tidy history together", async () => {
    const { store, session } = await setup();
    await session.change({ type: "setHomeNotes", notes: "original", now });
    const delayed = gate(), original = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementationOnce(async (...args) => { await delayed.pending; return original(...args); });
    const saving = session.apply({ type: "acceptTidiedNotes", scope: { kind: "home" }, original: "original", notes: "tidied", acceptedAt: now, now });
    await Promise.resolve(); await Promise.resolve();
    const editing = session.change({ type: "setHomeNotes", notes: "newer notes", now });
    delayed.release(); await Promise.all([saving, editing]);
    const job = await store.get("j");
    expect(job?.homeNotes).toBe("newer notes");
    expect(job?.notesTidyHistory?.[0]).toMatchObject({ original: "original", accepted: "tidied" });
  });
  it("does not restore original notes/history when a system is removed during tidy acceptance", async () => {
    const { store, session } = await setup();
    await session.change({ type: "addSystem", id: "other", name: "Other", now });
    await session.change({ type: "setSystemNotes", systemId: "s", componentId: scope.componentId, notes: "original", now });
    const delayed = gate(), original = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementationOnce(async (...args) => { await delayed.pending; return original(...args); });
    const saving = session.apply({ type: "acceptTidiedNotes", scope, original: "original", notes: "tidied", acceptedAt: now, now });
    await Promise.resolve(); await Promise.resolve();
    const removing = session.change({ type: "removeSystem", systemId: "s", now });
    delayed.release(); await Promise.all([saving, removing]);
    const job = await store.get("j");
    expect(job?.systems.map(system => system.id)).toEqual(["other"]);
    expect(job?.notesTidyHistory).toEqual([]);
    expect(JSON.stringify(job)).not.toContain("original");
  });
  it("only resets local editor identity after an explicit reload succeeds", async () => {
    const { store, session } = await setup();
    await session.change({ type: "setHomeNotes", notes: "saved", now });
    expect(session.getSnapshot().resetRevision).toBe(0);
    vi.spyOn(store, "get").mockRejectedValueOnce(new Error("Read failed"));
    await session.reload();
    expect(session.getSnapshot().resetRevision).toBe(0);
    await session.reload();
    expect(session.getSnapshot().resetRevision).toBe(1);
    expect(session.getSnapshot().job?.homeNotes).toBe("saved");
  });
  it("reports unchanged guarded actions as a failed save", async () => {
    const { session } = await setup();
    expect((await session.apply({ type: "acceptTidiedNotes", scope: { kind: "home" }, original: "not current", notes: "tidy", acceptedAt: now, now })).ok).toBe(false);
  });
  it("makes conflicting tabs recoverable without stale pagehide overwrites", async () => {
    const { store, session: a } = await setup(); const b = new JobSession(store, "j", "tab-b:j"); await b.load();
    await a.change({ type: "setLabel", label: "A saved", now });
    const result = await b.change({ type: "setHomeNotes", notes: "B unsaved", now });
    expect(result.ok).toBe(false);
    expect(b.getSnapshot()).toMatchObject({ conflict: true, unsaved: true });
    expect(b.getRecoveryJob()?.homeNotes).toBe("B unsaved");
    await a.flush(); await b.flush(); // visibilitychange/pagehide take this exact path.
    expect((await store.get("j"))?.label).toBe("A saved");
    expect((await store.get("j"))?.homeNotes).toBe("");
    const restarted = new JobSession(store, "j", "tab-b:j"); await restarted.load();
    expect(restarted.getSnapshot().conflict).toBe(true);
    expect(restarted.getSnapshot().job?.label).toBe("A saved");
    expect(restarted.getRecoveryJob()?.homeNotes).toBe("B unsaved");
    await b.reload(); expect(b.getSnapshot().conflict).toBe(false);
  });
  it("does not rewrite a clean cached snapshot on pagehide after another tab saves", async () => {
    const { store, session } = await setup();
    await session.change({ type: "setLabel", label: "first", now });
    const current = (await store.get("j"))!;
    await store.put({ ...current, label: "other tab" });
    const spy = vi.spyOn(store, "put");
    await session.flush();
    expect(spy).not.toHaveBeenCalled();
    expect((await store.get("j"))?.label).toBe("other tab");
  });
  it("queues pagehide/drafts behind annotation and cannot overwrite its metadata", async () => {
    const { store, session } = await setup();
    await session.atomic(job => ({ ...job, photos: [{ id: "p", systemId: "s", componentId: scope.componentId, caption: "", mime: "image/jpeg", bytes: 3, createdAt: now }] }), [{ id: "p", blob: new Blob(["old"]) }]);
    const delayed = gate(), original = store.putJobAndPhoto.bind(store);
    vi.spyOn(store, "putJobAndPhoto").mockImplementationOnce(async (...args) => { await delayed.pending; return original(...args); });
    const annotation = session.atomic(job => ({ ...job, photos: job.photos.map(p => ({ ...p, bytes: 7 })) }), [{ id: "p", blob: new Blob(["newdata"]) }]);
    await Promise.resolve(); await Promise.resolve();
    const editing = session.change({ type: "setHomeNotes", notes: "during annotation", now });
    const flush = session.flush(); delayed.release();
    await Promise.all([annotation, editing, flush]);
    expect((await store.get("j"))?.photos[0].bytes).toBe(7);
    expect((await store.get("j"))?.homeNotes).toBe("during annotation");
  });
  it("preserves edits arriving while recovery cleanup finishes after a commit", async () => {
    const { store, session } = await setup(); const delayed = gate();
    vi.spyOn(store, "deleteRecovery").mockImplementationOnce(() => delayed.pending);
    const saving = session.change({ type: "setLabel", label: "saved label", now });
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const editing = session.change({ type: "setHomeNotes", notes: "during cleanup", now });
    delayed.release(); await Promise.all([saving, editing]);
    expect((await store.get("j"))?.homeNotes).toBe("during cleanup");
  });
  it("refreshes clean sessions, retains failed ones, and invalidates an own-tab deletion", async () => {
    const { store } = await setup(); const session = getJobSession(store, "j"); await session.load();
    const saved = (await store.get("j"))!; await store.put({ ...saved, label: "external" });
    const reopening = session.load(true);
    expect(session.getSnapshot().status).toBe("loading");
    await reopening; expect(session.getSnapshot().job?.label).toBe("external");
    await store.delete("j"); forgetJobSession(store, "j");
    const reopened = getJobSession(store, "j"); await reopened.load();
    expect(reopened.getSnapshot().status).toBe("missing");
  });
  it("keeps a failed draft in the navigation cache and reports recovery write failures", async () => {
    const { store } = await setup(); const session = getJobSession(store, "j"); await session.load();
    vi.spyOn(store, "put").mockRejectedValue(new Error("Storage failed"));
    vi.spyOn(store, "putRecovery").mockRejectedValue(new Error("Quota"));
    await session.change(draft("unsaved"));
    expect(session.getSnapshot().error).toMatch(/recovery record could not be saved/);
    expect(getJobSession(store, "j")).toBe(session);
    await session.load(true); expect(session.getRecoveryJob()?.drafts?.[0].inputs.value).toBe("unsaved");
  });
  it("allows a failed staged action to be cancelled without later global retry applying it", async () => {
    const { store, session } = await setup();
    vi.spyOn(store, "put").mockRejectedValueOnce(new Error("Quota"));
    await session.apply({ type: "setHomeNotes", notes: "discarded", now });
    session.cancelPendingSave(); await session.retry();
    expect((await store.get("j"))?.homeNotes).toBe("");
  });
});

describe("startup fallback", () => {
  it("falls back on asynchronous open failure, warns about unavailable jobs, and permits retry before session work", async () => {
    const disk = new MemoryJobStore(true); await disk.put(base());
    vi.spyOn(disk, "list").mockRejectedValueOnce(new Error("Close other tabs to upgrade"));
    const browser = new BrowserJobStore(disk);
    expect(await browser.list()).toEqual([]); expect(browser.persistent).toBe(false);
    expect(browser.storageWarning).toMatch(/unavailable, not deleted/);
    await browser.retryPersistentStorage();
    expect(browser.persistent).toBe(true); expect(await browser.get("j")).not.toBeNull();
  });
  it("retains memory edits and refuses to switch stores under session-only work", async () => {
    const disk = new MemoryJobStore(true); vi.spyOn(disk, "list").mockRejectedValueOnce(new Error("blocked"));
    const browser = new BrowserJobStore(disk); const job = await browser.put(base());
    await browser.put({ ...job, homeNotes: "session edit" });
    expect((await browser.get("j"))?.homeNotes).toBe("session edit");
    await expect(browser.retryPersistentStorage()).rejects.toThrow(/session-only jobs/);
  });
  it("never switches to blank memory after a later durable write failure", async () => {
    const disk = new MemoryJobStore(true), browser = new BrowserJobStore(disk);
    const job = await browser.put(base()); vi.spyOn(disk, "put").mockRejectedValueOnce(new Error("Quota"));
    await expect(browser.put({ ...job, homeNotes: "failed" })).rejects.toThrow("Quota");
    expect(browser.persistent).toBe(true); expect((await browser.get("j"))?.homeNotes).toBe("");
  });
});
