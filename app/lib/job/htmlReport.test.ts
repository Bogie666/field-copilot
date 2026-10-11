import { describe, expect, it, vi } from "vitest";
import { createJob } from "./types";
import { makeFinding } from "./fixtures";
import { exportOfficeHtml } from "./htmlReport";

const now = "2026-10-11T00:00:00Z";
function fixture() {
  const job = createJob('<script>alert("x")</script>', now, { jobId: "j", systemId: "s" });
  job.photos = [{ id: "p", systemId: "s", componentId: "s:condenser", caption: '<img src=x onerror="bad()">', mime: "image/png", bytes: 3, createdAt: now }];
  return job;
}

describe("private HTML office evidence", () => {
  it("embeds saved photo bytes locally and escapes all technician text", async () => {
    const job = fixture();
    job.homeNotes = "</pre><script>bad()</script>";
    const result = await exportOfficeHtml(job, async () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }));
    expect(result.missingPhotoIds).toEqual([]);
    expect(result.html).toContain('src="data:image/png;base64,AQID"');
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain('<img src=x');
    expect(result.html).toContain("default-src 'none'");
    expect(result.html).toContain("not a restorable backup");
    expect(result.html).not.toContain("PHOTO METADATA (NO IMAGE FILES)");
  });
  it("lists missing current and historical photo files instead of claiming a complete export", async () => {
    const job = fixture();
    job.findingHistory = [makeFinding({ photoIds: ["history-only", "p"] })];
    const get = vi.fn(async () => null);
    const result = await exportOfficeHtml(job, get);
    expect(result.missingPhotoIds).toEqual(["p", "history-only"]);
    expect(get).toHaveBeenCalledTimes(2);
    expect(result.html).toContain("Incomplete photo evidence");
    expect(result.html).toContain("Do not treat this report as containing all photo evidence");
  });
  it("handles read failures and refuses active or unsupported image formats", async () => {
    const job = fixture();
    const unsupported = await exportOfficeHtml(job, async () => new Blob(["<svg onload='bad()'/>"] , { type: "image/svg+xml" }));
    expect(unsupported.missingPhotoIds).toEqual(["p"]);
    expect(unsupported.html).not.toContain("data:image/svg");
    const failed = await exportOfficeHtml(job, async () => { throw new Error("Storage unavailable"); });
    expect(failed.missingPhotoIds).toEqual(["p"]);
    expect(failed.html).toContain("could not be read");
  });
});
