import { describe, expect, it } from "vitest";
import { parseVoiceReadings, wordsToDigits, type VoiceTarget } from "./voiceReadings";

const charge: VoiceTarget[] = [
  { id: "sp", label: "Suction pressure", unit: "psig" },
  { id: "st", label: "Suction line temperature", unit: "F" },
  { id: "lp", label: "Liquid pressure", unit: "psig" },
  { id: "lt", label: "Liquid line temperature", unit: "F" },
  { id: "wb", label: "Indoor wet bulb", unit: "F" },
  { id: "db", label: "Outdoor dry bulb", unit: "F" },
];
const electrical: VoiceTarget[] = [
  { id: "nv", label: "Nominal voltage", unit: "V" },
  { id: "rla", label: "Compressor RLA", unit: "A" },
  { id: "fla", label: "Fan FLA", unit: "A" },
  { id: "lv", label: "Line voltage", unit: "V" },
  { id: "ca", label: "Compressor amps", unit: "A" },
  { id: "fa", label: "Fan amps", unit: "A" },
];
const values = (r: ReturnType<typeof parseVoiceReadings>) => Object.fromEntries(r.matches.map((m) => [m.id, m.value]));

describe("wordsToDigits", () => {
  it("converts spoken numbers and decimals", () => {
    expect(wordsToDigits("two hundred thirty eight")).toBe("238");
    expect(wordsToDigits("three point five")).toBe("3.5");
    expect(wordsToDigits("point two five")).toBe("0.25");
    expect(wordsToDigits("1 point 5")).toBe("1.5");
  });
});

describe("parseVoiceReadings", () => {
  it("matches gauge readings, preferring the closer label", () => {
    const r = parseVoiceReadings("Suction 118, suction temp 52, liquid 365 liquid line temperature 95", charge);
    expect(values(r)).toEqual({ sp: "118", st: "52", lp: "365", lt: "95" });
    expect(r.unmatched).toEqual([]);
  });

  it("handles units after numbers, spoken words and synonyms", () => {
    const r = parseVoiceReadings("line voltage two thirty eight volts compressor amps 13.4 amps fan amps one point two", electrical);
    expect(values(r)).toMatchObject({ lv: "238", ca: "13.4", fa: "1.2" });
    expect(values(parseVoiceReadings("indoor wet bulb 63 outdoor dry bulb 95", charge))).toEqual({ wb: "63", db: "95" });
  });

  it("reports what it could not place and never invents values", () => {
    const r = parseVoiceReadings("banana 12 suction 118", charge);
    expect(values(r)).toEqual({ sp: "118" });
    expect(r.unmatched).toEqual(["banana 12"]);
    expect(parseVoiceReadings("nothing useful here", charge)).toEqual({ matches: [], unmatched: [] });
  });
});
