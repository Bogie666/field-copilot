"use client";

import { useSyncExternalStore } from "react";
import { getPersistenceSnapshot, parsePersistenceSnapshot, subscribePersistence } from "../lib/job/persistenceStatus";

export default function SaveIndicator() {
  const snapshot = useSyncExternalStore(subscribePersistence, getPersistenceSnapshot, () => "idle|");
  const { state, savedAt } = parsePersistenceSnapshot(snapshot);
  if (state === "idle") return null;
  const text =
    state === "volatile"
      ? "Not saved on this device"
      : state === "saving"
        ? "Saving"
        : `Saved ${savedAt ? new Date(savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : ""}`.trim();
  return (
    <span className="saveState" data-state={state} role="status" aria-live="polite">
      {text}
    </span>
  );
}
