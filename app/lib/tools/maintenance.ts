import type { Reading } from "../job/types";
import type { ToolId } from "../job/registry";
import type { ResultItem } from "./numbers";

// Tune-up checklist. Each item is pass, fail or not applicable; measurements stay in
// their own tools, which the checklist links to.

export type ChecklistUnit = "outdoor" | "indoor";
export type ChecklistState = "" | "pass" | "fail" | "na";

export type ChecklistItem = { id: string; label: string; tool?: ToolId };

export const CHECKLISTS: Record<ChecklistUnit, { label: string; items: readonly ChecklistItem[] }> = {
  outdoor: {
    label: "Outdoor unit",
    items: [
      { id: "disconnect", label: "Disconnect and whip in good condition" },
      { id: "connections", label: "Electrical connections tightened, no heat damage" },
      { id: "contactor", label: "Contactor inspected", tool: "electrical" },
      { id: "capacitor", label: "Capacitor tested", tool: "electrical" },
      { id: "amps", label: "Compressor and fan amps checked", tool: "electrical" },
      { id: "coil", label: "Condenser coil cleaned or clean" },
      { id: "fan", label: "Fan blade and motor bearings checked" },
      { id: "charge", label: "Refrigerant readings checked", tool: "charge" },
      { id: "lineset", label: "Line set insulation intact" },
      { id: "level", label: "Unit level with clearance around it" },
      { id: "defrost", label: "Defrost operation checked (heat pump)", tool: "heatpump" },
    ],
  },
  indoor: {
    label: "Indoor unit",
    items: [
      { id: "thermostat", label: "Thermostat operation and calibration" },
      { id: "filter", label: "Filter checked or replaced", tool: "airside" },
      { id: "drain", label: "Condensate drain cleared and flowing", tool: "airside" },
      { id: "floatSwitch", label: "Overflow safety switch tested", tool: "airside" },
      { id: "blower", label: "Blower wheel and motor inspected" },
      { id: "evapCoil", label: "Evaporator coil inspected" },
      { id: "connections", label: "Electrical connections tightened" },
      { id: "static", label: "Static pressure checked", tool: "static" },
      { id: "airflow", label: "Temperature split or airflow checked", tool: "airflow" },
      { id: "ignition", label: "Igniter and flame sensor cleaned (gas)", tool: "gas" },
      { id: "gas", label: "Gas pressure checked (gas)", tool: "gas" },
      { id: "venting", label: "Flue and venting inspected (gas)", tool: "furnace" },
      { id: "heatExchanger", label: "Heat exchanger inspected (gas)", tool: "furnace" },
      { id: "strips", label: "Heat strips and sequencers checked (electric)", tool: "heatpump" },
      { id: "safeties", label: "Limit and rollout safeties tested" },
    ],
  },
};

export type MaintenanceInput = { unit: "" | ChecklistUnit; checks: Record<string, ChecklistState>; notes: string };
export const EMPTY_MAINTENANCE: MaintenanceInput = { unit: "", checks: {}, notes: "" };

export type MaintenanceResult = {
  items: ResultItem[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
  counts: { pass: number; fail: number; na: number; open: number; total: number };
};
export type MaintenanceAssessment = { errors: string[]; result: MaintenanceResult | null };

function state(value: unknown): ChecklistState {
  return value === "pass" || value === "fail" || value === "na" ? value : "";
}

export function assessMaintenance(input: MaintenanceInput): MaintenanceAssessment {
  if (input.unit !== "outdoor" && input.unit !== "indoor") return { errors: ["Choose indoor or outdoor checklist."], result: null };
  const list = CHECKLISTS[input.unit];
  const rows = list.items.map((item) => ({ item, state: state(input.checks?.[item.id]) }));
  const counts = { pass: 0, fail: 0, na: 0, open: 0, total: rows.length };
  for (const r of rows) {
    if (r.state === "") counts.open++;
    else counts[r.state]++;
  }
  const notes = input.notes.trim();
  if (counts.open === counts.total) return { errors: ["Mark at least one checklist item."], result: null };

  const failed = rows.filter((r) => r.state === "fail").map((r) => r.item.label.toLowerCase());
  const items: ResultItem[] = [];
  items.push({ id: "summary", label: list.label, line: `${list.label} tune-up: ${counts.pass} passed, ${counts.fail} failed, ${counts.na} not applicable${counts.open ? `, ${counts.open} not done` : ""}.`, tone: counts.fail ? "concern" : counts.open ? "info" : "ok" });
  if (failed.length) items.push({ id: "failed", label: "Failed items", line: `Did not pass: ${failed.join("; ")}.`, tone: "concern" });
  if (notes) items.push({ id: "notes", label: "Notes", line: `Checklist notes: ${notes}`, tone: "info" });

  const readings: Reading[] = [
    { label: "Items passed", value: counts.pass, unit: "", source: "computed" },
    { label: "Items failed", value: counts.fail, unit: "", source: "computed" },
    { label: "Items not done", value: counts.open, unit: "", source: "computed" },
  ];
  const severity = counts.fail ? "concern" : counts.open ? "info" : "ok";
  return { errors: [], result: { items, severity, diagnosis: items.map((i) => i.line).join(" "), readings, reference: "", counts } };
}
