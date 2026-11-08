import type { Reading } from "../job/types";
import { fmt, parseDecimal, quantityFrom, round, worstTone, type ResultItem } from "./numbers";

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
  /** Second (FAN) section of a dual run capacitor. Uses the same printed tolerance. */
  fanCapRatedUf: string;
  fanCapMeasuredUf: string;
  /** Installed breaker or fuse size, compared with the nameplate maximum overcurrent protection. */
  breakerAmps: string;
  mocp: string;
  /** Minimum circuit ampacity, recorded as a reference only. */
  mca: string;
  lra: string;
  /** Peak starting (inrush) amps from a meter with an inrush function. */
  inrushAmps: string;
  contactor: "" | ContactorCondition;
};

export type ContactorCondition = "good" | "pitted" | "chattering";
export const CONTACTOR_LABELS: Record<ContactorCondition, string> = {
  good: "Contacts clean, pulls in firmly",
  pitted: "Contacts pitted or burned",
  chattering: "Chatters or buzzes when energized",
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
  fanCapRatedUf: "",
  fanCapMeasuredUf: "",
  breakerAmps: "",
  mocp: "",
  mca: "",
  lra: "",
  inrushAmps: "",
  contactor: "",
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
  // Unlike scalar amp/static ratings, a voltage plate may legitimately list
  // alternatives or a range. Validate that grammar before extracting options.
  const match = /^(\+?\d+(?:\.\d+)?(?:\s*(?:\/|-|–|to)\s*\+?\d+(?:\.\d+)?)*)\s*(?:v(?:olts?)?(?:\s*ac)?|vac)?$/i.exec((nameplateVoltage ?? "").trim());
  if (!match) return [];
  const values = match[1].split(/\s*(?:\/|-|–|to)\s*/i).map(Number);
  return values.every((n) => Number.isFinite(n) && n >= 100 && n <= 600) ? [...new Set(values)] : [];
}

/** Pulls the numeric amps out of a nameplate value such as "12.3 A". */
export function ampsFrom(nameplateValue: string | undefined): string {
  return quantityFrom(nameplateValue, /^(?:a|amps?|amperes?)$/i);
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
    fanCapRated: parseDecimal(input.fanCapRatedUf, "Rated FAN capacitance", { positive: true, max: 100 }),
    fanCapMeasured: parseDecimal(input.fanCapMeasuredUf, "Measured FAN capacitance", { min: 0, max: 100 }),
    breaker: parseDecimal(input.breakerAmps, "Breaker or fuse size", { positive: true, max: 600 }),
    mocp: parseDecimal(input.mocp, "Maximum overcurrent protection", { positive: true, max: 600 }),
    mca: parseDecimal(input.mca, "Minimum circuit ampacity", { positive: true, max: 600 }),
    lra: parseDecimal(input.lra, "Compressor LRA", { positive: true, max: 1000 }),
    inrush: parseDecimal(input.inrushAmps, "Inrush amps", { min: 0, max: 1000 }),
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
  const fanCapRated = val(p.fanCapRated);
  const fanCapMeasured = val(p.fanCapMeasured);
  const breaker = val(p.breaker);
  const mocp = val(p.mocp);
  const mca = val(p.mca);
  const lra = val(p.lra);
  const inrush = val(p.inrush);
  const contactor = input.contactor && input.contactor in CONTACTOR_LABELS ? input.contactor : "";

  const capEntered = [capRated, capMeasured, capTol].filter((v) => v !== null).length;
  if (capEntered > 0 && capEntered < 3) errors.push("For the capacitor, enter rated uF, measured uF and tolerance percent together.");
  if ((fanCapRated === null) !== (fanCapMeasured === null)) errors.push("For the FAN capacitor section, enter rated and measured uF together.");
  if (fanCapRated !== null && fanCapMeasured !== null && capTol === null) errors.push("Enter the capacitor tolerance to check the FAN section.");
  if (measured === null && amps === null && fanAmps === null && capMeasured === null && fanCapMeasured === null && breaker === null && inrush === null && !contactor) errors.push("Enter at least one measured reading.");
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
      if (!Number.isFinite(pct)) return { errors: ["Compressor RLA percentage is nonfinite. Check the readings."], result: null };
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
      if (!Number.isFinite(pct)) return { errors: ["Fan FLA percentage is nonfinite. Check the readings."], result: null };
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
    if (!Number.isFinite(dev) || !Number.isFinite(round(dev, 1))) return { errors: ["Capacitor percentage is nonfinite. Check the readings."], result: null };
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

  if (fanCapMeasured !== null && fanCapRated !== null && capTol !== null) {
    const dev = ((fanCapMeasured - fanCapRated) / fanCapRated) * 100;
    if (!Number.isFinite(dev)) return { errors: ["FAN capacitor percentage is nonfinite. Check the readings."], result: null };
    const within = Math.abs(dev) <= capTol;
    readings.push({ label: "FAN capacitor measured", value: fanCapMeasured, unit: "uF", source: "entered" });
    readings.push({ label: "FAN capacitor rated", value: fanCapRated, unit: "uF", source: "entered" });
    references.push(`FAN section ${fmt(fanCapRated)} uF`);
    items.push({
      id: "fan-capacitor",
      label: "FAN capacitor",
      line: `FAN section ${fmt(fanCapMeasured)} uF measured against ${fmt(fanCapRated)} uF rated (${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent, tolerance ${fmt(capTol)} percent): ${within ? "within" : "outside"} tolerance.`,
      tone: within ? "ok" : "concern",
    });
  }

  if (breaker !== null) {
    readings.push({ label: "Breaker or fuse size", value: breaker, unit: "A", source: "entered" });
    const mcaText = mca !== null ? ` Nameplate minimum circuit ampacity is ${fmt(mca)} A; confirm conductor size separately.` : "";
    if (mca !== null) references.push(`minimum circuit ampacity ${fmt(mca)} A`);
    if (mocp !== null) {
      references.push(`maximum overcurrent protection ${fmt(mocp, 0)} A`);
      const above = breaker > mocp;
      items.push({ id: "breaker", label: "Overcurrent protection", line: `${fmt(breaker, 0)} A breaker or fuse is ${above ? "above" : "at or below"} the ${fmt(mocp, 0)} A nameplate maximum.${mcaText}`, tone: above ? "concern" : "ok" });
    } else {
      items.push({ id: "breaker", label: "Overcurrent protection", line: `${fmt(breaker, 0)} A breaker or fuse recorded. No maximum overcurrent protection entered, so it is not compared.${mcaText}`, tone: "info" });
    }
  }

  if (inrush !== null) {
    readings.push({ label: "Compressor inrush amps", value: inrush, unit: "A", source: "entered" });
    if (lra !== null) {
      references.push(`compressor LRA ${fmt(lra)} A`);
      const above = inrush > lra;
      items.push({ id: "inrush", label: "Starting amps", line: `${fmt(inrush)} A inrush is ${fmt((inrush / lra) * 100, 0)} percent of the ${fmt(lra)} A LRA${above ? ", above LRA" : ""}.`, tone: above ? "concern" : "info" });
    } else {
      items.push({ id: "inrush", label: "Starting amps", line: `${fmt(inrush)} A inrush measured. No LRA entered, so it is not compared.`, tone: "info" });
    }
  }

  if (contactor) {
    items.push({ id: "contactor", label: "Contactor", line: `Contactor: ${CONTACTOR_LABELS[contactor].toLowerCase()}.`, tone: contactor === "good" ? "ok" : "concern" });
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
