import type { Reading } from "../job/types";
import { fmt, parseDecimal, type ResultItem } from "./numbers";

// Refrigerant added and recovered, plus the line set charge adjustment from the
// installation manual. A record, not an assessment: it never classifies the charge.

export type RefrigerantLogInput = {
  refrigerant: string;
  addedLb: string;
  addedOz: string;
  recoveredLb: string;
  recoveredOz: string;
  cylinder: string;
  reason: string;
  lineLengthFt: string;
  includedLengthFt: string;
  ozPerFt: string;
};

export const EMPTY_REFRIGERANT_LOG: RefrigerantLogInput = {
  refrigerant: "",
  addedLb: "",
  addedOz: "",
  recoveredLb: "",
  recoveredOz: "",
  cylinder: "",
  reason: "",
  lineLengthFt: "",
  includedLengthFt: "",
  ozPerFt: "",
};

export type RefrigerantLogResult = {
  items: ResultItem[];
  severity: "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  addedOz: number | null;
  recoveredOz: number | null;
  adjustmentOz: number | null;
};

export type RefrigerantLogAssessment = { errors: string[]; result: RefrigerantLogResult | null };

export function formatLbOz(totalOz: number): string {
  const sign = totalOz < 0 ? "-" : "";
  const abs = Math.abs(totalOz);
  let lb = Math.floor(abs / 16);
  let oz = Number((abs - lb * 16).toFixed(1));
  if (oz >= 16) { lb += 1; oz -= 16; }
  return `${sign}${lb} lb ${fmt(oz)} oz`;
}

export function assessRefrigerantLog(input: RefrigerantLogInput): RefrigerantLogAssessment {
  const errors: string[] = [];
  const n = {
    addedLb: parseDecimal(input.addedLb, "Added pounds", { min: 0, max: 500 }),
    addedOz: parseDecimal(input.addedOz, "Added ounces", { min: 0, max: 1000 }),
    recoveredLb: parseDecimal(input.recoveredLb, "Recovered pounds", { min: 0, max: 500 }),
    recoveredOz: parseDecimal(input.recoveredOz, "Recovered ounces", { min: 0, max: 1000 }),
    line: parseDecimal(input.lineLengthFt, "Line set length", { positive: true, max: 500 }),
    included: parseDecimal(input.includedLengthFt, "Length included in factory charge", { min: 0, max: 500 }),
    ozPerFt: parseDecimal(input.ozPerFt, "Ounces per foot", { positive: true, max: 10 }),
  };
  for (const parsed of Object.values(n)) if (parsed.ok === false) errors.push(parsed.error);
  if (errors.length) return { errors, result: null };
  const v = Object.fromEntries(Object.entries(n).map(([k, x]) => [k, x.ok === true ? x.value : null])) as Record<keyof typeof n, number | null>;
  const total = (lb: number | null, oz: number | null) => (lb === null && oz === null ? null : (lb ?? 0) * 16 + (oz ?? 0));
  const addedOz = total(v.addedLb, v.addedOz);
  const recoveredOz = total(v.recoveredLb, v.recoveredOz);
  const lineFields = [v.line, v.included, v.ozPerFt].filter((x) => x !== null).length;
  if (lineFields > 0 && lineFields < 3) errors.push("For the line set adjustment, enter line length, length included in the factory charge and ounces per foot.");
  if ((addedOz !== null || recoveredOz !== null) && !input.refrigerant.trim()) errors.push("Enter the refrigerant.");
  if (addedOz === null && recoveredOz === null && lineFields < 3) errors.push("Enter refrigerant added, recovered or a line set adjustment.");
  if (errors.length) return { errors, result: null };

  const items: ResultItem[] = [];
  const readings: Reading[] = [];
  const references: string[] = [];
  const refrigerant = input.refrigerant.trim();
  const cylinder = input.cylinder.trim();
  const reason = input.reason.trim();

  if (addedOz !== null) {
    readings.push({ label: "Refrigerant added", value: Number(addedOz.toFixed(1)), unit: "oz", source: "computed" });
    items.push({ id: "added", label: "Added", line: `Added ${formatLbOz(addedOz)} of ${refrigerant}${cylinder ? ` from cylinder ${cylinder}` : ""}.`, tone: "info" });
  }
  if (recoveredOz !== null) {
    readings.push({ label: "Refrigerant recovered", value: Number(recoveredOz.toFixed(1)), unit: "oz", source: "computed" });
    items.push({ id: "recovered", label: "Recovered", line: `Recovered ${formatLbOz(recoveredOz)} of ${refrigerant}.`, tone: "info" });
  }

  let adjustmentOz: number | null = null;
  if (v.line !== null && v.included !== null && v.ozPerFt !== null) {
    adjustmentOz = (v.line - v.included) * v.ozPerFt;
    readings.push(
      { label: "Line set length", value: v.line, unit: "ft", source: "entered" },
      { label: "Length in factory charge", value: v.included, unit: "ft", source: "entered" },
      { label: "Line set adjustment", value: Number(adjustmentOz.toFixed(1)), unit: "oz", source: "computed" },
    );
    references.push(`installation manual ${fmt(v.ozPerFt, 2)} oz per foot beyond ${fmt(v.included, 0)} ft`);
    const line = adjustmentOz > 0
      ? `Line set ${fmt(v.line, 0)} ft is ${fmt(v.line - v.included, 0)} ft longer than the ${fmt(v.included, 0)} ft in the factory charge: add ${fmt(adjustmentOz)} oz (${formatLbOz(adjustmentOz)}) at ${fmt(v.ozPerFt, 2)} oz per foot.`
      : adjustmentOz < 0
        ? `Line set ${fmt(v.line, 0)} ft is shorter than the ${fmt(v.included, 0)} ft in the factory charge (${fmt(Math.abs(adjustmentOz))} oz at ${fmt(v.ozPerFt, 2)} oz per foot). Follow the installation manual; many do not call for removing charge.`
        : `Line set ${fmt(v.line, 0)} ft matches the length in the factory charge; no adjustment.`;
    items.push({ id: "lineset", label: "Line set adjustment", line, tone: "info" });
  }
  if (reason) items.push({ id: "reason", label: "Reason", line: `Reason: ${reason}.`, tone: "info" });

  return {
    errors: [],
    result: { items, severity: "info", diagnosis: items.map((i) => i.line).join(" "), readings, reference: references.join("; "), addedOz, recoveredOz, adjustmentOz },
  };
}
