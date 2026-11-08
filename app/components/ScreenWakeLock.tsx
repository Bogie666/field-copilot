"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { getWakeLockPref, subscribePrefs } from "../lib/devicePrefs";

type Sentinel = { release: () => Promise<void>; released: boolean };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

/** Screens where a technician is taking readings with their hands busy. */
export function wantsWakeLock(pathname: string): boolean {
  return /^\/(?:job\/|tools\/|troubleshoot\/)/.test(pathname);
}

export function wakeLockSupported(): boolean {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

/** Keeps the screen on during jobs and tools when enabled in Settings. The browser releases it when the tab is hidden. */
export default function ScreenWakeLock() {
  const enabled = useSyncExternalStore(subscribePrefs, getWakeLockPref, () => false);
  const pathname = usePathname() ?? "";
  const active = enabled && wantsWakeLock(pathname);

  useEffect(() => {
    if (!active || !wakeLockSupported()) return;
    const api = (navigator as unknown as { wakeLock: WakeLockApi }).wakeLock;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || (sentinel && !sentinel.released)) return;
      try {
        const next = await api.request("screen");
        if (cancelled) void next.release(); else sentinel = next;
      } catch { /* low battery mode or a browser policy can refuse; nothing to show */ }
    };
    const onVisible = () => { void acquire(); };
    void acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (sentinel && !sentinel.released) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
  return null;
}
