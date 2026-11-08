import { TOOLS, type ToolId } from "./job/registry";

// Tools that make sense without a job. Equipment scan and photos belong to a system.
export type DirectoryEntry = { id: string; href: string; title: string; meta: string };
export type DirectoryGroup = { label: string; entries: DirectoryEntry[] };

const tool = (id: ToolId): DirectoryEntry => ({ id, href: `/tools/${id}`, title: TOOLS[id].label, meta: TOOLS[id].description });

export const TOOL_GROUPS: DirectoryGroup[] = [
  { label: "Maintenance", entries: [tool("maintenance")] },
  { label: "Equipment diagnostics", entries: (["electrical", "charge", "heatpump", "furnace", "gas", "static", "airflow", "airside", "compressor"] as const).map(tool) },
  { label: "Install and repair", entries: (["evacuation", "refrigerantLog"] as const).map(tool) },
  { label: "Home and airflow planning", entries: (["insulation", "duct", "load"] as const).map(tool) },
  { label: "Customer communication", entries: [tool("explain")] },
  // Reference material that lives outside the measurement tool registry.
  { label: "Training and reference", entries: [{ id: "unit-explorer", href: "/tools/unit-explorer", title: "3D unit explorer", meta: "Explore a variable-speed outdoor unit in 3D: exploded views, part details, guided teardown and refrigerant flow." }] },
];

export const DIRECTORY: ReadonlyMap<string, DirectoryEntry> = new Map(TOOL_GROUPS.flatMap((g) => g.entries.map((e) => [e.id, e] as const)));
