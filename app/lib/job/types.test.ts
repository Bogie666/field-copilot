import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { createJob, hashInputs, sameFinding, summarizeJob, validateFinding } from "./types";

describe("validateFinding", () => {
  it("accepts a well-formed finding", () => {
    expect(validateFinding(makeFinding())).toEqual([]);
  });

  it("rejects non-objects", () => {
    expect(validateFinding(null)).not.toEqual([]);
    expect(validateFinding([])).not.toEqual([]);
    expect(validateFinding("x")).not.toEqual([]);
  });

  it("requires a title and a documented diagnosis", () => {
    expect(validateFinding(makeFinding({ title: " " })).join(" ")).toMatch(/title/);
    expect(validateFinding(makeFinding({ diagnosis: "" })).join(" ")).toMatch(/diagnosis/);
  });

  it("rejects blank readings instead of saving them as zero", () => {
    const blank = makeFinding({ readings: [{ label: "Amps", value: "", unit: "A", source: "entered" }] });
    expect(validateFinding(blank).join(" ")).toMatch(/blank/i);
    const nan = makeFinding({ readings: [{ label: "Amps", value: Number.NaN, unit: "A", source: "entered" }] });
    expect(validateFinding(nan).join(" ")).toMatch(/blank/i);
    const zero = makeFinding({ readings: [{ label: "Amps", value: 0, unit: "A", source: "entered" }] });
    expect(validateFinding(zero)).toEqual([]);
  });

  it("requires a safety action for safety findings", () => {
    expect(validateFinding(makeFinding({ severity: "safety" })).join(" ")).toMatch(/safety action/);
    expect(validateFinding(makeFinding({ severity: "safety", safetyAction: "  " })).join(" ")).toMatch(/safety action/);
    expect(validateFinding(makeFinding({ severity: "safety", safetyAction: "Shut down and tagged unit." }))).toEqual([]);
  });

  it("requires a photo when the safety finding says one is required", () => {
    const base = makeFinding({ severity: "safety", safetyAction: "Shut down.", requiresPhotoForSafety: true });
    expect(validateFinding(base).join(" ")).toMatch(/photo/);
    expect(validateFinding({ ...base, photoIds: [] }).join(" ")).toMatch(/photo/);
    expect(validateFinding({ ...base, photoIds: ["p1"] })).toEqual([]);
  });

  it("rejects an unknown severity, source, or scope", () => {
    expect(validateFinding({ ...makeFinding(), severity: "bad" }).join(" ")).toMatch(/Severity/);
    expect(validateFinding(makeFinding({ readings: [{ label: "x", value: 1, unit: "", source: "guess" as never }] })).join(" ")).toMatch(/source/);
    expect(validateFinding({ ...makeFinding(), scope: { kind: "system" } }).join(" ")).toMatch(/scope/);
  });

  it("rejects over-long text", () => {
    expect(validateFinding(makeFinding({ diagnosis: "x".repeat(2001) })).join(" ")).toMatch(/longer/);
  });
});

describe("hashInputs", () => {
  it("is stable regardless of key order and changes with values", () => {
    expect(hashInputs({ a: 1, b: 2 })).toBe(hashInputs({ b: 2, a: 1 }));
    expect(hashInputs({ a: 1 })).not.toBe(hashInputs({ a: 2 }));
  });
});

describe("job helpers", () => {
  it("creates a job with one system and trims the label", () => {
    const job = createJob("  Oak St  ", "2026-10-03T00:00:00.000Z", { jobId: "j1", systemId: "s1" });
    expect(job.label).toBe("Oak St");
    expect(job.systems).toHaveLength(1);
    expect(job.systems[0]).toMatchObject({ id: "s1", name: "System 1" });
  });

  it("matches findings by key and scope", () => {
    const a = makeFinding();
    expect(sameFinding(a, makeFinding())).toBe(true);
    expect(sameFinding(a, makeFinding({ scope: { kind: "system", systemId: "sys_2" } }))).toBe(false);
    expect(sameFinding(a, makeFinding({ key: "static" }))).toBe(false);
    expect(sameFinding(makeFinding({ scope: { kind: "home" } }), makeFinding({ scope: { kind: "home" } }))).toBe(true);
  });

  it("summarizes counts", () => {
    const job = createJob("x", "2026-10-03T00:00:00.000Z", { jobId: "j", systemId: "sys_1" });
    job.findings.push(makeFinding(), makeFinding({ key: "furnace", severity: "safety", safetyAction: "Off." }));
    expect(summarizeJob(job)).toMatchObject({ findingCount: 2, safetyCount: 1, systemCount: 1 });
  });
});
