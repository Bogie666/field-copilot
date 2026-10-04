import type { Reading } from "../job/types";
import { fmt, numbersIn, parseDecimal, round, worstTone, type ResultItem } from "./numbers";

export type ElectricalInput = {
  nominalVoltage: string;
  measuredVoltage: string;
  rla: string;
  compressorAmps: string;
  fanFla: string;
  fanAmps: string;
  capacitorRatedUf: string;
  capacitorMeasuredUf: string;
  capacitorTolerancePct: string;
};

export const EMPTY_ELECTRICAL: ElectricalInput = {
  nominalVoltage: "",
  measuredVoltage: "",
  rla: "",
  compressorAmps: "",
  fanFla: "",
  fanAmps: "",
  capacitorRatedUf: "",
  capacitorMeasuredUf: "",
  capacitorTolerancePct: "",
};

export const VOLTAGE_TOLERANCE_PCT = 10;

export type ElectricalResult = {
  items: ResultItem[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type ElectricalAssessment = { errors: string[]; result: ElectricalResult | null };

/** Candidate nominal voltages from a nameplate string such as "208/230 V". */
export function voltageOptions(nameplateVoltage: string | undefined): number[] {
  return numbersIn(nameplateVoltage ?? "").filter((n) => n >= 100 && n <= 600);
}

/** Pulls the numeric amps out of a nameplate value such as "12.3 A". */
export function ampsFrom(nameplateValue: string | undefined): string {
  const n = numbersIn(nameplateValue ?? "")[0];
  return n === undefined ? "" : String(n);
}

export function assessElectrical(input: ElectricalInput): ElectricalAssessment {
  const errors: string[] = [];
  const p = {
    nominal: parseDecimal(input.nominalVoltage, "Nominal voltage", { min: 90, max: 700 }),
    measured: parseDecimal(input.measuredVoltage, "Measured voltage", { min: 0, max: 700 }),
    rla: parseDecimal(input.rla, "Compressor RLA", { positive: true, max: 500 }),
    amps: parseDecimal(input.compressorAmps, "Compressor amps", { min: 0, max: 500 }),
    fla: parseDecimal(input.fanFla, "Fan FLA", { positive: true, max: 100 }),
    fanAmps: parseDecimal(input.fanAmps, "Fan amps", { min: 0, max: 100 }),
    capRated: parseDecimal(input.capacitorRatedUf, "Rated capacitance", { positive: true, max: 1000 }),
    capMeasured: parseDecimal(input.capacitorMeasuredUf, "Measured capacitance", { min: 0, max: 1000 }),
    capTol: parseDecimal(input.capacitorTolerancePct, "Capacitor tolerance", { positive: true, max: 50 }),
  };
  for (const parsed of Object.values(p)) if (parsed.ok === false) errors.push(parsed.error);
  if (errors.length) return { errors, result: null };

  const val = (x: (typeof p)[keyof typeof p]) => (x.ok === true ? x.value : null);
  const nominal = val(p.nominal);
  const measured = val(p.measured);
  const rla = val(p.rla);
  const amps = val(p.amps);
  const fla = val(p.fla);
  const fanAmps = val(p.fanAmps);
  const capRated = val(p.capRated);
  const capMeasured = val(p.capMeasured);
  const capTol = val(p.capTol);

  const capEntered = [capRated, capMeasured, capTol].filter((v) => v !== null).length;
  if (capEntered > 0 && capEntered < 3) errors.push("For the capacitor, enter rated uF, measured uF and tolerance percent together.");
  if (measured === null && amps === null && fanAmps === null && capMeasured === null) errors.push("Enter at least one measured reading.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];

  if (measured !== null) {
    readings.push({ label: "Line voltage", value: measured, unit: "V", source: "entered" });
    if (nominal !== null) {
      const pct = ((measured - nominal) / nominal) * 100;
      const within = Math.abs(pct) <= VOLTAGE_TOLERANCE_PCT;
      references.push(`nominal voltage ${fmt(nominal, 0)} V, band plus or minus ${VOLTAGE_TOLERANCE_PCT} percent`);
      items.push({
        id: "voltage",
        label: "Line voltage",
        line: `${fmt(measured)} V is ${fmt(Math.abs(pct))} percent ${pct >= 0 ? "above" : "below"} the ${fmt(nominal, 0)} V nominal, ${within ? "inside" : "outside"} the plus or minus ${VOLTAGE_TOLERANCE_PCT} percent band.`,
        tone: within ? "ok" : "concern",
      });
    } else {
      items.push({ id: "voltage", label: "Line voltage", line: `${fmt(measured)} V measured. No nominal voltage entered, so it is not compared.`, tone: "info" });
    }
  }

  if (amps !== null) {
    readings.push({ label: "Compressor amps", value: amps, unit: "A", source: "entered" });
    if (rla !== null) {
      const pct = (amps / rla) * 100;
      references.push(`compressor RLA ${fmt(rla)} A`);
      items.push({
        id: "compressor",
        label: "Compressor amps",
        line: `${fmt(amps)} A is ${fmt(pct, 0)} percent of the ${fmt(rla)} A RLA${amps > rla ? ", above RLA" : ", at or below RLA"}.`,
        tone: amps > rla ? "concern" : "ok",
      });
    } else {
      items.push({ id: "compressor", label: "Compressor amps", line: `${fmt(amps)} A measured. No RLA entered, so it is not compared.`, tone: "info" });
    }
  }

  if (fanAmps !== null) {
    readings.push({ label: "Condenser fan amps", value: fanAmps, unit: "A", source: "entered" });
    if (fla !== null) {
      const pct = (fanAmps / fla) * 100;
      references.push(`fan FLA ${fmt(fla)} A`);
      items.push({
        id: "fan",
        label: "Fan amps",
        line: `${fmt(fanAmps)} A is ${fmt(pct, 0)} percent of the ${fmt(fla)} A FLA${fanAmps > fla ? ", above FLA" : ", at or below FLA"}.`,
        tone: fanAmps > fla ? "concern" : "ok",
      });
    } else {
      items.push({ id: "fan", label: "Fan amps", line: `${fmt(fanAmps)} A measured. No FLA entered, so it is not compared.`, tone: "info" });
    }
  }

  if (capMeasured !== null && capRated !== null && capTol !== null) {
    const dev = ((capMeasured - capRated) / capRated) * 100;
    const within = Math.abs(dev) <= capTol;
    readings.push({ label: "Capacitor measured", value: capMeasured, unit: "uF", source: "entered" });
    readings.push({ label: "Capacitor rated", value: capRated, unit: "uF", source: "entered" });
    references.push(`capacitor label ${fmt(capRated)} uF, tolerance plus or minus ${fmt(capTol)} percent`);
    items.push({
      id: "capacitor",
      label: "Capacitor",
      line: `${fmt(capMeasured)} uF measured against ${fmt(capRated)} uF rated (${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent, tolerance ${fmt(capTol)} percent): ${within ? "within" : "outside"} tolerance.`,
      tone: within ? "ok" : "concern",
    });
  }

  const tone = worstTone(items);
  const severity = tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info";
  return {
    errors: [],
    result: {
      items,
      severity,
      diagnosis: items.map((i) => i.line).join(" "),
      readings,
      reference: references.join("; "),
    },
  };
}

export function roundedPct(value: number) {
  return round(value, 1);
}
