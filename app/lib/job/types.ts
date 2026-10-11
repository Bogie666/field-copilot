// Job domain types. One Job is one visit. A Job has Systems, and each tool saves
// Findings against a System (or against the whole home).

export const SEVERITIES = ["info", "ok", "concern", "safety"] as const;
export type Severity = (typeof SEVERITIES)[number];

export type ReadingSource = "entered" | "nameplate" | "computed";

export type Reading = {
  label: string;
  /** As entered by the technician. Never defaulted. */
  value: number | string;
  unit: string;
  source: ReadingSource;
};

export type ComponentKind = "condenser" | "furnace" | "attic" | "legacy";
export type JobComponent = {
  id: string;
  kind: ComponentKind;
  name: string;
  equipment: Record<string, string>;
  equipmentAge: string;
  equipmentAgeSource?: "manual" | "manufactured-date";
  equipmentAgeAsOf?: string;
  notes: string;
};
export type FindingScope = { kind: "system"; systemId: string; componentId?: string } | { kind: "home" };

export type Finding = {
  /** Stable per tool and scope, so saving again replaces the earlier finding. */
  key: string;
  toolId: string;
  scope: FindingScope;
  severity: Severity;
  /** Short, technician-facing title, for example "Superheat above target". */
  title: string;
  /** Plain documented statement. No recommendations. */
  diagnosis: string;
  readings: Reading[];
  /** What the readings were compared against and where that reference came from. */
  reference?: string;
  /** Technician-written next step, optional. */
  recommendation?: string;
  /** Technician-documented work and subsequent verification, never inferred. */
  actionTaken?: string;
  verification?: string;
  /** Required when severity is "safety". */
  safetyAction?: string;
  /** Photos documenting the finding. Required for safety findings from the furnace tool. */
  photoIds?: string[];
  /** Whether this finding must carry at least one photo when severity is "safety". */
  requiresPhotoForSafety?: boolean;
  /** The form values that produced this finding, so a tool can reopen it for editing. Never sent to AI. */
  inputs?: Record<string, unknown>;
  confirmedAt: string;
  /** Hash of the inputs that produced it, used to detect out-of-date findings. */
  inputsHash: string;
  /** Historical evidence retained, but excluded from customer/AI composition until reconfirmed. */
  staleAt?: string;
  staleReason?: string;
};

export type ToolDraft = {
  toolId: string;
  scope: FindingScope;
  /** Separate form and review fields so their updates cannot overwrite each other. */
  slot: string;
  inputs: Record<string, unknown>;
  updatedAt: string;
};

export type PhotoMeta = {
  id: string;
  systemId: string | null;
  componentId?: string;
  caption: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export type JobSystem = {
  id: string;
  /** Optional only for records created before component identity was introduced. */
  components?: JobComponent[];
  name: string;
  /** Confirmed nameplate and equipment fields, keyed by field name (model, serial, rla, ...). */
  equipment: Record<string, string>;
  /** Equipment age in years as typed by the technician. Blank means unknown. */
  equipmentAge: string;
  equipmentAgeSource?: "manual" | "manufactured-date";
  equipmentAgeAsOf?: string;
  notes: string;
};

export type NotesTidyHistory = { scope: FindingScope; original: string; accepted: string; acceptedAt: string };

export type Job = {
  id: string;
  /** Optimistic concurrency revision; missing legacy revision means zero. */
  storageRevision?: number;
  notesTidyHistory?: NotesTidyHistory[];
  /** Free text the tech types. Stays on the device and is never sent to an AI provider. */
  label: string;
  createdAt: string;
  updatedAt: string;
  systems: JobSystem[];
  findings: Finding[];
  /** Optional for backward compatibility with jobs created before drafts existed. */
  drafts?: ToolDraft[];
  /** Previous explicit confirmations retained locally, never included in AI composition. */
  findingHistory?: Finding[];
  photos: PhotoMeta[];
  homeNotes: string;
};

export type JobSummary = Pick<Job, "id" | "label" | "createdAt" | "updatedAt" | "storageRevision"> & {
  systemCount: number;
  findingCount: number;
  safetyCount: number;
};

export function scopeKey(scope: FindingScope): string {
  return scope.kind === "home" ? "home" : `system:${scope.systemId}${scope.componentId ? `:component:${scope.componentId}` : ""}`;
}

export const COMPONENT_LABELS: Record<ComponentKind, string> = {
  condenser: "Condenser", furnace: "Furnace or air handler", attic: "Attic and ductwork", legacy: "Unassigned legacy equipment",
};

export function defaultComponents(systemId: string): JobComponent[] {
  return (["condenser", "furnace", "attic"] as const).map(kind => ({
    id: `${systemId}:${kind}`, kind, name: COMPONENT_LABELS[kind], equipment: {}, equipmentAge: "", notes: "",
  }));
}

/** Persisted optional age provenance is untrusted, even when the age itself is valid. */
function normalizedAgeMetadata(value: { equipmentAgeSource?: unknown; equipmentAgeAsOf?: unknown }): Pick<JobComponent, "equipmentAgeSource" | "equipmentAgeAsOf"> {
  return {
    equipmentAgeSource: value.equipmentAgeSource === "manual" || value.equipmentAgeSource === "manufactured-date" ? value.equipmentAgeSource : undefined,
    equipmentAgeAsOf: typeof value.equipmentAgeAsOf === "string" && Number.isFinite(Date.parse(value.equipmentAgeAsOf)) ? value.equipmentAgeAsOf : undefined,
  };
}

/** Deterministic IDs also let old, unmigrated records be inspected without writing. */
export function componentsForSystem(system: JobSystem): JobComponent[] {
  if (!Array.isArray(system.components)) return defaultComponents(system.id);
  const seen = new Set<string>();
  return system.components.filter(c => {
    if (!c || typeof c !== "object" || typeof c.id !== "string" || !c.id || seen.has(c.id) || !Object.hasOwn(COMPONENT_LABELS, c.kind)) return false;
    seen.add(c.id);
    return true;
  }).map(c => ({ ...c, ...normalizedAgeMetadata(c), name: typeof c.name === "string" && c.name ? c.name : COMPONENT_LABELS[c.kind],
    equipment: c.equipment && typeof c.equipment === "object" && !Array.isArray(c.equipment) ? Object.fromEntries(Object.entries(c.equipment).filter(([, value]) => typeof value === "string")) : {},
    equipmentAge: typeof c.equipmentAge === "string" ? c.equipmentAge : "", notes: typeof c.notes === "string" ? c.notes : "",
  }));
}

export function componentForTile(system: JobSystem, tileId: string): JobComponent | undefined {
  return componentsForSystem(system).find(component => component.kind === tileId);
}

export function scopeForComponent(system: JobSystem, component: JobComponent): FindingScope {
  return { kind: "system", systemId: system.id, componentId: component.id };
}

export function componentForScope(system: JobSystem | null, scope: FindingScope | null): JobComponent | undefined {
  return system && scope?.kind === "system" && scope.systemId === system.id && scope.componentId
    ? componentsForSystem(system).find(component => component.id === scope.componentId) : undefined;
}

export function equipmentForScope(system: JobSystem | null, scope: FindingScope | null): Record<string, string> {
  if (!system || scope?.kind === "home") return {};
  return scope?.kind === "system" && scope.componentId ? componentForScope(system, scope)?.equipment ?? {} : system.equipment;
}

export function notesForScope(system: JobSystem | null, scope: FindingScope | null): string {
  if (!system || scope?.kind === "home") return "";
  return scope?.kind === "system" && scope.componentId ? componentForScope(system, scope)?.notes ?? "" : system.notes;
}

export function scopeExists(job: Job, scope: FindingScope): boolean {
  if (scope.kind === "home") return true;
  const system = job.systems.find(s => s.id === scope.systemId);
  return !!system && (scope.componentId === undefined || componentsForSystem(system).some(c => c.id === scope.componentId));
}

export function photoMatchesScope(photo: PhotoMeta, scope: FindingScope): boolean {
  return scope.kind === "home" ? photo.systemId === null && !photo.componentId
    : photo.systemId === scope.systemId && photo.componentId === scope.componentId;
}

export function sameFinding(a: Pick<Finding, "key" | "scope">, b: Pick<Finding, "key" | "scope">): boolean {
  return a.key === b.key && scopeKey(a.scope) === scopeKey(b.scope);
}

/** Small stable hash (FNV-1a) of any JSON-serializable inputs. */
export function hashInputs(inputs: unknown): string {
  const text = JSON.stringify(inputs, (_k, v) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v)) ?? "";
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const MAX_TEXT = 2000;

/**
 * Returns a list of problems. An empty list means the finding may be stored.
 * Rules come from the build spec: safety findings need an action (and a photo where required),
 * readings are never blank, and nothing carries customer-identifying fields.
 */
export function validateFinding(value: unknown, job?: Job): string[] {
  const errors: string[] = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["Finding must be an object."];
  const f = value as Partial<Finding>;
  if (!f.key || typeof f.key !== "string") errors.push("Finding needs a key.");
  if (!f.toolId || typeof f.toolId !== "string") errors.push("Finding needs a tool id.");
  const scope = f.scope;
  if (!scope || (scope.kind !== "home" && !(scope.kind === "system" && typeof scope.systemId === "string" && scope.systemId))) {
    errors.push("Finding needs a scope (a system or the whole home).");
  }
  if (scope?.kind === "system" && scope.componentId !== undefined && (typeof scope.componentId !== "string" || !scope.componentId)) errors.push("Finding needs a valid component identity.");
  if (!f.severity || !SEVERITIES.includes(f.severity)) errors.push("Severity must be info, ok, concern or safety.");
  if (typeof f.title !== "string" || !f.title.trim()) errors.push("Finding needs a title.");
  if (typeof f.diagnosis !== "string" || !f.diagnosis.trim()) errors.push("Finding needs a documented diagnosis.");
  for (const [name, text] of [["title", f.title], ["diagnosis", f.diagnosis], ["reference", f.reference], ["recommendation", f.recommendation], ["actionTaken", f.actionTaken], ["verification", f.verification], ["safetyAction", f.safetyAction], ["staleReason", f.staleReason], ["staleAt", f.staleAt]] as const) {
    if (text !== undefined && typeof text !== "string") errors.push(`${name} must be text.`);
    if (typeof text === "string" && text.length > MAX_TEXT) errors.push(`${name} is longer than ${MAX_TEXT} characters.`);
  }
  if (!Array.isArray(f.readings)) {
    errors.push("Readings must be a list.");
  } else {
    f.readings.forEach((r, index) => {
      const n = index + 1;
      if (!r || typeof r !== "object") {
        errors.push(`Reading ${n} is invalid.`);
        return;
      }
      if (!r.label || typeof r.label !== "string") errors.push(`Reading ${n} needs a label.`);
      const v = r.value;
      if (v === "" || v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) || (typeof v === "string" && !v.trim())) {
        errors.push(`Reading ${n} (${r.label || "unnamed"}) is blank. Blank readings are left out, never saved as zero.`);
      }
      if (typeof r.unit !== "string") errors.push(`Reading ${n} needs a unit (it can be empty).`);
      if (!["entered", "nameplate", "computed"].includes(r.source)) errors.push(`Reading ${n} needs a source.`);
    });
  }
  if (f.photoIds !== undefined && (!Array.isArray(f.photoIds) || f.photoIds.some(id => typeof id !== "string" || !id))) errors.push("Photo attachments must be a list of IDs.");
  if (job) {
    if (scope && !scopeExists(job, scope)) errors.push("The finding's system or component is not in this job.");
    if (Array.isArray(f.photoIds)) {
      for (const id of f.photoIds) {
        const photo = job.photos.find(p => p.id === id);
        if (!photo || (!scope || !photoMatchesScope(photo, scope))) errors.push("An attached photo is missing or belongs to a different scope.");
      }
    }
  }
  if (f.severity === "safety") {
    if (typeof f.safetyAction !== "string" || !f.safetyAction.trim()) errors.push("A safety finding needs a documented safety action.");
    if (f.requiresPhotoForSafety && !(Array.isArray(f.photoIds) && f.photoIds.length > 0)) errors.push("This safety finding needs at least one photo.");
  }
  if (f.inputs !== undefined && (typeof f.inputs !== "object" || f.inputs === null || Array.isArray(f.inputs) || JSON.stringify(f.inputs).length > 20_000)) errors.push("Saved form values are invalid or too large.");
  if (typeof f.confirmedAt !== "string" || Number.isNaN(Date.parse(f.confirmedAt))) errors.push("Finding needs a confirmation time.");
  if (typeof f.inputsHash !== "string" || !f.inputsHash) errors.push("Finding needs an inputs hash.");
  return errors;
}

/** Optional persisted extensions are untrusted; missing fields remain backward compatible. */
export function validToolDraft(value: unknown, job?: Job): value is ToolDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const d = value as Partial<ToolDraft>;
  if (typeof d.toolId !== "string" || !d.toolId || typeof d.slot !== "string" || !d.slot || typeof d.updatedAt !== "string" || Number.isNaN(Date.parse(d.updatedAt))) return false;
  if (!d.scope || (d.scope.kind !== "home" && !(d.scope.kind === "system" && typeof d.scope.systemId === "string" && d.scope.systemId))) return false;
  if (d.scope.kind === "system" && d.scope.componentId !== undefined && (typeof d.scope.componentId !== "string" || !d.scope.componentId)) return false;
  if (job && !scopeExists(job, d.scope)) return false;
  if (!d.inputs || typeof d.inputs !== "object" || Array.isArray(d.inputs)) return false;
  try { return JSON.stringify(d.inputs).length <= 20_000; } catch { return false; }
}

export function normalizeJobExtensions(job: Job): Job {
  // Old system-level evidence cannot be safely assigned to the indoor or outdoor unit.
  // Retain it under a clearly named legacy component, never infer its physical identity.
  const legacyIds = new Map<string, string>();
  const systems = job.systems.map(rawSystem => {
    const system = { ...rawSystem, ...normalizedAgeMetadata(rawSystem) };
    const unassigned = Object.keys(system.equipment).length > 0 || !!system.equipmentAge || !!system.notes ||
      [...job.findings, ...(Array.isArray(job.drafts) ? job.drafts : []), ...(Array.isArray(job.findingHistory) ? job.findingHistory : []), ...(Array.isArray(job.notesTidyHistory) ? job.notesTidyHistory : [])].some(item => item?.scope?.kind === "system" && item.scope.systemId === system.id && !item.scope.componentId) ||
      job.photos.some(photo => photo.systemId === system.id && !photo.componentId);
    const components = componentsForSystem(system);
    if (!unassigned) return { ...system, components };
    const existing = components.find(c => c.kind === "legacy");
    const unassignedFindings = job.findings.filter(f => f.scope.kind === "system" && f.scope.systemId === system.id && !f.scope.componentId);
    const unassignedDrafts = (Array.isArray(job.drafts) ? job.drafts : []).filter(d => validToolDraft(d) && d.scope.kind === "system" && d.scope.systemId === system.id && !d.scope.componentId);
    const evidenceCollision = existing && (unassignedFindings.some(incoming => job.findings.some(f => f.scope.kind === "system" && f.scope.systemId === system.id && f.scope.componentId === existing.id && f.key === incoming.key)) ||
      unassignedDrafts.some(incoming => (Array.isArray(job.drafts) ? job.drafts : []).some(d => d?.scope?.kind === "system" && d.scope.systemId === system.id && d.scope.componentId === existing.id && d.toolId === incoming.toolId && d.slot === incoming.slot)));
    const conflicts = existing && (evidenceCollision || Object.entries(system.equipment).some(([key, value]) => existing.equipment[key] && existing.equipment[key] !== value) ||
      (system.notes && existing.notes && system.notes !== existing.notes) || (system.equipmentAge && existing.equipmentAge && system.equipmentAge !== existing.equipmentAge));
    // Preserve two contradictory legacy identities separately; neither may replace the other.
    const id = conflicts ? `${system.id}:legacy-${hashInputs({ equipment: system.equipment, age: system.equipmentAge, notes: system.notes, findings: unassignedFindings.map(f => ({ key: f.key, toolId: f.toolId, confirmedAt: f.confirmedAt, inputsHash: f.inputsHash })), drafts: unassignedDrafts.map(d => ({ toolId: d.toolId, slot: d.slot, updatedAt: d.updatedAt, inputs: d.inputs })) })}` : existing?.id ?? `${system.id}:legacy`;
    legacyIds.set(system.id, id);
    const previous = components.find(c => c.id === id);
    const legacy: JobComponent = { id, kind: "legacy", name: conflicts ? `${COMPONENT_LABELS.legacy} (additional record)` : COMPONENT_LABELS.legacy,
      equipmentAgeSource: system.equipmentAgeSource ?? previous?.equipmentAgeSource, equipmentAgeAsOf: system.equipmentAgeAsOf ?? previous?.equipmentAgeAsOf,
      equipment: { ...(previous?.equipment ?? {}), ...system.equipment }, equipmentAge: system.equipmentAge || previous?.equipmentAge || "", notes: system.notes || previous?.notes || "" };
    return { ...system, equipment: {}, equipmentAge: "", equipmentAgeSource: undefined, equipmentAgeAsOf: undefined, notes: "", components: previous ? components.map(c => c.id === id ? legacy : c) : [...components, legacy] };
  });
  const migratedScope = (scope: FindingScope): FindingScope => scope.kind === "system" && !scope.componentId && legacyIds.has(scope.systemId)
    ? { ...scope, componentId: legacyIds.get(scope.systemId)! } : scope;
  job = {
    ...job, systems,
    findings: job.findings.map(f => ({ ...f, scope: migratedScope(f.scope) })),
    photos: job.photos.map(p => p.systemId && !p.componentId && legacyIds.has(p.systemId) ? { ...p, componentId: legacyIds.get(p.systemId)! } : p),
    ...(Array.isArray(job.drafts) ? { drafts: job.drafts.filter(d => d && typeof d === "object").map(d => ({ ...d, scope: d.scope ? migratedScope(d.scope) : d.scope })) } : {}),
    ...(Array.isArray(job.findingHistory) ? { findingHistory: job.findingHistory.filter(f => f && typeof f === "object").map(f => ({ ...f, scope: f.scope ? migratedScope(f.scope) : f.scope })) } : {}),
    ...(job.notesTidyHistory === undefined ? {} : { notesTidyHistory: Array.isArray(job.notesTidyHistory) ? job.notesTidyHistory.filter(h => h && typeof h === "object" && h.scope &&
      (h.scope.kind === "home" || (h.scope.kind === "system" && typeof h.scope.systemId === "string" && !!h.scope.systemId && (h.scope.componentId === undefined || typeof h.scope.componentId === "string"))) &&
      typeof h.original === "string" && h.original.length <= 12000 && typeof h.accepted === "string" && h.accepted.length <= 12000 && typeof h.acceptedAt === "string" && !Number.isNaN(Date.parse(h.acceptedAt)))
      .map(h => ({ ...h, scope: migratedScope(h.scope) })).filter(h => scopeExists({ ...job, systems }, h.scope)) : [] }),
  };
  return {
    ...job,
    findings: job.findings.map(f => {
      const attachmentIssues = validateFinding(f, job).filter(issue => /photo|system or component is not in this job/i.test(issue));
      return attachmentIssues.length ? { ...f, staleAt: f.staleAt ?? job.updatedAt, staleReason: "The system, component or an attached photo is unavailable or belongs to another scope. Review the record and explicitly reconfirm before using this finding." } : f;
    }),
    ...(job.drafts === undefined ? {} : { drafts: Array.isArray(job.drafts) ? job.drafts.filter(d => validToolDraft(d, job)).map(d => ({ toolId: d.toolId,
      scope: d.scope.kind === "home" ? { kind: "home" as const } : { kind: "system" as const, systemId: d.scope.systemId, ...(d.scope.componentId ? { componentId: d.scope.componentId } : {}) },
      slot: d.slot, inputs: d.inputs, updatedAt: d.updatedAt })) : [] }),
    ...(job.findingHistory === undefined ? {} : { findingHistory: Array.isArray(job.findingHistory) ? job.findingHistory.filter(f => { try { return validateFinding(f).length === 0; } catch { return false; } }) : [] }),
  };
}

export function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export function createJob(label: string, now: string, ids: { jobId?: string; systemId?: string } = {}): Job {
  const systemId = ids.systemId ?? newId("sys");
  return {
    id: ids.jobId ?? newId("job"),
    label: label.trim().slice(0, 80),
    createdAt: now,
    updatedAt: now,
    systems: [{ id: systemId, components: defaultComponents(systemId), name: "System 1", equipment: {}, equipmentAge: "", notes: "" }],
    findings: [],
    photos: [],
    homeNotes: "",
  };
}

export function summarizeJob(job: Job): JobSummary {
  return {
    id: job.id,
    label: job.label,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    storageRevision: job.storageRevision ?? 0,
    systemCount: job.systems.length,
    findingCount: job.findings.length,
    safetyCount: job.findings.filter((f) => f.severity === "safety").length,
  };
}
