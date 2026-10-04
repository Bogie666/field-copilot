import { describe, expect, it } from "vitest";
import { ampsFrom, assessElectrical, EMPTY_ELECTRICAL, voltageOptions } from "./electrical";

const run = (over: Partial<typeof EMPTY_ELECTRICAL>) => assessElectrical({ ...EMPTY_ELECTRICAL, ...over });

describe("assessElectrical", () => {
  it("requires at least one measured reading", () => {
    expect(run({ nominalVoltage: "240" }).errors.join(" ")).toMatch(/at least one measured/);
  });

  it("rejects non-numeric and non-positive inputs", () => {
    expect(run({ measuredVoltage: "2in" }).errors.join(" ")).toMatch(/plain number/);
    expect(run({ compressorAmps: "10", rla: "0" }).errors.join(" ")).toMatch(/greater than zero/);
  });

  it("classifies voltage at the plus or minus 10 percent edges", () => {
    expect(run({ nominalVoltage: "240", measuredVoltage: "264" }).result!.items[0].tone).toBe("ok");
    expect(run({ nominalVoltage: "240", measuredVoltage: "216" }).result!.items[0].tone).toBe("ok");
    expect(run({ nominalVoltage: "240", measuredVoltage: "264.5" }).result!.items[0].tone).toBe("concern");
    expect(run({ nominalVoltage: "240", measuredVoltage: "215" }).result!.items[0].tone).toBe("concern");
  });

  it("flags compressor amps above RLA", () => {
    const high = run({ rla: "12.3", compressorAmps: "13.1" }).result!;
    expect(high.items[0].tone).toBe("concern");
    expect(high.severity).toBe("concern");
    expect(run({ rla: "12.3", compressorAmps: "12.3" }).result!.items[0].tone).toBe("ok");
    expect(run({ rla: "12.3", compressorAmps: "9" }).result!.items[0].tone).toBe("ok");
  });

  it("does not interpret a reading without a reference", () => {
    const r = run({ compressorAmps: "9" }).result!;
    expect(r.items[0].tone).toBe("info");
    expect(r.severity).toBe("info");
    expect(r.reference).toBe("");
  });

  it("requires capacitor rated, measured and tolerance together", () => {
    expect(run({ capacitorMeasuredUf: "30" }).errors.join(" ")).toMatch(/together/);
    expect(run({ capacitorMeasuredUf: "30", capacitorRatedUf: "35" }).errors.join(" ")).toMatch(/together/);
  });

  it("compares the capacitor with the typed tolerance, inclusive at the boundary", () => {
    const within = run({ capacitorRatedUf: "40", capacitorMeasuredUf: "37.6", capacitorTolerancePct: "6" }).result!;
    expect(within.items[0].tone).toBe("ok");
    const outside = run({ capacitorRatedUf: "35", capacitorMeasuredUf: "31.2", capacitorTolerancePct: "6" }).result!;
    expect(outside.items[0].tone).toBe("concern");
    expect(outside.diagnosis).toContain("-10.9 percent");
    expect(outside.readings.map((x) => x.label)).toEqual(["Capacitor measured", "Capacitor rated"]);
  });

  it("returns readings as entered and never invents blanks", () => {
    const r = run({ measuredVoltage: "238", nominalVoltage: "240" }).result!;
    expect(r.readings).toEqual([{ label: "Line voltage", value: 238, unit: "V", source: "entered" }]);
  });
});

describe("nameplate helpers", () => {
  it("lists nominal voltage options and pulls amps", () => {
    expect(voltageOptions("208/230 V")).toEqual([208, 230]);
    expect(voltageOptions(undefined)).toEqual([]);
    expect(ampsFrom("12.3 A")).toBe("12.3");
    expect(ampsFrom("")).toBe("");
  });
});
