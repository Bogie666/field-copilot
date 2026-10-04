import { describe, expect, it } from "vitest";
import { parseNameplateExtras } from "./nameplateExtras";

describe("parseNameplateExtras", () => {
  it("reads a temperature rise range", () => {
    expect(parseNameplateExtras("TEMP RISE 35-65 F").tempRiseRange).toBe("35-65");
    expect(parseNameplateExtras("Temperature rise range: 65 to 35").tempRiseRange).toBe("35-65");
  });
  it("reads max external static", () => {
    expect(parseNameplateExtras("MAX EXT. STATIC 0.50 IN WC").maxExternalStatic).toBe("0.5");
    expect(parseNameplateExtras("Maximum external static pressure .8").maxExternalStatic).toBe("0.8");
  });
  it("returns blanks when the text does not state them", () => {
    expect(parseNameplateExtras("MODEL ABC123 SERIAL 99")).toEqual({ tempRiseRange: "", maxExternalStatic: "" });
    expect(parseNameplateExtras("temp rise 0-999")).toEqual({ tempRiseRange: "", maxExternalStatic: "" });
  });
});
