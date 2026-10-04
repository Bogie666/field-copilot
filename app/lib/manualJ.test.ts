import { describe, expect, it } from "vitest";
import {
  calculateManualJEstimate,
  climateProfiles,
  manualJClimateDependencyNotes,
} from "./manualJ";

describe("Manual J estimate", () => {
  it("uses local climate design temperatures when estimating cooling and heating load", () => {
    const dallas = calculateManualJEstimate({
      squareFeet: 2200,
      ceilingHeight: 9,
      occupants: 4,
      climateProfile: "dfw",
      indoorCoolingTemp: 75,
      indoorHeatingTemp: 70,
      insulationQuality: "average",
      airTightness: "average",
      windowQuality: "double",
      sunExposure: "average",
      ductLocation: "attic",
      ductLeakage: "average",
      orientation: "mixed",
      appliancesBtuh: 1200,
    });
    const tyler = calculateManualJEstimate({
      squareFeet: 2200,
      ceilingHeight: 9,
      occupants: 4,
      climateProfile: "tyler",
      indoorCoolingTemp: 75,
      indoorHeatingTemp: 70,
      insulationQuality: "average",
      airTightness: "average",
      windowQuality: "double",
      sunExposure: "average",
      ductLocation: "attic",
      ductLeakage: "average",
      orientation: "mixed",
      appliancesBtuh: 1200,
    });

    expect(climateProfiles.dfw.coolingDesignTempF).toBeGreaterThan(climateProfiles.tyler.coolingDesignTempF);
    expect(dallas.cooling.totalBtuh).toBeGreaterThan(0);
    expect(dallas.heating.totalBtuh).toBeGreaterThan(0);
    expect(dallas.cooling.totalBtuh).not.toBe(tyler.cooling.totalBtuh);
    expect(dallas.coolingTotalRange.lowBtuh).toBeLessThan(dallas.coolingTotalRange.highBtuh);
    expect(dallas.caveats.join(" ")).toContain("not an ACCA Manual J");
  });

  it("accepts a below-zero custom heating design temperature without treating it as missing", () => {
    const result = calculateManualJEstimate({
      squareFeet: 1600,
      ceilingHeight: 8,
      occupants: 2,
      climateProfile: "custom",
      customCoolingDesignTemp: 95,
      customHeatingDesignTemp: -5,
      customGrainsDifference: 45,
      indoorCoolingTemp: 75,
      indoorHeatingTemp: 70,
      insulationQuality: "average",
      airTightness: "average",
      windowQuality: "double",
      sunExposure: "average",
      ductLocation: "attic",
      ductLeakage: "average",
      orientation: "mixed",
      appliancesBtuh: 900,
    });

    expect(result.climate.heatingDesignTempF).toBe(-5);
    expect(result.heating.totalBtuh).toBeGreaterThan(0);
  });

  it("increases load for weaker envelope, high sun, and attic duct losses", () => {
    const efficient = calculateManualJEstimate({
      squareFeet: 1800,
      ceilingHeight: 8,
      occupants: 3,
      climateProfile: "dfw",
      indoorCoolingTemp: 75,
      indoorHeatingTemp: 70,
      insulationQuality: "good",
      airTightness: "tight",
      windowQuality: "lowE",
      sunExposure: "shaded",
      ductLocation: "conditioned",
      ductLeakage: "low",
      orientation: "mixed",
      appliancesBtuh: 800,
    });
    const weak = calculateManualJEstimate({
      squareFeet: 1800,
      ceilingHeight: 8,
      occupants: 3,
      climateProfile: "dfw",
      indoorCoolingTemp: 75,
      indoorHeatingTemp: 70,
      insulationQuality: "poor",
      airTightness: "leaky",
      windowQuality: "single",
      sunExposure: "high",
      ductLocation: "attic",
      ductLeakage: "high",
      orientation: "west",
      appliancesBtuh: 800,
    });

    expect(weak.cooling.totalBtuh).toBeGreaterThan(efficient.cooling.totalBtuh);
    expect(weak.heating.totalBtuh).toBeGreaterThan(efficient.heating.totalBtuh);
    expect(weak.cooling.ductLossBtuh).toBeGreaterThan(efficient.cooling.ductLossBtuh);
  });

  it("documents which calculators require climate or weather information", () => {
    expect(manualJClimateDependencyNotes.manualJ).toContain("design temperatures");
    expect(manualJClimateDependencyNotes.airflow).toContain("does not require");
    expect(manualJClimateDependencyNotes.ductulator).toContain("does not require");
  });
});
