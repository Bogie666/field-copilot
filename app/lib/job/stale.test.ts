import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { jobReducer } from "./reducer";
import { createJob } from "./types";
import { composeExplanationInput } from "./compose";

const now = "2026-10-04T00:00:00.000Z";
const scope = { kind: "system", systemId: "s1" } as const;
const base = () => createJob("Test", now, { jobId: "j1", systemId: "s1" });

describe("equipment-dependent findings", () => {
  it("keeps the prior stale evidence in history when explicitly reconfirmed", () => {
    let job = jobReducer(base(), { type: "upsertFinding", finding: makeFinding({ scope }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s1", equipment: { rla: "15" }, now });
    const prior = job.findings[0];
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope, title: "Rechecked", confirmedAt: now }), now });
    expect(job.findings[0].staleAt).toBeUndefined();
    expect(job.findingHistory).toEqual([prior]);
    expect(composeExplanationInput(job.findings).input?.diagnosis).toBe(job.findings[0].diagnosis);
  });
  it.each([
    ["electrical", "voltage"], ["electrical", "phase"], ["charge", "refrigerant"],
    ["furnace", "tempRiseRange"], ["static", "maxExternalStatic"], ["airflow", "capacity"],
    ["duct", "model"], ["insulation", "serial"], ["electrical", "manufacturer"], ["charge", "equipmentType"],
  ])("invalidates %s after relevant %s additions or removal, but not other scopes", (toolId, field) => {
    let job = jobReducer(base(), { type: "upsertFinding", finding: makeFinding({ key: toolId, toolId, scope }), now });
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ key: "home", toolId, scope: { kind: "home" } }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s1", equipment: { [field]: "new" }, now });
    expect(job.findings.find((f) => f.key === toolId)?.staleAt).toBe(now);
    expect(job.findings.find((f) => f.key === "home")?.staleAt).toBeUndefined();
  });
  it("does not invalidate for unchanged values, age, or an unrelated nameplate field", () => {
    let job = jobReducer(base(), { type: "setEquipment", systemId: "s1", equipment: { rla: "12" }, now });
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s1", equipment: { rla: " 12 ", capacity: "3 tons" }, now });
    job = jobReducer(job, { type: "setEquipmentAge", systemId: "s1", age: "12", now });
    expect(job.findings[0].staleAt).toBeUndefined();
  });
  it("marks electrical evidence stale on changed RLA and excludes it from AI without deleting it", () => {
    let job = jobReducer(base(), { type: "setEquipment", systemId: "s1", equipment: { rla: "12" }, now });
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope }), now });
    job = jobReducer(job, { type: "setEquipment", systemId: "s1", equipment: { rla: "15" }, now });
    expect(job.findings).toHaveLength(1);
    expect(job.findings[0].staleAt).toBe(now);
    expect(job.findings[0].staleReason).toContain("rla");
    expect(job.findings[0].readings[0].value).toBe(238);
    expect(composeExplanationInput(job.findings).input).toBeNull();
  });
});
