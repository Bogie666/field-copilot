import { describe, expect, it } from "vitest";
import { validateExplanationInput } from "../fieldAi";
import { composeExplanationInput, normalizeDashes, suggestUrgency } from "./compose";
import { makeFinding } from "./fixtures";
import { createJob } from "./types";

const concern = makeFinding({
  key: "static",
  toolId: "static",
  severity: "concern",
  title: "Static pressure above rated",
  diagnosis: "Total external static measured 0.92 in. w.c. against 0.50 rated.",
  readings: [{ label: "Supply static", value: 0.5, unit: "in. w.c.", source: "entered" }],
  reference: "Rated external static 0.50 in. w.c. (from nameplate)",
  recommendation: "Review return duct sizing.",
});
const safety = makeFinding({
  key: "furnace",
  toolId: "furnace",
  severity: "safety",
  title: "Heat exchanger observation",
  diagnosis: "Cracked heat exchanger observed and photographed.",
  safetyAction: "Shut down and tagged the furnace.",
  readings: [],
});

describe("composeExplanationInput", () => {
  it("returns exactly the six explain fields and passes validation", () => {
    const { input } = composeExplanationInput([makeFinding(), concern], { equipmentType: "Gas furnace", equipmentAge: 12 });
    expect(input).not.toBeNull();
    expect(Object.keys(input!).sort()).toEqual(["diagnosis", "equipmentAge", "equipmentType", "readings", "recommendation", "urgency"]);
    expect(validateExplanationInput(input)).toEqual(input);
  });

  it("puts safety first and adds the safety action to the recommendation", () => {
    const { input, suggestedUrgency } = composeExplanationInput([makeFinding(), concern, safety]);
    expect(input!.diagnosis.split("\n")[0]).toMatch(/Cracked heat exchanger/);
    expect(input!.recommendation).toContain("Safety action: Shut down and tagged the furnace.");
    expect(suggestedUrgency).toBe("urgent safety concern");
    expect(input!.urgency).toBe("urgent safety concern");
  });

  it("includes readings with units and the reference line", () => {
    const { input } = composeExplanationInput([concern]);
    expect(input!.readings).toBe("Static pressure above rated: Supply static: 0.5 in. w.c.; Reference: Rated external static 0.50 in. w.c. (from nameplate)");
  });

  it("never invents a recommendation", () => {
    const { input } = composeExplanationInput([makeFinding()]);
    expect(input!.recommendation).toBe("");
  });

  it("suggests fix soon for concerns and not assessed otherwise, and never routine on its own", () => {
    expect(suggestUrgency([concern])).toBe("fix soon");
    expect(suggestUrgency([makeFinding()])).toBe("not assessed");
    expect(composeExplanationInput([makeFinding()]).input!.urgency).not.toBe("routine");
  });

  it("lets the technician choose the urgency", () => {
    expect(composeExplanationInput([concern], { urgency: "routine" }).input!.urgency).toBe("routine");
  });

  it("uses null for unknown age and rejects an out-of-range age", () => {
    expect(composeExplanationInput([concern]).input!.equipmentAge).toBeNull();
    expect(composeExplanationInput([concern], { equipmentAge: 250 }).input).toBeNull();
  });

  it("refuses to truncate over-long text", () => {
    const long = makeFinding({ diagnosis: "x".repeat(1500) });
    const long2 = makeFinding({ key: "static", toolId: "static", diagnosis: "y".repeat(1500) });
    const result = composeExplanationInput([long, long2]);
    expect(result.input).toBeNull();
    expect(result.issues.join(" ")).toMatch(/too long/);
  });

  it("requires at least one finding", () => {
    expect(composeExplanationInput([]).input).toBeNull();
  });

  it("replaces em and en dashes", () => {
    expect(normalizeDashes("a — b")).toBe("a, b");
    expect(normalizeDashes("35–65")).toBe("35-65");
    const { input } = composeExplanationInput([makeFinding({ diagnosis: "Rise 40–50 — within range." })]);
    expect(input!.diagnosis).not.toMatch(/[–—]/);
  });

  it("never includes the job label or other customer details", () => {
    const job = createJob("Smith, 12 Oak Lane, 555-0100", "2026-10-03T00:00:00.000Z", { jobId: "j", systemId: "sys_1" });
    job.homeNotes = "Gate code 4421";
    job.systems[0].notes = "Customer Jane Smith";
    const { input } = composeExplanationInput([makeFinding()], { equipmentType: "Heat pump" });
    const text = JSON.stringify(input);
    for (const secret of [job.label, "Oak Lane", "555-0100", "Gate code", "Jane Smith"]) expect(text).not.toContain(secret);
  });
});
