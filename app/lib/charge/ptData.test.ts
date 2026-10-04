import { describe, expect, it } from "vitest";
import { maxPsig, ptRefrigerants, PT_TABLES, saturationTempF } from "./ptData";

describe("generated PT data", () => {
  it("includes the expected refrigerants", () => {
    expect(ptRefrigerants().map((r) => r.id)).toEqual(["R-410A", "R-32", "R-454B", "R-22"]);
  });

  it("matches widely published R-410A and R-22 reference points", () => {
    const a = saturationTempF("R-410A", 118, "dew");
    expect(a.ok && a.tempF).toBeCloseTo(40, 0);
    const b = saturationTempF("R-410A", 418, "bubble");
    expect(b.ok && b.tempF).toBeCloseTo(120, 0);
    const c = saturationTempF("R-22", 68.5, "dew");
    expect(c.ok && c.tempF).toBeCloseTo(40, 0);
  });

  it("shows glide for blends and none for pure fluids", () => {
    const dew = saturationTempF("R-454B", 150, "dew");
    const bubble = saturationTempF("R-454B", 150, "bubble");
    expect(dew.ok && bubble.ok && dew.tempF - bubble.tempF).toBeGreaterThan(1);
    const d32 = saturationTempF("R-32", 150, "dew");
    const b32 = saturationTempF("R-32", 150, "bubble");
    expect(d32.ok && b32.ok && Math.abs(d32.tempF - b32.tempF)).toBeLessThan(0.1);
  });

  it("temperature rises with pressure in every table", () => {
    for (const table of PT_TABLES) {
      for (let i = 1; i < table.dewF.length; i += 1) {
        expect(table.dewF[i]).toBeGreaterThan(table.dewF[i - 1]);
        expect(table.bubbleF[i]).toBeGreaterThan(table.bubbleF[i - 1]);
      }
      expect(table.bubbleF.length).toBe(table.dewF.length);
    }
  });

  it("errors outside the table instead of extrapolating", () => {
    const low = saturationTempF("R-410A", -5, "dew");
    expect(low.ok).toBe(false);
    const table = PT_TABLES.find((t) => t.id === "R-410A")!;
    const high = saturationTempF("R-410A", maxPsig(table) + 1, "dew");
    expect(high.ok).toBe(false);
    expect(saturationTempF("R-999", 100, "dew").ok).toBe(false);
    expect(saturationTempF("R-410A", Number.NaN, "dew").ok).toBe(false);
  });

  it("interpolates between grid points", () => {
    const a = saturationTempF("R-410A", 100, "dew");
    const b = saturationTempF("R-410A", 101, "dew");
    const c = saturationTempF("R-410A", 102, "dew");
    expect(a.ok && b.ok && c.ok && b.tempF).toBeCloseTo(((a as { tempF: number }).tempF + (c as { tempF: number }).tempF) / 2, 1);
  });
});
