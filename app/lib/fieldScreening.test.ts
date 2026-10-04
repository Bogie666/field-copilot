import { describe, expect, it } from "vitest";
import {
  airflowBand,
  averageReadings,
  ductVelocityGuidance,
  formatAirflowSummary,
  nearbyStandardSizes,
  validatePositiveInputs,
} from "./fieldScreening";

describe("field screening helpers", () => {
  it("averages only finite positive readings", () => {
    expect(averageReadings([600, 660, 0, Number.NaN])).toBe(630);
  });

  it("flags invalid inputs and classifies airflow bands", () => {
    expect(validatePositiveInputs([["Width", 0], ["Height", 10]])).toEqual(["Width must be greater than zero."]);
    expect(airflowBand(300, "cooling")).toContain("Below");
    expect(airflowBand(400, "cooling")).toContain("Within");
    expect(airflowBand(500, "heating")).toContain("Above");
  });

  it("uses duct context in velocity guidance", () => {
    expect(ductVelocityGuidance({ side: "return", section: "branch" }, 550)).toContain("within");
    expect(ductVelocityGuidance({ side: "supply", section: "trunk" }, 1100)).toContain("above");
  });

  it("returns nearby nominal sizes and produces a source-aware summary", () => {
    const sizes = nearbyStandardSizes(100);
    expect(sizes.round).toHaveLength(3);
    expect(sizes.rectangular).toHaveLength(3);
    const summary = formatAirflowSummary({ readings: [1180, 1220], averageReading: 1200, readingUnit: "CFM", cfm: 1200, cfmPerTon: 400, mode: "cooling", method: "flow-hood", beforeAfter: "After repair", status: "Within range" });
    expect(summary).toContain("1180, 1220 CFM");
    expect(summary).toContain("method: flow-hood");
    expect(summary).toContain("Comparison notes: After repair");
  });
});

import { airflowBandState, ductVelocityState } from "./fieldScreening";

describe("band states", () => {
  it("classifies airflow per ton by mode", () => {
    expect(airflowBandState(349, "cooling")).toBe("below");
    expect(airflowBandState(350, "cooling")).toBe("within");
    expect(airflowBandState(450, "cooling")).toBe("within");
    expect(airflowBandState(451, "cooling")).toBe("above");
    expect(airflowBandState(330, "heating")).toBe("within");
    expect(airflowBandState(0, "cooling")).toBe("none");
  });

  it("classifies duct velocity by context", () => {
    expect(ductVelocityState({ side: "supply", section: "trunk" }, 699)).toBe("below");
    expect(ductVelocityState({ side: "supply", section: "trunk" }, 1000)).toBe("within");
    expect(ductVelocityState({ side: "return", section: "branch" }, 701)).toBe("above");
    expect(ductVelocityState({ side: "return", section: "branch" }, Number.NaN)).toBe("none");
  });
});
