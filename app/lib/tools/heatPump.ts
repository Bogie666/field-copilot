import { PT_DATA_APPROVED, PT_TABLES, ptSourceReference, saturationTempF, type PtTable } from "../charge/ptData";
import type { Reading } from "../job/types";
import { fmt, parseDecimal, worstTone, type ResultItem } from "./numbers";

// Heat pump in heating mode. The indoor coil is the condenser and the outdoor coil is
// the evaporator. Targets come from the manufacturer heating chart, typed by the tech.

export const DEFROST_CHECKS = [
  { id: "initiated", label: "Defrost initiated (test mode or jumper)" },
  { id: "valveShifted", label: "Reversing valve shifted to cooling" },
  { id: "fanStopped", label: "Outdoor fan stopped during defrost" },
  { id: "auxOn", label: "Auxiliary heat energized during defrost" },
  { id: "terminated", label: "Defrost terminated and heating resumed" },
] as const;
export type DefrostCheckId = (typeof DEFROST_CHECKS)[number]["id"];
/** "" = not checked, "yes" = observed working, "no" = did not happen. */
export type DefrostState = "" | "yes" | "no";

export type HeatPumpInput = {
  refrigerant: string;
  outdoorF: string;
  returnF: string;
  supplyF: string;
  riseMinF: string;
  riseMaxF: string;
  lowPsig: string;
  suctionLineF: string;
  highPsig: string;
  liquidLineF: string;
  targetSubcoolingF: string;
  subcoolingTolF: string;
  stripVolts: string;
  stripAmps: string;
  stripRatedKw: string;
  stripRatedVolts: string;
  stripTolPct: string;
  defrost: Record<DefrostCheckId, DefrostState>;
};

export const EMPTY_HEAT_PUMP: HeatPumpInput = {
  refrigerant: "",
  outdoorF: "",
  returnF: "",
  supplyF: "",
  riseMinF: "",
  riseMaxF: "",
  lowPsig: "",
  suctionLineF: "",
  highPsig: "",
  liquidLineF: "",
  targetSubcoolingF: "",
  subcoolingTolF: "",
  stripVolts: "",
  stripAmps: "",
  stripRatedKw: "",
  stripRatedVolts: "",
  stripTolPct: "",
  defrost: { initiated: "", valveShifted: "", fanStopped: "", auxOn: "", terminated: "" },
};

export type HeatPumpResult = {
  items: ResultItem[];
  notes: string[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  riseF: number | null;
  superheatF: number | null;
  subcoolingF: number | null;
  stripKw: number | null;
};

export type HeatPumpAssessment = { errors: string[]; result: HeatPumpResult | null };

/** Resistance heat scales with the square of voltage, so the rating is corrected to the measured voltage. */
export function expectedStripKw(ratedKw: number, ratedVolts: number, measuredVolts: number): number {
  return ratedKw * (measuredVolts / ratedVolts) ** 2;
}

function defrostState(value: unknown): DefrostState {
  return value === "yes" || value === "no" ? value : "";
}

export function assessHeatPump(input: HeatPumpInput, tables: readonly PtTable[] = PT_TABLES): HeatPumpAssessment {
  const errors: string[] = [];
  const n = {
    outdoor: parseDecimal(input.outdoorF, "Outdoor temperature", { min: -40, max: 90 }),
    ret: parseDecimal(input.returnF, "Return air", { min: 0, max: 120 }),
    supply: parseDecimal(input.supplyF, "Supply air", { min: 0, max: 200 }),
    riseMin: parseDecimal(input.riseMinF, "Rise range low", { positive: true, max: 100 }),
    riseMax: parseDecimal(input.riseMaxF, "Rise range high", { positive: true, max: 100 }),
    low: parseDecimal(input.lowPsig, "Low-side pressure", { min: 0, max: 700 }),
    suctionLine: parseDecimal(input.suctionLineF, "Suction line temperature", { min: -40, max: 200 }),
    high: parseDecimal(input.highPsig, "High-side pressure", { min: 0, max: 700 }),
    liquidLine: parseDecimal(input.liquidLineF, "Liquid line temperature", { min: -40, max: 200 }),
    targetSc: parseDecimal(input.targetSubcoolingF, "Target subcooling", { positive: true, max: 60 }),
    scTol: parseDecimal(input.subcoolingTolF, "Subcooling tolerance", { positive: true, max: 30 }),
    stripVolts: parseDecimal(input.stripVolts, "Heat strip voltage", { min: 90, max: 700 }),
    stripAmps: parseDecimal(input.stripAmps, "Heat strip amps", { min: 0, max: 200 }),
    ratedKw: parseDecimal(input.stripRatedKw, "Rated heat kW", { positive: true, max: 50 }),
    ratedVolts: parseDecimal(input.stripRatedVolts, "Rated heat voltage", { min: 90, max: 700 }),
    stripTol: parseDecimal(input.stripTolPct, "Heat strip tolerance", { positive: true, max: 50 }),
  };
  for (const parsed of Object.values(n)) if (parsed.ok === false) errors.push(parsed.error);
  if (errors.length) return { errors, result: null };
  const v = (x: (typeof n)[keyof typeof n]) => (x.ok === true ? x.value : null);
  const outdoor = v(n.outdoor), ret = v(n.ret), supply = v(n.supply), riseMin = v(n.riseMin), riseMax = v(n.riseMax);
  const low = v(n.low), suctionLine = v(n.suctionLine), high = v(n.high), liquidLine = v(n.liquidLine);
  const targetSc = v(n.targetSc), scTol = v(n.scTol);
  const stripVolts = v(n.stripVolts), stripAmps = v(n.stripAmps), ratedKw = v(n.ratedKw), ratedVolts = v(n.ratedVolts), stripTol = v(n.stripTol);
  const defrost = Object.fromEntries(DEFROST_CHECKS.map((c) => [c.id, defrostState(input.defrost?.[c.id])])) as Record<DefrostCheckId, DefrostState>;

  if ((ret === null) !== (supply === null)) errors.push("Enter return and supply air together for the temperature rise.");
  if ((riseMin === null) !== (riseMax === null)) errors.push("Enter both ends of the temperature rise range, or neither.");
  if (riseMin !== null && riseMax !== null && riseMin > riseMax) errors.push("Rise range low must not be above rise range high.");
  if ((low === null) !== (suctionLine === null)) errors.push("Enter low-side pressure and suction line temperature together for superheat.");
  if ((high === null) !== (liquidLine === null)) errors.push("Enter high-side pressure and liquid line temperature together for subcooling.");
  if ((low !== null || high !== null) && !input.refrigerant) errors.push("Choose the refrigerant.");
  if ((stripVolts === null) !== (stripAmps === null)) errors.push("Enter heat strip voltage and amps together.");
  if ([ratedKw, ratedVolts].filter((x) => x !== null).length === 1) errors.push("Enter rated heat kW and its rated voltage together.");
  const anyDefrost = Object.values(defrost).some(Boolean);
  if (ret === null && low === null && high === null && stripAmps === null && !anyDefrost) errors.push("Enter at least one reading or defrost check.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const notes: string[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];
  let riseF: number | null = null, superheatF: number | null = null, subcoolingF: number | null = null, stripKw: number | null = null;

  if (outdoor !== null) readings.push({ label: "Outdoor temperature", value: outdoor, unit: "F", source: "entered" });

  if (ret !== null && supply !== null) {
    riseF = supply - ret;
    readings.push({ label: "Return air", value: ret, unit: "F", source: "entered" }, { label: "Supply air", value: supply, unit: "F", source: "entered" }, { label: "Temperature rise", value: Number(riseF.toFixed(1)), unit: "F", source: "computed" });
    if (riseMin !== null && riseMax !== null) {
      const where = riseF < riseMin ? "below" : riseF > riseMax ? "above" : "within";
      references.push(`manufacturer heating rise ${fmt(riseMin, 0)} to ${fmt(riseMax, 0)} F`);
      items.push({ id: "rise", label: "Temperature rise", line: `Heating temperature rise ${fmt(riseF)} F is ${where} the ${fmt(riseMin, 0)} to ${fmt(riseMax, 0)} F range from the manufacturer chart.`, tone: where === "within" ? "ok" : "concern" });
    } else {
      items.push({ id: "rise", label: "Temperature rise", line: `Heating temperature rise ${fmt(riseF)} F. No chart range entered, so it is not compared.`, tone: "info" });
    }
    notes.push("Measure the heating rise with auxiliary heat off so it reflects the compressor only.");
  }

  const ptNeeded = low !== null || high !== null;
  if (ptNeeded) {
    if (!PT_DATA_APPROVED) notes.push("Provisional: pressure-temperature data is not approved. Verify against your gauge set or the manufacturer chart.");
    references.push(`PT source: ${ptSourceReference(input.refrigerant, tables)}`);
  }

  if (low !== null && suctionLine !== null) {
    const dew = saturationTempF(input.refrigerant, low, "dew", tables);
    if (!dew.ok) return { errors: [dew.error], result: null };
    superheatF = suctionLine - dew.tempF;
    readings.push({ label: "Low-side pressure", value: low, unit: "psig", source: "entered" }, { label: "Suction line temperature", value: suctionLine, unit: "F", source: "entered" }, { label: "Outdoor coil saturation", value: Number(dew.tempF.toFixed(1)), unit: "F", source: "computed" }, { label: "Superheat", value: Number(superheatF.toFixed(1)), unit: "F", source: "computed" });
    const split = outdoor !== null ? ` Outdoor coil saturation is ${fmt(outdoor - dew.tempF)} F below the outdoor air.` : "";
    items.push({ id: "superheat", label: "Superheat", line: `Superheat ${fmt(superheatF)} F (suction line ${fmt(suctionLine)} F, outdoor coil saturation ${fmt(dew.tempF)} F at ${fmt(low, 0)} psig).${split}`, tone: superheatF <= 0 ? "concern" : "info" });
    if (superheatF <= 0) notes.push("Superheat is at or below zero. Recheck probe placement and the low-side port before relying on it.");
  }

  if (high !== null && liquidLine !== null) {
    const bubble = saturationTempF(input.refrigerant, high, "bubble", tables);
    if (!bubble.ok) return { errors: [bubble.error], result: null };
    subcoolingF = bubble.tempF - liquidLine;
    readings.push({ label: "High-side pressure", value: high, unit: "psig", source: "entered" }, { label: "Liquid line temperature", value: liquidLine, unit: "F", source: "entered" }, { label: "Indoor coil saturation", value: Number(bubble.tempF.toFixed(1)), unit: "F", source: "computed" }, { label: "Subcooling", value: Number(subcoolingF.toFixed(1)), unit: "F", source: "computed" });
    const base = `Subcooling ${fmt(subcoolingF)} F (indoor coil saturation ${fmt(bubble.tempF)} F at ${fmt(high, 0)} psig, liquid line ${fmt(liquidLine)} F).`;
    if (targetSc !== null && scTol !== null) {
      const where = subcoolingF > targetSc + scTol ? "above" : subcoolingF < targetSc - scTol ? "below" : "within";
      references.push(`manufacturer heating target subcooling ${fmt(targetSc)} F, tolerance ${fmt(scTol)} F`);
      items.push({ id: "subcooling", label: "Subcooling", line: `${base} That is ${where} the ${fmt(targetSc)} F heating target (tolerance ${fmt(scTol)} F).`, tone: where === "within" ? "ok" : "concern" });
    } else {
      items.push({ id: "subcooling", label: "Subcooling", line: `${base} No heating target entered, so it is not compared.`, tone: subcoolingF < 0 ? "concern" : "info" });
    }
    if (subcoolingF < 0) notes.push("Subcooling is negative. Recheck probe placement and the high-side port before relying on it.");
  }

  if (stripVolts !== null && stripAmps !== null) {
    stripKw = (stripVolts * stripAmps) / 1000;
    readings.push({ label: "Heat strip voltage", value: stripVolts, unit: "V", source: "entered" }, { label: "Heat strip amps", value: stripAmps, unit: "A", source: "entered" }, { label: "Heat strip output", value: Number(stripKw.toFixed(2)), unit: "kW", source: "computed" });
    const base = `Heat strips draw ${fmt(stripAmps)} A at ${fmt(stripVolts, 0)} V, ${fmt(stripKw, 2)} kW (single-phase volts times amps).`;
    if (ratedKw !== null && ratedVolts !== null) {
      const expected = expectedStripKw(ratedKw, ratedVolts, stripVolts);
      const dev = ((stripKw - expected) / expected) * 100;
      if (!Number.isFinite(dev)) return { errors: ["Heat strip percentage is nonfinite. Check the readings."], result: null };
      references.push(`heat kit ${fmt(ratedKw, 1)} kW at ${fmt(ratedVolts, 0)} V, corrected to measured voltage`);
      if (stripTol !== null) {
        const within = Math.abs(dev) <= stripTol;
        items.push({ id: "strips", label: "Heat strips", line: `${base} Expected ${fmt(expected, 2)} kW at this voltage; ${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent, ${within ? "within" : "outside"} the ${fmt(stripTol)} percent tolerance.`, tone: within ? "ok" : "concern" });
      } else {
        items.push({ id: "strips", label: "Heat strips", line: `${base} Expected ${fmt(expected, 2)} kW at this voltage (${dev >= 0 ? "+" : "-"}${fmt(Math.abs(dev))} percent). No tolerance entered, so it is not classified.`, tone: "info" });
      }
      notes.push("A low reading usually means an element or sequencer stage is not energized. Check each element's amps.");
    } else {
      items.push({ id: "strips", label: "Heat strips", line: `${base} No rating entered, so it is not compared.`, tone: "info" });
    }
  }

  if (anyDefrost) {
    const failed = DEFROST_CHECKS.filter((c) => defrost[c.id] === "no").map((c) => c.label.toLowerCase());
    const passed = DEFROST_CHECKS.filter((c) => defrost[c.id] === "yes").length;
    const unchecked = DEFROST_CHECKS.filter((c) => !defrost[c.id]).length;
    const line = failed.length
      ? `Defrost check: did not observe ${failed.join("; ")}.`
      : `Defrost check: ${passed} of ${DEFROST_CHECKS.length} steps observed working${unchecked ? `, ${unchecked} not checked` : ""}.`;
    items.push({ id: "defrost", label: "Defrost", line, tone: failed.length ? "concern" : unchecked ? "info" : "ok" });
  }

  const tone = worstTone(items);
  return {
    errors: [],
    result: {
      items,
      notes,
      severity: tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info",
      diagnosis: [ptNeeded && !PT_DATA_APPROVED ? "Provisional pressure-temperature data." : "", ...items.map((i) => i.line)].filter(Boolean).join(" "),
      readings,
      reference: references.join("; "),
      riseF,
      superheatF,
      subcoolingF,
      stripKw,
    },
  };
}
