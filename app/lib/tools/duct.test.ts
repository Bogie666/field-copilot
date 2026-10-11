import { describe, expect, it } from "vitest";
import { assessDuct, EMPTY_DUCT, targetVelocity } from "./duct";
import { fmt } from "./numbers";

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

  it("preserves the reported 1000.4 FPM excess in classification and saved evidence", () => {
    const result = assessDuct({ ...EMPTY_DUCT, cfm: "1000.4", width: "12", height: "12" }).result!;
    expect(result.velocity).toBe(1000.4);
    expect(fmt(result.velocity, 0)).toBe("1000"); // Rounding is presentation only.
    expect(result.band).toBe("above");
    expect(result.severity).toBe("concern");
    expect(result.guidance).toContain("above");
    expect(result.diagnosis).toContain("above");
    const saved = JSON.parse(JSON.stringify(result));
    expect(saved.readings.find((reading: { label: string }) => reading.label === "Velocity").value).toBe(1000.4);
  });

  describe.each([
    { side: "supply", section: "trunk", low: 700, high: 1000 },
    { side: "supply", section: "branch", low: 500, high: 800 },
    { side: "return", section: "trunk", low: 500, high: 800 },
    { side: "return", section: "branch", low: 400, high: 700 },
  ] as const)("full-precision $side $section boundaries", ({ side, section, low, high }) => {
    it.each([
      { velocity: low - 0.4, band: "below" },
      { velocity: low, band: "within" },
      { velocity: low + 0.4, band: "within" },
      { velocity: high - 0.4, band: "within" },
      { velocity: high, band: "within" },
      { velocity: high + 0.4, band: "above" },
    ])("classifies $velocity as $band", ({ velocity, band }) => {
      // Exactly one square foot lets CFM exercise each FPM boundary directly.
      const assessment = assessDuct({ side, section, cfm: String(velocity), width: "12", height: "12" });
      expect(assessment.errors).toEqual([]);
      expect(assessment.result?.velocity).toBe(velocity);
      expect(assessment.result?.band).toBe(band);
      expect(assessment.result?.severity).toBe(band === "within" ? "ok" : "concern");
      expect(assessment.result?.guidance).toContain(`is ${band}`);
    });
  });

  it("uses raw division when dimensions also have decimals", () => {
    const result = assessDuct({ ...EMPTY_DUCT, cfm: "1000", width: "11.999", height: "12" }).result!;
    expect(result.velocity).toBeGreaterThan(1000);
    expect(fmt(result.velocity, 0)).toBe("1000");
    expect(result.band).toBe("above");
  });

  it.each([
    { cfm: "1000", width: "0." + "0".repeat(320) + "1", height: "12" },
    { cfm: "0." + "0".repeat(322) + "1", width: "200", height: "200" },
  ])("does not turn unrepresentable derived velocity into a recordable result: %s", (inputs) => {
    const assessment = assessDuct({ ...EMPTY_DUCT, ...inputs });
    expect(assessment.result).toBeNull();
    expect(assessment.errors.join(" ")).toMatch(/finite and greater than zero/);
  });
});
