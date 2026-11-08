import { describe, expect, it } from "vitest";
import { wantsWakeLock } from "../components/ScreenWakeLock";
import { normalizeProfile, preparedByLine, TEXT_SIZE_BOOT_SCRIPT } from "./devicePrefs";
import { customerCloseoutText, officeEvidenceRecord, officeEvidenceText } from "./job/report";
import { exportOfficeHtml } from "./job/htmlReport";
import { createJob } from "./job/types";

describe("device preferences", () => {
  it("cleans the stored technician profile", () => {
    expect(normalizeProfile({ name: "  Ryan\n  Smith ", company: 5 })).toEqual({ name: "Ryan Smith", company: "" });
    expect(normalizeProfile("junk")).toEqual({ name: "", company: "" });
    expect(normalizeProfile({ name: "x".repeat(200) }).name).toHaveLength(80);
    expect(preparedByLine({ name: "Ryan", company: "Lex Air" })).toBe("Ryan, Lex Air");
    expect(preparedByLine({ name: "", company: "Lex Air" })).toBe("Lex Air");
    expect(preparedByLine(null)).toBe("");
  });

  it("boot script applies only known text sizes", () => {
    const run = (stored: string | null) => {
      const doc = { documentElement: { dataset: {} as Record<string, string> } };
      new Function("localStorage", "document", TEXT_SIZE_BOOT_SCRIPT)({ getItem: () => stored }, doc);
      return doc.documentElement.dataset.text;
    };
    expect(run("xlarge")).toBe("xlarge");
    expect(run("normal")).toBeUndefined();
    expect(run("huge")).toBeUndefined();
  });

  it("keeps the screen awake only on working screens", () => {
    expect(wantsWakeLock("/job/abc/condenser/charge")).toBe(true);
    expect(wantsWakeLock("/tools/static")).toBe(true);
    expect(wantsWakeLock("/troubleshoot/water-leak")).toBe(true);
    expect(wantsWakeLock("/")).toBe(false);
    expect(wantsWakeLock("/tools")).toBe(false);
    expect(wantsWakeLock("/settings")).toBe(false);
  });
});

describe("reports with a technician profile", () => {
  const job = createJob("12 Oak Lane", "2026-11-08T00:00:00.000Z", { jobId: "j", systemId: "s" });
  it("adds the technician only when one is set", async () => {
    expect(officeEvidenceText(job, "Ryan, Lex Air")).toContain("Prepared by: Ryan, Lex Air");
    expect(officeEvidenceText(job)).not.toContain("Prepared by");
    expect(customerCloseoutText(job, job.findings, "Ryan, Lex Air").split("\n")[1]).toBe("Technician: Ryan, Lex Air");
    expect(customerCloseoutText(job)).not.toContain("Technician:");
    expect(officeEvidenceRecord(job, "Ryan").preparedBy).toBe("Ryan");
    const { html } = await exportOfficeHtml(job, async () => null, "<b>Ryan</b>");
    expect(html).toContain("&lt;b&gt;Ryan&lt;/b&gt;");
    expect(html).not.toContain("<b>Ryan</b>");
  });
});
