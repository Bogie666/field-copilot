import { describe, expect, it } from "vitest";
import { quantityFrom } from "./numbers";

describe("whole nameplate quantities", () => {
  const amps = (value: string | undefined) => quantityFrom(value, /^(?:a|amps?)$/i);

  it.each([".5", "0.5", ".50 A", "0.50A", "  +.5 amps  "])("preserves decimal intent in %s", (value) => {
    expect(amps(value)).toBe("0.5");
  });

  it.each(["-.5", "-0.5", "-.50 A", "-0.50A"])("preserves a negative sign in %s", (value) => {
    expect(amps(value)).toBe("-0.5");
  });

  it("preserves negative zero for validation rather than silently dropping the sign", () => {
    expect(amps("-0 A")).toBe("-0");
  });

  it.each([
    undefined, "", " ", ".", "..5", ".5.0", "1..5", "--.5", "+-.5",
    ".5/.8", ".5-.8", ".5 .8", ".5 and .8 A", ".5 +/- .1 A",
    ".5e1", ".5e-1 A", "1E3 A", "5e A", "5,5 A", "5,000 A",
    "unknown .5 A", ".5 A extra", ".5 V", ".5 mA", "Infinity A", "NaN A",
    `${"9".repeat(400)} A`,
  ])("rejects the complete ambiguous or unsupported quantity %s", (value) => {
    expect(amps(value)).toBe("");
  });
});
