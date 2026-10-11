import { describe, expect, it } from "vitest";
import { explanationMessages, validateExplanationInput } from "../fieldAi";
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
    expect(input!.readings).toBe("[System 1 / Unassigned equipment / Finding 1] Supply static: 0.5 in. w.c.; Reference: Rated external static 0.50 in. w.c. (from nameplate)");
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


describe("equipment provenance in AI composition", () => {
  const job = createJob("Private customer address", "2026-10-03T00:00:00.000Z", { systemId: "s1" });
  job.systems = [1, 2].map(number => ({
    id: `s${number}`, name: `Secret customer system ${number}`, equipment: {}, equipmentAge: "", notes: "Private system notes",
    components: ["condenser", "furnace"].map((kind, index) => ({
      id: `c${number}${index}`, kind: kind as "condenser" | "furnace", name: `Secret component ${number}${index}`,
      equipment: { model: "SECRET MODEL", serial: "SECRET SERIAL" }, equipmentAge: "", notes: "Private component notes",
    })),
  }));
  const outdoor = makeFinding({ scope: { kind: "system", systemId: "s1", componentId: "c10" }, diagnosis: "Outdoor reading ONE", readings: [{ label: "Current", value: 11, unit: "A", source: "entered" }], recommendation: "Outdoor next step ONE", actionTaken: "Outdoor action ONE", verification: "Outdoor verification ONE", photoIds: ["SECRET PHOTO"] });
  const indoor = makeFinding({ scope: { kind: "system", systemId: "s2", componentId: "c21" }, diagnosis: "Indoor reading TWO", readings: [{ label: "Current", value: 22, unit: "A", source: "entered" }], recommendation: "Indoor next step TWO" });

  it("keeps same-title readings, actions and verification aligned across systems/components", () => {
    const input = composeExplanationInput([outdoor, indoor], { systems: job.systems }).input!;
    for (const field of [input.diagnosis, input.readings, input.recommendation]) {
      expect(field).toContain("[System 1 / Component 1 (Outdoor unit) / Finding 1]");
      expect(field).toContain("[System 2 / Component 2 (Furnace or air handler) / Finding 2]");
    }
    expect(input.recommendation.split("\n")[0]).toContain("Action taken: Outdoor action ONE; Verification: Outdoor verification ONE; Next step: Outdoor next step ONE");
    expect(input.recommendation.split("\n")[1]).toContain("Indoor next step TWO");
    expect(input.readings.split("\n")[0]).toContain("11 A");
    expect(input.readings.split("\n")[1]).toContain("22 A");
  });

  it("keeps job ordinals stable for a subset, and excludes labels, identifiers, notes and photos", () => {
    const input = composeExplanationInput([indoor], { systems: job.systems }).input!;
    expect(input.diagnosis).toContain("System 2 / Component 2");
    const payload = JSON.stringify(input);
    for (const secret of ["Secret", "SECRET", "Private", "c21", "s2"]) expect(payload).not.toContain(secret);
  });

  it("distinguishes components even when only finding scopes are available", () => {
    const sameSystem = { ...indoor, scope: { kind: "system" as const, systemId: "s1", componentId: "c11" } };
    const input = composeExplanationInput([outdoor, sameSystem]).input!;
    expect(input.diagnosis).toContain("Component 1 (Unverified identity)");
    expect(input.diagnosis).toContain("Component 2 (Unverified identity)");
  });

  it("excludes stale evidence including actions, verification and readings", () => {
    const stale = { ...outdoor, staleAt: "2026-10-04T00:00:00.000Z" };
    const input = composeExplanationInput([stale, indoor], { systems: job.systems }).input!;
    expect(JSON.stringify(input)).not.toContain("ONE");
    expect(JSON.stringify(input)).not.toContain("11 A");
  });

  it("instructs the model to preserve system/component/finding associations", () => {
    const input = composeExplanationInput([outdoor, indoor], { systems: job.systems }).input!;
    expect(explanationMessages(input)[0].content).toContain("Never combine an action or reading from one labeled finding with another");
  });
});
