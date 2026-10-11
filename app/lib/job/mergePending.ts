import { scopeKey, type Job } from "./types";

const equal = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);
function key(value: unknown, path: string): string | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.id === "string") return row.id;
  const scope = row.scope as Parameters<typeof scopeKey>[0] | undefined;
  if (scope && typeof row.key === "string") return `${row.key}:${scopeKey(scope)}${path.endsWith("findingHistory") ? `:${row.confirmedAt}` : ""}`;
  if (scope && typeof row.toolId === "string" && typeof row.slot === "string") return `${row.toolId}:${scopeKey(scope)}:${row.slot}`;
  if (scope && typeof row.acceptedAt === "string") return `${scopeKey(scope)}:${row.acceptedAt}`;
  return null;
}
function merge(base: unknown, saved: unknown, current: unknown, path: string): unknown {
  if (equal(current, base)) return saved;
  if (equal(saved, base)) return current;
  if (Array.isArray(base) && Array.isArray(saved) && Array.isArray(current)) {
    if (![...base, ...saved, ...current].every(value => key(value, path) !== null)) return current;
    const b = new Map(base.map(value => [key(value, path)!, value]));
    const s = new Map(saved.map(value => [key(value, path)!, value]));
    const c = new Map(current.map(value => [key(value, path)!, value]));
    const result: unknown[] = [];
    for (const id of new Set([...c.keys(), ...s.keys()])) {
      if (b.has(id) && !c.has(id)) continue; // A later local deletion wins.
      if (b.has(id) && !s.has(id) && equal(c.get(id), b.get(id))) continue;
      result.push(merge(b.get(id), s.get(id), c.get(id), `${path}[]`));
    }
    return result.filter(value => value !== undefined);
  }
  if (base && saved && current && typeof base === "object" && typeof saved === "object" && typeof current === "object" && !Array.isArray(base) && !Array.isArray(saved) && !Array.isArray(current)) {
    const b = base as Record<string, unknown>, s = saved as Record<string, unknown>, c = current as Record<string, unknown>;
    const result: Record<string, unknown> = {};
    for (const field of new Set([...Object.keys(b), ...Object.keys(s), ...Object.keys(c)])) {
      const value = merge(b[field], s[field], c[field], `${path}.${field}`);
      if (value !== undefined) result[field] = value;
    }
    return result;
  }
  return current; // Both changed the same value: retain the later local edit for the next write.
}

/** A completed save must not clear drafts or overwrite inputs typed while its transaction ran. */
export function mergePendingChanges(started: Job, saved: Job, current: Job): Job {
  if (current === started) return saved;
  const result = merge(started, saved, current, "job") as Job;
  result.storageRevision = saved.storageRevision;
  const removed = new Set(started.systems.filter(system => !current.systems.some(s => s.id === system.id)).map(s => s.id));
  if (removed.size) {
    result.photos = result.photos.filter(p => !p.systemId || !removed.has(p.systemId));
    result.findings = result.findings.filter(f => f.scope.kind === "home" || !removed.has(f.scope.systemId));
    result.drafts = result.drafts?.filter(d => d.scope.kind === "home" || !removed.has(d.scope.systemId));
    result.findingHistory = result.findingHistory?.filter(f => f.scope.kind === "home" || !removed.has(f.scope.systemId));
    result.notesTidyHistory = result.notesTidyHistory?.filter(entry => entry.scope.kind === "home" || !removed.has(entry.scope.systemId));
  }
  return result;
}
