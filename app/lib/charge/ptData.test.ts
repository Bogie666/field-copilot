import { describe, expect, it } from "vitest";
import { maxPsig, ptRefrigerants, ptSourceReference, PT_TABLES, saturationTempF, type PtTable } from "./ptData";
import { assessCharge, EMPTY_CHARGE } from "./refrigerantCharge";

const sourceBearingUniform: PtTable = {
  id: "VALID",
  safetyClass: "A1",
  startPsig: 10,
  stepPsig: 10,
  bubbleF: [30, 40],
  dewF: [32, 42],
  source: PT_TABLES[0].source,
};

const mixedAxes: PtTable = {
  id: "MIXED",
  safetyClass: "A1",
  dewPressurePsig: [10, 20, 30],
  dewF: [30, 40, 50],
  bubbleF: [32, 42],
  startPsig: 10,
  stepPsig: 10,
};

describe("mixed explicit and implicit phase axes", () => {
  it("uses the bubble column length for its implicit maximum", () => {
    expect(maxPsig(mixedAxes, "dew")).toBe(30);
    expect(maxPsig(mixedAxes, "bubble")).toBe(20);
  });

  it("rejects bubble pressures beyond its endpoint instead of succeeding with NaN", () => {
    for (const pressure of [10, 15, 20]) {
      const result = saturationTempF("MIXED", pressure, "bubble", [mixedAxes]);
      expect(result.ok).toBe(true);
      if (result.ok) expect(Number.isFinite(result.tempF)).toBe(true);
    }
    expect(saturationTempF("MIXED", 15, "bubble", [mixedAxes])).toEqual({ ok: true, tempF: 37 });
    expect(saturationTempF("MIXED", 25, "dew", [mixedAxes])).toEqual({ ok: true, tempF: 45 });
    expect(saturationTempF("MIXED", 25, "bubble", [mixedAxes])).toEqual({
      ok: false,
      error: "25 psig is outside the MIXED table (10 to 20 psig). Check the gauge reading.",
    });
  });
});

describe("source-bearing legacy uniform PT tables", () => {
  it("references uniform phase ranges without an explicit pressure axis", () => {
    expect(saturationTempF("VALID", 15, "dew", [sourceBearingUniform])).toEqual({ ok: true, tempF: 37 });
    const reference = ptSourceReference("VALID", [sourceBearingUniform]);
    expect(reference).toContain("bubble range 10 to 20 psig; dew range 10 to 20 psig");
    expect(reference).toContain(sourceBearingUniform.source!.dataSha256);
  });

  it("assesses a source-bearing uniform table without throwing", () => {
    const assessment = assessCharge({
      ...EMPTY_CHARGE,
      refrigerant: "VALID",
      device: "txv",
      suctionPsig: "15",
      suctionLineF: "47",
      liquidPsig: "15",
      liquidLineF: "25",
    }, [sourceBearingUniform]);
    expect(assessment.errors).toEqual([]);
    expect(assessment.result).toMatchObject({ suctionSatF: 37, liquidSatF: 35, superheatF: 10, subcoolingF: 10 });
    expect(assessment.result!.reference).toContain("bubble range 10 to 20 psig; dew range 10 to 20 psig");
  });
});

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
      for (const phase of ["dew", "bubble"] as const) {
        const values = phase === "dew" ? table.dewF : table.bubbleF;
        const pressures = (phase === "dew" ? table.dewPressurePsig : table.bubblePressurePsig) ?? table.pressurePsig!;
        expect(pressures.length).toBe(values.length);
        for (let i = 1; i < values.length; i += 1) {
          expect(pressures[i]).toBeGreaterThan(pressures[i - 1]);
          // Rounded direct 400 psig / inverse 400.1 psig dew both publish 123.0 F.
          if (table.id === "R-454B" && phase === "dew" && pressures[i] === 400.1) expect(values[i]).toBe(values[i - 1]);
          else expect(values[i]).toBeGreaterThan(values[i - 1]);
        }
      }
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
