import { describe, expect, it } from "vitest";
import { ageFromManufacturedDate, EQUIPMENT_TYPES, matchEquipmentType } from "./nameplateEquipment";

const now = "2026-10-11T12:00:00Z";

describe("ageFromManufacturedDate", () => {
  it.each([
    ["2014", 12], ["2026", 0], ["2025", 1], [" 2000 ", 26],
  ])("labels printed year %s as an approximate %s years", (date, years) => {
    const result = ageFromManufacturedDate(date, now)!;
    expect(result.years).toBe(years);
    expect(result.precision).toBe("year");
    expect(result.label).toContain(`About ${years}`);
    expect(result.label).toContain("only the manufacture year");
  });

  it.each([
    ["2014-10", 12], ["2014-11", 11], ["10/2014", 12], ["11/2014", 11],
    ["8/2023", 3], ["08-2023", 3], ["8-2023", 3], ["2026-10", 0],
  ])("labels printed month %s as an approximate %s years", (date, years) => {
    const result = ageFromManufacturedDate(date, now)!;
    expect(result.years).toBe(years);
    expect(result.precision).toBe("month");
    expect(result.label).toContain(`About ${years}`);
    expect(result.label).toContain("only the manufacture month and year");
  });

  it.each([
    ["2014-10-10", 12], ["2014-10-11", 12], ["2014-10-12", 11],
    ["2014-11-01", 11], ["2026-10-11", 0], ["2025-10-12", 0],
  ])("calculates completed years from exact date %s", (date, years) => {
    const result = ageFromManufacturedDate(date, now)!;
    expect(result.years).toBe(years);
    expect(result.precision).toBe("day");
    expect(result.label).toMatch(/completed years? from the printed manufacture date/);
    expect(result.label).not.toContain("About");
  });

  it("handles leap days without normalizing impossible calendar dates", () => {
    expect(ageFromManufacturedDate("2024-02-29", "2025-02-28T12:00:00Z")?.years).toBe(0);
    expect(ageFromManufacturedDate("2024-02-29", "2025-03-01T12:00:00Z")?.years).toBe(1);
    expect(ageFromManufacturedDate("2000-02-29", now)?.precision).toBe("day");
    expect(ageFromManufacturedDate("1900-02-29", now)).toBeNull();
    expect(ageFromManufacturedDate("2023-02-29", now)).toBeNull();
  });

  it.each(["2027", "2026-11", "11/2026", "2026-10-12", "2027-01-01"])("rejects future printed date %s", (date) => {
    expect(ageFromManufacturedDate(date, now)).toBeNull();
  });

  it.each([
    undefined, "", " ", "0000", "0000-01-01", "2023-00", "2023-13", "0/2023", "13-2023",
    "2023-01-00", "2023-04-31", "2023-02-30", "2023-01-32", "2023-99-99",
    "08/09/2023", "13/09/2023", "8/23", "23", "2023/08", "2023-8-9", "2023-10-11T12:00:00Z",
    "MFG 2023", "installed 2023", "2013 or 2014", "2013-2014", "ABC2310XYZ", "SERIAL 20141011", "20141011",
  ])("rejects invalid, ambiguous, or non-date input %s", (date) => {
    expect(ageFromManufacturedDate(date, now)).toBeNull();
  });

  it("uses the supplied valid clock without mutating it", () => {
    const clock = new Date(now);
    expect(ageFromManufacturedDate("2014-10-11", clock)?.years).toBe(12);
    expect(clock.toISOString()).toBe("2026-10-11T12:00:00.000Z");
    expect(ageFromManufacturedDate("2014", new Date("invalid"))).toBeNull();
    expect(ageFromManufacturedDate("2014", "invalid")).toBeNull();
  });
});

describe("matchEquipmentType", () => {
  it.each(EQUIPMENT_TYPES)("retains the supported choice %s", (type) => {
    expect(matchEquipmentType(type)).toBe(type);
  });

  it.each([
    ["Air conditioner", "Condenser / air conditioner"],
    ["CON DENSER", undefined],
    ["Condensing unit", "Condenser / air conditioner"],
    ["  heat   pump  ", "Heat pump"],
    ["NATURAL GAS FURNACE", "Gas furnace"],
    ["Propane furnace", "Gas furnace"],
    ["Electric furnace", "Electric furnace"],
    ["Air handling unit", "Air handler"],
    ["Fan coil", "Air handler"],
    ["Packaged system", "Packaged unit"],
    ["Evaporator coil", "Evaporator coil"],
    ["Hot water boiler", "Boiler"],
  ])("matches explicit type %s conservatively", (raw, expected) => {
    expect(matchEquipmentType(raw)).toBe(expected);
  });

  it.each([
    undefined, "", "Furnace", "Mini-split", "Water heater", "dual fuel", "gas/electric furnace",
    "Heat pump / air conditioner", "not a heat pump", "heat pump compatible", "Gas furnace or boiler",
    "model HP123", "serial 202314", "MANUFACTURER Heat pump MODEL ABC123", "unknown custom type",
  ])("does not replace unmatched legacy or ambiguous OCR value %s", (raw) => {
    expect(matchEquipmentType(raw)).toBeUndefined();
  });
});


it("rejects malformed persisted clock values rather than throwing during report generation", () => {
  for (const invalid of [{ invalid: true }, null, undefined, 42, []]) {
    expect(ageFromManufacturedDate("2016", invalid as never)).toBeNull();
  }
});
