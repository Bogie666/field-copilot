import { describe, expect, it } from "vitest";
import { assessCharge, EMPTY_CHARGE, orificeTargetSuperheatF, type ChargeInput } from "./refrigerantCharge";
import type { PtTable } from "./ptData";

// A tiny synthetic table makes the arithmetic exact: dew = 40 + psig/10 (F), bubble = 50 + psig/10 (F).
const synthetic: PtTable[] = [
  {
    id: "TEST",
    safetyClass: "A1",
    startPsig: 0,
    stepPsig: 100,
    dewF: [40, 50, 60, 70, 80, 90],
    bubbleF: [50, 60, 70, 80, 90, 100],
  },
];

const base: ChargeInput = { ...EMPTY_CHARGE, refrigerant: "TEST", device: "txv", suctionPsig: "100", suctionLineF: "60", liquidPsig: "300", liquidLineF: "70" };
const run = (over: Partial<ChargeInput>) => assessCharge({ ...base, ...over }, synthetic);

describe("assessCharge", () => {
  it("computes superheat from the dew point and subcooling from the bubble point", () => {
    const r = run({}).result!;
    expect(r.suctionSatF).toBeCloseTo(50, 5);
    expect(r.liquidSatF).toBeCloseTo(80, 5);
    expect(r.superheatF).toBeCloseTo(10, 5);
    expect(r.subcoolingF).toBeCloseTo(10, 5);
  });

  it("requires refrigerant, device and all four gauge readings", () => {
    expect(assessCharge({ ...EMPTY_CHARGE }, synthetic).errors.length).toBeGreaterThanOrEqual(6);
  });

  it("errors on pressures outside the table", () => {
    expect(run({ suctionPsig: "690" }).errors.join(" ")).toMatch(/outside/);
  });

  it("TXV classifies subcooling only with a typed target and tolerance", () => {
    const none = run({}).result!;
    expect(none.items.find((i) => i.id === "subcooling")!.tone).toBe("info");
    expect(none.notes.join(" ")).toMatch(/target subcooling/);
    const within = run({ targetSubcoolingF: "10", subcoolingTolF: "2" }).result!;
    expect(within.items.find((i) => i.id === "subcooling")!.tone).toBe("ok");
    expect(within.severity).toBe("ok");
    const above = run({ targetSubcoolingF: "6", subcoolingTolF: "2" }).result!;
    expect(above.items.find((i) => i.id === "subcooling")!.line).toMatch(/above the 6 F target/);
    expect(above.severity).toBe("concern");
    const below = run({ targetSubcoolingF: "14", subcoolingTolF: "2" }).result!;
    expect(below.items.find((i) => i.id === "subcooling")!.line).toMatch(/below the 14 F target/);
  });

  it("treats the tolerance edge as within", () => {
    const edge = run({ targetSubcoolingF: "8", subcoolingTolF: "2" }).result!;
    expect(edge.items.find((i) => i.id === "subcooling")!.tone).toBe("ok");
  });

  it("fixed orifice uses the screening formula inside its range and classifies with a tolerance", () => {
    // (3 x 67 - 80 - 95) / 2 = 13
    const r = run({ device: "orifice", indoorWetBulbF: "67", outdoorDryBulbF: "95", superheatTolF: "2" }).result!;
    expect(r.targetSuperheatF).toBeCloseTo(13, 5);
    expect(r.items.find((i) => i.id === "superheat")!.line).toMatch(/below the 13 F screening target/);
    expect(r.severity).toBe("concern");
  });

  it("fixed orifice shows no target outside the formula range", () => {
    const r = run({ device: "orifice", indoorWetBulbF: "67", outdoorDryBulbF: "40", superheatTolF: "3" }).result!;
    expect(r.targetSuperheatF).toBeNull();
    expect(r.notes.join(" ")).toMatch(/outside the formula range/);
    expect(r.severity).toBe("info");
  });

  it("never describes the charge level as a conclusion", () => {
    const r = run({ targetSubcoolingF: "4", subcoolingTolF: "1" }).result!;
    expect(r.diagnosis).not.toMatch(/low on charge|overcharg|undercharg|leak/i);
  });

  it("warns and flags non-physical results", () => {
    const r = run({ suctionLineF: "45" }).result!;
    expect(r.superheatF).toBeLessThan(0);
    expect(r.notes.join(" ")).toMatch(/at or below zero/);
    expect(r.items.find((i) => i.id === "superheat")!.tone).toBe("concern");
  });

  it("records computed values as computed readings", () => {
    const r = run({}).result!;
    expect(r.readings.filter((x) => x.source === "computed").map((x) => x.label)).toEqual(["Superheat", "Subcooling"]);
  });
});

describe("orificeTargetSuperheatF", () => {
  it("returns a target inside the range and a reason outside it", () => {
    expect(orificeTargetSuperheatF(67, 95)).toEqual({ ok: true, targetF: 13 });
    expect(orificeTargetSuperheatF(67, 120).ok).toBe(false);
    expect(orificeTargetSuperheatF(50, 95).ok).toBe(false);
    expect(orificeTargetSuperheatF(58, 110).ok).toBe(false);
  });
});
