import { describe, expect, it } from "vitest";
import { assessCompressor, EMPTY_COMPRESSOR, type CompressorInput } from "./compressor";
import { assessEvacuation, EMPTY_EVACUATION, temperatureCorrectedPsig, type EvacuationInput } from "./evacuation";
import { assessRefrigerantLog, EMPTY_REFRIGERANT_LOG, formatLbOz, type RefrigerantLogInput } from "./refrigerantLog";

const evac = (over: Partial<EvacuationInput>) => assessEvacuation({ ...EMPTY_EVACUATION, ...over });
const log = (over: Partial<RefrigerantLogInput>) => assessRefrigerantLog({ ...EMPTY_REFRIGERANT_LOG, ...over });
const comp = (over: Partial<CompressorInput>) => assessCompressor({ ...EMPTY_COMPRESSOR, ...over });

describe("assessEvacuation", () => {
  it("requires a reading and paired values", () => {
    expect(evac({}).errors.join(" ")).toMatch(/pressure test or a vacuum/);
    expect(evac({ n2StartPsig: "300" }).errors.join(" ")).toMatch(/together/);
    expect(evac({ holdEndMicrons: "600" }).errors.join(" ")).toMatch(/final vacuum/);
  });

  it("temperature-corrects the nitrogen test", () => {
    const expected = temperatureCorrectedPsig(300, 90, 70);
    expect(expected).toBeLessThan(300);
    const r = evac({ n2StartPsig: "300", n2EndPsig: String(Math.round(expected)), n2StartF: "90", n2EndF: "70", n2AllowedDropPsig: "1" }).result!;
    expect(r.severity).toBe("ok");
    expect(evac({ n2StartPsig: "300", n2EndPsig: "290", n2AllowedDropPsig: "1" }).result!.severity).toBe("concern");
    expect(evac({ n2StartPsig: "300", n2EndPsig: "290" }).result!.severity).toBe("info");
  });

  it("checks vacuum and decay against typed limits", () => {
    const r = evac({ finalMicrons: "350", targetMicrons: "500", holdMinutes: "10", holdEndMicrons: "1500", maxHoldMicrons: "1000" }).result!;
    expect(r.items.find((i) => i.id === "vacuum")!.tone).toBe("ok");
    expect(r.items.find((i) => i.id === "decay")!.tone).toBe("concern");
    expect(r.riseMicrons).toBe(1150);
  });
});

describe("assessRefrigerantLog", () => {
  it("totals pounds and ounces and needs a refrigerant", () => {
    expect(log({ addedLb: "1" }).errors.join(" ")).toMatch(/refrigerant/);
    const r = log({ refrigerant: "R-410A", addedLb: "1", addedOz: "8", recoveredOz: "20" }).result!;
    expect(r.addedOz).toBe(24);
    expect(r.recoveredOz).toBe(20);
    expect(formatLbOz(24)).toBe("1 lb 8 oz");
    expect(r.severity).toBe("info");
  });

  it("computes the line set adjustment", () => {
    expect(log({ lineLengthFt: "40" }).errors.join(" ")).toMatch(/line set/);
    expect(log({ lineLengthFt: "40", includedLengthFt: "15", ozPerFt: "0.6" }).result!.adjustmentOz).toBeCloseTo(15, 6);
    expect(log({ lineLengthFt: "10", includedLengthFt: "15", ozPerFt: "0.6" }).result!.items[0].line).toMatch(/shorter/);
  });
});

describe("assessCompressor", () => {
  it("checks the winding sum", () => {
    expect(comp({}).errors.join(" ")).toMatch(/winding resistance/);
    expect(comp({ csOhms: "2.5", crOhms: "0.8", srOhms: "3.3" }).result!.severity).toBe("ok");
    expect(comp({ csOhms: "2.5", crOhms: "0.8", srOhms: "5" }).result!.severity).toBe("concern");
    expect(comp({ csOhms: "0.8", crOhms: "2.5", srOhms: "3.3" }).result!.notes.join(" ")).toMatch(/terminal identification/);
  });

  it("explains an open internal overload and checks insulation", () => {
    const r = comp({ csOpen: true, crOpen: true, srOhms: "3.3", hotShell: true }).result!;
    expect(r.severity).toBe("concern");
    expect(r.notes.join(" ")).toMatch(/cool/);
    expect(comp({ csOpen: true, csOhms: "2" }).errors.join(" ")).toMatch(/open/);
    expect(comp({ groundMegohm: "0.5", groundMinMegohm: "1" }).result!.severity).toBe("concern");
    expect(comp({ groundMegohm: "500", groundMinMegohm: "1" }).result!.severity).toBe("ok");
  });
});
