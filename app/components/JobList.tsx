"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { getBrowserStore } from "../lib/job/browserStore";
import type { JobStore } from "../lib/job/store";
import { setPersistenceState } from "../lib/job/persistenceStatus";
import { createJob, type JobSummary } from "../lib/job/types";
import { ConfirmDialog, EmptyState, ListLink, PageHead, TextField, Chip } from "./ui";

const subscribeNever = () => () => undefined;

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? `Today, ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function JobList() {
  const router = useRouter();
  const store = useSyncExternalStore<JobStore | null>(subscribeNever, () => getBrowserStore(), () => null);
  const [jobs, setJobs] = useState<JobSummary[] | null>(null);
  const [error, setError] = useState("");
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
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

  async function start() {
    if (!store || creating) return;
    setCreating(true);
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
    if (!store) return;
    await store.delete(job.id).catch(() => undefined);
    setJobs((current) => (current ? current.filter((j) => j.id !== job.id) : current));
    setDeleting(null);
  }

  return (
    <main className="page">
      <PageHead title="Start a job" lede="Each job keeps its readings on this device. Nothing leaves the device until you generate a customer note." />
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <TextField label="Job label (optional)" value={label} onChange={setLabel} maxLength={80} hint="A street name or short reminder for you. It stays on this device and is never sent to an AI provider." />
        <button className="btn primary block" type="submit" disabled={creating || !store}>
          {creating ? "Starting" : "Start job"}
        </button>
      </form>
      {error && (
        <div className="callout" data-tone="warn" role="alert">
          <strong>Storage problem</strong>
          <p>{error}</p>
        </div>
      )}
      <h2 style={{ margin: "26px 0 12px" }}>Recent jobs</h2>
      {jobs === null ? (
        <p className="hint" role="status">
          Loading jobs
        </p>
      ) : jobs.length === 0 ? (
        <EmptyState title="No jobs on this device yet" body="Start a job above. It will show up here so you can pick it back up." />
      ) : (
        <ul className="list">
          {jobs.map((job) => (
            <li key={job.id} style={{ display: "grid", gap: 6 }}>
              <ListLink
                href={`/job/${job.id}`}
                title={job.label || "Untitled job"}
                meta={`${when(job.updatedAt)}, ${job.findingCount} ${job.findingCount === 1 ? "finding" : "findings"} across ${job.systemCount} ${job.systemCount === 1 ? "system" : "systems"}`}
                right={job.safetyCount > 0 ? <Chip tone="safety">Safety</Chip> : undefined}
              />
              <button className="btn ghost" type="button" style={{ minHeight: 36, justifySelf: "end" }} onClick={() => setDeleting(job)} aria-label={`Delete ${job.label || "untitled job"}`}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="hint" style={{ marginTop: 24 }}>
        Need a single tool without a job? <Link href="/tools">Open the tool list</Link>.
      </p>
      {deleting && (
        <ConfirmDialog
          title="Delete this job?"
          body={`${deleting.label || "This job"} and its ${deleting.findingCount} saved findings and photos will be removed from this device. This cannot be undone.`}
          confirmLabel="Delete job"
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
    </main>
  );
}
