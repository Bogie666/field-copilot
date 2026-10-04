import { roundTo } from "./calculations";

export type OperatingMode = "cooling" | "heating";
export type AirflowMethod = "velocity-traverse" | "flow-hood" | "grille" | "estimated";
export type DuctContext = { side: "supply" | "return"; section: "trunk" | "branch" };

export function averageReadings(readings: number[]): number {
  const valid = readings.filter((value) => Number.isFinite(value) && value > 0);
  return valid.length ? roundTo(valid.reduce((sum, value) => sum + value, 0) / valid.length, 0) : 0;
}

export function validatePositiveInputs(values: Array<[string, number]>): string[] {
  return values.filter(([, value]) => !Number.isFinite(value) || value <= 0).map(([label]) => `${label} must be greater than zero.`);
}

export function airflowBand(cfmPerTon: number, mode: OperatingMode): string {
  if (!Number.isFinite(cfmPerTon) || cfmPerTon <= 0) return "Enter valid readings and system tonnage.";
  const [low, high] = mode === "cooling" ? [350, 450] : [325, 450];
  if (cfmPerTon < low) return `Below the ${low}-${high} CFM/ton ${mode} screening band. Verify the test method, blower setup, filter, coil, static pressure, and duct restrictions.`;
  if (cfmPerTon > high) return `Above the ${low}-${high} CFM/ton ${mode} screening band. Verify the test method, blower setup, noise, and comfort or humidity effects.`;
  return `Within the ${low}-${high} CFM/ton ${mode} screening band. Confirm against manufacturer data and job conditions.`;
}

export type BandState = "below" | "within" | "above" | "none";

export function airflowBandState(cfmPerTon: number, mode: OperatingMode): BandState {
  if (!Number.isFinite(cfmPerTon) || cfmPerTon <= 0) return "none";
  const [low, high] = mode === "cooling" ? [350, 450] : [325, 450];
  return cfmPerTon < low ? "below" : cfmPerTon > high ? "above" : "within";
}

const guidance: Record<string, [number, number]> = {
  "supply-trunk": [700, 1000], "supply-branch": [500, 800],
  "return-trunk": [500, 800], "return-branch": [400, 700],
};
export function ductVelocityState(context: DuctContext, velocity: number): BandState {
  const [low, high] = guidance[`${context.side}-${context.section}`];
  if (!Number.isFinite(velocity) || velocity <= 0) return "none";
  return velocity < low ? "below" : velocity > high ? "above" : "within";
}

export function ductVelocityGuidance(context: DuctContext, velocity: number): string {
  const [low, high] = guidance[`${context.side}-${context.section}`];
  const label = `${context.side} ${context.section}`;
  if (!Number.isFinite(velocity) || velocity <= 0) return "Enter valid airflow and dimensions.";
  if (velocity < low) return `${roundTo(velocity, 0)} FPM is below the typical ${low}-${high} FPM ${label} screening range.`;
  if (velocity > high) return `${roundTo(velocity, 0)} FPM is above the typical ${low}-${high} FPM ${label} screening range. Check noise and pressure drop.`;
  return `${roundTo(velocity, 0)} FPM is within the typical ${low}-${high} FPM ${label} screening range.`;
}

const roundSizes = [4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30];
const rectangularSizes = [
  [8, 4], [10, 6], [12, 6], [12, 8], [14, 8], [16, 8], [16, 10], [18, 10], [20, 10], [20, 12], [24, 12], [24, 14], [30, 14], [30, 16], [36, 16], [36, 18],
];
export function nearbyStandardSizes(requiredAreaSqIn: number) {
  if (!Number.isFinite(requiredAreaSqIn) || requiredAreaSqIn <= 0) return { round: [], rectangular: [] };
  const byDistance = (area: number) => Math.abs(area - requiredAreaSqIn);
  const round = [...roundSizes].sort((a, b) => byDistance(Math.PI * a * a / 4) - byDistance(Math.PI * b * b / 4)).slice(0, 3);
  const rectangular = [...rectangularSizes].sort((a, b) => byDistance(a[0] * a[1]) - byDistance(b[0] * b[1])).slice(0, 3).map(([w, h]) => `${w} x ${h}`);
  return { round, rectangular };
}

export function formatAirflowSummary(input: { readings: number[]; averageReading: number; readingUnit: "FPM" | "CFM"; cfm: number; cfmPerTon: number; mode: OperatingMode; method: string; beforeAfter: string; status: string; afterReadings?: number[]; afterAverage?: number; afterCfm?: number }): string {
  const comparison = input.afterCfm ? `After readings: ${(input.afterReadings || []).join(", ")} ${input.readingUnit}; average: ${input.afterAverage} ${input.readingUnit}; airflow: ${input.afterCfm} CFM; change: ${roundTo(input.afterCfm - input.cfm, 0)} CFM (${roundTo((input.afterCfm - input.cfm) / input.cfm * 100, 1)}%)` : "After readings: Not documented";
  return [`AIRFLOW / CFM SCREENING`, `Mode: ${input.mode}; method: ${input.method}`, `Before readings: ${input.readings.join(", ")} ${input.readingUnit}; average: ${input.averageReading} ${input.readingUnit}`, `Before airflow: ${input.cfm} CFM; ${input.cfmPerTon} CFM/ton`, comparison, input.beforeAfter ? `Comparison notes: ${input.beforeAfter}` : "Comparison notes: Not documented", `Screening: ${input.status}`, "Assumptions: Confirm instrument placement, traverse coverage or hood capture, grille free area, leakage, blower setup, and manufacturer data."].join("\n");
}

export function formatDuctSummary(input: { cfm: number; velocity: number; side: string; section: string; dimensions: string; guidance: string; suggestions: { round: number[]; rectangular: string[] } }): string {
  return ["DUCT AREA & VELOCITY CHECK", `Context: ${input.side} ${input.section}`, `Airflow: ${input.cfm} CFM`, `Existing size: ${input.dimensions}; estimated velocity: ${input.velocity} FPM`, `Guidance: ${input.guidance}`, `Nearby nominal round sizes: ${input.suggestions.round.map((v) => `${v} in`).join(", ")}`, `Nearby nominal rectangular sizes: ${input.suggestions.rectangular.map((v) => `${v} in`).join(", ")}`, "Assumptions: Uses nominal free area and does not account for fittings, liner, flex compression, leakage, pressure drop, or Manual D design."].join("\n");
}
