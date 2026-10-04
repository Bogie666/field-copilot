import { describe, expect, it } from "vitest";
import { jobReducer } from "./reducer";
import { createJob } from "./types";
import { makeFinding } from "./fixtures";

const now = "2026-10-04T00:00:00.000Z";
const scope = { kind: "system", systemId: "s1" } as const;
const base = () => createJob("Test", now, { jobId: "j1", systemId: "s1" });

describe("tool drafts", () => {
  it("rejects orphan or oversized drafts and drops drafts when their system is removed", () => {
    const job = base();
    expect(jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope: { kind: "system", systemId: "missing" }, inputs: {}, now })).toBe(job);
    expect(jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope, inputs: { text: "x".repeat(20001) }, now })).toBe(job);
    let next = jobReducer(job, { type: "addSystem", id: "s2", name: "Other", now });
    next = jobReducer(next, { type: "setToolDraft", toolId: "electrical", scope: { kind: "system", systemId: "s2" }, inputs: { v: "23" }, now });
    next = jobReducer(next, { type: "removeSystem", systemId: "s2", now });
    expect(next.drafts).toEqual([]);
  });
  it("clears only this tool's drafts on explicit valid save, not on failed save", () => {
    let job = jobReducer(base(), { type: "setToolDraft", toolId: "electrical", scope, inputs: { v: "238" }, now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "static", scope, inputs: { v: "1" }, now });
    const invalid = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope, diagnosis: "" }), now });
    expect(invalid.drafts).toHaveLength(2);
    job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope }), now });
    expect(job.drafts?.map((d) => d.toolId)).toEqual(["static"]);
  });
  it("keeps incomplete inputs separate from confirmed findings and isolates tool/scope slots", () => {
    let job = jobReducer(base(), { type: "setToolDraft", toolId: "electrical", scope, inputs: { measuredVoltage: "2" }, now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope: { kind: "home" }, inputs: { measuredVoltage: "3" }, now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope, slot: "review", inputs: { recommendation: "Check" }, now });
    job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope, inputs: { measuredVoltage: "23" }, now });
    expect(job.drafts).toHaveLength(3);
    expect(job.drafts?.find((d) => d.scope.kind === "system" && d.slot === "form")?.inputs).toEqual({ measuredVoltage: "23" });
    expect(job.findings).toEqual([]);
  });
});
