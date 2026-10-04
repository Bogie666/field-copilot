import type { Reading } from "../job/types";
import { fmt, numbersIn, parseDecimal, type ResultItem } from "./numbers";

/**
 * Safety configuration. OPEN DECISION: the CO level that triggers a safety finding, and the
 * wording techs see, are the owner's call. Until coThresholdPpm is a number, the entered CO
 * reading is recorded but not classified. Ticked observations always trigger the safety path.
 */
export const FURNACE_SAFETY_CONFIG: {
  coThresholdPpm: number | null;
  pendingCoNote: string;
  safetyActionPrompt: string;
} = {
  coThresholdPpm: null,
  pendingCoNote: "A CO reading was recorded. No CO threshold is configured, so it is not classified. Follow your company procedure.",
  safetyActionPrompt: "Describe the safety action taken (for example, shut down and tagged the unit).",
};

export const OBSERVATIONS = [
  { id: "crackedExchanger", label: "Cracked or perforated heat exchanger" },
  { id: "rollout", label: "Flame rollout or scorch marks" },
  { id: "soot", label: "Soot or heavy carbon buildup" },
  { id: "flueBlocked", label: "Blocked, disconnected or corroded flue" },
  { id: "gasOdor", label: "Gas odor or suspected gas leak" },
] as const;

export type ObservationId = (typeof OBSERVATIONS)[number]["id"];

export type FurnaceInput = {
  returnF: string;
  supplyF: string;
  riseMinF: string;
  riseMaxF: string;
  coPpm: string;
  observations: Record<ObservationId, boolean>;
};

export const EMPTY_FURNACE: FurnaceInput = {
  returnF: "",
  supplyF: "",
  riseMinF: "",
  riseMaxF: "",
  coPpm: "",
  observations: { crackedExchanger: false, rollout: false, soot: false, flueBlocked: false, gasOdor: false },
};

/** Parses a nameplate temperature rise such as "35-65 F" into [min, max]. */
export function parseRiseRange(text: string | undefined): [number, number] | null {
  const [a, b] = numbersIn(text ?? "");
  if (a === undefined || b === undefined) return null;
  return a <= b ? [a, b] : [b, a];
}

export type FurnaceResult = {
  rise: number | null;
  items: ResultItem[];
  safety: boolean;
  /** The checked observation labels, for the safety finding text. */
  safetyReasons: string[];
  severity: "ok" | "concern" | "safety" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  notes: string[];
};

export type FurnaceAssessment = { errors: string[]; result: FurnaceResult | null };

export function assessFurnace(input: FurnaceInput, config = FURNACE_SAFETY_CONFIG): FurnaceAssessment {
  const errors: string[] = [];
  const ret = parseDecimal(input.returnF, "Return air temperature", { min: -20, max: 200 });
  const sup = parseDecimal(input.supplyF, "Supply air temperature", { min: 0, max: 400 });
  const rMin = parseDecimal(input.riseMinF, "Rise range low", { positive: true, max: 150 });
  const rMax = parseDecimal(input.riseMaxF, "Rise range high", { positive: true, max: 150 });
  const co = parseDecimal(input.coPpm, "CO reading", { min: 0, max: 5000 });
  for (const parsed of [ret, sup, rMin, rMax, co]) if (parsed.ok === false) errors.push(parsed.error);
  if ((ret.ok === "blank") !== (sup.ok === "blank")) errors.push("Enter both return and supply air temperatures, or leave both blank.");
  if ((rMin.ok === "blank") !== (rMax.ok === "blank")) errors.push("Enter both ends of the temperature rise range, or leave both blank.");
  if (rMin.ok === true && rMax.ok === true && rMin.value > rMax.value) errors.push("Rise range low must not exceed the high end.");
  const safetyReasons = OBSERVATIONS.filter((o) => input.observations[o.id]).map((o) => o.label);
  const hasAnything = ret.ok === true || co.ok === true || safetyReasons.length > 0;
  if (!hasAnything && errors.length === 0) errors.push("Enter temperatures, a CO reading, or tick an observation.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const notes: string[] = [];
  let reference = "";
  let rise: number | null = null;

  if (ret.ok === true && sup.ok === true) {
    rise = sup.value - ret.value;
    readings.push({ label: "Return air temperature", value: ret.value, unit: "F", source: "entered" });
    readings.push({ label: "Supply air temperature", value: sup.value, unit: "F", source: "entered" });
    readings.push({ label: "Temperature rise", value: Number(rise.toFixed(1)), unit: "F", source: "computed" });
    if (rMin.ok === true && rMax.ok === true) {
      reference = `nameplate temperature rise range ${fmt(rMin.value, 0)} to ${fmt(rMax.value, 0)} F`;
      const where = rise > rMax.value ? "above" : rise < rMin.value ? "below" : "within";
      items.push({
        id: "rise",
        label: "Temperature rise",
        line: `Temperature rise ${fmt(rise)} F (supply ${fmt(sup.value)} F minus return ${fmt(ret.value)} F), ${where} the ${fmt(rMin.value, 0)} to ${fmt(rMax.value, 0)} F range.`,
        tone: where === "within" ? "ok" : "concern",
      });
    } else {
      items.push({ id: "rise", label: "Temperature rise", line: `Temperature rise ${fmt(rise)} F. No nameplate range entered, so it is not compared.`, tone: "info" });
    }
  }

  if (co.ok === true) {
    readings.push({ label: "CO reading", value: co.value, unit: "ppm", source: "entered" });
    if (config.coThresholdPpm !== null) {
      const over = co.value >= config.coThresholdPpm;
      items.push({ id: "co", label: "CO", line: `CO ${fmt(co.value, 0)} ppm, ${over ? "at or above" : "below"} the configured ${fmt(config.coThresholdPpm, 0)} ppm threshold.`, tone: over ? "safety" : "ok" });
    } else {
      items.push({ id: "co", label: "CO", line: `CO ${fmt(co.value, 0)} ppm recorded.`, tone: "info" });
      notes.push(config.pendingCoNote);
    }
  }

  if (safetyReasons.length) {
    items.push({ id: "observed", label: "Observed conditions", line: `Observed: ${safetyReasons.join("; ")}.`, tone: "safety" });
  }

  const safety = items.some((i) => i.tone === "safety");
  const severity: FurnaceResult["severity"] = safety ? "safety" : items.some((i) => i.tone === "concern") ? "concern" : items.some((i) => i.tone === "ok") ? "ok" : "info";
  return { errors: [], result: { rise, items, safety, safetyReasons, severity, diagnosis: items.map((i) => i.line).join(" "), readings, reference, notes } };
}
