import { describe, expect, it } from "vitest";
import { jobReducer } from "./reducer";
import { createJob } from "./types";
import { makeFinding } from "./fixtures";

const now = "2026-10-04T00:00:00.000Z";
const scope = { kind: "system", systemId: "s" } as const;
const base = () => createJob("test", now, { jobId: "j", systemId: "s" });
const safety = (photoIds?: string[]) => makeFinding({ scope, toolId: "furnace", severity: "safety", safetyAction: "Shut down", requiresPhotoForSafety: true, photoIds });

describe("review photo safety at job boundary", () => {
  it("prunes a deleted photo from a persisted unsaved review before reopen", () => {
    let job = base();
    job.photos = [{ id: "p", systemId: "s", caption: "", mime: "image/jpeg", bytes: 1, createdAt: now }];
    job = jobReducer(job, { type: "setToolDraft", toolId: "furnace", scope, slot: "review", inputs: { safetyAction: "Shut down", photoIds: ["p"] }, now });
    job = jobReducer(job, { type: "removePhoto", photoId: "p", now });
    const reopened = structuredClone(job).drafts![0].inputs;
    expect(reopened.photoIds).toEqual([]);
    expect(jobReducer(job, { type: "upsertFinding", finding: safety(reopened.photoIds as string[]), now })).toBe(job);
  });
  it.each([undefined, [], ["foreign-job"], ["missing"], ["wrong-system"], ["home-photo"]].map(photoIds => ({ photoIds })))("rejects absent or unowned attachments $photoIds", ({ photoIds }) => {
    const job = base();
    job.photos = [
      { id: "wrong-system", systemId: "other", caption: "", mime: "image/jpeg", bytes: 1, createdAt: now },
      { id: "home-photo", systemId: null, caption: "", mime: "image/jpeg", bytes: 1, createdAt: now },
    ];
    expect(jobReducer(job, { type: "upsertFinding", finding: safety(photoIds), now })).toBe(job);
  });
});
