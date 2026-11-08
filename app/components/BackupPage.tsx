"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { backupFileName, buildBackup, describeRestore, parseBackup, restoreBackup, type Backup } from "../lib/job/backup";
import { getBrowserStore } from "../lib/job/browserStore";
import { getPersonalNotesStore } from "../lib/notesStore";
import { Callout, ConfirmDialog, Crumbs, ErrorList, PageHead } from "./ui";

export const LAST_BACKUP_KEY = "field-copilot:last-backup:v1";

function readLastBackup(): string {
  try { return window.localStorage.getItem(LAST_BACKUP_KEY) ?? ""; } catch { return ""; }
}
const subscribeNoop = () => () => undefined;

export function useLastBackup(): string {
  return useSyncExternalStore(subscribeNoop, readLastBackup, () => "");
}

function notesBackend() {
  try { return typeof indexedDB === "undefined" ? null : getPersonalNotesStore(); } catch { return null; }
}

export default function BackupPage() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, setPending] = useState<Backup | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const stored = useLastBackup();
  const last = lastBackup ?? stored;
  const fileInput = useRef<HTMLInputElement>(null);

  async function makeFile(): Promise<File> {
    const { backup, missingPhotos } = await buildBackup(getBrowserStore(), notesBackend());
    const file = new File([JSON.stringify(backup)], backupFileName(), { type: "application/json" });
    const when = new Date().toISOString();
    try { window.localStorage.setItem(LAST_BACKUP_KEY, when); } catch { /* reminder only */ }
    setLastBackup(when);
    setMessage(`Backup contains ${backup.jobs.length} ${backup.jobs.length === 1 ? "job" : "jobs"}, ${backup.photos.length} ${backup.photos.length === 1 ? "photo" : "photos"} and ${backup.notes.length} ${backup.notes.length === 1 ? "note" : "notes"}.${missingPhotos ? ` ${missingPhotos} photo ${missingPhotos === 1 ? "file was" : "files were"} already missing on this device.` : ""}`);
    return file;
  }

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setErrors([]); setMessage("");
    try { await action(); } catch (error) { setErrors([error instanceof Error ? error.message : "Something went wrong."]); }
    finally { setBusy(false); }
  }

  const download = () => run(async () => {
    const file = await makeFile();
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url; link.download = file.name;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  });

  const canShare = typeof navigator !== "undefined" && typeof navigator.canShare === "function";
  const share = () => run(async () => {
    const file = await makeFile();
    if (!navigator.canShare?.({ files: [file] })) throw new Error("This browser cannot share files. Use Download instead.");
    try { await navigator.share({ files: [file], title: file.name }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) throw error; }
  });

  const choose = (file: File | undefined) => run(async () => {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if ("error" in parsed) throw new Error(parsed.error);
    setPending(parsed.backup);
  });

  const restore = () => {
    const backup = pending;
    setPending(null);
    if (backup) void run(async () => setMessage(describeRestore(await restoreBackup(backup, getBrowserStore(), notesBackend()))));
  };

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { label: "Backup and restore" }]} />
      <PageHead title="Backup and restore" lede="Jobs, photos and notes are stored only in this browser. Save a backup file somewhere safe so a lost phone or cleared browser data does not lose your records." />
      <section className="panel">
        <h3>Back up this device</h3>
        <p className="hint">{last ? `Last backup from this device: ${new Date(last).toLocaleString()}.` : "No backup has been made from this device yet."}</p>
        <p className="hint">The file includes customer job labels and photos. Store it like any other customer record.</p>
        <div className="btnRow">
          {canShare && <button className="btn primary" type="button" disabled={busy} onClick={() => void share()}>Share backup</button>}
          <button className={canShare ? "btn" : "btn primary"} type="button" disabled={busy} onClick={() => void download()}>Download backup</button>
        </div>
      </section>
      <section className="panel" style={{ marginTop: 16 }}>
        <h3>Restore from a backup</h3>
        <p className="hint">Adds jobs and notes that are not on this device. Anything already here is kept as it is, never overwritten.</p>
        <input ref={fileInput} type="file" accept="application/json,.json" hidden onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="btnRow">
          <button className="btn" type="button" disabled={busy} onClick={() => fileInput.current?.click()}>Choose backup file</button>
        </div>
      </section>
      {busy && <p className="hint" role="status" style={{ marginTop: 16 }}>Working…</p>}
      {message && <div style={{ marginTop: 16 }}><Callout tone="ok"><p>{message}</p></Callout></div>}
      <ErrorList errors={errors} />
      {pending && (
        <ConfirmDialog
          title="Restore this backup?"
          body={`Made ${new Date(pending.exportedAt).toLocaleString()} with ${pending.jobs.length} ${pending.jobs.length === 1 ? "job" : "jobs"}, ${pending.photos.length} photos and ${pending.notes.length} notes. Records already on this device are kept.`}
          confirmLabel="Restore"
          onConfirm={restore}
          onCancel={() => setPending(null)}
        />
      )}
    </main>
  );
}
