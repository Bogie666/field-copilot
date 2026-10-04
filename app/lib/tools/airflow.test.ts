import { describe, expect, it } from "vitest";
import { assessAirflow, directCfm, EMPTY_AIRFLOW, tonsFromCapacity, type AirflowInput } from "./airflow";

const run = (over: Partial<AirflowInput>) => assessAirflow({ ...EMPTY_AIRFLOW, ...over });

describe("assessAirflow", () => {
  it("starts blank and asks for the method, readings and tonnage", () => {
    const { errors } = run({});
    expect(errors.join(" ")).toMatch(/measurement method/);
    expect(errors.join(" ")).toMatch(/at least one reading/);
    expect(errors.join(" ")).toMatch(/tonnage/);
  });

  it("converts rectangular velocity readings to CFM per ton and flags the band", () => {
    // 600 FPM x (20 x 10 / 144) = 833 CFM; on 2 tons = 417 CFM per ton (within cooling band).
    const within = run({ method: "velocity-traverse", readings: ["600", "600"], width: "20", height: "10", tons: "2" }).result!;
    expect(within.cfm).toBe(833);
    expect(within.cfmPerTon).toBe(417);
    expect(within.band).toBe("within");
    expect(within.severity).toBe("ok");
    const low = run({ method: "velocity-traverse", readings: ["600"], width: "20", height: "10", tons: "3" }).result!;
    expect(low.band).toBe("below");
    expect(low.severity).toBe("concern");
  });

  it("uses direct CFM for a flow hood and ignores duct size", () => {
    const r = run({ method: "flow-hood", readings: ["1200"], tons: "3" }).result!;
    expect(r.cfm).toBe(1200);
    expect(r.cfmPerTon).toBe(400);
    expect(directCfm("flow-hood")).toBe(true);
  });

  it("requires duct size for velocity methods", () => {
    expect(run({ method: "grille", readings: ["500"], tons: "3" }).errors.join(" ")).toMatch(/duct width/);
    expect(run({ method: "grille", shape: "round", readings: ["500"], tons: "3" }).errors.join(" ")).toMatch(/duct diameter/);
  });

  it("reports before and after change", () => {
    const r = run({ method: "flow-hood", readings: ["1000"], afterReadings: ["1200"], tons: "3" }).result!;
    expect(r.changeCfm).toBe(200);
    expect(r.changePct).toBe(20);
    expect(r.diagnosis).toMatch(/change of 200 CFM/);
  });

  it("rejects bad numbers", () => {
    expect(run({ method: "flow-hood", readings: ["12x"], tons: "3" }).errors.join(" ")).toMatch(/plain number/);
    expect(run({ method: "flow-hood", readings: ["1200"], tons: "0" }).errors.join(" ")).toMatch(/greater than zero/);
  });

  it("derives tons from a nameplate capacity only when it looks like BTU/h", () => {
    expect(tonsFromCapacity("36000 BTUH")).toBe("3");
    expect(tonsFromCapacity("36,000 BTUH")).toBe("3");
    expect(tonsFromCapacity("3")).toBe("");
    expect(tonsFromCapacity(undefined)).toBe("");
  });
});
