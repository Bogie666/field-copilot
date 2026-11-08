import { describe, expect, it } from "vitest";
import { mostUsed, parsePrefs } from "./toolPrefs";

describe("tool prefs", () => {
  it("ignores malformed storage", () => {
    expect(parsePrefs("x", [1])).toEqual({ favorites: [], usage: {} });
    expect(parsePrefs(["charge", "charge", 4, ""], { charge: 3, gas: -1, static: "2", airflow: Infinity })).toEqual({ favorites: ["charge"], usage: { charge: 3 } });
  });

  it("ranks most used, excluding favorites", () => {
    const prefs = { favorites: ["charge"], usage: { charge: 9, gas: 2, static: 5, airflow: 2 } };
    expect(mostUsed(prefs, ["charge", "static", "airflow", "gas", "duct"])).toEqual(["static", "airflow", "gas"]);
    expect(mostUsed(prefs, ["charge", "static", "airflow", "gas"], 1)).toEqual(["static"]);
  });
});
