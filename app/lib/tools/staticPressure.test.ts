import { describe, expect, it } from "vitest";
import { assessStatic, EMPTY_STATIC, staticFrom } from "./staticPressure";

const run = (over: Partial<typeof EMPTY_STATIC>) => assessStatic({ ...EMPTY_STATIC, ...over });

describe("assessStatic", () => {
  it("sums supply and return into total external static", () => {
    const r = run({ supply: "0.55", returnStatic: "0.37", rated: "0.5" }).result!;
    expect(r.tesp).toBeCloseTo(0.92, 5);
    expect(r.severity).toBe("concern");
    expect(r.percentOfRated).toBeCloseTo(184, 0);
    expect(r.reference).toContain("0.50");
  });

  it("treats a total equal to the rating as within", () => {
    expect(run({ supply: "0.3", returnStatic: "0.2", rated: "0.5" }).result!.severity).toBe("ok");
  });

  it("records without comparing when no rating is entered", () => {
    const r = run({ supply: "0.3", returnStatic: "0.2" }).result!;
    expect(r.severity).toBe("info");
    expect(r.items[0].tone).toBe("info");
  });

  it("requires both readings and rejects negatives and implausible values", () => {
    expect(run({ supply: "0.3" }).errors.join(" ")).toMatch(/return static/i);
    expect(run({ supply: "0.3", returnStatic: "-0.2" }).errors.join(" ")).toMatch(/positive/);
    expect(run({ supply: "9", returnStatic: "0.2" }).errors.join(" ")).toMatch(/at most/);
    expect(run({ supply: "x", returnStatic: "0.2" }).errors.join(" ")).toMatch(/plain number/);
  });

  it("records component drops and validates them", () => {
    const r = run({ supply: "0.3", returnStatic: "0.2", components: [{ label: "Filter", value: "0.15" }] }).result!;
    expect(r.readings.some((x) => x.label === "Filter drop")).toBe(true);
    expect(run({ supply: "0.3", returnStatic: "0.2", components: [{ label: "Coil", value: "abc" }] }).errors.length).toBe(1);
  });

  it("pulls the number from a nameplate value", () => {
    expect(staticFrom("0.50 in. w.c.")).toBe("0.5");
    expect(staticFrom(undefined)).toBe("");
  });
});
