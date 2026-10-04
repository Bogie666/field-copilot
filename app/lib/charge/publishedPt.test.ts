import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";
import { saturationTempF, type PtTable } from "./ptData";

it("interpolates actual irregular pressure knots, not a rounded uniform grid", () => {
  const table = { id: "IRREGULAR", safetyClass: "A1", pressurePsig: [10, 12.2, 18], bubbleF: [30, 40, 50], dewF: [32, 42, 52] } as unknown as PtTable;
  expect(saturationTempF("IRREGULAR", 11.1, "dew", [table])).toEqual({ ok: true, tempF: 37 });
  expect(saturationTempF("IRREGULAR", 15.1, "bubble", [table])).toEqual({ ok: true, tempF: 45 });
});


it("rejects malformed pressure axes and mismatched temperature columns", () => {
  for (const pressurePsig of [[10, 10, 20], [10, 9, 20], [10, NaN, 20], [10, 20]]) {
    const table: PtTable = { id: "BAD", safetyClass: "A1", pressurePsig, bubbleF: [30, 40, 50], dewF: [32, 42, 52] };
    expect(saturationTempF("BAD", 12, "dew", [table]).ok).toBe(false);
  }
  expect(saturationTempF("BAD", 12, "bubble", [{ id: "BAD", safetyClass: "A1", pressurePsig: [10, 20], dewF: [30, 40], bubbleF: [NaN, 40] }]).ok).toBe(false);
});


it("uses exact published chart points for all four refrigerants", () => {
  for (const [id, pressure, temp] of [["R-410A", 118.1, 40], ["R-410A", 416.9, 120], ["R-22", 68.6, 40], ["R-22", 260, 120], ["R-32", 121, 40], ["R-32", 325.7, 100]] as const) {
    expect(saturationTempF(id, pressure, "dew")).toEqual({ ok: true, tempF: temp });
    expect(saturationTempF(id, pressure, "bubble")).toEqual({ ok: true, tempF: temp });
  }
  expect(saturationTempF("R-454B", 120, "bubble")).toEqual({ ok: true, tempF: 43.6 });
  expect(saturationTempF("R-454B", 120, "dew")).toEqual({ ok: true, tempF: 46 });
  expect(saturationTempF("R-454B", -2, "bubble")).toEqual({ ok: true, tempF: -64.1 });
  expect(saturationTempF("R-454B", 400, "dew")).toEqual({ ok: true, tempF: 123 });
});


it("extends Chemours above 400 on independent phase pressure axes", () => {
  expect(saturationTempF("R-454B", 400, "bubble")).toEqual({ ok: true, tempF: 120.8 });
  expect(saturationTempF("R-454B", 400, "dew")).toEqual({ ok: true, tempF: 123 });
  expect(saturationTempF("R-454B", 400.9, "bubble")).toEqual({ ok: true, tempF: 121 });
  expect(saturationTempF("R-454B", 400.1, "dew")).toEqual({ ok: true, tempF: 123 });
  expect(saturationTempF("R-454B", 728.9, "bubble")).toEqual({ ok: true, tempF: 170 });
  expect(saturationTempF("R-454B", 723.1, "dew")).toEqual({ ok: true, tempF: 170 });
  expect(saturationTempF("R-454B", 723.2, "dew").ok).toBe(false);
  expect(saturationTempF("R-454B", 729, "bubble").ok).toBe(false);
  const result = saturationTempF("R-454B", (400.1 + 405.4) / 2, "dew");
  expect(result.ok && result.tempF).toBeCloseTo(123.5, 10);
});



it("rejects unmatched uniform fixture phase columns rather than synthesizing separate ranges", () => {
  expect(saturationTempF("BAD", 12, "dew", [{ id: "BAD", safetyClass: "A1", startPsig: 10, stepPsig: 10, dewF: [30, 40, 50], bubbleF: [32, 42] }]).ok).toBe(false);
});


it("retains every saved direct row and each high-pressure inverse phase point", () => {
  const fixtures = JSON.parse(readFileSync("scripts/pt-sources/published-rows.json", "utf8")) as Array<{ id: string; rows: number[][]; inverseRows?: number[][] }>;
  for (const fixture of fixtures) {
    for (const [pressure, bubble, dew] of fixture.rows) {
      expect(saturationTempF(fixture.id, pressure, "bubble")).toEqual({ ok: true, tempF: bubble });
      expect(saturationTempF(fixture.id, pressure, "dew")).toEqual({ ok: true, tempF: dew });
    }
    for (const [temp, liquidPressure, vaporPressure] of fixture.inverseRows ?? []) {
      if (liquidPressure > 400) expect(saturationTempF(fixture.id, liquidPressure, "bubble")).toEqual({ ok: true, tempF: temp });
      if (vaporPressure > 400) expect(saturationTempF(fixture.id, vaporPressure, "dew")).toEqual({ ok: true, tempF: temp });
    }
  }
});

it("interpolates measured pressures between actual published knots", () => {
  for (const [id, low, high, expected] of [["R-410A", 118.1, 120.3, 40.5], ["R-22", 68.6, 70, 40.5], ["R-32", 121, 133, 42.5]] as const) {
    const value = saturationTempF(id, (low + high) / 2, "dew");
    expect(value.ok && value.tempF).toBeCloseTo(expected, 10);
  }
});

it("accepts phase endpoints and rejects nonfinite inputs or any extrapolation", () => {
  for (const [id, low, high] of [["R-410A", 10.8, 611.9], ["R-22", 0.6, 381.7], ["R-32", 11, 628.8]] as const) {
    for (const phase of ["dew", "bubble"] as const) {
      expect(saturationTempF(id, low, phase)).toEqual({ ok: true, tempF: -40 });
      expect(saturationTempF(id, high, phase)).toEqual({ ok: true, tempF: 150 });
      for (const pressure of [low - 0.01, high + 0.01, NaN, Infinity, -Infinity]) expect(saturationTempF(id, pressure, phase).ok).toBe(false);
    }
  }
  expect(saturationTempF("R-454B", -2, "dew")).toEqual({ ok: true, tempF: -62.3 });
  expect(saturationTempF("R-454B", -2.01, "dew").ok).toBe(false);
});

it("regenerates byte-identical tables and audit from the saved source fixtures", () => {
  const result = spawnSync("python3", ["scripts/generate-pt-data.py", "--check"], { encoding: "utf8" });
  expect(result.status, result.stderr).toBe(0);
});
