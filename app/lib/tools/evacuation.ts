import type { Reading } from "../job/types";
import { fmt, parseDecimal, worstTone, type ResultItem } from "./numbers";

// Standing nitrogen pressure test and evacuation/decay test. Acceptance values come from
// the manufacturer or company procedure and are typed by the technician.

export type EvacuationInput = {
  n2StartPsig: string;
  n2EndPsig: string;
  n2StartF: string;
  n2EndF: string;
  n2Minutes: string;
  n2AllowedDropPsig: string;
  finalMicrons: string;
  holdMinutes: string;
  holdEndMicrons: string;
  targetMicrons: string;
  maxHoldMicrons: string;
};

export const EMPTY_EVACUATION: EvacuationInput = {
  n2StartPsig: "",
  n2EndPsig: "",
  n2StartF: "",
  n2EndF: "",
  n2Minutes: "",
  n2AllowedDropPsig: "",
  finalMicrons: "",
  holdMinutes: "",
  holdEndMicrons: "",
  targetMicrons: "",
  maxHoldMicrons: "",
};

/** Standard atmosphere for converting gauge to absolute pressure. Altitude changes this slightly. */
export const ATMOSPHERE_PSI = 14.7;

/** Ideal-gas expected gauge pressure after a temperature change in a sealed system. */
export function temperatureCorrectedPsig(startPsig: number, startF: number, endF: number): number {
  return ((startPsig + ATMOSPHERE_PSI) * (endF + 459.67)) / (startF + 459.67) - ATMOSPHERE_PSI;
}

export type EvacuationResult = {
  items: ResultItem[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  correctedLossPsig: number | null;
  riseMicrons: number | null;
};

export type EvacuationAssessment = { errors: string[]; result: EvacuationResult | null };

export function assessEvacuation(input: EvacuationInput): EvacuationAssessment {
  const errors: string[] = [];
  const n = {
    n2Start: parseDecimal(input.n2StartPsig, "Starting nitrogen pressure", { positive: true, max: 800 }),
    n2End: parseDecimal(input.n2EndPsig, "Ending nitrogen pressure", { min: 0, max: 800 }),
    n2StartF: parseDecimal(input.n2StartF, "Starting temperature", { min: -40, max: 160 }),
    n2EndF: parseDecimal(input.n2EndF, "Ending temperature", { min: -40, max: 160 }),
    n2Minutes: parseDecimal(input.n2Minutes, "Pressure test duration", { positive: true, max: 10_000 }),
    n2Allowed: parseDecimal(input.n2AllowedDropPsig, "Allowed pressure drop", { min: 0, max: 100 }),
    final: parseDecimal(input.finalMicrons, "Final vacuum", { min: 0, max: 760_000 }),
    holdMinutes: parseDecimal(input.holdMinutes, "Decay test duration", { positive: true, max: 1_000 }),
    holdEnd: parseDecimal(input.holdEndMicrons, "Vacuum at end of hold", { min: 0, max: 760_000 }),
    target: parseDecimal(input.targetMicrons, "Target vacuum", { positive: true, max: 10_000 }),
    maxHold: parseDecimal(input.maxHoldMicrons, "Maximum after hold", { positive: true, max: 50_000 }),
  };
  for (const parsed of Object.values(n)) if (parsed.ok === false) errors.push(parsed.error);
  if (errors.length) return { errors, result: null };
  const v = Object.fromEntries(Object.entries(n).map(([k, x]) => [k, x.ok === true ? x.value : null])) as Record<keyof typeof n, number | null>;

  if ((v.n2Start === null) !== (v.n2End === null)) errors.push("Enter starting and ending nitrogen pressure together.");
  if ((v.n2StartF === null) !== (v.n2EndF === null)) errors.push("Enter starting and ending temperature together, or neither.");
  if (v.holdEnd !== null && v.final === null) errors.push("Enter the final vacuum before isolating for the decay test.");
  if (v.holdEnd !== null && v.holdMinutes === null) errors.push("Enter how long the decay test ran.");
  if (v.n2Start === null && v.final === null) errors.push("Enter a pressure test or a vacuum reading.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];
  let correctedLossPsig: number | null = null;
  let riseMicrons: number | null = null;

  if (v.n2Start !== null && v.n2End !== null) {
    readings.push({ label: "Nitrogen start", value: v.n2Start, unit: "psig", source: "entered" }, { label: "Nitrogen end", value: v.n2End, unit: "psig", source: "entered" });
    if (v.n2Minutes !== null) readings.push({ label: "Pressure test duration", value: v.n2Minutes, unit: "min", source: "entered" });
    let expected = v.n2Start;
    let tempNote = " No temperatures entered, so the change is not temperature corrected.";
    if (v.n2StartF !== null && v.n2EndF !== null) {
      expected = temperatureCorrectedPsig(v.n2Start, v.n2StartF, v.n2EndF);
      tempNote = ` Corrected for ${fmt(v.n2StartF, 0)} to ${fmt(v.n2EndF, 0)} F, the expected end is ${fmt(expected)} psig.`;
      readings.push({ label: "Expected end (temperature corrected)", value: Number(expected.toFixed(1)), unit: "psig", source: "computed" });
      references.push(`ideal-gas temperature correction at ${ATMOSPHERE_PSI} psi atmosphere`);
    }
    correctedLossPsig = expected - v.n2End;
    const duration = v.n2Minutes !== null ? ` over ${fmt(v.n2Minutes, 0)} minutes` : "";
    const base = `Nitrogen held from ${fmt(v.n2Start, 0)} to ${fmt(v.n2End, 0)} psig${duration}.${tempNote} Loss ${fmt(Math.max(correctedLossPsig, 0))} psig.`;
    if (v.n2Allowed !== null) {
      const fail = correctedLossPsig > v.n2Allowed;
      references.push(`allowed pressure drop ${fmt(v.n2Allowed)} psig`);
      items.push({ id: "pressure", label: "Pressure test", line: `${base} ${fail ? "More than" : "Within"} the ${fmt(v.n2Allowed)} psig allowed.`, tone: fail ? "concern" : "ok" });
    } else items.push({ id: "pressure", label: "Pressure test", line: `${base} No allowed drop entered, so it is not classified.`, tone: "info" });
  }

  if (v.final !== null) {
    readings.push({ label: "Final vacuum", value: v.final, unit: "microns", source: "entered" });
    if (v.target !== null) {
      const ok = v.final <= v.target;
      references.push(`target vacuum ${fmt(v.target, 0)} microns`);
      items.push({ id: "vacuum", label: "Evacuation", line: `Pulled to ${fmt(v.final, 0)} microns, ${ok ? "at or below" : "above"} the ${fmt(v.target, 0)} micron target.`, tone: ok ? "ok" : "concern" });
    } else items.push({ id: "vacuum", label: "Evacuation", line: `Pulled to ${fmt(v.final, 0)} microns. No target entered, so it is not compared.`, tone: "info" });
  }

  if (v.final !== null && v.holdEnd !== null && v.holdMinutes !== null) {
    riseMicrons = v.holdEnd - v.final;
    readings.push({ label: "Decay test duration", value: v.holdMinutes, unit: "min", source: "entered" }, { label: "Vacuum after hold", value: v.holdEnd, unit: "microns", source: "entered" }, { label: "Rise during hold", value: riseMicrons, unit: "microns", source: "computed" });
    const base = `Isolated for ${fmt(v.holdMinutes, 0)} minutes: ${fmt(v.final, 0)} to ${fmt(v.holdEnd, 0)} microns (rise ${fmt(riseMicrons, 0)}).`;
    if (v.maxHold !== null) {
      const ok = v.holdEnd <= v.maxHold;
      references.push(`maximum after hold ${fmt(v.maxHold, 0)} microns`);
      items.push({ id: "decay", label: "Decay test", line: `${base} ${ok ? "At or below" : "Above"} the ${fmt(v.maxHold, 0)} micron limit.`, tone: ok ? "ok" : "concern" });
    } else items.push({ id: "decay", label: "Decay test", line: `${base} No limit entered, so it is not classified.`, tone: "info" });
  }

  const tone = worstTone(items);
  return {
    errors: [],
    result: {
      items,
      severity: tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info",
      diagnosis: items.map((i) => i.line).join(" "),
      readings,
      reference: references.join("; "),
      correctedLossPsig,
      riseMicrons,
    },
  };
}
