"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getBrowserStore } from "../lib/job/browserStore";
import { forgetJobSession } from "../lib/job/jobSession";
import { JobConflictError } from "../lib/job/store";
import type { JobStore } from "../lib/job/store";
import { setPersistenceState } from "../lib/job/persistenceStatus";
import { createJob, type JobSummary } from "../lib/job/types";
import { Chip, ConfirmDialog, EmptyState, PageHead, TextField } from "./ui";
import SaveIndicator from "./SaveIndicator";

const subscribeNever = () => () => undefined;

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const date = sameDay ? "Today" : d.toLocaleDateString([], { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
  return `${date} · ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

export default function JobList() {
  const router = useRouter();
  const store = useSyncExternalStore<JobStore | null>(subscribeNever, () => getBrowserStore(), () => null);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [deleting, setDeleting] = useState<JobSummary | null>(null);

  useEffect(() => {
    if (!store) return;
    let cancelled = false;
    store
      .list()
      .then((list) => {
        if (!cancelled) {
          setJobs(list);
          setPersistenceState(store.persistent ? "saved" : "volatile");
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not open saved jobs on this device.");
          setJobs([]);
          setPersistenceState("volatile");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  async function retryStorage() {
    if (!store?.retryPersistentStorage) return;
    try {
      await store.retryPersistentStorage();
      setJobs(await store.list()); setError("");
      setPersistenceState(store.persistent ? "saved" : "volatile");
    } catch (error) { setError(error instanceof Error ? error.message : "Device storage is still unavailable."); }
  }

  async function start() {
    if (!store || creating) return;
    setCreating(true);
    setError("");
    try {
      const job = createJob(label, new Date().toISOString());
      await store.put(job);
      router.push(`/job/${job.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start a job on this device.");
      setCreating(false);
    }
  }

  async function remove(job: JobSummary) {
    if (!store || removing) return;
    setRemoving(true);
    setError("");
    try {
      await store.delete(job.id, job.storageRevision ?? 0);
      forgetJobSession(store, job.id);
      setJobs(current => current ? current.filter(j => j.id !== job.id) : current);
      setDeleting(null);
    } catch (error) {
      if (error instanceof JobConflictError) setJobs(await store.list().catch(() => jobs));
      setError(`The job was not deleted. ${error instanceof Error ? error.message : "Storage is unavailable."} Try Delete again when storage is available.`);
      setDeleting(null);
      setPersistenceState("failed");
    } finally { setRemoving(false); }
  }

  return (
    <main className="page">
      <PageHead title="Jobs" lede={`${jobs?.length ?? 0} on this device`}><SaveIndicator /></PageHead>
      <h2 className="sectionLabel">Start job</h2>
      <form
        className="jobStartRow"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <TextField label="Job label (optional)" value={label} onChange={setLabel} maxLength={80} hint="A street name or short reminder for you. It stays on this device and is never sent to an AI provider." />
        <button className="btn primary" type="submit" disabled={creating || !store}>
          {creating ? "Starting" : "Start"}
        </button>
      </form>
      {error && (
        <div className="callout" data-tone="warn" role="alert">
          <strong>Storage problem</strong>
          <p>{error}</p>
        </div>
      )}
      {jobs !== null && store && !store.persistent && <div className="callout" data-tone="warn" role="status">
        <strong>Session-only storage</strong>
        <p>{store.storageWarning || "Changes are kept only while this tab stays open. Closing or refreshing it will lose them."}</p>
        {jobs.length === 0 && store.retryPersistentStorage && <button type="button" className="btn" onClick={() => void retryStorage()}>Retry device storage</button>}
      </div>}
      <h2 className="sectionLabel">Recent</h2>
      {jobs === null ? (
        <p className="hint" role="status">
          Loading jobs
        </p>
      ) : jobs.length === 0 ? (
        <EmptyState title={store?.persistent ? "No jobs on this device yet" : "No jobs in this session"} body={store?.persistent ? "Start a job above. It will show up here so you can pick it back up." : "Saved device jobs may be unavailable. New session-only jobs will appear here until this tab closes or refreshes."} />
      ) : (
        <ul className="jobLedger">
          {jobs.map((job) => (
            <li key={job.id} className="jobLedgerRow">
              <time dateTime={job.updatedAt}>{when(job.updatedAt)}</time>
              <Link className="jobLedgerLink" href={`/job/${job.id}`}>
                <strong>{job.label || "Untitled job"}</strong>
                <span>{job.findingCount} {job.findingCount === 1 ? "finding" : "findings"} · {job.systemCount} {job.systemCount === 1 ? "system" : "systems"}</span>
              </Link>
              <span className="jobLedgerStatus">{job.safetyCount > 0 ? <Chip tone="safety">Safety</Chip> : job.findingCount > 0 ? <Chip tone="accent">In progress</Chip> : <Chip>Started</Chip>}</span>
              <button className="jobDelete" type="button" disabled={removing} onClick={() => setDeleting(job)} aria-label={`Delete ${job.label || "untitled job"}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint" style={{ marginTop: 24 }}>
        Need a single tool without a job? <Link href="/tools">Open the tool list</Link>.
      </p>
      <p className="screeningLine">Findings are screening results for technician review.</p>
      {deleting && (
        <ConfirmDialog
          title="Delete this job?"
          body={`${deleting.label || "This job"} and its ${deleting.findingCount} saved findings, previous confirmations, notes, and photos will be removed from this device. This cannot be undone.`}
          confirmLabel={removing ? "Deleting…" : "Delete job"}
          onConfirm={() => void remove(deleting)}
          onCancel={() => { if (!removing) setDeleting(null); }}
        />
      )}
    </main>
  );
}
