// Per-device tool shortcuts: favorites the tech stars and a local open count for
// "most used". Stored in localStorage only; never part of a job or sent anywhere.

export const FAVORITES_KEY = "field-copilot:tool-favorites:v1";
export const USAGE_KEY = "field-copilot:tool-usage:v1";
const CHANGE_EVENT = "field-copilot:tool-prefs";
export const MOST_USED_LIMIT = 4;
const MAX_IDS = 50;

export type ToolPrefs = { favorites: string[]; usage: Record<string, number> };
export const EMPTY_PREFS: ToolPrefs = { favorites: [], usage: {} };

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: shortcuts are a convenience, so fail quietly.
  }
  cached = null;
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** Malformed storage is ignored rather than trusted. */
export function parsePrefs(favorites: unknown, usage: unknown): ToolPrefs {
  const favs = Array.isArray(favorites) ? [...new Set(favorites.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 64))].slice(0, MAX_IDS) : [];
  const counts: Record<string, number> = {};
  if (usage && typeof usage === "object" && !Array.isArray(usage)) {
    for (const [id, n] of Object.entries(usage as Record<string, unknown>).slice(0, MAX_IDS * 2)) {
      if (id.length <= 64 && typeof n === "number" && Number.isFinite(n) && n > 0) counts[id] = Math.floor(n);
    }
  }
  return { favorites: favs, usage: counts };
}

let cached: ToolPrefs | null = null;
export function getPrefs(): ToolPrefs {
  if (typeof window === "undefined") return EMPTY_PREFS;
  cached ??= parsePrefs(read(FAVORITES_KEY), read(USAGE_KEY));
  return cached;
}

export function subscribePrefs(callback: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === FAVORITES_KEY || e.key === USAGE_KEY || e.key === null) { cached = null; callback(); }
  };
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function toggleFavorite(id: string): void {
  const { favorites } = getPrefs();
  write(FAVORITES_KEY, favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id].slice(-MAX_IDS));
}

export function recordToolUse(id: string): void {
  const { usage } = getPrefs();
  write(USAGE_KEY, { ...usage, [id]: (usage[id] ?? 0) + 1 });
}

/** Most opened tools that are not already favorites, ties broken by the given order. */
export function mostUsed(prefs: ToolPrefs, known: readonly string[], limit = MOST_USED_LIMIT): string[] {
  return known
    .filter((id) => (prefs.usage[id] ?? 0) > 0 && !prefs.favorites.includes(id))
    .map((id, index) => ({ id, index, count: prefs.usage[id] }))
    .sort((a, b) => b.count - a.count || a.index - b.index)
    .slice(0, limit)
    .map((x) => x.id);
}
