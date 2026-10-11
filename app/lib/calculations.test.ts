import { describe, expect, it } from "vitest";
import { velocityFromDuct } from "./calculations";

describe("velocityFromDuct", () => {
  it("returns full precision rather than display rounding", () => {
    expect(velocityFromDuct(1000.4, 12, 12)).toBe(1000.4);
    expect(velocityFromDuct(699.6, 12, 12)).toBe(699.6);
    expect(velocityFromDuct(1000, 17, 9)).toBe(1000 / (153 / 144));
  });

  it.each([[0, 12, 12], [-1, 12, 12], [800, 0, 12], [800, 12, -1]])("keeps nonpositive inputs unusable (%s, %s, %s)", (cfm, width, height) => {
    expect(velocityFromDuct(cfm, width, height)).toBe(0);
  });
});
