"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getBrowserStore, requestPersistence } from "../lib/job/browserStore";
import { setPersistenceState } from "../lib/job/persistenceStatus";
import { jobReducer, type JobAction } from "../lib/job/reducer";
import type { JobStore } from "../lib/job/store";
import { newId, validateFinding, type Finding, type FindingScope, type Job, type JobSystem, type PhotoMeta } from "../lib/job/types";
import { compressImage, MAX_PHOTOS_PER_SYSTEM } from "../lib/photoCompress";

type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;
export type JobActionInput = DistributiveOmit<JobAction, "now">;

export type FindingInput = Omit<Finding, "confirmedAt" | "scope"> & { scope: FindingScope };
export type SaveResult = { ok: true } | { ok: false; errors: string[] };

export type JobApi = {
  status: "loading" | "ready" | "missing" | "error";
  error: string;
  job: Job | null;
  activeSystem: JobSystem | null;
  setActiveSystemId: (id: string) => void;
  dispatch: (action: JobActionInput) => void;
  saveFinding: (finding: FindingInput) => SaveResult;
  addPhoto: (blob: Blob, systemId: string | null, caption: string) => Promise<{ ok: true; photo: PhotoMeta } | { ok: false; error: string }>;
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

export function JobProvider({ jobId, children, store: injectedStore }: { jobId: string; children: ReactNode; store?: JobStore }) {
  const store = useMemo(() => injectedStore ?? getBrowserStore(), [injectedStore]);
  const [job, setJob] = useState<Job | null>(null);
  const [status, setStatus] = useState<JobApi["status"]>("loading");
  const [error, setError] = useState("");
  const [activeSystemId, setActiveSystemId] = useState<string>("");
  const loadedRef = useRef<Job | null>(null);
  const latestRef = useRef<Job | null>(null);
  const urlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    store
      .get(jobId)
      .then((found) => {
        if (cancelled) return;
        if (!found) {
          setStatus("missing");
          return;
        }
        loadedRef.current = found;
        latestRef.current = found;
        setJob(found);
        setActiveSystemId((current) => (found.systems.some((s) => s.id === current) ? current : (found.systems[0]?.id ?? "")));
        setStatus("ready");
        setPersistenceState(store.persistent ? "saved" : "volatile", Date.parse(found.updatedAt));
        void requestPersistence();
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Could not open saved jobs on this device.");
        setStatus("error");
        setPersistenceState("volatile");
      });
    const urls = urlsRef.current;
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, [jobId, store]);

  // Persist every change immediately. Writes are small, and a tech may close the app right after Save,
  // so there is no debounce. Anything typed at length (notes) is committed by its own tool on a pause.
  useEffect(() => {
    if (!job || job === loadedRef.current) return;
    latestRef.current = job;
    if (!store.persistent) {
      setPersistenceState("volatile");
      return;
    }
    setPersistenceState("saving");
    let current = true;
    store
      .put(job)
      .then(() => {
        if (current) setPersistenceState("saved");
      })
      .catch(() => {
        if (current) setPersistenceState("volatile");
      });
    return () => {
      current = false;
    };
  }, [job, store]);

  useEffect(() => {
    const flush = () => {
      const latest = latestRef.current;
      if (latest && latest !== loadedRef.current && store.persistent) void store.put(latest).catch(() => undefined);
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [store]);

  const dispatch = useCallback((action: JobActionInput) => {
    setJob((current) => {
      if (!current) return current;
      const next = jobReducer(current, { ...action, now: new Date().toISOString() } as JobAction);
      latestRef.current = next;
      return next;
    });
  }, []);

  const saveFinding = useCallback(
    (input: FindingInput): SaveResult => {
      const finding: Finding = { ...input, confirmedAt: new Date().toISOString() };
      const errors = validateFinding(finding);
      if (errors.length) return { ok: false, errors };
      dispatch({ type: "upsertFinding", finding });
      return { ok: true };
    },
    [dispatch],
  );

  const addPhoto = useCallback<JobApi["addPhoto"]>(
    async (blob, systemId, caption) => {
      const current = latestRef.current;
      if (!current) return { ok: false, error: "The job is not open." };
      const count = current.photos.filter((p) => p.systemId === systemId).length;
      if (count >= MAX_PHOTOS_PER_SYSTEM) return { ok: false, error: `This system already has ${MAX_PHOTOS_PER_SYSTEM} photos. Remove one first.` };
      try {
        const jpeg = await compressImage(blob);
        const photo: PhotoMeta = { id: newId("photo"), systemId, caption: caption.slice(0, 200), mime: jpeg.type || "image/jpeg", bytes: jpeg.size, createdAt: new Date().toISOString() };
        await store.putPhoto(photo.id, jpeg);
        dispatch({ type: "addPhoto", photo });
        return { ok: true, photo };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "The photo could not be saved." };
      }
    },
    [dispatch, store],
  );

  const removePhoto = useCallback<JobApi["removePhoto"]>(
    async (photoId) => {
      const current = latestRef.current;
      if (!current) return { ok: false, error: "The job is not open." };
      const after = jobReducer(current, { type: "removePhoto", photoId, now: new Date().toISOString() });
      if (after === current) return { ok: false, error: "A safety finding needs this photo. Remove or edit that finding first." };
      dispatch({ type: "removePhoto", photoId });
      const url = urlsRef.current.get(photoId);
      if (url) {
        URL.revokeObjectURL(url);
        urlsRef.current.delete(photoId);
      }
      await store.deletePhoto(photoId).catch(() => undefined);
      return { ok: true };
    },
    [dispatch, store],
  );

  const getPhotoBlob = useCallback((photoId: string) => store.getPhoto(photoId), [store]);

  const getPhotoUrl = useCallback(
    async (photoId: string) => {
      const cached = urlsRef.current.get(photoId);
      if (cached) return cached;
      const blob = await store.getPhoto(photoId);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      urlsRef.current.set(photoId, url);
      return url;
    },
    [store],
  );

  const replacePhotoBlob = useCallback(
    async (photoId: string, blob: Blob) => {
      const jpeg = await compressImage(blob);
      await store.putPhoto(photoId, jpeg);
      const old = urlsRef.current.get(photoId);
      if (old) {
        URL.revokeObjectURL(old);
        urlsRef.current.delete(photoId);
      }
    },
    [store],
  );

  const activeSystem = job ? (job.systems.find((s) => s.id === activeSystemId) ?? job.systems[0] ?? null) : null;

  const api: JobApi = {
    status,
    error,
    job,
    activeSystem,
    setActiveSystemId,
    dispatch,
    saveFinding,
    addPhoto,
    removePhoto,
    getPhotoUrl,
    getPhotoBlob,
    replacePhotoBlob,
    persistent: store.persistent,
  };
  return <JobContext.Provider value={api}>{children}</JobContext.Provider>;
}
