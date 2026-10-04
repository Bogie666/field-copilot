// Tiny external store so the app bar can show whether work is kept on this device.
export type PersistenceState = "idle" | "saving" | "saved" | "volatile";

let state: PersistenceState = "idle";
let savedAt: number | null = null;
const listeners = new Set<() => void>();

export function setPersistenceState(next: PersistenceState, at: number | null = null) {
  state = next;
  if (next === "saved") savedAt = at ?? Date.now();
  listeners.forEach((listener) => listener());
}

export function subscribePersistence(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPersistenceSnapshot(): string {
  return `${state}|${savedAt ?? ""}`;
}

export function parsePersistenceSnapshot(snapshot: string): { state: PersistenceState; savedAt: number | null } {
  const [s, at] = snapshot.split("|");
  return { state: s as PersistenceState, savedAt: at ? Number(at) : null };
}
