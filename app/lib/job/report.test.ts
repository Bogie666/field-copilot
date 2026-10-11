import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { customerCloseoutText, EXPORT_LIMITS, officeEvidenceRecord, officeEvidenceText, recordedEquipmentAge, REPORT_LIMITS } from "./report";
import { createJob, type Finding, type Job } from "./types";

const now = "2026-10-05T00:00:00.000Z";
function evidenceJob(): Job {
  const job = createJob("PRIVATE JOB LABEL", now, { jobId: "j1", systemId: "s1" });
  const scope = { kind: "system" as const, systemId: "s1", componentId: "c1" };
  job.systems[0].name = "PRIVATE SYSTEM LABEL";
  job.systems[0].components = [{ id: "c1", name: "PRIVATE COMPONENT LABEL", kind: "furnace", equipment: { model: "MODEL-123", serial: "SERIAL-456", voltage: "240" }, equipmentAge: "12", notes: "PRIVATE COMPONENT NOTES" }];
  job.systems[0].notes = "PRIVATE LEGACY NOTES";
  job.homeNotes = "PRIVATE HOME NOTES";
  job.findings = [makeFinding({ scope, actionTaken: "Replaced documented part.", verification: "Recorded post-work voltage at 240 V.", recommendation: "Review recorded comparison.", photoIds: ["photo1"], inputs: { inputVoltage: "238" } })];
  job.findingHistory = [makeFinding({ scope, diagnosis: "Historical measurement", confirmedAt: "2026-10-04T00:00:00.000Z" })];
  job.photos = [{ id: "photo1", systemId: "s1", componentId: "c1", mime: "image/jpeg", bytes: 500, caption: "PRIVATE PHOTO CAPTION", createdAt: now }];
  job.drafts = [{ toolId: "electrical", scope, slot: "form", inputs: { voltage: "239", draftNote: "UNCONFIRMED DRAFT" }, updatedAt: now }];
  job.notesTidyHistory = [{ scope, original: "ORIGINAL OMITTED NEGATION", accepted: "ACCEPTED NOTE EDIT", acceptedAt: now }];
  return job;
}

describe("deterministic office evidence", () => {
  it("includes equipment, numeric evidence, actions, sources, notes, history, drafts and photo metadata", () => {
    const job = evidenceJob();
    const text = officeEvidenceText(job);
    for (const detail of ["PRIVATE JOB LABEL", "MODEL-123", "SERIAL-456", "Recorded age: 12 years", "238 V [entered]", "Nameplate nominal", "Replaced documented part", "post-work voltage", "PRIVATE COMPONENT NOTES", "PRIVATE HOME NOTES", "PRIVATE LEGACY NOTES", "Historical measurement", "ORIGINAL OMITTED NEGATION", "ACCEPTED NOTE EDIT", "UNCONFIRMED DRAFT", "photo1", "500 bytes", "image/jpeg", "PRIVATE PHOTO CAPTION"]) expect(text).toContain(detail);
    expect(text).toContain(REPORT_LIMITS);
    expect(text).toContain(EXPORT_LIMITS);
  });

  it("exports a complete structured local record without inventing embedded images or backup support", () => {
    const job = evidenceJob();
    const record = officeEvidenceRecord(job);
    expect(record.job).toEqual(job);
    expect(record.photoContent).toBe("metadata-only");
    expect(record.limitations.join(" ")).toContain("not a restorable backup");
    expect(record.limitations.join(" ")).toContain("not a safety certification");
    expect(JSON.parse(JSON.stringify(record)).job.notesTidyHistory[0].original).toBe("ORIGINAL OMITTED NEGATION");
    expect(JSON.stringify(record)).not.toContain("data:image/");
  });

  it("is repeatable, immutable, includes stale/history status, and supports visits with no findings", () => {
    const job = evidenceJob();
    job.findings[0].staleAt = now;
    job.findings[0].staleReason = "Equipment changed";
    const before = JSON.stringify(job);
    expect(officeEvidenceText(job)).toEqual(officeEvidenceText(job));
    expect(officeEvidenceText(job)).toContain("NEEDS RECONFIRMATION");
    expect(officeEvidenceText(job)).toContain("Equipment changed");
    expect(officeEvidenceText(job)).toContain("HISTORY");
    expect(JSON.stringify(job)).toBe(before);
    const empty = createJob("An unfinished visit", now);
    expect(officeEvidenceText(empty)).toContain("No findings saved");
    expect(officeEvidenceRecord(empty).job).toEqual(empty);
  });
});

describe("customer closeout without AI", () => {
  it("includes documented findings/actions/verification without private labels or history", () => {
    const text = customerCloseoutText(evidenceJob());
    expect(text).toContain("System 1 / Component 1 (Furnace or air handler)");
    for (const detail of ["238 V", "Replaced documented part", "post-work voltage", "Review recorded comparison", "Nameplate nominal"]) expect(text).toContain(detail);
    for (const privateDetail of ["PRIVATE", "MODEL-123", "SERIAL-456", "Historical measurement", "ORIGINAL", "ACCEPTED", "UNCONFIRMED", "photo1"]) expect(text).not.toContain(privateDetail);
    expect(text).toContain(REPORT_LIMITS);
  });

  it("does not manufacture an action, verification or all-clear when none was documented", () => {
    const job = evidenceJob();
    job.findings = [makeFinding()];
    const text = customerCloseoutText(job);
    expect(text).toContain("No action documented");
    expect(text).toContain("No verification documented");
    expect(text).not.toMatch(/all checks passed|equipment is safe|system is healthy/i);
  });

  it("always retains current safety evidence and warns about stale safety without presenting it as current", () => {
    const job = evidenceJob();
    const safety: Finding = makeFinding({ key: "safety", scope: job.findings[0].scope, severity: "safety", diagnosis: "Documented electrical hazard", safetyAction: "Power isolated", staleAt: now });
    const activeSafety: Finding = { ...safety, key: "active-safety", diagnosis: "Current safety condition", safetyAction: "Current isolation action", staleAt: undefined };
    job.findings.push(safety, activeSafety);
    const text = customerCloseoutText(job, []);
    expect(text).toContain("Current safety condition");
    expect(text).toContain("Current isolation action");
    expect(text).toContain("previously documented safety concern remains pending technician review");
    expect(text).not.toContain("Documented electrical hazard");
    expect(text).not.toContain("Power isolated");
    expect(text).toContain("do not treat it as resolved");
  });

  it("cannot reintroduce stale/history/deleted findings by passing an obsolete selection", () => {
    const job = evidenceJob();
    const old = job.findings[0];
    job.findings[0] = { ...old, diagnosis: "Latest confirmed diagnosis" };
    const deleted = makeFinding({ key: "deleted", diagnosis: "DELETED EVIDENCE" });
    const text = customerCloseoutText(job, [old, deleted]);
    expect(text).toContain("Latest confirmed diagnosis");
    expect(text).not.toContain(old.diagnosis);
    expect(text).not.toContain("DELETED EVIDENCE");
  });

  it("tells the reader about unselected stale ordinary findings and empty selections", () => {
    const job = evidenceJob();
    job.findings[0].staleAt = now;
    const text = customerCloseoutText(job, []);
    expect(text).toContain("No current findings selected");
    expect(text).toContain("previous finding needs technician review and reconfirmation");
    expect(text).not.toContain(job.findings[0].diagnosis);
  });
});


describe("age provenance in closeout", () => {
  it("retains year/month precision and the saved as-of date rather than presenting an exact current age", () => {
    const job = evidenceJob();
    const equipment = job.systems[0].components![0];
    equipment.equipmentAge = "10";
    equipment.equipmentAgeSource = "manufactured-date";
    equipment.equipmentAgeAsOf = now;
    equipment.equipment.manufacturedDate = "2016";
    expect(recordedEquipmentAge(equipment)).toContain("Approximate recorded age: 10 years");
    expect(recordedEquipmentAge(equipment)).toContain("manufacture year only");
    expect(officeEvidenceText(job)).toContain(`as of ${now}`);
    equipment.equipment.manufacturedDate = "2016-01";
    expect(recordedEquipmentAge(equipment)).toContain("manufacture month and year only");
  });
  it("does not silently update a stored age, and flags a disagreement with its printed date", () => {
    const job = evidenceJob();
    const equipment = job.systems[0].components![0];
    equipment.equipmentAge = "4";
    equipment.equipmentAgeSource = "manufactured-date";
    equipment.equipmentAgeAsOf = now;
    equipment.equipment.manufacturedDate = "2016-01-15";
    const text = recordedEquipmentAge(equipment);
    expect(text).toContain("Recorded completed-year age: 4 years");
    expect(text).toContain("recorded age and date calculation differ, review required");
    expect(equipment.equipmentAge).toBe("4");
  });
});
