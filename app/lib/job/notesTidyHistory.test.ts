import { describe, expect, it } from "vitest";
import { MAX_TRANSCRIPT_CHARS } from "../fieldAi";
import { jobReducer } from "./reducer";
import { createJob, normalizeJobExtensions, notesForScope, type FindingScope } from "./types";

const now = "2026-10-05T00:00:00.000Z";
const home: FindingScope = { kind: "home" };

describe("accepted note originals", () => {
  it("atomically records the exact original and accepted version, and survives serialized reload", () => {
    const job = createJob("test", now);
    job.homeNotes = "Original: NO leak observed; customer declined work. Exact original whitespace.  ";
    const next = jobReducer(job, { type: "acceptTidiedNotes", scope: home, original: job.homeNotes, notes: "Edited note", acceptedAt: now, now });
    expect(next.homeNotes).toBe("Edited note");
    expect(next.notesTidyHistory).toEqual([{ scope: home, original: job.homeNotes, accepted: "Edited note", acceptedAt: now }]);
    const loaded = normalizeJobExtensions(JSON.parse(JSON.stringify(next)));
    expect(loaded.notesTidyHistory).toEqual(next.notesTidyHistory);
    expect(job.homeNotes).not.toBe(next.homeNotes);
  });

  it("cannot accept an old response over newer notes or duplicate an accepted edit", () => {
    const job = createJob("test", now);
    job.homeNotes = "Newer technician note";
    const action = { type: "acceptTidiedNotes" as const, scope: home, original: "Old note", notes: "Suggestion", acceptedAt: now, now };
    expect(jobReducer(job, action)).toBe(job);
    const accepted = jobReducer({ ...job, homeNotes: action.original }, action);
    expect(jobReducer(accepted, action)).toBe(accepted);
    expect(accepted.notesTidyHistory).toHaveLength(1);
  });

  it("keeps component histories and notes distinct", () => {
    const job = createJob("test", now, { systemId: "s1" });
    job.systems[0].components = ["a", "b"].map(id => ({ id, name: id, kind: "furnace", equipment: {}, equipmentAge: "", notes: `${id} original` }));
    const scope: FindingScope = { kind: "system", systemId: "s1", componentId: "a" };
    const next = jobReducer(job, { type: "acceptTidiedNotes", scope, original: "a original", notes: "a accepted", acceptedAt: now, now });
    expect(notesForScope(next.systems[0], scope)).toBe("a accepted");
    expect(next.systems[0].components![1].notes).toBe("b original");
    expect(next.notesTidyHistory![0].scope).toEqual(scope);
  });

  it("rejects oversized accepted notes and an invalid or removed target", () => {
    const job = createJob("test", now);
    const action = { type: "acceptTidiedNotes" as const, scope: home, original: "", notes: "x".repeat(MAX_TRANSCRIPT_CHARS + 1), acceptedAt: now, now };
    expect(jobReducer(job, action)).toBe(job);
    expect(jobReducer(job, { ...action, notes: "valid", scope: { kind: "system", systemId: "deleted", componentId: "deleted" } })).toBe(job);
  });
});
