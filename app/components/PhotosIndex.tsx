"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getBrowserStore } from "../lib/job/browserStore";
import { jobHref } from "../lib/job/routes";
import { componentsForSystem, type Job, type PhotoMeta } from "../lib/job/types";
import { EmptyState, PageHead } from "./ui";

type PhotoRow = { photo: PhotoMeta; job: Job; url: string | null; href: string };

function photoHref(job: Job, photo: PhotoMeta): string {
  if (!photo.systemId) return jobHref(job.id, "home", "photos", { kind: "home" });
  const system = job.systems.find(item => item.id === photo.systemId);
  const component = system && componentsForSystem(system).find(item => item.id === photo.componentId);
  if (!system || !component) return `/job/${job.id}`;
  return jobHref(job.id, component.kind, "photos", { kind: "system", systemId: system.id, componentId: component.id });
}

export default function PhotosIndex() {
  const [rows, setRows] = useState<PhotoRow[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const urls = new Set<string>();
    const store = getBrowserStore();
    (async () => {
      try {
        const summaries = await store.list();
        const jobResults = await Promise.allSettled(summaries.map(summary => store.get(summary.id)));
        if (!live) return;
        const jobs = jobResults.flatMap(result => result.status === "fulfilled" && result.value ? [result.value] : []);
        const failedJobs = jobResults.filter(result => result.status === "rejected").length;
        const metadata = jobs.flatMap(job => job.photos.map(photo => ({ job, photo }))).sort((a, b) => b.photo.createdAt.localeCompare(a.photo.createdAt));
        let failedPhotos = 0;
        const loaded = await Promise.all(metadata.map(async ({ job, photo }): Promise<PhotoRow> => {
          try {
            const blob = await store.getPhoto(photo.id);
            if (!blob) {
              failedPhotos += 1;
              return { job, photo, url: null, href: photoHref(job, photo) };
            }
            if (!live) return { job, photo, url: null, href: photoHref(job, photo) };
            const url = URL.createObjectURL(blob);
            urls.add(url);
            return { job, photo, url, href: photoHref(job, photo) };
          } catch {
            failedPhotos += 1;
            return { job, photo, url: null, href: photoHref(job, photo) };
          }
        }));
        if (!live) return;
        setRows(loaded);
        const failures = failedJobs + failedPhotos;
        if (failures) setError(`${failures} saved ${failures === 1 ? "item could" : "items could"} not be opened. Other photos are still shown.`);
      } catch (reason) {
        if (live) {
          setRows([]);
          setError(reason instanceof Error ? reason.message : "Saved photos could not be opened.");
        }
      }
    })();
    return () => {
      live = false;
      urls.forEach(url => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  return <main className="page photosPage">
    <PageHead title="Photos" lede={rows ? `${rows.length} across all jobs · newest first` : "All job photos, newest first"} />
    {error && <div className="callout" data-tone="warn" role="alert"><strong>Photos unavailable</strong><p>{error}</p></div>}
    {rows === null ? <p className="hint" role="status">Opening job photos…</p> : rows.length === 0 ? <EmptyState title="No job photos yet" body="Photos attached inside a job will appear here. Personal-note drawings stay private in Notes and are not job evidence." /> : <ul className="aggregatePhotos">{rows.map(({ photo, job, url, href }) => <li key={`${job.id}:${photo.id}`}>
      <Link href={href}>{url ? <img src={url} alt={photo.caption || `Job photo from ${job.label || "untitled job"}`} loading="lazy" decoding="async" /> : <span className="missingPhoto">Image unavailable</span>}<span className="photoInfo"><strong>{photo.caption || "Job photo"}</strong><small>{job.label || "Untitled job"} · {new Date(photo.createdAt).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</small></span></Link>
    </li>)}</ul>}
  </main>;
}
