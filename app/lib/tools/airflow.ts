import { cfmFromRoundDuctVelocity, cfmFromVelocity, roundTo, sensibleBtuh, totalBtuh } from "../calculations";
import { airflowBand, airflowBandState, averageReadings, type AirflowMethod, type BandState, type OperatingMode } from "../fieldScreening";
import type { Reading } from "../job/types";
import { fmt, numbersIn, parseDecimal } from "./numbers";

export type AirflowInput = {
  mode: OperatingMode;
  method: AirflowMethod | "";
  shape: "rect" | "round";
  readings: string[];
  afterReadings: string[];
  width: string;
  height: string;
  diameter: string;
  tons: string;
  deltaT: string;
  enthalpy: string;
};

export const EMPTY_AIRFLOW: AirflowInput = { mode: "cooling", method: "", shape: "rect", readings: [""], afterReadings: [], width: "", height: "", diameter: "", tons: "", deltaT: "", enthalpy: "" };

export const METHOD_LABELS: Record<AirflowMethod, string> = {
  "velocity-traverse": "Duct velocity traverse",
  "flow-hood": "Flow hood",
  grille: "Grille velocity",
  estimated: "Estimated CFM",
};

export const FLOW_HOOD_READING_SCOPE = "Enter repeated whole-system flow-hood readings, not individual outlet readings. Readings are averaged, not summed. Individual outlets must not be compared with the system CFM/ton band.";

export function directCfm(method: AirflowInput["method"]) {
  return method === "flow-hood" || method === "estimated";
}

/** Tons from a nameplate capacity such as "36000 BTUH". Returns "" when it cannot be read. */
export function tonsFromCapacity(capacity: string | undefined): string {
  const n = numbersIn((capacity ?? "").replace(/,/g, ""))[0];
  if (n === undefined) return "";
  if (n >= 6000) return String(roundTo(n / 12000, 1));
  return "";
}

export type AirflowResult = {
  average: number;
  unit: "FPM" | "CFM";
  cfm: number;
  cfmPerTon: number;
  band: BandState;
  statusText: string;
  afterCfm: number | null;
  changeCfm: number | null;
  changePct: number | null;
  sensible: number | null;
  total: number | null;
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type AirflowAssessment = { errors: string[]; result: AirflowResult | null };

function parseList(list: string[], label: string, errors: string[]): number[] {
  const values: number[] = [];
  list.forEach((text, i) => {
    const p = parseDecimal(text, `${label} ${i + 1}`, { positive: true, max: 100000 });
    if (p.ok === true) values.push(p.value);
    else if (p.ok === false) errors.push(p.error);
  });
  return values;
}

export function assessAirflow(input: AirflowInput): AirflowAssessment {
  const errors: string[] = [];
  if (!input.method) errors.push("Choose the measurement method.");
  const direct = directCfm(input.method);
  const unit: "FPM" | "CFM" = direct ? "CFM" : "FPM";
  const readings = parseList(input.readings.filter((r) => r.trim()), direct ? "Airflow reading" : "Velocity reading", errors);
  if (readings.length === 0 && !errors.some((e) => /reading/i.test(e))) errors.push("Enter at least one reading.");
  const after = parseList(input.afterReadings.filter((r) => r.trim()), "After reading", errors);
  const tons = parseDecimal(input.tons, "System tonnage", { positive: true, max: 30 });
  const width = parseDecimal(input.width, "Duct width", { positive: true, max: 200 });
  const height = parseDecimal(input.height, "Duct height", { positive: true, max: 200 });
  const diameter = parseDecimal(input.diameter, "Duct diameter", { positive: true, max: 200 });
  const deltaT = parseDecimal(input.deltaT, "Delta-T", { positive: true, max: 100 });
  const enthalpy = parseDecimal(input.enthalpy, "Enthalpy delta", { positive: true, max: 100 });
  for (const p of [tons, width, height, diameter, deltaT, enthalpy]) if (p.ok === false) errors.push(p.error);
  if (tons.ok === "blank") errors.push("Enter the system tonnage.");
  if (!direct && input.method) {
    if (input.shape === "rect") {
      if (width.ok === "blank") errors.push("Enter the duct width.");
      if (height.ok === "blank") errors.push("Enter the duct height.");
    } else if (diameter.ok === "blank") errors.push("Enter the duct diameter.");
  }
  if (errors.length || tons.ok !== true) return { errors, result: null };

  const toCfm = (v: number) => (direct ? v : input.shape === "rect" ? cfmFromVelocity(v, (width as { value: number }).value, (height as { value: number }).value) : cfmFromRoundDuctVelocity(v, (diameter as { value: number }).value));
  // Validate raw derived values before helpers round (or replace nonfinite values with zero).
  const rawAverage = readings.reduce((sum, value) => sum + value, 0) / readings.length;
  const area = direct ? 1 : input.shape === "rect" ? ((width as { value: number }).value * (height as { value: number }).value) / 144 : Math.PI * ((diameter as { value: number }).value / 24) ** 2;
  const rawCfm = rawAverage * area;
  const rawCfmPerTon = rawCfm / tons.value;
  const rawAfterCfm = after.length ? (after.reduce((sum, value) => sum + value, 0) / after.length) * area : null;
  const rawChangePct = rawAfterCfm !== null ? ((rawAfterCfm - rawCfm) / rawCfm) * 100 : null;
  if ([rawCfm, rawCfmPerTon, rawAfterCfm, rawChangePct].some((v) => v !== null && !Number.isFinite(v))) {
    return { errors: ["Derived airflow or percentage is nonfinite. Check tonnage, dimensions and readings."], result: null };
  }
  const average = averageReadings(readings);
  const cfm = toCfm(average);
  const cfmPerTon = roundTo(rawCfmPerTon, 0);
  const band = airflowBandState(rawCfmPerTon, input.mode);
  const statusText = airflowBand(rawCfmPerTon, input.mode);
  const afterCfm = after.length ? toCfm(averageReadings(after)) : null;
  const changeCfm = afterCfm !== null ? roundTo(afterCfm - cfm, 0) : null;
  const changePct = afterCfm !== null && cfm > 0 ? roundTo(((afterCfm - cfm) / cfm) * 100, 1) : null;
  const sensible = deltaT.ok === true ? sensibleBtuh(cfm, deltaT.value) : null;
  const total = enthalpy.ok === true ? totalBtuh(cfm, enthalpy.value) : null;
  const severity = band === "within" ? "ok" : band === "none" ? "info" : "concern";

  const diagnosis = [
    `Estimated airflow ${fmt(cfm, 0)} CFM (${input.method ? METHOD_LABELS[input.method] : ""}, average of ${readings.length} ${readings.length === 1 ? "reading" : "readings"}: ${fmt(average, 0)} ${unit}), ${fmt(cfmPerTon, 0)} CFM per ton on ${fmt(tons.value)} tons in ${input.mode} mode.`,
    statusText,
    afterCfm !== null ? `After readings give ${fmt(afterCfm, 0)} CFM, a change of ${fmt(changeCfm ?? 0, 0)} CFM (${fmt(changePct ?? 0)} percent).` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const out: Reading[] = readings.map((v, i) => ({ label: `${direct ? "Airflow" : "Velocity"} reading ${i + 1}`, value: v, unit, source: "entered" }));
  out.push({ label: "Estimated airflow", value: cfm, unit: "CFM", source: "computed" }, { label: "Airflow per ton", value: cfmPerTon, unit: "CFM/ton", source: "computed" }, { label: "System tonnage", value: tons.value, unit: "tons", source: "entered" });
  return { errors: [], result: { average, unit, cfm, cfmPerTon, band, statusText, afterCfm, changeCfm, changePct, sensible, total, severity, diagnosis, readings: out, reference: `${input.mode} screening band ${input.mode === "cooling" ? "350 to 450" : "325 to 450"} CFM per ton. Manufacturer airflow data governs.${input.method === "flow-hood" ? ` ${FLOW_HOOD_READING_SCOPE}` : ""}` } };
}
