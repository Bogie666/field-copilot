import { describe, expect, it } from "vitest";
import { assessGas, clockedInputBtuh, EMPTY_GAS, type GasInput } from "./gas";

const run = (over: Partial<GasInput>) => assessGas({ ...EMPTY_GAS, ...over });

describe("assessGas", () => {
  it("requires a reading and complete pairs", () => {
    expect(run({}).errors.join(" ")).toMatch(/at least one reading/);
    expect(run({ manifoldHigh: "3.5", manifoldHighMin: "3.2" }).errors.join(" ")).toMatch(/both ends/);
    expect(run({ dialCuFt: "1" }).errors.join(" ")).toMatch(/clock the meter/);
  });

  it("compares inlet and manifold only against typed ranges", () => {
    expect(run({ inletRunning: "5" }).result!.severity).toBe("info");
    expect(run({ inletRunning: "4", inletMin: "4.5" }).result!.severity).toBe("concern");
    expect(run({ inletStatic: "7", inletMax: "10.5" }).result!.severity).toBe("ok");
    expect(run({ manifoldHigh: "3.5", manifoldHighMin: "3.2", manifoldHighMax: "3.8" }).result!.severity).toBe("ok");
    expect(run({ manifoldHigh: "4.1", manifoldHighMin: "3.2", manifoldHighMax: "3.8" }).result!.items[0].line).toMatch(/above/);
  });

  it("clocks the meter and compares with rated input", () => {
    expect(clockedInputBtuh(1, 36, 1000)).toBe(100000);
    const r = run({ dialCuFt: "1", secondsPerRev: "36", heatingValue: "1000", ratedInputBtuh: "80000", inputTolPct: "2" }).result!;
    expect(r.clockedBtuh).toBe(100000);
    expect(r.severity).toBe("concern");
    expect(r.items[0].line).toMatch(/overfiring/);
  });

  it("makes a gas leak a safety finding", () => {
    expect(run({ gasLeak: true }).result!.severity).toBe("safety");
    expect(run({ flameUa: "0.5", flameMinUa: "1" }).result!.severity).toBe("concern");
  });
});
