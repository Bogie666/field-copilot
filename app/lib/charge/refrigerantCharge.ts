import type { Reading } from "../job/types";
import { fmt, parseDecimal, worstTone, type ResultItem } from "../tools/numbers";
import { PT_DATA_APPROVED, PT_DATA_SOURCE, PT_TABLES, saturationTempF, type PtTable } from "./ptData";

export type MeteringDevice = "txv" | "orifice";

export type ChargeInput = {
  refrigerant: string;
  device: MeteringDevice | "";
  suctionPsig: string;
  suctionLineF: string;
  liquidPsig: string;
  liquidLineF: string;
  indoorWetBulbF: string;
  outdoorDryBulbF: string;
  /** Manufacturer target subcooling. Typed by the tech, never defaulted. */
  targetSubcoolingF: string;
  subcoolingTolF: string;
  superheatTolF: string;
};

export const EMPTY_CHARGE: ChargeInput = {
  refrigerant: "",
  device: "",
  suctionPsig: "",
  suctionLineF: "",
  liquidPsig: "",
  liquidLineF: "",
  indoorWetBulbF: "",
  outdoorDryBulbF: "",
  targetSubcoolingF: "",
  subcoolingTolF: "",
  superheatTolF: "",
};

/**
 * Validity range for the fixed-orifice screening formula. No target is shown outside it.
 * OPEN DECISION: confirm these bounds. They follow the span common charging charts cover.
 */
export const ORIFICE_FORMULA_RANGE = { outdoorDryBulbF: [55, 115], indoorWetBulbF: [57, 76] } as const;

export const ORIFICE_FORMULA_LABEL = "Screening formula (3 x indoor wet bulb - 80 - outdoor dry bulb) / 2. The manufacturer charging chart governs.";

export function orificeTargetSuperheatF(indoorWetBulbF: number, outdoorDryBulbF: number): { ok: true; targetF: number } | { ok: false; reason: string } {
  if (!Number.isFinite(indoorWetBulbF) || !Number.isFinite(outdoorDryBulbF)) return { ok: false, reason: "Formula temperatures must be finite numbers. Use the manufacturer chart." };
  const [odbMin, odbMax] = ORIFICE_FORMULA_RANGE.outdoorDryBulbF;
  const [iwbMin, iwbMax] = ORIFICE_FORMULA_RANGE.indoorWetBulbF;
  if (outdoorDryBulbF < odbMin || outdoorDryBulbF > odbMax) return { ok: false, reason: `Outdoor dry bulb ${fmt(outdoorDryBulbF, 0)} F is outside the formula range of ${odbMin} to ${odbMax} F. Use the manufacturer chart.` };
  if (indoorWetBulbF < iwbMin || indoorWetBulbF > iwbMax) return { ok: false, reason: `Indoor wet bulb ${fmt(indoorWetBulbF, 0)} F is outside the formula range of ${iwbMin} to ${iwbMax} F. Use the manufacturer chart.` };
  const targetF = (3 * indoorWetBulbF - 80 - outdoorDryBulbF) / 2;
  if (targetF <= 0) return { ok: false, reason: "The formula gives no usable target for these conditions. Use the manufacturer chart." };
  return { ok: true, targetF };
}

export type ChargeResult = {
  superheatF: number;
  subcoolingF: number;
  suctionSatF: number;
  liquidSatF: number;
  targetSuperheatF: number | null;
  items: ResultItem[];
  notes: string[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type ChargeAssessment = { errors: string[]; result: ChargeResult | null };

function against(actual: number, target: number, tol: number): "above" | "within" | "below" {
  if (actual > target + tol) return "above";
  if (actual < target - tol) return "below";
  return "within";
}

export function assessCharge(input: ChargeInput, tables: readonly PtTable[] = PT_TABLES): ChargeAssessment {
  const errors: string[] = [];
  if (!input.refrigerant) errors.push("Choose the refrigerant.");
  if (!input.device) errors.push("Choose the metering device.");
  const num = (text: string, label: string, opts: Parameters<typeof parseDecimal>[2]) => parseDecimal(text, label, opts);
  const suctionPsig = num(input.suctionPsig, "Suction pressure", { min: 0, max: 700 });
  const suctionLineF = num(input.suctionLineF, "Suction line temperature", { min: -40, max: 250 });
  const liquidPsig = num(input.liquidPsig, "Liquid pressure", { min: 0, max: 700 });
  const liquidLineF = num(input.liquidLineF, "Liquid line temperature", { min: -40, max: 250 });
  const iwb = num(input.indoorWetBulbF, "Indoor wet bulb", { min: 30, max: 100 });
  const odb = num(input.outdoorDryBulbF, "Outdoor dry bulb", { min: -20, max: 150 });
  const targetSc = num(input.targetSubcoolingF, "Target subcooling", { positive: true, max: 60 });
  const scTol = num(input.subcoolingTolF, "Subcooling tolerance", { positive: true, max: 30 });
  const shTol = num(input.superheatTolF, "Superheat tolerance", { positive: true, max: 30 });
  for (const parsed of [suctionPsig, suctionLineF, liquidPsig, liquidLineF, iwb, odb, targetSc, scTol, shTol]) if (parsed.ok === false) errors.push(parsed.error);
  for (const [parsed, label] of [[suctionPsig, "suction pressure"], [suctionLineF, "suction line temperature"], [liquidPsig, "liquid pressure"], [liquidLineF, "liquid line temperature"]] as const) {
    if (parsed.ok === "blank") errors.push(`Enter the ${label}.`);
  }
  if (errors.length || suctionPsig.ok !== true || suctionLineF.ok !== true || liquidPsig.ok !== true || liquidLineF.ok !== true) return { errors, result: null };

  const dew = saturationTempF(input.refrigerant, suctionPsig.value, "dew", tables);
  const bubble = saturationTempF(input.refrigerant, liquidPsig.value, "bubble", tables);
  if (!dew.ok) errors.push(dew.error);
  if (!bubble.ok) errors.push(bubble.error);
  if (!dew.ok || !bubble.ok) return { errors, result: null };

  const superheatF = suctionLineF.value - dew.tempF;
  const subcoolingF = bubble.tempF - liquidLineF.value;
  const items: ResultItem[] = [];
  const provisional = PT_DATA_APPROVED ? "" : "Provisional charge comparison: pressure-temperature data is not approved. Verify against your gauge set or manufacturer chart before relying on this classification.";
  const notes: string[] = provisional ? [provisional] : [];
  const references: string[] = [`${input.refrigerant} pressure-temperature data (sea-level gauge pressure)`];
  references.push(`PT source: ${PT_DATA_SOURCE}.${PT_DATA_APPROVED ? "" : " Provisional data, not approved."}`);
  let targetSuperheatF: number | null = null;

  const shBase = `Superheat ${fmt(superheatF)} F (suction line ${fmt(suctionLineF.value)} F, dew point ${fmt(dew.tempF)} F at ${fmt(suctionPsig.value, 0)} psig).`;
  const scBase = `Subcooling ${fmt(subcoolingF)} F (bubble point ${fmt(bubble.tempF)} F at ${fmt(liquidPsig.value, 0)} psig, liquid line ${fmt(liquidLineF.value)} F).`;

  if (input.device === "orifice") {
    if (iwb.ok === true && odb.ok === true) {
      const target = orificeTargetSuperheatF(iwb.value, odb.value);
      if (target.ok) {
        targetSuperheatF = target.targetF;
        references.push(`fixed-orifice screening target superheat ${fmt(target.targetF)} F from indoor wet bulb ${fmt(iwb.value, 0)} F and outdoor dry bulb ${fmt(odb.value, 0)} F`);
      } else notes.push(target.reason);
    } else notes.push("Enter indoor wet bulb and outdoor dry bulb to get a screening target superheat.");
    if (targetSuperheatF !== null && shTol.ok === true) {
      const where = against(superheatF, targetSuperheatF, shTol.value);
      items.push({ id: "superheat", label: "Superheat", line: `${shBase} That is ${where} the ${fmt(targetSuperheatF)} F screening target (tolerance ${fmt(shTol.value)} F).`, tone: where === "within" ? "ok" : "concern" });
    } else {
      if (targetSuperheatF !== null) notes.push("Enter a superheat tolerance to compare against the screening target.");
      items.push({ id: "superheat", label: "Superheat", line: targetSuperheatF !== null ? `${shBase} Screening target ${fmt(targetSuperheatF)} F, not classified without a tolerance.` : `${shBase} No target available, so it is not compared.`, tone: "info" });
    }
    items.push({ id: "subcooling", label: "Subcooling", line: `${scBase} Recorded for reference.`, tone: "info" });
  } else {
    if (targetSc.ok === true && scTol.ok === true) {
      const where = against(subcoolingF, targetSc.value, scTol.value);
      references.push(`manufacturer target subcooling ${fmt(targetSc.value)} F, tolerance ${fmt(scTol.value)} F`);
      items.push({ id: "subcooling", label: "Subcooling", line: `${scBase} That is ${where} the ${fmt(targetSc.value)} F target (tolerance ${fmt(scTol.value)} F).`, tone: where === "within" ? "ok" : "concern" });
    } else {
      notes.push("Enter the manufacturer target subcooling and a tolerance to compare.");
      items.push({ id: "subcooling", label: "Subcooling", line: `${scBase} No target entered, so it is not compared.`, tone: "info" });
    }
    items.push({ id: "superheat", label: "Superheat", line: `${shBase} Recorded for reference.`, tone: "info" });
  }

  if (superheatF <= 0) {
    notes.push("Superheat is at or below zero. Recheck the gauge, line temperature probe placement and refrigerant selection before relying on it.");
    const sh = items.find((i) => i.id === "superheat");
    if (sh) sh.tone = "concern";
  }
  if (subcoolingF < 0) {
    notes.push("Subcooling is negative. Recheck the gauge, line temperature probe placement and refrigerant selection before relying on it.");
    const sc = items.find((i) => i.id === "subcooling");
    if (sc) sc.tone = "concern";
  }

  const tone = worstTone(items);
  const readings: Reading[] = [
    { label: "Suction pressure", value: suctionPsig.value, unit: "psig", source: "entered" },
    { label: "Suction line temperature", value: suctionLineF.value, unit: "F", source: "entered" },
    { label: "Liquid pressure", value: liquidPsig.value, unit: "psig", source: "entered" },
    { label: "Liquid line temperature", value: liquidLineF.value, unit: "F", source: "entered" },
    { label: "Superheat", value: Number(superheatF.toFixed(1)), unit: "F", source: "computed" },
    { label: "Subcooling", value: Number(subcoolingF.toFixed(1)), unit: "F", source: "computed" },
  ];
  if (input.device === "orifice" && iwb.ok === true) readings.push({ label: "Indoor wet bulb", value: iwb.value, unit: "F", source: "entered" });
  if (input.device === "orifice" && odb.ok === true) readings.push({ label: "Outdoor dry bulb", value: odb.value, unit: "F", source: "entered" });

  return {
    errors: [],
    result: {
      superheatF,
      subcoolingF,
      suctionSatF: dew.tempF,
      liquidSatF: bubble.tempF,
      targetSuperheatF,
      items,
      notes,
      severity: tone === "concern" ? "concern" : tone === "ok" ? "ok" : "info",
      diagnosis: [provisional, ...items.map((i) => i.line)].filter(Boolean).join(" "),
      readings,
      reference: references.join("; "),
    },
  };
}
