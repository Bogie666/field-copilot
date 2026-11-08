import type { Reading } from "../job/types";
import { fixed, fmt, parseDecimal, worstTone, type ResultItem } from "./numbers";

// Gas pressures and firing rate. Every acceptable range comes from the rating plate or
// installation manual and is typed by the technician; nothing is defaulted by fuel type.

export type GasFuel = "" | "natural" | "lp";

export type GasInput = {
  fuel: GasFuel;
  inletStatic: string;
  inletRunning: string;
  inletMin: string;
  inletMax: string;
  manifoldHigh: string;
  manifoldHighMin: string;
  manifoldHighMax: string;
  manifoldLow: string;
  manifoldLowMin: string;
  manifoldLowMax: string;
  dialCuFt: string;
  secondsPerRev: string;
  heatingValue: string;
  ratedInputBtuh: string;
  inputTolPct: string;
  flameUa: string;
  flameMinUa: string;
  gasLeak: boolean;
};

export const EMPTY_GAS: GasInput = {
  fuel: "",
  inletStatic: "",
  inletRunning: "",
  inletMin: "",
  inletMax: "",
  manifoldHigh: "",
  manifoldHighMin: "",
  manifoldHighMax: "",
  manifoldLow: "",
  manifoldLowMin: "",
  manifoldLowMax: "",
  dialCuFt: "",
  secondsPerRev: "",
  heatingValue: "",
  ratedInputBtuh: "",
  inputTolPct: "",
  flameUa: "",
  flameMinUa: "",
  gasLeak: false,
};

export const GAS_SAFETY_PROMPT = "Gas odor or leak: document the shutoff, customer notice and leak location. Follow company procedure and the utility's instructions.";

export type GasResult = {
  items: ResultItem[];
  severity: "ok" | "concern" | "info" | "safety";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  clockedBtuh: number | null;
};

export type GasAssessment = { errors: string[]; result: GasResult | null };

/** Firing rate from timing one revolution of a meter test dial. */
export function clockedInputBtuh(dialCuFt: number, secondsPerRev: number, heatingValueBtuPerCuFt: number): number {
  return (3600 / secondsPerRev) * dialCuFt * heatingValueBtuPerCuFt;
}

const WC = "in. w.c.";

export function assessGas(input: GasInput): GasAssessment {
  const errors: string[] = [];
  const pressure = (text: string, label: string) => parseDecimal(text, label, { min: 0, max: 30 });
  const n = {
    inletStatic: pressure(input.inletStatic, "Inlet static pressure"),
    inletRunning: pressure(input.inletRunning, "Inlet running pressure"),
    inletMin: pressure(input.inletMin, "Minimum inlet pressure"),
    inletMax: pressure(input.inletMax, "Maximum inlet pressure"),
    manifoldHigh: pressure(input.manifoldHigh, "Manifold pressure (high fire)"),
    manifoldHighMin: pressure(input.manifoldHighMin, "High fire range low"),
    manifoldHighMax: pressure(input.manifoldHighMax, "High fire range high"),
    manifoldLow: pressure(input.manifoldLow, "Manifold pressure (low fire)"),
    manifoldLowMin: pressure(input.manifoldLowMin, "Low fire range low"),
    manifoldLowMax: pressure(input.manifoldLowMax, "Low fire range high"),
    dial: parseDecimal(input.dialCuFt, "Test dial size", { positive: true, max: 100 }),
    seconds: parseDecimal(input.secondsPerRev, "Seconds per revolution", { positive: true, max: 3600 }),
    heatingValue: parseDecimal(input.heatingValue, "Heating value", { min: 500, max: 3500 }),
    rated: parseDecimal(input.ratedInputBtuh, "Rated input", { positive: true, max: 1_000_000 }),
    inputTol: parseDecimal(input.inputTolPct, "Input tolerance", { positive: true, max: 50 }),
    flame: parseDecimal(input.flameUa, "Flame signal", { min: 0, max: 100 }),
    flameMin: parseDecimal(input.flameMinUa, "Minimum flame signal", { positive: true, max: 100 }),
  };
  for (const parsed of Object.values(n)) if (parsed.ok === false) errors.push(parsed.error);
  if (errors.length) return { errors, result: null };
  const v = (x: (typeof n)[keyof typeof n]) => (x.ok === true ? x.value : null);
  const val = Object.fromEntries(Object.entries(n).map(([k, x]) => [k, v(x)])) as Record<keyof typeof n, number | null>;
  const gasLeak = input.gasLeak === true;

  const pair = (a: number | null, b: number | null, label: string) => {
    if ((a === null) !== (b === null)) errors.push(`Enter both ends of the ${label}, or neither.`);
    else if (a !== null && b !== null && a > b) errors.push(`The ${label} low value must not be above the high value.`);
  };
  pair(val.manifoldHighMin, val.manifoldHighMax, "high fire manifold range");
  pair(val.manifoldLowMin, val.manifoldLowMax, "low fire manifold range");
  if (val.inletMin !== null && val.inletMax !== null && val.inletMin > val.inletMax) errors.push("Minimum inlet pressure must not be above the maximum.");
  const clockFields = [val.dial, val.seconds, val.heatingValue].filter((x) => x !== null).length;
  if (clockFields > 0 && clockFields < 3) errors.push("To clock the meter, enter dial size, seconds per revolution and heating value together.");
  const measured = [val.inletStatic, val.inletRunning, val.manifoldHigh, val.manifoldLow, val.flame].some((x) => x !== null) || clockFields === 3;
  if (!measured && !gasLeak) errors.push("Enter at least one reading.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];
  const fuel = input.fuel === "natural" ? "natural gas" : input.fuel === "lp" ? "LP (propane)" : "";

  if (gasLeak) items.push({ id: "leak", label: "Gas leak", line: "Gas odor or leak found.", tone: "safety" });

  if (val.inletStatic !== null) {
    readings.push({ label: "Inlet static pressure", value: val.inletStatic, unit: WC, source: "entered" });
    if (val.inletMax !== null) {
      const above = val.inletStatic > val.inletMax;
      items.push({ id: "inletStatic", label: "Inlet static", line: `Inlet static ${fixed(val.inletStatic, 1)} ${WC} is ${above ? "above" : "at or below"} the ${fixed(val.inletMax, 1)} ${WC} maximum.`, tone: above ? "concern" : "ok" });
    } else items.push({ id: "inletStatic", label: "Inlet static", line: `Inlet static ${fixed(val.inletStatic, 1)} ${WC}. No maximum entered, so it is not compared.`, tone: "info" });
  }
  if (val.inletRunning !== null) {
    readings.push({ label: "Inlet running pressure", value: val.inletRunning, unit: WC, source: "entered" });
    const drop = val.inletStatic !== null ? ` That is a ${fixed(val.inletStatic - val.inletRunning, 1)} ${WC} drop from static.` : "";
    if (val.inletMin !== null) {
      const below = val.inletRunning < val.inletMin;
      items.push({ id: "inletRunning", label: "Inlet running", line: `Inlet running ${fixed(val.inletRunning, 1)} ${WC} is ${below ? "below" : "at or above"} the ${fixed(val.inletMin, 1)} ${WC} minimum.${drop}`, tone: below ? "concern" : "ok" });
    } else items.push({ id: "inletRunning", label: "Inlet running", line: `Inlet running ${fixed(val.inletRunning, 1)} ${WC}. No minimum entered, so it is not compared.${drop}`, tone: "info" });
  }
  if (val.inletMin !== null || val.inletMax !== null) references.push(`inlet range ${val.inletMin !== null ? fixed(val.inletMin, 1) : "—"} to ${val.inletMax !== null ? fixed(val.inletMax, 1) : "—"} ${WC}`);

  const manifold = (id: string, label: string, reading: number | null, min: number | null, max: number | null) => {
    if (reading === null) return;
    readings.push({ label: `Manifold pressure (${label})`, value: reading, unit: WC, source: "entered" });
    if (min !== null && max !== null) {
      const where = reading < min ? "below" : reading > max ? "above" : "within";
      references.push(`${label} manifold ${fixed(min, 1)} to ${fixed(max, 1)} ${WC}`);
      items.push({ id, label: `Manifold ${label}`, line: `Manifold ${label} ${fixed(reading, 1)} ${WC} is ${where} the ${fixed(min, 1)} to ${fixed(max, 1)} ${WC} range.`, tone: where === "within" ? "ok" : "concern" });
    } else items.push({ id, label: `Manifold ${label}`, line: `Manifold ${label} ${fixed(reading, 1)} ${WC}. No range entered, so it is not compared.`, tone: "info" });
  };
  manifold("manifoldHigh", "high fire", val.manifoldHigh, val.manifoldHighMin, val.manifoldHighMax);
  manifold("manifoldLow", "low fire", val.manifoldLow, val.manifoldLowMin, val.manifoldLowMax);

  let clockedBtuh: number | null = null;
  if (val.dial !== null && val.seconds !== null && val.heatingValue !== null) {
    clockedBtuh = clockedInputBtuh(val.dial, val.seconds, val.heatingValue);
    readings.push(
      { label: "Test dial", value: val.dial, unit: "cu ft", source: "entered" },
      { label: "Seconds per revolution", value: val.seconds, unit: "s", source: "entered" },
      { label: "Heating value", value: val.heatingValue, unit: "BTU/cu ft", source: "entered" },
      { label: "Clocked input", value: Math.round(clockedBtuh), unit: "BTU/h", source: "computed" },
    );
    references.push(`heating value ${fmt(val.heatingValue, 0)} BTU/cu ft as entered`);
    const base = `Clocked input ${Math.round(clockedBtuh).toLocaleString("en-US")} BTU/h (${fmt(val.dial, 2)} cu ft dial in ${fmt(val.seconds)} s at ${fmt(val.heatingValue, 0)} BTU/cu ft).`;
    if (val.rated !== null) {
      const dev = ((clockedBtuh - val.rated) / val.rated) * 100;
      references.push(`rated input ${Math.round(val.rated).toLocaleString("en-US")} BTU/h`);
      if (val.inputTol !== null) {
        const within = Math.abs(dev) <= val.inputTol;
        items.push({ id: "input", label: "Firing rate", line: `${base} ${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent of rated, ${within ? "within" : "outside"} the ${fmt(val.inputTol)} percent tolerance${!within && dev > 0 ? " (overfiring)" : !within ? " (underfiring)" : ""}.`, tone: within ? "ok" : "concern" });
      } else items.push({ id: "input", label: "Firing rate", line: `${base} ${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent of rated. No tolerance entered, so it is not classified.`, tone: "info" });
    } else items.push({ id: "input", label: "Firing rate", line: `${base} No rated input entered, so it is not compared.`, tone: "info" });
  }

  if (val.flame !== null) {
    readings.push({ label: "Flame signal", value: val.flame, unit: "uA", source: "entered" });
    if (val.flameMin !== null) {
      const below = val.flame < val.flameMin;
      references.push(`minimum flame signal ${fmt(val.flameMin)} uA`);
      items.push({ id: "flame", label: "Flame signal", line: `Flame signal ${fmt(val.flame)} uA is ${below ? "below" : "at or above"} the ${fmt(val.flameMin)} uA minimum.`, tone: below ? "concern" : "ok" });
    } else items.push({ id: "flame", label: "Flame signal", line: `Flame signal ${fmt(val.flame)} uA. No minimum entered, so it is not compared.`, tone: "info" });
  }

  const tone = worstTone(items);
  return {
    errors: [],
    result: {
      items,
      severity: tone,
      diagnosis: [fuel ? `Fuel: ${fuel}.` : "", ...items.map((i) => i.line)].filter(Boolean).join(" "),
      readings,
      reference: references.join("; "),
      clockedBtuh,
    },
  };
}
