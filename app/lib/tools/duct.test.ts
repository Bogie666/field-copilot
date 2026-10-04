import { describe, expect, it } from "vitest";
import { assessDuct, EMPTY_DUCT, targetVelocity } from "./duct";

describe("assessDuct", () => {
  it("requires all three inputs", () => {
    expect(assessDuct(EMPTY_DUCT).errors).toHaveLength(3);
  });

  it("computes velocity and classifies against the supply trunk range", () => {
    // 800 CFM through 18 x 10 in (1.25 sq ft) = 640 FPM, below the 700 to 1000 supply trunk range.
    const low = assessDuct({ ...EMPTY_DUCT, cfm: "800", width: "18", height: "10" }).result!;
    expect(low.velocity).toBe(640);
    expect(low.band).toBe("below");
    expect(low.severity).toBe("concern");
    const ok = assessDuct({ ...EMPTY_DUCT, cfm: "1000", width: "18", height: "10" }).result!;
    expect(ok.velocity).toBe(800);
    expect(ok.band).toBe("within");
  });

  it("uses a different target for return branches", () => {
    expect(targetVelocity({ side: "return", section: "branch" })).toBe(550);
    expect(targetVelocity({ side: "supply", section: "trunk" })).toBe(850);
  });

  it("offers nearby sizes without claiming a design", () => {
    const r = assessDuct({ ...EMPTY_DUCT, cfm: "800", width: "18", height: "10" }).result!;
    expect(r.suggestions.round).toHaveLength(3);
    expect(r.reference).toMatch(/Manual D/);
  });
});
