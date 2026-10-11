import { ageFromManufacturedDate } from "../nameplateEquipment";
import { safeScopeLabel } from "./provenance";
import { scopeKey, type Finding, type FindingScope, type Job, type JobComponent } from "./types";

export const REPORT_LIMITS = "This is a visit record, not a safety certification or a guarantee of equipment condition. Screening results and incomplete checks require technician review.";
export const EXPORT_LIMITS = "This download includes text, structured evidence and photo metadata only. Image files are not embedded. It is not a restorable backup, cloud sync or proof of storage durability.";

export function findingId(finding: Finding): string {
  return `${finding.key}|${scopeKey(finding.scope)}`;
}

/** The private export is explicit about omissions. No external service is involved. */
export function officeEvidenceRecord(job: Job) {
  return {
    format: "field-copilot-office-evidence",
    version: 1,
    recordedThrough: job.updatedAt,
    limitations: [REPORT_LIMITS, EXPORT_LIMITS],
    photoContent: "metadata-only",
    job,
  };
}

export function recordedEquipmentAge(equipment: Pick<JobComponent, "equipmentAge" | "equipmentAgeSource" | "equipmentAgeAsOf" | "equipment">): string {
  if (!equipment.equipmentAge) return "Recorded age: Unknown";
  const asOf = equipment.equipmentAgeAsOf ? `as of ${equipment.equipmentAgeAsOf}` : "as-of date not recorded";
  if (equipment.equipmentAgeSource !== "manufactured-date") return `Recorded age: ${equipment.equipmentAge} years (${equipment.equipmentAgeSource === "manual" ? "technician entered" : "source not recorded"}; ${asOf})`;
  const date = equipment.equipment.manufacturedDate;
  const derived = equipment.equipmentAgeAsOf ? ageFromManufacturedDate(date, equipment.equipmentAgeAsOf) : null;
  const precision = derived?.precision === "year" ? "manufacture year only" : derived?.precision === "month" ? "manufacture month and year only" : derived?.precision === "day" ? "full printed manufacture date" : "date precision unverified";
  const mismatch = derived && String(derived.years) !== equipment.equipmentAge ? "; recorded age and date calculation differ, review required" : "";
  return `${derived?.precision === "day" ? "Recorded completed-year age" : "Approximate recorded age"}: ${equipment.equipmentAge} years (derived from ${precision}; printed date: ${date || "not recorded"}; ${asOf}${mismatch})`;
}

function privateScopeLabel(job: Job, scope: FindingScope): string {
  if (scope.kind === "home") return "Whole home";
  const system = job.systems.find(item => item.id === scope.systemId);
  const component = system?.components?.find(item => item.id === scope.componentId);
  return `${safeScopeLabel(scope, job.systems)}${system ? `; local label: ${system.name}` : ""}${component ? `; component label: ${component.name}` : ""}`;
}

function findingLines(job: Job, finding: Finding, historical = false): string[] {
  return [
    `${historical ? "HISTORY" : finding.staleAt ? "NEEDS RECONFIRMATION" : "CONFIRMED"} | ${finding.severity.toUpperCase()} | ${finding.title}`,
    `Scope: ${privateScopeLabel(job, finding.scope)}`,
    `Tool: ${finding.toolId}; key: ${finding.key}; confirmed: ${finding.confirmedAt}; input hash: ${finding.inputsHash}`,
    `As found: ${finding.diagnosis}`,
    ...finding.readings.map(reading => `Reading: ${reading.label}: ${reading.value}${reading.unit ? ` ${reading.unit}` : ""} [${reading.source}]`),
    `Reference: ${finding.reference || "Not documented"}`,
    `Action taken: ${finding.actionTaken || "Not documented"}`,
    `Verification: ${finding.verification || "Not documented"}`,
    `Safety action: ${finding.safetyAction || "Not documented"}`,
    `Next step: ${finding.recommendation || "Not documented"}`,
    `Photo IDs: ${finding.photoIds?.join(", ") || "None attached"}`,
    ...(finding.staleAt ? [`Stale since: ${finding.staleAt}; reason: ${finding.staleReason || "Review required"}`] : []),
    ...(finding.inputs ? [`Saved form values: ${JSON.stringify(finding.inputs)}`] : []),
  ];
}

/** Complete readable evidence, including notes/history/drafts, without claiming to contain images. */
export function officeEvidenceText(job: Job): string {
  const lines = [
    "FIELD COPILOT | PRIVATE OFFICE EVIDENCE",
    `Job: ${job.label || "Untitled"}`,
    `Job ID: ${job.id}`,
    `Created: ${job.createdAt}`,
    `Last recorded update: ${job.updatedAt}`,
    REPORT_LIMITS,
    EXPORT_LIMITS,
    "Contains private job labels, equipment identifiers and notes. Review the intended recipient before sharing.",
    "", "EQUIPMENT AND NOTES",
  ];
  for (const [systemIndex, system] of job.systems.entries()) {
    lines.push("", `System ${systemIndex + 1}: ${system.name} [${system.id}]`);
    for (const [key, value] of Object.entries(system.equipment)) lines.push(`System equipment ${key}: ${value}`);
    if (system.equipmentAge) lines.push(`System ${recordedEquipmentAge(system)}`);
    if (system.notes) lines.push(`System notes:\n${system.notes}`);
    for (const [componentIndex, component] of (system.components ?? []).entries()) {
      lines.push(`Component ${componentIndex + 1}: ${component.name} (${component.kind}) [${component.id}]`);
      const fields = Object.entries(component.equipment);
      lines.push(...(fields.length ? fields.map(([key, value]) => `  ${key}: ${value}`) : ["  No equipment fields documented"]));
      lines.push(`  ${recordedEquipmentAge(component)}`);
      lines.push(`  Notes:\n${component.notes || "Not documented"}`);
    }
  }
  lines.push("", "WHOLE-HOME NOTES", job.homeNotes || "Not documented", "", "SAVED FINDINGS");
  if (!job.findings.length) lines.push("No findings saved. This does not establish that checks were performed or passed.");
  for (const finding of job.findings) lines.push("", ...findingLines(job, finding));
  lines.push("", "PREVIOUS FINDING CONFIRMATIONS");
  if (!job.findingHistory?.length) lines.push("None recorded");
  for (const finding of job.findingHistory ?? []) lines.push("", ...findingLines(job, finding, true));
  lines.push("", "ACCEPTED NOTE EDIT HISTORY");
  if (!job.notesTidyHistory?.length) lines.push("None recorded");
  for (const edit of job.notesTidyHistory ?? []) {
    lines.push("", `${privateScopeLabel(job, edit.scope)}; accepted: ${edit.acceptedAt}`, `ORIGINAL:\n${edit.original}`, `ACCEPTED EDIT:\n${edit.accepted}`);
  }
  lines.push("", "UNCONFIRMED TOOL DRAFTS", "Drafts are working notes, not saved findings or verified results.");
  if (!job.drafts?.length) lines.push("None recorded");
  for (const draft of job.drafts ?? []) lines.push(`${privateScopeLabel(job, draft.scope)}; ${draft.toolId}; ${draft.slot}; ${draft.updatedAt}`, JSON.stringify(draft.inputs));
  lines.push("", "PHOTO METADATA (NO IMAGE FILES)");
  if (!job.photos.length) lines.push("None recorded");
  for (const photo of job.photos) {
    const scope: FindingScope = photo.systemId === null ? { kind: "home" } : { kind: "system", systemId: photo.systemId, ...(photo.componentId ? { componentId: photo.componentId } : {}) };
    lines.push(`Photo ${photo.id}; ${privateScopeLabel(job, scope)}; ${photo.mime}; ${photo.bytes} bytes; created ${photo.createdAt}`, `Caption: ${photo.caption || "None"}`);
  }
  return lines.join("\n");
}

/** Verbatim documented facts, never interpretations. Private notes, labels and images stay out. */
export function customerCloseoutText(job: Job, selected: Finding[] = job.findings): string {
  // Selection cannot inject historical/deleted evidence. All safety findings stay visible.
  const selectedIds = new Set(selected.map(findingId));
  const current = job.findings.filter(finding => !finding.staleAt && (selectedIds.has(findingId(finding)) || finding.severity === "safety"));
  const stale = job.findings.filter(finding => finding.staleAt);
  const lines = ["VISIT SUMMARY", "Prepared from the technician’s recorded findings. Review with the technician before customer use.", REPORT_LIMITS];
  const sorted = [...current].sort((a, b) => Number(b.severity === "safety") - Number(a.severity === "safety"));
  for (const finding of sorted) {
    lines.push("", `${safeScopeLabel(finding.scope, job.systems)}${finding.severity === "safety" ? " | Documented safety concern" : ""}`);
    lines.push(`What was found: ${finding.diagnosis}`);
    if (finding.readings.length) lines.push(`Recorded measurements: ${finding.readings.map(reading => `${reading.label}: ${reading.value}${reading.unit ? ` ${reading.unit}` : ""}`).join("; ")}`);
    if (finding.reference) lines.push(`Compared with: ${finding.reference}`);
    lines.push(`Work recorded: ${finding.actionTaken || "No action documented."}`);
    if (finding.safetyAction) lines.push(`Safety action recorded: ${finding.safetyAction}`);
    lines.push(`Verification recorded: ${finding.verification || "No verification documented."}`);
    if (finding.recommendation) lines.push(`Recommended next step: ${finding.recommendation}`);
  }
  if (!current.length) lines.push("", "No current findings selected. This is not confirmation that checks were completed or that equipment is safe.");
  if (stale.length) {
    lines.push("", "PENDING RECONFIRMATION");
    for (const finding of stale) lines.push(`${safeScopeLabel(finding.scope, job.systems)}: ${finding.severity === "safety" ? "A previously documented safety concern remains pending technician review. Its status has not been reconfirmed; do not treat it as resolved." : "A previous finding needs technician review and reconfirmation. Its earlier result is not presented as current."}`);
  }
  return lines.join("\n");
}
