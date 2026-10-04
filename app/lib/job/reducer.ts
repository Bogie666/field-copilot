import { type Finding, type Job, type PhotoMeta, sameFinding, validateFinding } from "./types";

export type JobAction =
  | { type: "setLabel"; label: string; now: string }
  | { type: "addSystem"; id: string; name: string; now: string }
  | { type: "renameSystem"; systemId: string; name: string; now: string }
  | { type: "removeSystem"; systemId: string; now: string }
  | { type: "setEquipment"; systemId: string; equipment: Record<string, string>; now: string }
  | { type: "setEquipmentAge"; systemId: string; age: string; now: string }
  | { type: "upsertFinding"; finding: Finding; now: string }
  | { type: "removeFinding"; key: string; scope: Finding["scope"]; now: string }
  | { type: "addPhoto"; photo: PhotoMeta; now: string }
  | { type: "removePhoto"; photoId: string; now: string }
  | { type: "setSystemNotes"; systemId: string; notes: string; now: string }
  | { type: "setHomeNotes"; notes: string; now: string };

function touch(job: Job, now: string): Job {
  return { ...job, updatedAt: now };
}

/**
 * Pure reducer. Invalid input leaves the job unchanged (use validateFinding first to show the reasons).
 * The last remaining system cannot be removed.
 */
export function jobReducer(job: Job, action: JobAction): Job {
  switch (action.type) {
    case "setLabel":
      return touch({ ...job, label: action.label.trim().slice(0, 80) }, action.now);
    case "addSystem": {
      const name = action.name.trim().slice(0, 40) || `System ${job.systems.length + 1}`;
      if (job.systems.some((s) => s.id === action.id)) return job;
      return touch({ ...job, systems: [...job.systems, { id: action.id, name, equipment: {}, equipmentAge: "", notes: "" }] }, action.now);
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
          findings: job.findings.filter((f) => !(f.scope.kind === "system" && f.scope.systemId === action.systemId)),
          photos: job.photos.filter((p) => p.systemId !== action.systemId),
        },
        action.now,
      );
    }
    case "setEquipment": {
      const cleaned = Object.fromEntries(Object.entries(action.equipment).map(([k, v]) => [k, String(v).trim().slice(0, 120)]).filter(([, v]) => v));
      return touch({ ...job, systems: job.systems.map((s) => (s.id === action.systemId ? { ...s, equipment: cleaned } : s)) }, action.now);
    }
    case "setEquipmentAge":
      return touch({ ...job, systems: job.systems.map((s) => (s.id === action.systemId ? { ...s, equipmentAge: action.age.trim().slice(0, 4) } : s)) }, action.now);
    case "upsertFinding": {
      if (validateFinding(action.finding).length > 0) return job;
      if (action.finding.scope.kind === "system") {
        const sid = action.finding.scope.systemId;
        if (!job.systems.some((s) => s.id === sid)) return job;
      }
      const others = job.findings.filter((f) => !sameFinding(f, action.finding));
      return touch({ ...job, findings: [...others, action.finding] }, action.now);
    }
    case "removeFinding":
      return touch({ ...job, findings: job.findings.filter((f) => !sameFinding(f, { key: action.key, scope: action.scope })) }, action.now);
    case "addPhoto":
      if (job.photos.some((p) => p.id === action.photo.id)) return job;
      return touch({ ...job, photos: [...job.photos, action.photo] }, action.now);
    case "removePhoto": {
      // A safety finding that requires a photo must keep at least one. Remove the finding first.
      const blocked = job.findings.some((f) => f.severity === "safety" && f.requiresPhotoForSafety && f.photoIds?.length === 1 && f.photoIds[0] === action.photoId);
      if (blocked) return job;
      return touch(
        {
          ...job,
          photos: job.photos.filter((p) => p.id !== action.photoId),
          findings: job.findings.map((f) => (f.photoIds?.includes(action.photoId) ? { ...f, photoIds: f.photoIds.filter((id) => id !== action.photoId) } : f)),
        },
        action.now,
      );
    }
    case "setSystemNotes":
      return touch({ ...job, systems: job.systems.map((s) => (s.id === action.systemId ? { ...s, notes: action.notes.slice(0, 6000) } : s)) }, action.now);
    case "setHomeNotes":
      return touch({ ...job, homeNotes: action.notes.slice(0, 6000) }, action.now);
    default:
      return job;
  }
}
