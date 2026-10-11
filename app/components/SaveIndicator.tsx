"use client";

import { useSyncExternalStore } from "react";
import { getPersistenceSnapshot, parsePersistenceSnapshot, subscribePersistence } from "../lib/job/persistenceStatus";

export default function SaveIndicator() {
  const snapshot = useSyncExternalStore(subscribePersistence, getPersistenceSnapshot, () => "idle|");
  const { state, savedAt } = parsePersistenceSnapshot(snapshot);
  if (state === "idle") return null;
  const text =
    state === "conflict"
      ? "Save conflict: review changes"
      : state === "failed"
        ? "Save failed: retry needed"
        : state === "volatile"
      ? "Session only: not saved on device"
      : state === "saving"
        ? "Saving"
        : `Saved ${savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}`.trim();
  return (
    <span className="saveState" data-state={state} role="status" aria-live="polite">
      {text}
    </span>
  );
}
