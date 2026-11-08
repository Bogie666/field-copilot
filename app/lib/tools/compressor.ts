import type { Reading } from "../job/types";
import { fmt, parseDecimal, worstTone, type ResultItem } from "./numbers";

// Single-phase compressor winding resistance and insulation (megohm) test.
// The winding identity S-R = C-S + C-R is physics; the sum tolerance is a house screening band.

/** House screening band for the winding sum check. Pending technical approval (see HANDOFF.md). */
export const WINDING_SUM_TOLERANCE_PCT = 10;

export type CompressorInput = {
  csOhms: string;
  crOhms: string;
  srOhms: string;
  csOpen: boolean;
  crOpen: boolean;
  srOpen: boolean;
  groundMegohm: string;
  groundMinMegohm: string;
  hotShell: boolean;
};

export const EMPTY_COMPRESSOR: CompressorInput = {
  csOhms: "",
  crOhms: "",
  srOhms: "",
  csOpen: false,
  crOpen: false,
  srOpen: false,
  groundMegohm: "",
  groundMinMegohm: "",
  hotShell: false,
};

export type CompressorResult = {
  items: ResultItem[];
  notes: string[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type CompressorAssessment = { errors: string[]; result: CompressorResult | null };

const PAIRS = [
  { key: "cs", label: "C-S", ohms: "csOhms", open: "csOpen" },
  { key: "cr", label: "C-R", ohms: "crOhms", open: "crOpen" },
  { key: "sr", label: "S-R", ohms: "srOhms", open: "srOpen" },
] as const;

export function assessCompressor(input: CompressorInput): CompressorAssessment {
  const errors: string[] = [];
  const parsed = PAIRS.map((p) => ({ ...p, value: parseDecimal(input[p.ohms], `${p.label} resistance`, { min: 0, max: 1000 }), isOpen: input[p.open] === true }));
  const ground = parseDecimal(input.groundMegohm, "Winding to ground", { min: 0, max: 100_000 });
  const groundMin = parseDecimal(input.groundMinMegohm, "Minimum to ground", { positive: true, max: 100_000 });
  for (const p of parsed) {
    if (p.value.ok === false) errors.push(p.value.error);
    if (p.isOpen && p.value.ok === true) errors.push(`${p.label} is marked open; clear the reading or the open mark.`);
  }
  for (const x of [ground, groundMin]) if (x.ok === false) errors.push(x.error);
  const anyWinding = parsed.some((p) => p.isOpen || p.value.ok === true);
  if (!anyWinding && ground.ok !== true) errors.push("Enter winding resistance or a winding-to-ground reading.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const notes: string[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];
  const ohms = Object.fromEntries(parsed.map((p) => [p.key, p.value.ok === true ? p.value.value : null])) as Record<"cs" | "cr" | "sr", number | null>;

  for (const p of parsed) {
    if (p.isOpen) {
      readings.push({ label: `${p.label} resistance`, value: "open", unit: "ohm", source: "entered" });
      items.push({ id: p.key, label: p.label, line: `${p.label} reads open.`, tone: "concern" });
    } else if (p.value.ok === true) {
      readings.push({ label: `${p.label} resistance`, value: p.value.value, unit: "ohm", source: "entered" });
      if (p.value.value === 0) items.push({ id: p.key, label: p.label, line: `${p.label} reads 0 ohms (shorted winding, or meter leads not zeroed).`, tone: "concern" });
    }
  }
  const opens = parsed.filter((p) => p.isOpen).map((p) => p.key);
  if (opens.length === 2 && opens.includes("cs") && opens.includes("cr") && !opens.includes("sr")) {
    notes.push(input.hotShell
      ? "C-S and C-R open with S-R intact on a hot compressor points to an open internal overload. Let it cool fully and retest before condemning it."
      : "C-S and C-R open with S-R intact usually means the internal overload is open, or the common terminal or lead has failed.");
  }

  if (ohms.cs !== null && ohms.cr !== null && ohms.sr !== null && ohms.cs > 0 && ohms.cr > 0 && ohms.sr > 0) {
    const sum = ohms.cs + ohms.cr;
    const dev = ((ohms.sr - sum) / sum) * 100;
    const ok = Math.abs(dev) <= WINDING_SUM_TOLERANCE_PCT;
    readings.push({ label: "C-S plus C-R", value: Number(sum.toFixed(3)), unit: "ohm", source: "computed" });
    references.push(`S-R equals C-S plus C-R, house screening band plus or minus ${WINDING_SUM_TOLERANCE_PCT} percent`);
    items.push({ id: "sum", label: "Winding check", line: `S-R ${fmt(ohms.sr, 2)} ohms against C-S plus C-R ${fmt(sum, 2)} ohms (${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent): ${ok ? "consistent" : "inconsistent"}.`, tone: ok ? "ok" : "concern" });
    const largest = Math.max(ohms.cs, ohms.cr, ohms.sr);
    if (largest !== ohms.sr) notes.push("S-R should be the highest reading. Check the terminal identification before relying on these readings.");
    else if (ohms.cs < ohms.cr) notes.push("Run winding (C-R) normally reads lower than start winding (C-S). Check the terminal identification.");
  }

  if (ground.ok === true) {
    readings.push({ label: "Winding to ground", value: ground.value, unit: "megohm", source: "entered" });
    if (groundMin.ok === true) {
      const low = ground.value < groundMin.value;
      references.push(`minimum insulation resistance ${fmt(groundMin.value)} megohm`);
      items.push({ id: "ground", label: "Insulation", line: `Winding to ground ${fmt(ground.value)} megohm is ${low ? "below" : "at or above"} the ${fmt(groundMin.value)} megohm minimum.`, tone: low ? "concern" : "ok" });
    } else {
      items.push({ id: "ground", label: "Insulation", line: `Winding to ground ${fmt(ground.value)} megohm. No minimum entered, so it is not classified.`, tone: ground.value === 0 ? "concern" : "info" });
    }
    if (ground.value === 0) notes.push("A dead short to ground can energize the compressor shell. Keep the circuit off and follow lockout procedure.");
  }

  if (anyWinding && !items.some((i) => i.id === "sum" || ["cs", "cr", "sr"].includes(i.id))) {
    const recorded = parsed.filter((p) => p.value.ok === true).map((p) => `${p.label} ${fmt((p.value as { value: number }).value, 2)} ohms`);
    items.push({ id: "windings", label: "Windings", line: `Windings recorded: ${recorded.join(", ")}. Enter all three to check them against each other.`, tone: "info" });
  }

  const tone = worstTone(items);
  return {
    errors: [],
    result: {
      items,
      notes,
      severity: tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info",
      diagnosis: items.map((i) => i.line).join(" "),
      readings,
      reference: references.join("; "),
    },
  };
}
