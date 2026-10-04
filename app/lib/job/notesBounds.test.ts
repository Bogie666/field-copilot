import { describe, expect, it } from "vitest";
import { jobReducer } from "./reducer";
import { createJob } from "./types";
import { MAX_TRANSCRIPT_CHARS, notesFallback, validateStructuredNotes } from "../fieldAi";
const now = "2026-10-04T00:00:00.000Z";
describe("notes bounds without silent data loss", () => {
  it("preserves a long offline tidy section instead of slicing it at 8000", () => {
    const notes = notesFallback("x".repeat(9000) + "CRITICAL TAIL");
    expect(validateStructuredNotes(notes)?.diagnosisFindings).toBe(notes.diagnosisFindings);
  });
  it("rejects an overlong structured section rather than silently truncating it", () => {
    expect(validateStructuredNotes(notesFallback("x".repeat(MAX_TRANSCRIPT_CHARS + 1)))).toBeNull();
  });
  it("rejects individually valid sections whose joined note exceeds the persistence limit", () => {
    const notes = notesFallback("short");
    for (const key of Object.keys(notes) as Array<keyof typeof notes>) notes[key] = "x".repeat(2500);
    expect(validateStructuredNotes(notes)).toBeNull();
  });
  it("persists the full editor limit for home and system notes, including critical tail", () => {
    const notes = "x".repeat(MAX_TRANSCRIPT_CHARS - 13) + "CRITICAL TAIL";
    const job = createJob("x", now, { systemId: "s" });
    expect(jobReducer(job, { type: "setHomeNotes", notes, now }).homeNotes).toBe(notes);
    expect(jobReducer(job, { type: "setSystemNotes", systemId: "s", notes, now }).systems[0].notes).toBe(notes);
  });
});
