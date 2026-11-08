"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
}

/** Registers the offline service worker (production only) and shows a banner while offline. */
export default function OfflineSupport() {
  const online = useOnline();
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const version = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(version)}`, { scope: "/" }).catch(() => undefined);
  }, []);
  if (online) return null;
  return (
    <div className="offlineBanner noPrint" role="status">
      Offline. Jobs, tools and notes keep working and save on this device. AI note features need a connection.
    </div>
  );
}
