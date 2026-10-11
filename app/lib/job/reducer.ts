import { MAX_TRANSCRIPT_CHARS } from "../fieldAi";
import { type Finding, type FindingScope, type Job, type PhotoMeta, sameFinding, scopeKey, validateFinding, defaultComponents, componentsForSystem, equipmentForScope, notesForScope, scopeExists } from "./types";

export type JobAction =
  | { type: "setToolDraft"; toolId: string; scope: FindingScope; slot?: string; inputs: Record<string, unknown>; now: string }
  | { type: "setLabel"; label: string; now: string }
  | { type: "addSystem"; id: string; name: string; now: string }
  | { type: "renameSystem"; systemId: string; name: string; now: string }
  | { type: "removeSystem"; systemId: string; now: string }
  | { type: "setEquipment"; systemId: string; componentId?: string; age?: string; ageSource?: "manual" | "manufactured-date"; equipment: Record<string, string>; now: string }
  | { type: "setEquipmentAge"; systemId: string; componentId?: string; age: string; now: string }
  | { type: "upsertFinding"; finding: Finding; now: string }
  | { type: "removeFinding"; key: string; scope: Finding["scope"]; now: string }
  | { type: "addPhoto"; photo: PhotoMeta; now: string }
  | { type: "removePhoto"; photoId: string; now: string }
  | { type: "setSystemNotes"; systemId: string; componentId?: string; notes: string; now: string }
  | { type: "acceptTidiedNotes"; scope: FindingScope; original: string; notes: string; acceptedAt: string; now: string }
  | { type: "setHomeNotes"; notes: string; now: string };

// Dependencies are data inputs, not safety thresholds. Identity changes conservatively
// invalidate every system finding; other fields affect only tools that consume them.
const IDENTITY_FIELDS = ["manufacturer", "model", "serial", "equipmentType"];
const TOOL_EQUIPMENT_FIELDS: Record<string, string[]> = {
  electrical: ["rla", "voltage", "phase"],
  charge: ["refrigerant"],
  furnace: ["tempRiseRange"],
  static: ["maxExternalStatic"],
  airflow: ["capacity"],
};

function touch(job: Job, now: string): Job {
  return { ...job, updatedAt: now };
}

/**
 * Pure reducer. Invalid input leaves the job unchanged (use validateFinding first to show the reasons).
 * The last remaining system cannot be removed.
 */
export function jobReducer(job: Job, action: JobAction): Job {
  switch (action.type) {
    case "setToolDraft": {
      if (!scopeExists(job, action.scope)) return job;
      if (!action.toolId || !action.inputs || Array.isArray(action.inputs) || JSON.stringify(action.inputs).length > 20_000) return job;
      const slot = action.slot ?? "form";
      const others = (job.drafts ?? []).filter((d) => !(d.toolId === action.toolId && scopeKey(d.scope) === scopeKey(action.scope) && d.slot === slot));
      return touch({ ...job, drafts: [...others, { toolId: action.toolId, scope: action.scope, slot, inputs: action.inputs, updatedAt: action.now }] }, action.now);
    }
    case "setLabel":
      return touch({ ...job, label: action.label.trim().slice(0, 80) }, action.now);
    case "addSystem": {
      const name = action.name.trim().slice(0, 40) || `System ${job.systems.length + 1}`;
      if (job.systems.some((s) => s.id === action.id)) return job;
      return touch({ ...job, systems: [...job.systems, { id: action.id, name, components: defaultComponents(action.id), equipment: {}, equipmentAge: "", notes: "" }] }, action.now);
    }
    case "renameSystem": {
      const name = action.name.trim().slice(0, 40);
      if (!name) return job;
      return touch({ ...job, systems: job.systems.map((s) => (s.id === action.systemId ? { ...s, name } : s)) }, action.now);
    }
    case "removeSystem": {
      if (job.systems.length <= 1 || !job.systems.some((s) => s.id === action.systemId)) return job;
      return touch(
        {
          ...job,
          systems: job.systems.filter((s) => s.id !== action.systemId),
          drafts: (job.drafts ?? []).filter((d) => !(d.scope.kind === "system" && d.scope.systemId === action.systemId)),
          findings: job.findings.filter((f) => !(f.scope.kind === "system" && f.scope.systemId === action.systemId)),
          photos: job.photos.filter((p) => p.systemId !== action.systemId),
          findingHistory: (job.findingHistory ?? []).filter(f => !(f.scope.kind === "system" && f.scope.systemId === action.systemId)),
          notesTidyHistory: (job.notesTidyHistory ?? []).filter(h => !(h.scope.kind === "system" && h.scope.systemId === action.systemId)),
        },
        action.now,
      );
    }
    case "setEquipment": {
      const cleaned = Object.fromEntries(Object.entries(action.equipment).map(([k, v]) => [k, String(v).trim().slice(0, 120)]).filter(([, v]) => v));
      const before = job.systems.find((s) => s.id === action.systemId);
      const scope: FindingScope = { kind: "system", systemId: action.systemId, ...(action.componentId ? { componentId: action.componentId } : {}) };
      if (!before || !scopeExists(job, scope)) return job;
      const previousEquipment = equipmentForScope(before, scope);
      const changed = new Set([...Object.keys(previousEquipment), ...Object.keys(cleaned)].filter((key) => (previousEquipment[key] ?? "") !== (cleaned[key] ?? "")));
      const findings = job.findings.map((f) => {
        if (scopeKey(f.scope) !== scopeKey(scope)) return f;
        const relevant = [...IDENTITY_FIELDS, ...(TOOL_EQUIPMENT_FIELDS[f.toolId] ?? [])].filter((key) => changed.has(key));
        if (!relevant.length) return f;
        return { ...f, staleAt: f.staleAt ?? action.now, staleReason: `Confirmed nameplate changed: ${relevant.join(", ")}. Review readings and references, then reconfirm.` };
      });
      const age = action.age === undefined ? {} : { equipmentAge: action.age.trim().slice(0, 4), equipmentAgeSource: action.ageSource ?? "manual" as const, equipmentAgeAsOf: action.now };
      return touch({ ...job, findings, drafts: (job.drafts ?? []).filter(d => !(d.toolId === "nameplate" && scopeKey(d.scope) === scopeKey(scope))), systems: job.systems.map(s => s.id !== action.systemId ? s : action.componentId
        ? { ...s, components: componentsForSystem(s).map(c => c.id === action.componentId ? { ...c, equipment: cleaned, ...age } : c) }
        : { ...s, equipment: cleaned, ...age }) }, action.now);
    }
    case "setEquipmentAge": {
      const scope: FindingScope = { kind: "system", systemId: action.systemId, ...(action.componentId ? { componentId: action.componentId } : {}) };
      if (!scopeExists(job, scope)) return job;
      return touch({ ...job, systems: job.systems.map(s => s.id !== action.systemId ? s : action.componentId
        ? { ...s, components: componentsForSystem(s).map(c => c.id === action.componentId ? { ...c, equipmentAge: action.age.trim().slice(0, 4), equipmentAgeSource: "manual" as const, equipmentAgeAsOf: action.now } : c) }
        : { ...s, equipmentAge: action.age.trim().slice(0, 4), equipmentAgeSource: "manual" as const, equipmentAgeAsOf: action.now }) }, action.now);
    }
    case "upsertFinding": {
      if (validateFinding(action.finding, job).length > 0) return job;
      if (action.finding.scope.kind === "system") {
        const sid = action.finding.scope.systemId;
        if (!job.systems.some((s) => s.id === sid)) return job;
      }
      const others = job.findings.filter((f) => !sameFinding(f, action.finding));
      const previous = job.findings.filter((f) => sameFinding(f, action.finding));
      return touch({ ...job, findingHistory: [...(job.findingHistory ?? []), ...previous], findings: [...others, action.finding], drafts: (job.drafts ?? []).filter((d) => !(d.toolId === action.finding.toolId && scopeKey(d.scope) === scopeKey(action.finding.scope))) }, action.now);
    }
    case "removeFinding":
      return touch({ ...job, findings: job.findings.filter((f) => !sameFinding(f, { key: action.key, scope: action.scope })) }, action.now);
    case "addPhoto":
      if (job.photos.some((p) => p.id === action.photo.id)) return job;
      if (!scopeExists(job, action.photo.systemId === null ? { kind: "home" } : { kind: "system", systemId: action.photo.systemId, componentId: action.photo.componentId })) return job;
      if (action.photo.systemId === null && action.photo.componentId) return job;
      return touch({ ...job, photos: [...job.photos, action.photo] }, action.now);
    case "removePhoto": {
      // A safety finding that requires a photo must keep at least one. Remove the finding first.
      const blocked = job.findings.some((f) => f.severity === "safety" && f.requiresPhotoForSafety && f.photoIds?.length === 1 && f.photoIds[0] === action.photoId);
      if (blocked || (job.findingHistory ?? []).some(f => f.photoIds?.includes(action.photoId))) return job;
      return touch(
        {
          ...job,
          photos: job.photos.filter((p) => p.id !== action.photoId),
          drafts: (job.drafts ?? []).map(d => Array.isArray(d.inputs.photoIds) ? { ...d, inputs: { ...d.inputs, photoIds: d.inputs.photoIds.filter(id => id !== action.photoId) } } : d),
          findings: job.findings.map((f) => (f.photoIds?.includes(action.photoId) ? { ...f, photoIds: f.photoIds.filter((id) => id !== action.photoId) } : f)),
        },
        action.now,
      );
    }
    case "setSystemNotes": {
      const scope: FindingScope = { kind: "system", systemId: action.systemId, ...(action.componentId ? { componentId: action.componentId } : {}) };
      if (!scopeExists(job, scope) || typeof action.notes !== "string" || action.notes.length > MAX_TRANSCRIPT_CHARS) return job;
      return touch({ ...job, systems: job.systems.map(s => s.id !== action.systemId ? s : action.componentId
        ? { ...s, components: componentsForSystem(s).map(c => c.id === action.componentId ? { ...c, notes: action.notes } : c) }
        : { ...s, notes: action.notes }) }, action.now);
    }
    case "acceptTidiedNotes": {
      if (!scopeExists(job, action.scope) || typeof action.original !== "string" || typeof action.notes !== "string" || action.original.length > MAX_TRANSCRIPT_CHARS || action.notes.length > MAX_TRANSCRIPT_CHARS || Number.isNaN(Date.parse(action.acceptedAt))) return job;
      const system = action.scope.kind === "system" ? job.systems.find(s => s.id === (action.scope as { systemId: string }).systemId) ?? null : null;
      const current = action.scope.kind === "home" ? job.homeNotes : notesForScope(system, action.scope);
      if (current !== action.original) return job;
      const updated = action.scope.kind === "home"
        ? jobReducer(job, { type: "setHomeNotes", notes: action.notes, now: action.now })
        : jobReducer(job, { type: "setSystemNotes", systemId: action.scope.systemId, componentId: action.scope.componentId, notes: action.notes, now: action.now });
      return { ...updated, notesTidyHistory: [...(job.notesTidyHistory ?? []), { scope: action.scope, original: action.original, accepted: action.notes, acceptedAt: action.acceptedAt }] };
    }
    case "setHomeNotes":
      if (typeof action.notes !== "string" || action.notes.length > MAX_TRANSCRIPT_CHARS) return job;
      return touch({ ...job, homeNotes: action.notes }, action.now);
    default:
      return job;
  }
}
