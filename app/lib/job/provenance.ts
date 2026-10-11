import type { FindingScope, JobSystem } from "./types";

const COMPONENT_NAMES = {
  condenser: "Outdoor unit",
  furnace: "Furnace or air handler",
  attic: "Attic equipment",
  legacy: "Unassigned legacy equipment",
} as const;

/** Only ordinal identities and fixed vocabulary are allowed in customer/AI labels. */
export function safeScopeLabel(scope: FindingScope, systems: JobSystem[], fallbackSystemIds: string[] = [], fallbackScopes: FindingScope[] = []): string {
  if (scope.kind === "home") return "Whole home";
  const index = systems.findIndex(system => system.id === scope.systemId);
  const ordinal = index < 0 ? fallbackSystemIds.indexOf(scope.systemId) + 1 : index + 1;
  const label = ordinal > 0 ? `System ${ordinal}` : "Unassigned system";
  const system = systems[index];
  if (!scope.componentId) return `${label} / Unassigned equipment`;
  const componentIndex = system?.components?.findIndex(component => component.id === scope.componentId) ?? -1;
  if (componentIndex < 0) {
    const ids = [...new Set(fallbackScopes.flatMap(item => item.kind === "system" && item.systemId === scope.systemId && item.componentId ? [item.componentId] : []))].sort();
    const fallbackIndex = ids.indexOf(scope.componentId);
    return fallbackIndex < 0 ? `${label} / Unavailable component` : `${label} / Component ${fallbackIndex + 1} (Unverified identity)`;
  }
  const component = system.components![componentIndex];
  return `${label} / Component ${componentIndex + 1} (${COMPONENT_NAMES[component.kind] ?? "Equipment"})`;
}
