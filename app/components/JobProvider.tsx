"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBrowserStore, requestPersistence } from "../lib/job/browserStore";
import { setPersistenceState } from "../lib/job/persistenceStatus";
import { getJobSession, type SaveResult } from "../lib/job/jobSession";
import { jobReducer, type JobAction } from "../lib/job/reducer";
import type { JobStore } from "../lib/job/store";
import { newId, scopeExists, validateFinding, type Finding, type FindingScope, type Job, type JobSystem, type PhotoMeta } from "../lib/job/types";
import { compressImage, MAX_PHOTOS_PER_SYSTEM } from "../lib/photoCompress";

export type { SaveResult } from "../lib/job/jobSession";
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type JobActionInput = DistributiveOmit<JobAction, "now">;
export type FindingInput = Omit<Finding, "confirmedAt" | "scope"> & { scope: FindingScope };
export type JobApi = {
  status: "loading" | "ready" | "missing" | "error";
  error: string;
  job: Job | null;
  activeSystem: JobSystem | null;
  setActiveSystemId: (id: string) => void;
  dispatch: (action: JobActionInput) => Promise<SaveResult>;
  saving: boolean;
  cancelPendingSave: () => void;
  saveAction: (action: JobActionInput) => Promise<SaveResult>;
  saveFinding: (finding: FindingInput) => Promise<SaveResult>;
  addPhoto: (blob: Blob, systemId: string | null, caption: string, componentId?: string) => Promise<{ ok: true; photo: PhotoMeta } | { ok: false; error: string }>;
  removePhoto: (photoId: string) => Promise<{ ok: boolean; error?: string }>;
  getPhotoUrl: (photoId: string) => Promise<string | null>;
  getPhotoBlob: (photoId: string) => Promise<Blob | null>;
  replacePhotoBlob: (photoId: string, blob: Blob) => Promise<void>;
  persistent: boolean;
};
const JobContext = createContext<JobApi | null>(null);
export function useJob(): JobApi {
  const api = useContext(JobContext);
  if (!api) throw new Error("useJob must be used inside a JobProvider.");
  return api;
}
const actionNow = (action: JobActionInput): JobAction => ({ ...action, now: new Date().toISOString() }) as JobAction;
const errorText = (error: unknown) => error instanceof Error ? error.message : "The photo could not be saved. Retry when storage is available.";

export function JobProvider({ jobId, children, store: injectedStore }: { jobId: string; children: ReactNode; store?: JobStore }) {
  const store = useMemo(() => injectedStore ?? getBrowserStore(), [injectedStore]);
  const session = useMemo(() => getJobSession(store, jobId), [store, jobId]);
  const [snapshot, setSnapshot] = useState(() => {
    const current = session.getSnapshot();
    // Clean navigation reopens from storage; don't mount editors from a stale cached snapshot.
    return current.status === "ready" && !current.error && !current.unsaved && !current.saving ? { ...current, status: "loading" as const } : current;
  });
  const [activeSystemId, setActiveSystemId] = useState("");
  const urlsRef = useRef<Map<string, string>>(new Map());
  const { status, job, error } = snapshot;

  useEffect(() => {
    const update = () => {
      const next = session.getSnapshot();
      setSnapshot(next);
      setPersistenceState(next.conflict ? "conflict" : next.error ? "failed" : next.saving || next.unsaved ? "saving" : store.persistent ? "saved" : "volatile");
    };
    const unsubscribe = session.subscribe(update);
    update();
    void session.load(true).then(() => { void requestPersistence(); });
    return unsubscribe;
  }, [session, store]);

  useEffect(() => {
    // Changes enter the queue immediately; lifecycle flush only drains unsaved work.
    // It never rewrites a clean snapshot, and conflicts still use the same CAS path.
    const flush = () => { void session.flush(); };
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    const urls = urlsRef.current;
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [session]);

  const dispatch = useCallback((action: JobActionInput) => session.change(actionNow(action)), [session]);
  const saveAction = useCallback((action: JobActionInput) => session.apply(actionNow(action)), [session]);
  const saveFinding = useCallback(async (input: FindingInput): Promise<SaveResult> => {
    const finding: Finding = { ...input, confirmedAt: new Date().toISOString() };
    const current = session.getSnapshot().job;
    if (!current) return { ok: false, errors: ["The job is not open."] };
    const errors = validateFinding(finding, current);
    if (errors.length) return { ok: false, errors };
    return saveAction({ type: "upsertFinding", finding });
  }, [session, saveAction]);

  const invalidateUrl = useCallback((id: string) => {
    const url = urlsRef.current.get(id);
    if (url) { URL.revokeObjectURL(url); urlsRef.current.delete(id); }
  }, []);
  const addPhoto = useCallback<JobApi["addPhoto"]>(async (blob, systemId, caption, componentId) => {
    try {
      const jpeg = await compressImage(blob);
      const photo: PhotoMeta = { id: newId("photo"), systemId, ...(componentId ? { componentId } : {}), caption: caption.slice(0, 200), mime: jpeg.type || "image/jpeg", bytes: jpeg.size, createdAt: new Date().toISOString() };
      await session.atomic(current => {
        if (!scopeExists(current, systemId ? { kind: "system", systemId, ...(componentId ? { componentId } : {}) } : { kind: "home" })) return current;
        if (current.photos.filter(p => p.systemId === systemId && p.componentId === componentId).length >= MAX_PHOTOS_PER_SYSTEM) throw new Error(`This equipment already has ${MAX_PHOTOS_PER_SYSTEM} photos. Remove one first.`);
        return jobReducer(current, { type: "addPhoto", photo, now: photo.createdAt });
      }, [{ id: photo.id, blob: jpeg }]);
      return { ok: true, photo };
    } catch (error) { return { ok: false, error: errorText(error) }; }
  }, [session]);
  const removePhoto = useCallback<JobApi["removePhoto"]>(async photoId => {
    try {
      await session.atomic(current => {
        if (current.findingHistory?.some(f => f.photoIds?.includes(photoId))) throw new Error("This photo is retained by a previous finding. Delete its system or job to remove that history.");
        if (!current.photos.some(p => p.id === photoId)) return current;
        const next = jobReducer(current, { type: "removePhoto", photoId, now: new Date().toISOString() });
        if (next === current) throw new Error("A safety finding needs this photo. Remove or edit that finding first.");
        return next;
      });
      invalidateUrl(photoId);
      return { ok: true };
    } catch (error) { return { ok: false, error: errorText(error) }; }
  }, [session, invalidateUrl]);
  const getPhotoBlob = useCallback((photoId: string) => store.getPhoto(photoId), [store]);
  const getPhotoUrl = useCallback(async (photoId: string) => {
    const cached = urlsRef.current.get(photoId);
    if (cached) return cached;
    const blob = await store.getPhoto(photoId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urlsRef.current.set(photoId, url);
    return url;
  }, [store]);
  const replacePhotoBlob = useCallback(async (photoId: string, blob: Blob) => {
    const jpeg = await compressImage(blob);
    await session.atomic(current => {
      if (current.findingHistory?.some(f => f.photoIds?.includes(photoId))) throw new Error("This photo is retained by a previous finding. Add a new photo instead of changing historical evidence.");
      if (!current.photos.some(p => p.id === photoId)) return current;
      return { ...current, updatedAt: new Date().toISOString(), photos: current.photos.map(p => p.id === photoId ? { ...p, bytes: jpeg.size, mime: jpeg.type } : p) };
    }, [{ id: photoId, blob: jpeg }]);
    invalidateUrl(photoId);
  }, [session, invalidateUrl]);

  function downloadRecovery() {
    const recovery = session.getRecoveryJob();
    if (!recovery) return;
    const blob = new Blob([JSON.stringify({ notice: "Unsaved recovery record. Photo files are not included. Compare this record with the saved job; it is not a complete backup.", job: recovery }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `field-copilot-unsaved-${jobId}.json`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function reloadSaved() {
    if (!window.confirm("Discard this tab's unsaved changes and load the saved job? Download your unsaved record first if you need to keep it.")) return;
    urlsRef.current.forEach(url => URL.revokeObjectURL(url)); urlsRef.current.clear();
    void session.reload();
  }
  const activeSystem = job ? (activeSystemId ? job.systems.find(s => s.id === activeSystemId) ?? null : job.systems[0] ?? null) : null;
  const api: JobApi = { saving: snapshot.saving, cancelPendingSave: () => session.cancelPendingSave(), status, error, job, activeSystem, setActiveSystemId, dispatch, saveAction, saveFinding, addPhoto, removePhoto, getPhotoUrl, getPhotoBlob, replacePhotoBlob, persistent: store.persistent };
  return <JobContext.Provider value={api}>
    {status === "ready" && error && <div className="callout" data-tone="warn" role="alert" style={{ margin: "16px auto", maxWidth: 760 }}>
      <strong>{snapshot.conflict ? "Save conflict" : "Changes could not be saved"}</strong>
      <p>{error}</p><p>Your pending record stays available in this tab. Download it before discarding changes. The download includes text and photo references, not photo files.</p>
      <div className="btnRow">
        {!snapshot.conflict && <button type="button" className="btn" disabled={snapshot.saving} onClick={() => void session.retry()}>Retry save</button>}
        <button type="button" className="btn" onClick={downloadRecovery}>Download unsaved record</button>
        <button type="button" className="btn" onClick={reloadSaved}>Discard changes and reload saved job</button>
      </div>
    </div>}
    {status === "ready" && !store.persistent && <div className="callout" data-tone="warn" role="status" style={{ margin: "16px auto", maxWidth: 760 }}><strong>Session-only storage</strong><p>Edits remain available while this app stays open. Closing or refreshing this tab will lose them. This device is not saving a durable copy.</p></div>}
    <fieldset key={snapshot.resetRevision} disabled={snapshot.conflict} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }} aria-label={snapshot.conflict ? "Job editing paused until save conflict is resolved" : undefined}>{children}</fieldset>
  </JobContext.Provider>;
}
