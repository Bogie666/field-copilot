import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { jobReducer } from "./reducer";
import { createJob } from "./types";

const NOW = "2026-10-03T23:00:00.000Z";
const base = () => createJob("Oak St", "2026-10-03T22:00:00.000Z", { jobId: "j1", systemId: "sys_1" });

describe("jobReducer", () => {
  it("upserts a finding by key and scope without duplicating", () => {
    let job = jobReducer(base(), { type: "upsertFinding", finding: makeFinding(), now: NOW });
    expect(job.findings).toHaveLength(1);
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ title: "Updated" }), now: NOW });
    expect(job.findings).toHaveLength(1);
    expect(job.findings[0].title).toBe("Updated");
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ key: "static", toolId: "static" }), now: NOW });
    expect(job.findings).toHaveLength(2);
  });

  it("ignores invalid findings and findings for unknown systems", () => {
    const job = base();
    expect(jobReducer(job, { type: "upsertFinding", finding: makeFinding({ diagnosis: "" }), now: NOW })).toBe(job);
    expect(jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope: { kind: "system", systemId: "nope" } }), now: NOW })).toBe(job);
  });

  it("adds, renames and removes systems, and drops that system's findings and photos", () => {
    let job = jobReducer(base(), { type: "addSystem", id: "sys_2", name: "Upstairs", now: NOW });
    expect(job.systems.map((s) => s.name)).toEqual(["System 1", "Upstairs"]);
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope: { kind: "system", systemId: "sys_2" } }), now: NOW });
    job = jobReducer(job, { type: "addPhoto", photo: { id: "p1", systemId: "sys_2", caption: "", mime: "image/jpeg", bytes: 10, createdAt: NOW }, now: NOW });
    job = jobReducer(job, { type: "renameSystem", systemId: "sys_2", name: "  Attic unit ", now: NOW });
    expect(job.systems[1].name).toBe("Attic unit");
    job = jobReducer(job, { type: "removeSystem", systemId: "sys_2", now: NOW });
    expect(job.systems).toHaveLength(1);
    expect(job.findings).toHaveLength(0);
    expect(job.photos).toHaveLength(0);
  });

  it("never removes the last system", () => {
    const job = base();
    expect(jobReducer(job, { type: "removeSystem", systemId: "sys_1", now: NOW })).toBe(job);
  });

  it("stores only non-empty equipment values, trimmed", () => {
    const job = jobReducer(base(), { type: "setEquipment", systemId: "sys_1", equipment: { model: " ABC ", serial: "", rla: "12.3 A" }, now: NOW });
    expect(job.systems[0].equipment).toEqual({ model: "ABC", rla: "12.3 A" });
  });

  it("removes a finding by key and scope", () => {
    let job = jobReducer(base(), { type: "upsertFinding", finding: makeFinding(), now: NOW });
    job = jobReducer(job, { type: "removeFinding", key: "electrical", scope: { kind: "system", systemId: "sys_1" }, now: NOW });
    expect(job.findings).toHaveLength(0);
  });

  it("detaches a removed photo from findings, but protects the last required safety photo", () => {
    let job = jobReducer(base(), { type: "addPhoto", photo: { id: "p1", systemId: "sys_1", caption: "", mime: "image/jpeg", bytes: 1, createdAt: NOW }, now: NOW });
    job = jobReducer(job, { type: "addPhoto", photo: { id: "p2", systemId: "sys_1", caption: "", mime: "image/jpeg", bytes: 1, createdAt: NOW }, now: NOW });
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ key: "furnace", toolId: "furnace", photoIds: ["p1", "p2"] }), now: NOW });
    job = jobReducer(job, { type: "removePhoto", photoId: "p1", now: NOW });
    expect(job.findings[0].photoIds).toEqual(["p2"]);

    const safety = makeFinding({ key: "furnace", toolId: "furnace", severity: "safety", safetyAction: "Off.", requiresPhotoForSafety: true, photoIds: ["p2"] });
    job = jobReducer(job, { type: "upsertFinding", finding: safety, now: NOW });
    const after = jobReducer(job, { type: "removePhoto", photoId: "p2", now: NOW });
    expect(after).toBe(job);
  });

  it("updates updatedAt on change", () => {
    const job = jobReducer(base(), { type: "setHomeNotes", notes: "Gate code on file", now: NOW });
    expect(job.updatedAt).toBe(NOW);
    expect(job.homeNotes).toBe("Gate code on file");
  });
});
