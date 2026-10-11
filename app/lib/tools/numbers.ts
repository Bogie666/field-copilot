// Shared strict number parsing for tool inputs. Inputs arrive as raw form strings.

export type Parsed = { ok: true; value: number } | { ok: false; error: string } | { ok: "blank" };

/** Strict decimal. Rejects "2in", "1,5", "1e3", and blank is reported separately so callers decide. */
export function parseDecimal(text: string | undefined, label: string, opts: { min?: number; max?: number; positive?: boolean } = {}): Parsed {
  const raw = (text ?? "").trim();
  if (!raw) return { ok: "blank" };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(raw)) return { ok: false, error: `${label} must be a plain number.` };
  const value = Number(raw);
  if (!Number.isFinite(value)) return { ok: false, error: `${label} must be a plain number.` };
  if (opts.positive && value <= 0) return { ok: false, error: `${label} must be greater than zero.` };
  if (opts.min !== undefined && value < opts.min) return { ok: false, error: `${label} must be at least ${opts.min}.` };
  if (opts.max !== undefined && value > opts.max) return { ok: false, error: `${label} must be at most ${opts.max}.` };
  return { ok: true, value };
}

export function round(value: number, places = 1): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export function fmt(value: number, places = 1): string {
  const r = round(value, places);
  return Object.is(r, -0) ? "0" : String(r);
}

/** Fixed decimal places, for readings where trailing zeros matter (static pressure). */
export function fixed(value: number, places = 2): string {
  return round(value, places).toFixed(places);
}

/**
 * A single reviewed nameplate quantity, optionally followed by one of the expected
 * units. Match the entire value: never turn a malformed number, range, exponent,
 * or an unrelated unit into a usable reference by taking its first digit run.
 * Signs are preserved so the tool's normal validation can reject negative ratings.
 */
export function quantityFrom(text: string | undefined, units: RegExp): string {
  const match = /^([-+]?(?:\d+\.?\d*|\.\d+))\s*(.*?)$/.exec((text ?? "").trim());
  if (!match || (match[2] && !units.test(match[2]))) return "";
  const parsed = parseDecimal(match[1], "Nameplate quantity");
  if (parsed.ok !== true) return "";
  return Object.is(parsed.value, -0) ? "-0" : String(parsed.value);
}

/** Legacy multi-value extraction for capacity/rise fields; not for scalar references. */
export function numbersIn(text: string): number[] {
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter(Number.isFinite);
}

export type Tone = "ok" | "concern" | "info" | "safety";

export type ResultItem = { id: string; label: string; line: string; tone: Tone };

export function worstTone(items: Array<{ tone: Tone }>): "ok" | "concern" | "info" | "safety" {
  if (items.some((i) => i.tone === "safety")) return "safety";
  if (items.some((i) => i.tone === "concern")) return "concern";
  if (items.some((i) => i.tone === "ok")) return "ok";
  return "info";
}
