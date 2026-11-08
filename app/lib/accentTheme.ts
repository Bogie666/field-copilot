// Accent color theme, stored per device. Applied before first paint by the inline script in
// the root layout, so the page never flashes the default color.

export const ACCENT_KEY = "fc.accent";
export const ACCENT_EVENT = "fc-accent-change";

export const ACCENTS = [
  { id: "purple", label: "Purple", swatch: "#9184d9" },
  { id: "teal", label: "Teal", swatch: "oklch(0.7 0.12 190)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.7 0.12 250)" },
  { id: "green", label: "Green", swatch: "oklch(0.7 0.126 150)" },
  { id: "graphite", label: "Graphite", swatch: "oklch(0.74 0.03 250)" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export function isAccent(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

/** Inline, dependency-free version for the layout <head>. Unknown or blocked storage keeps purple. */
export const ACCENT_BOOT_SCRIPT = `try{var a=localStorage.getItem(${JSON.stringify(ACCENT_KEY)});if(${JSON.stringify(ACCENTS.map((x) => x.id).filter((id) => id !== "purple"))}.indexOf(a)>=0)document.documentElement.dataset.accent=a}catch(e){}`;

export function applyAccent(id: AccentId): void {
  if (id === "purple") delete document.documentElement.dataset.accent;
  else document.documentElement.dataset.accent = id;
  try { window.localStorage.setItem(ACCENT_KEY, id); } catch { /* the choice then lasts for this visit */ }
  window.dispatchEvent(new Event(ACCENT_EVENT));
}

export function currentAccent(): AccentId {
  const value = document.documentElement.dataset.accent;
  return isAccent(value) ? value : "purple";
}
