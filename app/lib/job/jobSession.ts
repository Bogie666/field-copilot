import { mergePendingChanges } from "./mergePending";
import { jobReducer, type JobAction } from "./reducer";
import { JobConflictError, type JobStore, type PhotoWrite } from "./store";
import { newId, normalizeJobExtensions, type Job } from "./types";

export type SaveResult = { ok: true; persistent: boolean } | { ok: false; errors: string[] };
export type SessionSnapshot = { status: "loading" | "ready" | "missing" | "error"; job: Job | null; error: string; saving: boolean; conflict: boolean; unsaved: boolean; resetRevision: number };
const writerId = newId("writer");
const pointerKey = (id: string) => `field-copilot-recovery:${id}`;
function previousRecoveryKey(id: string, fallback: string) {
  try { return sessionStorage.getItem(pointerKey(id)) || fallback; } catch { return fallback; }
}
function rememberRecoveryKey(id: string, key: string) {
  try { sessionStorage.setItem(pointerKey(id), key); } catch { /* Download remains available without sessionStorage. */ }
}
const message = (error: unknown) => error instanceof Error ? error.message : "Could not save changes on this device. Your edits are still here. Retry when storage is available.";

/** One serialized write queue per open job. No browser lifecycle event bypasses its revision check. */
export class JobSession {
  private snapshot: SessionSnapshot = { status: "loading", job: null, error: "", saving: false, conflict: false, unsaved: false, resetRevision: 0 };
  private listeners = new Set<() => void>();
  private writes: Promise<unknown> = Promise.resolve();
  private loading: Promise<void> | null = null;
  private generation = 0;
  private savedGeneration = 0;
  private failure: unknown = null;
  private recoveredJob: Job | null = null;
  private pendingAtomic: { change: (job: Job) => Job; writes: readonly PhotoWrite[] } | null = null;
  constructor(readonly store: JobStore, readonly id: string, readonly recoveryKey = `${writerId}:${id}`) {}
  getSnapshot = () => this.snapshot;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private publish(patch: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...patch, unsaved: this.generation !== this.savedGeneration };
    this.listeners.forEach(listener => listener());
  }
  load(refresh = false): Promise<void> {
    if (this.loading && (!refresh || this.snapshot.status === "loading" || this.snapshot.unsaved || this.snapshot.saving || this.snapshot.error)) return this.loading;
    this.publish({ status: "loading" });
    this.loading = Promise.all([this.store.get(this.id), this.store.getRecovery(previousRecoveryKey(this.id, this.recoveryKey))]).then(async ([job, recovery]) => {
      if (recovery) {
        // A duplicated tab inherits sessionStorage; fork its recovery record before editing it.
        try { await this.store.putRecovery(this.recoveryKey, recovery); rememberRecoveryKey(this.id, this.recoveryKey); }
        catch { /* Keep the original durable recovery pointer if a fork cannot be saved. */ }
        this.recoveredJob = recovery.proposedJob;
        this.failure = new JobConflictError(this.id, !job);
        this.publish({ job: job ? normalizeJobExtensions(job) : normalizeJobExtensions(recovery.job), status: "ready", conflict: true, error: "An unsaved record was recovered from an earlier session. Download it and compare it with the saved job before discarding it. No recovered changes have overwritten the saved job." });
      } else this.publish({ job: job ? normalizeJobExtensions(job) : null, status: job ? "ready" : "missing", error: "" });
    }).catch(error => { this.publish({ status: "error", error: message(error) }); });
    return this.loading;
  }
  private enqueue<T>(write: () => Promise<T>): Promise<T> {
    const result = this.writes.then(write);
    this.writes = result.catch(() => undefined);
    return result;
  }
  private async failed(error: unknown) {
    this.failure = error;
    this.publish({ error: message(error), conflict: error instanceof JobConflictError, saving: false });
    const job = this.snapshot.job;
    const proposedJob = this.getRecoveryJob();
    if (job && proposedJob) {
      try { await this.store.putRecovery(this.recoveryKey, { job, proposedJob, error: message(error), conflict: error instanceof JobConflictError, recordedAt: new Date().toISOString() }); rememberRecoveryKey(this.id, this.recoveryKey); }
      catch { this.publish({ error: `${message(error)} The recovery record could not be saved either. Keep this tab open or download your unsaved record now.` }); }
    }
  }
  getRecoveryJob = (): Job | null => {
    const current = this.snapshot.job;
    if (this.recoveredJob) return this.recoveredJob;
    if (!current || !this.pendingAtomic) return current;
    try { return this.pendingAtomic.change(current); } catch { return current; }
  };
  cancelPendingSave(): void {
    if (this.snapshot.conflict) return; // A conflict requires export/discard; do not erase recovery silently.
    this.pendingAtomic = null;
    if (!this.snapshot.unsaved) {
      this.failure = null;
      this.publish({ error: "", conflict: false });
      void this.store.deleteRecovery(this.recoveryKey).catch(() => undefined);
    } else if (this.failure) void this.failed(this.failure);
  }
  retry(): Promise<SaveResult> {
    return this.pendingAtomic ? this.result(this.atomic(this.pendingAtomic.change, this.pendingAtomic.writes)) : this.flush(true);
  }
  apply(action: JobAction): Promise<SaveResult> {
    return this.result(this.atomic(job => jobReducer(job, action)));
  }
  private async committed(saved: Job, started: Job, generation: number) {
    await this.store.deleteRecovery(this.recoveryKey).catch(() => undefined);
    const current = this.snapshot.job!;
    const job = mergePendingChanges(started, saved, current);
    this.savedGeneration = generation;
    this.failure = null;
    this.recoveredJob = null;
    this.publish({ job, error: "", conflict: false, saving: false });
  }
  private async result(work: Promise<unknown>): Promise<SaveResult> {
    try { await work; return { ok: true, persistent: this.store.persistent }; }
    catch (error) { return { ok: false, errors: [message(error)] }; }
  }
  change(action: JobAction, explicit = false): Promise<SaveResult> {
    const current = this.snapshot.job;
    if (this.recoveredJob) return Promise.resolve({ ok: false, errors: ["Download and resolve the recovered record before editing this job."] });
    if (!current) return Promise.resolve({ ok: false, errors: ["The job is not open."] });
    const next = jobReducer(current, action);
    if (next !== current) { this.generation += 1; this.publish({ job: next }); }
    return this.flush(explicit);
  }
  /** Retry never reloads or rebases a stale snapshot. Conflicts require explicit recovery. */
  flush(retry = false): Promise<SaveResult> {
    return this.result(this.enqueue(async () => {
      if (this.failure && (!retry || this.failure instanceof JobConflictError)) { await this.failed(this.failure); throw this.failure; }
      const started = this.snapshot.job;
      if (!started || this.generation === this.savedGeneration) return;
      const generation = this.generation;
      this.publish({ saving: true });
      try { await this.committed(await this.store.put(started), started, generation); }
      catch (error) { await this.failed(error); throw error; }
    }));
  }
  /** Photo metadata is published only after its all-or-nothing blob transaction completes. */
  atomic(change: (job: Job) => Job, writes: readonly PhotoWrite[] = []): Promise<Job> {
    return this.enqueue(async () => {
      if (this.failure instanceof JobConflictError) throw this.failure;
      const started = this.snapshot.job;
      if (!started) throw new Error("The job is not open.");
      const next = change(started);
      if (next === started) throw new Error("These changes are no longer applicable. The job, equipment, or original notes may have changed; review them before saving.");
      const generation = this.generation;
      this.publish({ saving: true });
      try {
        const saved = writes.length === 1 ? await this.store.putJobAndPhoto(next, writes[0].id, writes[0].blob) : await this.store.put(next, writes);
        this.pendingAtomic = null;
        await this.committed(saved, started, generation);
        return saved;
      } catch (error) { this.pendingAtomic = { change, writes }; await this.failed(error); throw error; }
    });
  }
  /** Caller obtains explicit consent to discard local changes before using this recovery action. */
  reload(): Promise<void> {
    return this.enqueue(async () => {
      try {
        const job = await this.store.get(this.id);
        await this.store.deleteRecovery(this.recoveryKey);
        this.generation = this.savedGeneration = 0;
        this.failure = null;
        this.pendingAtomic = null;
        this.recoveredJob = null;
        this.publish({ job, status: job ? "ready" : "missing", error: "", conflict: false, saving: false, resetRevision: this.snapshot.resetRevision + 1 });
      } catch (error) { await this.failed(error); }
    });
  }
}

// Navigation within this tab must not discard edits after a failed write or a conflict.
const sessions = new WeakMap<JobStore, Map<string, JobSession>>();
export function getJobSession(store: JobStore, id: string): JobSession {
  let jobs = sessions.get(store);
  if (!jobs) { jobs = new Map(); sessions.set(store, jobs); }
  let session = jobs.get(id);
  if (!session) { session = new JobSession(store, id); jobs.set(id, session); }
  return session;
}

export function forgetJobSession(store: JobStore, id: string) { sessions.get(store)?.delete(id); }
