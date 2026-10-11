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

  it.each([".5", "0.5", ".50 A", "0.50A", ".5 amps", ".5 amperes"])("uses the true amp reference from %s", (value) => {
    const rla = ampsFrom(value);
    expect(rla).toBe("0.5");
    const result = run({ rla, compressorAmps: ".6", fanFla: rla, fanAmps: ".6" }).result!;
    expect(result.severity).toBe("concern");
    expect(result.items.map((item) => item.tone)).toEqual(["concern", "concern"]);
    expect(result.diagnosis).toContain("120 percent of the 0.5 A RLA");
    expect(result.diagnosis).toContain("120 percent of the 0.5 A FLA");
    expect(result.reference).toBe("compressor RLA 0.5 A; fan FLA 0.5 A");
  });

  it.each(["-.5 A", "-0.5", "-0 A"])("preserves negative amps %s for validation", (value) => {
    const rla = ampsFrom(value);
    expect(rla.startsWith("-")).toBe(true);
    expect(run({ rla, compressorAmps: ".6" }).result).toBeNull();
    expect(run({ fanFla: rla, fanAmps: ".6" }).result).toBeNull();
  });

  it.each([".5/.8 A", "0.5 0.8 A", "1e1 A", "1e-1 A", "0.5.0 A", "0.5mA"])("does not extract a plausible-looking first amp number from %s", (value) => {
    expect(ampsFrom(value)).toBe("");
    expect(run({ rla: ampsFrom(value), compressorAmps: ".6" }).result!.severity).toBe("info");
  });

  it.each(["208/230 V", "208-230 V", "208–230 VAC", "208 to 230 volts", "208 / 230 V AC"])("retains explicit nominal voltage alternatives in %s", (value) => {
    expect(voltageOptions(value)).toEqual([208, 230]);
  });

  it.each(["240", "240 V", "240VAC", "240 volts", "+240 V"])("retains a single nominal voltage in %s", (value) => {
    expect(voltageOptions(value)).toEqual([240]);
  });

  it.each(["-240 V", "240e0 V", "2.4e2 V", "208 230 V", "208/230 V 60 Hz", "208/230/NaN V", "208/-230 V", "240.0.0 V", "208/700 V", "240 kV"])("rejects ambiguous or unsupported nominal voltage text %s", (value) => {
    expect(voltageOptions(value)).toEqual([]);
  });
});
