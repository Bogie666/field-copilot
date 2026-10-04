import { describe, expect, it } from "vitest";
import { assessInsulation, type InsulationInput } from "./insulation";
const input = (changes: Partial<InsulationInput> = {}): InsulationInput => ({ material: "fiberglass", depths: ["4", "6", "8"], zone: "3", starting: "other", target: "49", gaps: false, uneven: false, compressed: false, moisture: false, vermiculite: false, airSealing: "unknown", conditionsReviewed: true, ...changes });
describe("insulation assessment", () => {
  it("carries source context into a safety hold without upgrade or savings advice", () => {
    const result = assessInsulation(input({ vermiculite: true }));
    expect(result.summary).toContain("2026-10-04");
    expect(result.summary).toContain("https://basc.pnnl.gov");
    expect(result.summary).not.toContain("15%");
    expect(assessInsulation(input()).summary).toContain("DOE Loose-Fill Insulations, May 1995");
  });
  it("does not equate unperformed condition checks with an adequate inspection and labels a single sample", () => {
    const result = assessInsulation(input({ depths: ["23"], conditionsReviewed: false }));
    expect(result.status).toBe("inspection-needed");
    expect(result.summary).toContain("Conditions not fully reviewed");
    expect(result.summary).toContain("Single reading: limited sample");
    expect(result.summary).not.toContain("no listed concerns observed");
    expect(result.summary).not.toContain("No insulation upgrade indicated");
  });
  it("rejects unexpected selector values instead of manufacturing a benchmark", () => {
    for (const change of [{ starting: "unexpected" }, { material: "foam" }, { airSealing: "yes" }]) {
      const result = assessInsulation(input(change as Partial<InsulationInput>));
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.summary).toBe("");
    }
  });
  it("treats rounding-boundary overlap as uncertain rather than displaying R49 with a below-R49 verdict", () => {
    const result = assessInsulation(input({ depths: ["18.14"] }));
    expect(result.materialR).toEqual([39.9, 49]);
    expect(result.status).toBe("uncertain");
  });
  it("allows no selected total target without discarding measurements or published benchmarks", () => {
    const result = assessInsulation(input({ target: "", starting: "3-4", depths: ["4"] }));
    expect(result.errors).toEqual([]);
    expect(result.status).toBe("no-selected-target");
    expect(result.materialR).toEqual([8.8, 10.8]);
    expect(result.summary).toContain("add R38");
    expect(result.summary).toContain("No total screening target selected");
  });
  it("keeps EPA savings contextual for every air-sealing scope and carries dated source limitations into the summary", () => {
    for (const airSealing of ["unknown", "none", "attic", "whole-home"] as const) {
      const summary = assessInsulation(input({ airSealing })).summary;
      expect(summary).toContain(`Air sealing scope: ${airSealing}`);
      expect(summary).toContain("15% on heating and cooling costs");
      expect(summary).toContain("11% on total energy costs");
      expect(summary).toContain("combined package");
      expect(summary).toContain("floors over crawl spaces");
      expect(summary).toContain("accessible basement rim joists");
      expect(summary).toContain("not attic-only or personalized savings");
      expect(summary).toContain("No savings percentage is assigned to this assessment");
      expect(summary).toContain("2026-10-04");
      expect(summary).toContain("https://basc.pnnl.gov/redcalc/tool/loose-fill-insulation");
      expect(summary).toContain("https://www.energystar.gov/saveathome/seal_insulate/methodology");
      expect(summary).toContain("density and settled depth");
      expect(summary).toContain("manufacturer");
      expect(summary).not.toMatch(/\$|guaranteed|you will save/i);
    }
  });
  it("compares only documented starting conditions against the additional-insulation table for every zone", () => {
    const rows = [["1", 30, 25], ["2", 49, 38], ["3", 49, 38], ["4A", 60, 49], ["4B", 60, 49], ["4C", 60, 49], ["5", 60, 49], ["6", 60, 49], ["7", 60, 49], ["8", 60, 49]] as const;
    for (const [zone, empty, existing] of rows) {
      const a = assessInsulation(input({ zone, starting: "uninsulated", depths: ["0"] }));
      expect(a.summary).toContain(`add R${empty}`);
      const b = assessInsulation(input({ zone, starting: "3-4", depths: ["3", "4"] }));
      expect(b.summary).toContain(`add R${existing}`);
      expect(b.summary).toContain("ADDITIONAL, not a final total");
      expect(b.summary).toContain("technician-selected total screening target R49");
      expect(b.summary).toContain("not local code or an approved company standard");
    }
    expect(assessInsulation(input()).summary).toContain("does not directly classify other existing depths");
    expect(assessInsulation(input({ starting: "3-4", depths: ["2", "4"] })).errors).toContain("The 3–4 inch starting condition requires every reading from 3 to 4 inches.");
    expect(assessInsulation(input({ starting: "uninsulated", depths: ["1"] })).errors).toContain("Uninsulated requires every depth reading to be zero.");
    expect(assessInsulation(input({ zone: "4" })).errors).toContain("Select a documented climate zone; zone 4 needs A, B, or C.");
  });
  it("reports condition concerns even below target or for unknown material", () => {
    for (const material of ["fiberglass", "unknown"] as const) {
      const result = assessInsulation(input({ material, gaps: true, compressed: true }));
      expect(result.summary).toContain("gaps");
      expect(result.summary).toContain("compression");
      expect(result.summary).toContain("uneven depth");
      expect(result.summary).toContain("not quantified");
    }
  });
  it("blocks upgrade advice and disturbance for moisture or suspected vermiculite even with invalid inputs", () => {
    for (const hazard of ["moisture", "vermiculite"] as const) {
      for (const depths of [["4"], [""]]) {
        const result = assessInsulation(input({ [hazard]: true, depths }));
        expect(result.status).toBe("blocked");
        expect(result.summary).toContain("Do not disturb");
        expect(result.summary).toContain("professional first");
        expect(result.summary).not.toContain("Consider professional evaluation of air sealing and insulation");
        expect(result.summary).not.toContain("No insulation upgrade indicated");
      }
    }
  });
  it("separates condition concerns from material R and avoids upselling an adequate attic", () => {
    const adequate = assessInsulation(input({ depths: ["23", "23"] }));
    expect(adequate.status).toBe("adequate");
    expect(adequate.summary).toContain("No insulation upgrade indicated");
    for (const flag of ["gaps", "uneven", "compressed"] as const) {
      const result = assessInsulation(input({ depths: ["23"], [flag]: true }));
      expect(result.materialR).toEqual(adequate.materialR);
      expect(result.status).toBe("condition-review");
      expect(result.summary).toContain(flag === "compressed" ? "compression" : flag);
      expect(result.summary).toContain("not quantified");
    }
    expect(assessInsulation(input({ depths: ["18.2"] })).status).toBe("uncertain");
  });
  it("supports cellulose but refuses an R claim for unknown material or unlabeled batts", () => {
    expect(assessInsulation(input({ material: "cellulose", depths: ["5"] })).materialR).toEqual([16, 19]);
    for (const material of ["unknown", "batts"] as const) {
      const result = assessInsulation(input({ material }));
      expect(result.materialR).toBeNull();
      expect(result.status).toBe("unknown");
      expect(result.summary).toContain("No R-value claim");
    }
  });
  it("rejects malformed or missing depths and targets without silently coercing numbers", () => {
    for (const value of ["", " ", "1e2", "0x10", "Infinity", "NaN", "-1", "2in", "1,2", "61"]) {
      const result = assessInsulation(input({ depths: ["4", value] }));
      expect(result.errors.length, value).toBeGreaterThan(0);
      expect(result.materialR).toBeNull();
    }
    expect(assessInsulation(input({ depths: [] })).errors.length).toBeGreaterThan(0);
    for (const target of ["0", "-49", "49R", "1e2", "101"]) expect(assessInsulation(input({ target })).errors.length).toBeGreaterThan(0);
    expect(assessInsulation(input({ depths: ["0", ".5", "4.25"] })).errors).toEqual([]);
  });
  it("uses settled material-only ranges and the minimum instead of averaging away a thin spot", () => {
    const result = assessInsulation(input());
    expect(result.errors).toEqual([]);
    expect(result.materialR).toEqual([8.8, 10.8]);
    expect(result.depthRange).toEqual([4, 8]);
    expect(result.status).toBe("below");
    expect(result.summary).toContain("material-only");
  });
});
