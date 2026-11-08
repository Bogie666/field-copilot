import type { Finding, Job, JobSystem, JobComponent } from "./types";
import { componentForTile, scopeForComponent, scopeKey } from "./types";

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
  | "explain"
  | "heatpump"
  | "gas"
  | "evacuation"
  | "refrigerantLog"
  | "compressor"
  | "airside"
  | "maintenance";

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
  notes: { id: "notes", label: "Job notes", description: "Dictate job notes and tidy them into sections.", kind: "notes" },
  explain: { id: "explain", label: "Customer note", description: "Write an estimate note from free-typed facts.", kind: "standalone" },
  heatpump: { id: "heatpump", label: "Heat pump heating", description: "Heating rise, heating subcooling, heat strip output and defrost check.", kind: "finding", findingKey: "heatpump" },
  gas: { id: "gas", label: "Gas pressure and input", description: "Inlet and manifold pressure, clocked firing rate and flame signal.", kind: "finding", findingKey: "gas" },
  evacuation: { id: "evacuation", label: "Pressure test and evacuation", description: "Nitrogen standing test with temperature correction, vacuum and decay test.", kind: "finding", findingKey: "evacuation" },
  refrigerantLog: { id: "refrigerantLog", label: "Refrigerant record", description: "Refrigerant added or recovered, and the line set charge adjustment.", kind: "finding", findingKey: "refrigerantLog" },
  compressor: { id: "compressor", label: "Compressor windings", description: "Winding resistance and insulation to ground.", kind: "finding", findingKey: "compressor" },
  airside: { id: "airside", label: "Filter, drain and humidity", description: "Filter condition, condensate drain, overflow switch and indoor dew point.", kind: "finding", findingKey: "airside" },
  maintenance: { id: "maintenance", label: "Tune-up checklist", description: "Pass or fail each maintenance item, with links to the measuring tools.", kind: "finding", findingKey: "maintenance" },
};

export type TileId = "condenser" | "furnace" | "attic" | "home" | "legacy";

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
  { id: "condenser", label: "Condenser", description: "Outdoor unit", scope: "system", tools: ["nameplate", "maintenance", "electrical", "charge", "heatpump", "compressor", "evacuation", "refrigerantLog", "photos", "notes"], expected: ["electrical", "charge"] },
  { id: "furnace", label: "Furnace or air handler", description: "Indoor unit", scope: "system", tools: ["nameplate", "maintenance", "furnace", "gas", "static", "airflow", "airside", "electrical", "photos", "notes"], expected: ["furnace", "static", "airflow"] },
  { id: "attic", label: "Attic and ductwork", description: "Insulation and duct runs", scope: "system", tools: ["insulation", "duct", "static", "photos", "notes"], expected: ["insulation", "duct"] },
  { id: "home", label: "Whole home", description: "Load and general notes", scope: "home", tools: ["load", "photos", "notes"], expected: ["load"] },
];

export const LEGACY_TILE: TileDef = { id: "legacy", label: "Unassigned legacy equipment", description: "Preserved evidence with unconfirmed component identity", scope: "system", tools: ["nameplate", "maintenance", "electrical", "charge", "heatpump", "compressor", "evacuation", "refrigerantLog", "furnace", "gas", "static", "airflow", "airside", "insulation", "duct", "photos", "notes"], expected: [] };

export function tileById(id: string): TileDef | undefined {
  return id === "legacy" ? LEGACY_TILE : TILES.find((t) => t.id === id);
}

export function toolById(id: string): ToolDef | undefined {
  return (TOOLS as Record<string, ToolDef | undefined>)[id];
}

export type TileStatus = "not-started" | "in-progress" | "done" | "attention" | "safety" | "needs-review";

/**
 * Tile status is derived from the job, never stored.
 * safety: any safety finding in the tile. attention: any concern. done: all expected findings saved.
 * in-progress: some expected findings or equipment saved. not-started: nothing yet.
 */
export function tileStatus(job: Job, tile: TileDef, system: JobSystem | null, resolvedComponent?: JobComponent | null): TileStatus {
  const component = resolvedComponent !== undefined ? resolvedComponent : system ? componentForTile(system, tile.id) : undefined;
  const scopeId = tile.scope === "home" ? "home" : system && component ? scopeKey(scopeForComponent(system, component)) : "";
  const findings: Finding[] = job.findings.filter((f) => scopeKey(f.scope) === scopeId && tile.tools.includes(f.toolId as ToolId));
  if (findings.some((f) => f.severity === "safety")) return "safety";
  if (findings.some((f) => f.staleAt)) return "needs-review";
  if (findings.some((f) => f.severity === "concern")) return "attention";
  const have = new Set(findings.filter(f => !f.staleAt && tile.expected.includes(f.key)).map((f) => f.key));
  if (tile.expected.length > 0 && tile.expected.every((k) => have.has(k))) return "done";
  const hasEquipment = tile.tools.includes("nameplate") && !!system && Object.keys(component?.equipment ?? {}).length > 0;
  return findings.length > 0 || hasEquipment ? "in-progress" : "not-started";
}

export function tileStatusLabel(status: TileStatus, tile: TileDef, job: Job, system: JobSystem | null, resolvedComponent?: JobComponent | null): string {
  const component = resolvedComponent !== undefined ? resolvedComponent : system ? componentForTile(system, tile.id) : undefined;
  const scopeId = tile.scope === "home" ? "home" : system && component ? scopeKey(scopeForComponent(system, component)) : "";
  const saved = new Set(job.findings.filter((f) => scopeKey(f.scope) === scopeId && tile.expected.includes(f.key) && !f.staleAt).map((f) => f.key)).size;
  const stale = job.findings.some(f => scopeKey(f.scope) === scopeId && tile.tools.includes(f.toolId as ToolId) && !!f.staleAt);
  if (tile.id === "legacy") {
    const preserved = job.findings.filter(f => scopeKey(f.scope) === scopeId).length;
    return `${preserved} preserved ${preserved === 1 ? "finding" : "findings"}${status === "safety" ? " · Safety finding" : ""}${stale ? " · Needs review" : ""}`;
  }
  switch (status) {
    case "safety":
      return stale ? "Safety finding · Needs review" : "Safety finding";
    case "needs-review":
      return `Needs review · ${saved} of ${tile.expected.length} current`;
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
