"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { getBrowserStore } from "../lib/job/browserStore";
import { EMPTY_PROFILE, getProfile, getTextSize, getWakeLockPref, setProfile, setTextSize, setWakeLockPref, subscribePrefs, TEXT_SIZES, type TechProfile, type TextSize } from "../lib/devicePrefs";
import { wakeLockSupported } from "./ScreenWakeLock";
import { Check, TextField } from "./ui";

export function TextSizePicker() {
  const active = useSyncExternalStore<TextSize>(subscribePrefs, getTextSize, () => "normal");
  return (
    <div className="sizePicker" role="radiogroup" aria-label="Text size">
      {TEXT_SIZES.map((size) => (
        <button key={size.id} type="button" role="radio" aria-checked={active === size.id} className="sizeOption" onClick={() => setTextSize(size.id)}>
          <span className="sizeSample" style={{ fontSize: `${Math.round(16 * size.zoom)}px` }} aria-hidden="true">Aa</span>
          <span>{size.label}</span>
        </button>
      ))}
    </div>
  );
}

export function WakeLockSetting() {
  const on = useSyncExternalStore(subscribePrefs, getWakeLockPref, () => false);
  const supported = useSyncExternalStore(subscribePrefs, wakeLockSupported, () => true);
  return (
    <div>
      <Check label="Keep the screen on during jobs, tools and troubleshooting" checked={on && supported} disabled={!supported} onChange={setWakeLockPref} />
      <p className="hint">{supported ? "Uses more battery. The screen can still turn off when the phone is in low power mode." : "This browser does not support keeping the screen on. Change the phone's auto-lock time instead."}</p>
    </div>
  );
}

export function ProfileSetting() {
  const saved = useSyncExternalStore<TechProfile>(subscribePrefs, getProfile, () => EMPTY_PROFILE);
  const [draft, setDraft] = useState<TechProfile | null>(null);
  const value = draft ?? saved;
  const dirty = draft !== null && (draft.name.trim() !== saved.name || draft.company.trim() !== saved.company);
  return (
    <div>
      <TextField label="Technician name" value={value.name} onChange={(name) => setDraft({ ...value, name })} maxLength={80} />
      <TextField label="Company" value={value.company} onChange={(company) => setDraft({ ...value, company })} maxLength={80} />
      <p className="hint">Printed on the office report and the customer visit summary. Stored on this device only and never sent to AI features.</p>
      <div className="btnRow">
        <button className="btn primary" type="button" disabled={!dirty} onClick={() => { setProfile(value); setDraft(null); }}>{dirty ? "Save" : "Saved"}</button>
      </div>
    </div>
  );
}

type About = { offline: string; jobs: string; storage: string; persisted: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export function AboutSetting() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
  const [about, setAbout] = useState<About>({ offline: "Checking…", jobs: "Checking…", storage: "Checking…", persisted: "Checking…" });
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: About = { offline: "Not available in this browser", jobs: "Unknown", storage: "Unknown", persisted: "Unknown" };
      try {
        if ("serviceWorker" in navigator) {
          const controlled = !!navigator.serviceWorker.controller;
          const keys = typeof caches !== "undefined" ? await caches.keys() : [];
          next.offline = controlled && keys.some((key) => key.startsWith("fc-pages-")) ? "Ready" : "Not ready yet. Open the app once with a connection and wait a few seconds.";
        }
      } catch { /* report unknown */ }
      try { next.jobs = String((await getBrowserStore().list()).length); } catch { /* unknown */ }
      try {
        const estimate = await navigator.storage?.estimate?.();
        if (estimate?.usage !== undefined) next.storage = `${formatBytes(estimate.usage)} used${estimate.quota ? ` of ${formatBytes(estimate.quota)} available` : ""}`;
        const persisted = await navigator.storage?.persisted?.();
        if (persisted !== undefined) next.persisted = persisted ? "Protected from automatic cleanup" : "The browser may clear it if the phone runs low on space. Keep backups.";
      } catch { /* unknown */ }
      if (!cancelled) setAbout(next);
    })();
    return () => { cancelled = true; };
  }, []);
  const rows: Array<[string, string]> = [
    ["App version", version],
    ["Offline use", about.offline],
    ["Jobs on this device", about.jobs],
    ["Storage", about.storage],
    ["Saved data", about.persisted],
  ];
  return (
    <dl className="aboutList">
      {rows.map(([label, value]) => (
        <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
      ))}
    </dl>
  );
}
