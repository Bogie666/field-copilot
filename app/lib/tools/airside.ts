import type { Reading } from "../job/types";
import { fmt, parseDecimal, worstTone, type ResultItem } from "./numbers";

// Filter, condensate and indoor humidity. Observations, not measurements against a standard.

type Option<T extends string> = { value: T; label: string; tone: "ok" | "concern" };

export const FILTER_CONDITIONS = [
  { value: "clean", label: "Clean", tone: "ok" },
  { value: "dirty", label: "Dirty or loaded", tone: "concern" },
  { value: "missing", label: "Missing", tone: "concern" },
  { value: "wrongSize", label: "Wrong size or gaps around it", tone: "concern" },
] as const satisfies readonly Option<string>[];

export const DRAIN_FLOW = [
  { value: "flowing", label: "Drains freely", tone: "ok" },
  { value: "slow", label: "Slow", tone: "concern" },
  { value: "blocked", label: "Blocked", tone: "concern" },
] as const satisfies readonly Option<string>[];

export const DRAIN_TRAP = [
  { value: "present", label: "Trapped and primed", tone: "ok" },
  { value: "dry", label: "Trap dry or unprimed", tone: "concern" },
  { value: "missing", label: "No trap where one is required", tone: "concern" },
] as const satisfies readonly Option<string>[];

export const SAFETY_SWITCH = [
  { value: "testedOk", label: "Present, tested, shuts the system off", tone: "ok" },
  { value: "failed", label: "Present, did not shut the system off", tone: "concern" },
  { value: "untested", label: "Present, not tested", tone: "ok" },
  { value: "none", label: "None installed", tone: "concern" },
] as const satisfies readonly Option<string>[];

export const PAN_CONDITION = [
  { value: "dry", label: "Dry and sound", tone: "ok" },
  { value: "water", label: "Water in the pan", tone: "concern" },
  { value: "rusted", label: "Rusted or cracked", tone: "concern" },
  { value: "none", label: "No secondary pan", tone: "ok" },
] as const satisfies readonly Option<string>[];

export type AirsideInput = {
  filterSize: string;
  filterRating: string;
  filterCondition: string;
  drainFlow: string;
  drainTrap: string;
  safetySwitch: string;
  pan: string;
  indoorF: string;
  indoorRh: string;
};

export const EMPTY_AIRSIDE: AirsideInput = { filterSize: "", filterRating: "", filterCondition: "", drainFlow: "", drainTrap: "", safetySwitch: "", pan: "", indoorF: "", indoorRh: "" };

/** Magnus approximation, adequate for indoor conditions. */
export function dewPointF(tempF: number, rhPct: number): number {
  const c = ((tempF - 32) * 5) / 9;
  const a = 17.62, b = 243.12;
  const gamma = Math.log(rhPct / 100) + (a * c) / (b + c);
  const dewC = (b * gamma) / (a - gamma);
  return (dewC * 9) / 5 + 32;
}

export type AirsideResult = { items: ResultItem[]; severity: "ok" | "concern" | "info"; diagnosis: string; readings: Reading[]; reference: string; dewPointF: number | null };
export type AirsideAssessment = { errors: string[]; result: AirsideResult | null };

function pick<T extends readonly Option<string>[]>(options: T, value: string): T[number] | undefined {
  return options.find((o) => o.value === value);
}

export function assessAirside(input: AirsideInput): AirsideAssessment {
  const errors: string[] = [];
  const temp = parseDecimal(input.indoorF, "Indoor temperature", { min: 30, max: 120 });
  const rh = parseDecimal(input.indoorRh, "Indoor relative humidity", { positive: true, max: 100 });
  for (const x of [temp, rh]) if (x.ok === false) errors.push(x.error);
  if ((temp.ok === true) !== (rh.ok === true) && temp.ok !== false && rh.ok !== false) errors.push("Enter indoor temperature and relative humidity together.");
  const filter = pick(FILTER_CONDITIONS, input.filterCondition);
  const flow = pick(DRAIN_FLOW, input.drainFlow);
  const trap = pick(DRAIN_TRAP, input.drainTrap);
  const sw = pick(SAFETY_SWITCH, input.safetySwitch);
  const pan = pick(PAN_CONDITION, input.pan);
  const anyObservation = !!(filter || flow || trap || sw || pan || input.filterSize.trim() || input.filterRating.trim());
  if (!anyObservation && temp.ok !== true) errors.push("Record at least one observation or reading.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const size = input.filterSize.trim();
  const rating = input.filterRating.trim();
  if (filter || size || rating) {
    const desc = [size, rating].filter(Boolean).join(", ");
    items.push({ id: "filter", label: "Filter", line: `Filter${desc ? ` (${desc})` : ""}: ${filter ? filter.label.toLowerCase() : "condition not recorded"}.`, tone: filter?.tone ?? "info" });
  }
  const drainParts = [flow && `drain ${flow.label.toLowerCase()}`, trap && trap.label.toLowerCase()].filter(Boolean);
  if (drainParts.length) items.push({ id: "drain", label: "Condensate drain", line: `Condensate: ${drainParts.join("; ")}.`, tone: [flow, trap].some((o) => o?.tone === "concern") ? "concern" : "ok" });
  if (sw) items.push({ id: "switch", label: "Overflow safety switch", line: `Overflow safety switch: ${sw.label.toLowerCase()}.`, tone: sw.value === "untested" ? "info" : sw.tone });
  if (pan) items.push({ id: "pan", label: "Secondary pan", line: `Secondary pan: ${pan.label.toLowerCase()}.`, tone: pan.tone });

  let dew: number | null = null;
  if (temp.ok === true && rh.ok === true) {
    dew = dewPointF(temp.value, rh.value);
    readings.push({ label: "Indoor temperature", value: temp.value, unit: "F", source: "entered" }, { label: "Indoor relative humidity", value: rh.value, unit: "%", source: "entered" }, { label: "Indoor dew point", value: Number(dew.toFixed(1)), unit: "F", source: "computed" });
    items.push({ id: "humidity", label: "Indoor humidity", line: `Indoor ${fmt(temp.value, 0)} F at ${fmt(rh.value, 0)} percent relative humidity (dew point ${fmt(dew)} F).`, tone: "info" });
  }

  const tone = worstTone(items);
  return {
    errors: [],
    result: { items, severity: tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info", diagnosis: items.map((i) => i.line).join(" "), readings, reference: dew !== null ? "dew point by the Magnus approximation" : "", dewPointF: dew },
  };
}
