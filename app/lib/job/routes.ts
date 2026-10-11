import type { TileDef } from "./registry";
import { componentsForSystem, scopeForComponent, type FindingScope, type Job, type JobComponent, type JobSystem } from "./types";

/** Every equipment link carries its exact target; browser history is the source of truth. */
export function jobHref(jobId: string, tileId?: string, toolId?: string, scope?: FindingScope): string {
  const path = `/job/${encodeURIComponent(jobId)}${tileId ? `/${encodeURIComponent(tileId)}` : ""}${toolId ? `/${encodeURIComponent(toolId)}` : ""}`;
  if (!scope || scope.kind === "home") return path;
  const params = new URLSearchParams({ system: scope.systemId });
  if (tileId && scope.componentId) params.set("component", scope.componentId);
  return `${path}?${params}`;
}

export type RouteScope = { ok: true; system: JobSystem | null; component: JobComponent | null; scope: FindingScope } | { ok: false; error: string };
export function resolveRouteScope(job: Job, tile: TileDef, systemId: string | null, componentId: string | null): RouteScope {
  if (tile.scope === "home") return { ok: true, system: null, component: null, scope: { kind: "home" } };
  if (!systemId || !componentId) return { ok: false, error: "This link does not identify a system and component. Choose the equipment from the job overview before entering readings." };
  const system = job.systems.find(s => s.id === systemId);
  if (!system) return { ok: false, error: "The system in this link is no longer in this job. Choose a system from the job overview." };
  const component = componentsForSystem(system).find(c => c.id === componentId);
  if (!component || component.kind !== tile.id) return { ok: false, error: "The component in this link is unavailable or does not match this page. Choose the equipment from the job overview." };
  return { ok: true, system, component, scope: scopeForComponent(system, component) };
}
