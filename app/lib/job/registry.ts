import type { Finding, Job, JobSystem } from "./types";
import { scopeKey } from "./types";

export type ToolId =
  | "nameplate"
  | "electrical"
  | "charge"
  | "furnace"
  | "static"
  | "airflow"
  | "insulation"
  | "duct"
  | "load"
  | "photos"
  | "notes"
  | "explain";

export type ToolKind = "finding" | "equipment" | "media" | "notes" | "standalone";

export type ToolDef = {
  id: ToolId;
  label: string;
  description: string;
  kind: ToolKind;
  /** Finding key this tool saves. Only finding tools have one. */
  findingKey?: string;
};

export const TOOLS: Record<ToolId, ToolDef> = {
  nameplate: { id: "nameplate", label: "Nameplate scan", description: "Read the data plate and confirm the fields.", kind: "equipment" },
  electrical: { id: "electrical", label: "Electrical readings", description: "Voltage, amps and capacitor against the nameplate.", kind: "finding", findingKey: "electrical" },
  charge: { id: "charge", label: "Refrigerant charge", description: "Superheat and subcooling from your gauge readings.", kind: "finding", findingKey: "charge" },
  furnace: { id: "furnace", label: "Furnace check", description: "Temperature rise, CO and heat exchanger observations.", kind: "finding", findingKey: "furnace" },
  static: { id: "static", label: "Static pressure", description: "Total external static against the rated value.", kind: "finding", findingKey: "static" },
  airflow: { id: "airflow", label: "Airflow", description: "CFM per ton from temperature split or measured airflow.", kind: "finding", findingKey: "airflow" },
  insulation: { id: "insulation", label: "Attic insulation", description: "Depth readings and an added-R recommendation.", kind: "finding", findingKey: "insulation" },
  duct: { id: "duct", label: "Duct sizing", description: "Area and velocity check for a duct run.", kind: "finding", findingKey: "duct" },
  load: { id: "load", label: "Load screening", description: "Rough cooling and heating load range for the home.", kind: "finding", findingKey: "load" },
  photos: { id: "photos", label: "Photos", description: "Take, mark up and attach photos.", kind: "media" },
  notes: { id: "notes", label: "Voice notes", description: "Dictate notes and tidy them into sections.", kind: "notes" },
  explain: { id: "explain", label: "Customer note", description: "Write an estimate note from free-typed facts.", kind: "standalone" },
};

export type TileId = "condenser" | "furnace" | "attic" | "home";

export type TileDef = {
  id: TileId;
  label: string;
  description: string;
  scope: "system" | "home";
  tools: ToolId[];
  /** Finding keys that count toward this tile's progress. */
  expected: string[];
};

export const TILES: TileDef[] = [
  { id: "condenser", label: "Condenser", description: "Outdoor unit", scope: "system", tools: ["nameplate", "electrical", "charge", "photos", "notes"], expected: ["electrical", "charge"] },
  { id: "furnace", label: "Furnace or air handler", description: "Indoor unit", scope: "system", tools: ["nameplate", "furnace", "static", "airflow", "electrical", "photos", "notes"], expected: ["furnace", "static", "airflow"] },
  { id: "attic", label: "Attic and ductwork", description: "Insulation and duct runs", scope: "system", tools: ["insulation", "duct", "static", "photos", "notes"], expected: ["insulation", "duct"] },
  { id: "home", label: "Whole home", description: "Load and general notes", scope: "home", tools: ["load", "photos", "notes"], expected: ["load"] },
];

export function tileById(id: string): TileDef | undefined {
  return TILES.find((t) => t.id === id);
}

export function toolById(id: string): ToolDef | undefined {
  return (TOOLS as Record<string, ToolDef | undefined>)[id];
}

export type TileStatus = "not-started" | "in-progress" | "done" | "attention" | "safety";

/**
 * Tile status is derived from the job, never stored.
 * safety: any safety finding in the tile. attention: any concern. done: all expected findings saved.
 * in-progress: some expected findings or equipment saved. not-started: nothing yet.
 */
export function tileStatus(job: Job, tile: TileDef, system: JobSystem | null): TileStatus {
  const scopeId = tile.scope === "home" ? "home" : system ? scopeKey({ kind: "system", systemId: system.id }) : "";
  const findings: Finding[] = job.findings.filter((f) => scopeKey(f.scope) === scopeId && tile.expected.includes(f.key));
  if (findings.some((f) => f.severity === "safety")) return "safety";
  if (findings.some((f) => f.severity === "concern")) return "attention";
  const have = new Set(findings.map((f) => f.key));
  if (tile.expected.every((k) => have.has(k))) return "done";
  const hasEquipment = tile.tools.includes("nameplate") && !!system && Object.keys(system.equipment).length > 0;
  return have.size > 0 || hasEquipment ? "in-progress" : "not-started";
}

export function tileStatusLabel(status: TileStatus, tile: TileDef, job: Job, system: JobSystem | null): string {
  const scopeId = tile.scope === "home" ? "home" : system ? scopeKey({ kind: "system", systemId: system.id }) : "";
  const saved = new Set(job.findings.filter((f) => scopeKey(f.scope) === scopeId && tile.expected.includes(f.key)).map((f) => f.key)).size;
  switch (status) {
    case "safety":
      return "Safety finding";
    case "attention":
      return "Needs attention";
    case "done":
      return `${saved} of ${tile.expected.length} saved`;
    case "in-progress":
      return `${saved} of ${tile.expected.length} saved`;
    default:
      return "Not started";
  }
}
