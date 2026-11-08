// Per-device preferences kept in localStorage: text size, keep-screen-awake and the
// technician profile printed on reports. Read through useSyncExternalStore-friendly helpers.

export const TEXT_SIZE_KEY = "fc.textSize";
export const WAKE_LOCK_KEY = "fc.wakeLock";
export const PROFILE_KEY = "fc.techProfile";
export const PREFS_EVENT = "fc-prefs-change";

export const TEXT_SIZES = [
  { id: "normal", label: "Normal", zoom: 1 },
  { id: "large", label: "Large", zoom: 1.12 },
  { id: "xlarge", label: "Extra large", zoom: 1.25 },
] as const;
export type TextSize = (typeof TEXT_SIZES)[number]["id"];

export type TechProfile = { name: string; company: string };
export const EMPTY_PROFILE: TechProfile = { name: "", company: "" };
const MAX_PROFILE_TEXT = 80;

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* blocked storage: the choice lasts for this visit only */ }
  window.dispatchEvent(new Event(PREFS_EVENT));
}

export function subscribePrefs(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key.startsWith("fc.")) listener(); };
  window.addEventListener(PREFS_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREFS_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function isTextSize(value: unknown): value is TextSize {
  return TEXT_SIZES.some((size) => size.id === value);
}
export function getTextSize(): TextSize {
  const value = document.documentElement.dataset.text;
  return isTextSize(value) ? value : "normal";
}
export function setTextSize(size: TextSize): void {
  if (size === "normal") delete document.documentElement.dataset.text;
  else document.documentElement.dataset.text = size;
  write(TEXT_SIZE_KEY, size === "normal" ? null : size);
}

export function getWakeLockPref(): boolean {
  return read(WAKE_LOCK_KEY) === "1";
}
export function setWakeLockPref(on: boolean): void {
  write(WAKE_LOCK_KEY, on ? "1" : null);
}

/** Stored profile text is untrusted: trimmed, length-limited and stripped of control characters. */
export function normalizeProfile(value: unknown): TechProfile {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const clean = (text: unknown) => typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_PROFILE_TEXT) : "";
  return { name: clean(record.name), company: clean(record.company) };
}
let cachedRaw: string | null | undefined;
let cachedProfile: TechProfile = EMPTY_PROFILE;
export function getProfile(): TechProfile {
  const raw = read(PROFILE_KEY);
  if (raw === cachedRaw) return cachedProfile;
  cachedRaw = raw;
  try { cachedProfile = raw ? normalizeProfile(JSON.parse(raw)) : EMPTY_PROFILE; } catch { cachedProfile = EMPTY_PROFILE; }
  return cachedProfile;
}
export function setProfile(profile: TechProfile): void {
  const value = normalizeProfile(profile);
  write(PROFILE_KEY, value.name || value.company ? JSON.stringify(value) : null);
}

/** "Prepared by" line for reports; blank when no profile is set. */
export function preparedByLine(profile: TechProfile | null | undefined): string {
  const p = normalizeProfile(profile);
  if (!p.name && !p.company) return "";
  return p.name && p.company ? `${p.name}, ${p.company}` : p.name || p.company;
}

/** Inline, dependency-free; applies the stored text size before first paint. */
export const TEXT_SIZE_BOOT_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(TEXT_SIZE_KEY)});if(${JSON.stringify(TEXT_SIZES.map((s) => s.id).filter((id) => id !== "normal"))}.indexOf(t)>=0)document.documentElement.dataset.text=t}catch(e){}`;
