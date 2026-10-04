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
  confirmedAt: string;
  /** Hash of the inputs that produced it, used to detect out-of-date findings. */
  inputsHash: string;
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
export function validateFinding(value: unknown): string[] {
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
  for (const [name, text] of [["title", f.title], ["diagnosis", f.diagnosis], ["reference", f.reference], ["recommendation", f.recommendation], ["safetyAction", f.safetyAction]] as const) {
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
  if (f.severity === "safety") {
    if (typeof f.safetyAction !== "string" || !f.safetyAction.trim()) errors.push("A safety finding needs a documented safety action.");
    if (f.requiresPhotoForSafety && !(Array.isArray(f.photoIds) && f.photoIds.length > 0)) errors.push("This safety finding needs at least one photo.");
  }
  if (typeof f.confirmedAt !== "string" || Number.isNaN(Date.parse(f.confirmedAt))) errors.push("Finding needs a confirmation time.");
  if (typeof f.inputsHash !== "string" || !f.inputsHash) errors.push("Finding needs an inputs hash.");
  return errors;
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
