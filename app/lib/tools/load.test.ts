import { describe, expect, it } from "vitest";
import { assessLoad, EMPTY_LOAD, loadDiagnosis, loadReadings, type LoadForm } from "./load";

const run = (over: Partial<LoadForm>) => assessLoad({ ...EMPTY_LOAD, ...over });

describe("assessLoad", () => {
  it("requires home facts, which start blank", () => {
    const { errors } = run({});
    expect(errors.join(" ")).toMatch(/conditioned area/i);
    expect(errors.join(" ")).toMatch(/ceiling height/i);
    expect(errors.join(" ")).toMatch(/occupants/i);
  });

  it("produces ranges and a screening-only diagnosis", () => {
    const r = run({ squareFeet: "2200", ceilingHeight: "9", occupants: "4" });
    expect(r.errors).toEqual([]);
    expect(r.result!.coolingTotalRange.highBtuh).toBeGreaterThan(r.result!.coolingTotalRange.lowBtuh);
    const text = loadDiagnosis(r.result!);
    expect(text).toMatch(/not an ACCA Manual J calculation/);
    expect(loadReadings(r.input!, r.result!).some((x) => x.source === "computed")).toBe(true);
  });

  it("requires design values for a custom climate", () => {
    expect(run({ squareFeet: "2000", ceilingHeight: "8", occupants: "3", climateProfile: "custom" }).errors.join(" ")).toMatch(/design temperature/i);
  });

  it("rejects non-numeric input", () => {
    expect(run({ squareFeet: "2k", ceilingHeight: "9", occupants: "4" }).errors.join(" ")).toMatch(/plain number/);
  });
});
