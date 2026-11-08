import { describe, expect, it } from "vitest";
import { saturationTempF } from "../charge/ptData";
import { assessHeatPump, EMPTY_HEAT_PUMP, expectedStripKw, type HeatPumpInput } from "./heatPump";

const run = (over: Partial<HeatPumpInput>) => assessHeatPump({ ...EMPTY_HEAT_PUMP, ...over });

describe("assessHeatPump", () => {
  it("requires a reading and paired inputs", () => {
    expect(run({}).errors.join(" ")).toMatch(/at least one reading/);
    expect(run({ returnF: "70" }).errors.join(" ")).toMatch(/return and supply/);
    expect(run({ lowPsig: "100" }).errors.join(" ")).toMatch(/suction line/);
    expect(run({ lowPsig: "100", suctionLineF: "30" }).errors.join(" ")).toMatch(/refrigerant/);
  });

  it("classifies the rise only against a typed chart range", () => {
    expect(run({ returnF: "70", supplyF: "95" }).result!.items[0].tone).toBe("info");
    expect(run({ returnF: "70", supplyF: "95", riseMinF: "20", riseMaxF: "35" }).result!.severity).toBe("ok");
    expect(run({ returnF: "70", supplyF: "85", riseMinF: "20", riseMaxF: "35" }).result!.severity).toBe("concern");
  });

  it("computes superheat and subcooling from the PT data", () => {
    const r = run({ refrigerant: "R-410A", lowPsig: "100", suctionLineF: "40", highPsig: "350", liquidLineF: "95", targetSubcoolingF: "10", subcoolingTolF: "3" }).result!;
    const dew = saturationTempF("R-410A", 100, "dew");
    const bubble = saturationTempF("R-410A", 350, "bubble");
    expect(dew.ok && bubble.ok).toBe(true);
    if (!dew.ok || !bubble.ok) return;
    expect(r.superheatF).toBeCloseTo(40 - dew.tempF, 5);
    expect(r.subcoolingF).toBeCloseTo(bubble.tempF - 95, 5);
    expect(r.items.find((i) => i.id === "subcooling")!.tone).toBe(Math.abs(bubble.tempF - 95 - 10) <= 3 ? "ok" : "concern");
  });

  it("corrects heat strip output for voltage", () => {
    expect(expectedStripKw(10, 240, 230)).toBeCloseTo(10 * (230 / 240) ** 2, 6);
    const ok = run({ stripVolts: "240", stripAmps: "41.6", stripRatedKw: "10", stripRatedVolts: "240", stripTolPct: "5" }).result!;
    expect(ok.items[0].tone).toBe("ok");
    const half = run({ stripVolts: "240", stripAmps: "20.8", stripRatedKw: "10", stripRatedVolts: "240", stripTolPct: "5" }).result!;
    expect(half.items[0].tone).toBe("concern");
  });

  it("flags a defrost step that did not happen", () => {
    const r = run({ defrost: { ...EMPTY_HEAT_PUMP.defrost, initiated: "yes", valveShifted: "no" } }).result!;
    expect(r.severity).toBe("concern");
    expect(r.diagnosis).toMatch(/reversing valve/);
    const all = run({ defrost: { initiated: "yes", valveShifted: "yes", fanStopped: "yes", auxOn: "yes", terminated: "yes" } }).result!;
    expect(all.severity).toBe("ok");
  });
});
