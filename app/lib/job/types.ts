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

export type FindingScope = { kind: "system"; systemId: string } | { kind: "home" };

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
  caption: string;
  mime: string;
  bytes: number;
  createdAt: string;
};

export type JobSystem = {
  id: string;
  name: string;
  /** Confirmed nameplate and equipment fields, keyed by field name (model, serial, rla, ...). */
  equipment: Record<string, string>;
  /** Equipment age in years as typed by the technician. Blank means unknown. */
  equipmentAge: string;
  notes: string;
};

export type Job = {
  id: string;
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

export type JobSummary = Pick<Job, "id" | "label" | "createdAt" | "updatedAt"> & {
  systemCount: number;
  findingCount: number;
  safetyCount: number;
};

export function scopeKey(scope: FindingScope): string {
  return scope.kind === "home" ? "home" : `system:${scope.systemId}`;
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
  if (!f.severity || !SEVERITIES.includes(f.severity)) errors.push("Severity must be info, ok, concern or safety.");
  if (typeof f.title !== "string" || !f.title.trim()) errors.push("Finding needs a title.");
  if (typeof f.diagnosis !== "string" || !f.diagnosis.trim()) errors.push("Finding needs a documented diagnosis.");
  for (const [name, text] of [["title", f.title], ["diagnosis", f.diagnosis], ["reference", f.reference], ["recommendation", f.recommendation], ["safetyAction", f.safetyAction], ["staleReason", f.staleReason], ["staleAt", f.staleAt]] as const) {
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
    if (scope?.kind === "system" && !job.systems.some(s => s.id === scope.systemId)) errors.push("The finding's system is not in this job.");
    if (Array.isArray(f.photoIds)) {
      for (const id of f.photoIds) {
        const photo = job.photos.find(p => p.id === id);
        if (!photo || (scope?.kind === "system" ? photo.systemId !== scope.systemId : photo.systemId !== null)) errors.push("An attached photo is missing or belongs to a different scope.");
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
  if (job && d.scope.kind === "system" && !job.systems.some(s => s.id === (d.scope as { systemId: string }).systemId)) return false;
  if (!d.inputs || typeof d.inputs !== "object" || Array.isArray(d.inputs)) return false;
  try { return JSON.stringify(d.inputs).length <= 20_000; } catch { return false; }
}

export function normalizeJobExtensions(job: Job): Job {
  return {
    ...job,
    findings: job.findings.map(f => {
      const attachmentIssues = validateFinding(f, job).filter(issue => /photo|system is not in this job/i.test(issue));
      return attachmentIssues.length ? { ...f, staleAt: f.staleAt ?? job.updatedAt, staleReason: "An attached photo is missing or belongs to another scope. Review attachments and explicitly reconfirm before using this finding." } : f;
    }),
    ...(job.drafts === undefined ? {} : { drafts: Array.isArray(job.drafts) ? job.drafts.filter(d => validToolDraft(d, job)) : [] }),
    ...(job.findingHistory === undefined ? {} : { findingHistory: Array.isArray(job.findingHistory) ? job.findingHistory.filter(f => { try { return validateFinding(f).length === 0; } catch { return false; } }) : [] }),
  };
}

export function newId(prefix: string): string {
  const random = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export function createJob(label: string, now: string, ids: { jobId?: string; systemId?: string } = {}): Job {
  return {
    id: ids.jobId ?? newId("job"),
    label: label.trim().slice(0, 80),
    createdAt: now,
    updatedAt: now,
    systems: [{ id: ids.systemId ?? newId("sys"), name: "System 1", equipment: {}, equipmentAge: "", notes: "" }],
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
    systemCount: job.systems.length,
    findingCount: job.findings.length,
    safetyCount: job.findings.filter((f) => f.severity === "safety").length,
  };
}
