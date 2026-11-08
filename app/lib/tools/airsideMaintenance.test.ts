import { describe, expect, it } from "vitest";
import { assessAirside, dewPointF, EMPTY_AIRSIDE, type AirsideInput } from "./airside";
import { assessMaintenance, CHECKLISTS } from "./maintenance";
import { TOOLS } from "../job/registry";

const air = (over: Partial<AirsideInput>) => assessAirside({ ...EMPTY_AIRSIDE, ...over });

describe("assessAirside", () => {
  it("requires an observation and paired humidity", () => {
    expect(air({}).errors.join(" ")).toMatch(/at least one/);
    expect(air({ indoorF: "75" }).errors.join(" ")).toMatch(/together/);
  });

  it("classifies observations", () => {
    expect(air({ filterCondition: "clean", drainFlow: "flowing", drainTrap: "present", safetySwitch: "testedOk", pan: "dry" }).result!.severity).toBe("ok");
    expect(air({ filterCondition: "dirty" }).result!.severity).toBe("concern");
    expect(air({ safetySwitch: "failed" }).result!.severity).toBe("concern");
    expect(air({ safetySwitch: "untested" }).result!.severity).toBe("info");
  });

  it("computes dew point", () => {
    expect(dewPointF(75, 50)).toBeCloseTo(55.1, 0);
    expect(air({ indoorF: "75", indoorRh: "50" }).result!.dewPointF).toBeCloseTo(55.1, 0);
  });
});

describe("assessMaintenance", () => {
  it("needs a checklist and at least one mark", () => {
    expect(assessMaintenance({ unit: "", checks: {}, notes: "" }).errors.join(" ")).toMatch(/Choose/);
    expect(assessMaintenance({ unit: "outdoor", checks: {}, notes: "" }).errors.join(" ")).toMatch(/at least one/);
  });

  it("summarizes pass, fail and open items", () => {
    const partial = assessMaintenance({ unit: "outdoor", checks: { coil: "pass" }, notes: "" }).result!;
    expect(partial.severity).toBe("info");
    const failed = assessMaintenance({ unit: "outdoor", checks: { coil: "fail", fan: "pass" }, notes: "" }).result!;
    expect(failed.severity).toBe("concern");
    expect(failed.diagnosis).toMatch(/condenser coil/);
    const all = Object.fromEntries(CHECKLISTS.indoor.items.map((i) => [i.id, "pass" as const]));
    expect(assessMaintenance({ unit: "indoor", checks: all, notes: "" }).result!.severity).toBe("ok");
  });

  it("links only to tools that exist", () => {
    for (const list of Object.values(CHECKLISTS)) for (const item of list.items) if (item.tool) expect(TOOLS[item.tool]).toBeDefined();
  });
});
