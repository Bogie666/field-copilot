import { describe, expect, it } from "vitest";
import {
  EMPTY_NAMEPLATE_CONFIDENCE,
  EMPTY_NAMEPLATE_FIELDS,
  formatNameplateSummary,
  hasUsableNameplateData,
  mergeNameplateExtractions,
  normalizeVisionExtraction,
  parseNameplateText,
} from "./nameplate";

describe("parseNameplateText", () => {
  it("extracts labeled HVAC identifiers and electrical ratings", () => {
    const result = parseNameplateText(`
      GOODMAN MANUFACTURING
      AIR CONDITIONER
      MODEL NO. GSXH503610AA
      SERIAL NO. 2404123456
      REFRIGERANT R-32
      208/230 VAC 1 PH 60 HZ
      MINIMUM CIRCUIT AMPACITY 18.7
      MAX FUSE 30 AMPS
      RLA 12.3 LRA 64
      CAPACITY 36000 BTUH
    `);

    expect(result.fields).toMatchObject({
      manufacturer: "Goodman",
      equipmentType: "Air conditioner",
      model: "GSXH503610AA",
      serial: "2404123456",
      refrigerant: "R-32",
      voltage: "208/230 V",
      phase: "1 phase",
      frequency: "60 Hz",
      mca: "18.7 A",
      maxFuseBreaker: "30 A",
      rla: "12.3 A",
      lra: "64 A",
      capacity: "36000 BTUH",
    });
    expect(result.confidence.model).toBeGreaterThan(0.9);
    expect(result.warnings).toEqual([]);
  });

  it("supports M/N and S/N labels while preserving punctuation", () => {
    const result = parseNameplateText(`
      TRANE
      HEAT PUMP
      M/N: 4TWR6036N1000A
      S/N: 23145AB7F
      R-410A
      460 V 3 PH 60 HZ
      MCA: 11.2 A
      MOCP: 20 A
    `);

    expect(result.fields.model).toBe("4TWR6036N1000A");
    expect(result.fields.serial).toBe("23145AB7F");
    expect(result.fields.refrigerant).toBe("R-410A");
    expect(result.fields.voltage).toBe("460 V");
    expect(result.fields.phase).toBe("3 phase");
    expect(result.fields.mca).toBe("11.2 A");
    expect(result.fields.maxFuseBreaker).toBe("20 A");
  });

  it("does not cross a model label into a serial label on the next line", () => {
    const result = parseNameplateText(`
      MODEL
      SERIAL NO. 1234567890
      208/230 VAC
    `);

    expect(result.fields.model).toBe("");
    expect(result.fields.serial).toBe("1234567890");
    expect(result.warnings[0]).toContain("No model number");
  });

  it("does not copy a serial-only value into the model field", () => {
    const result = parseNameplateText("SERIAL NO. 23145AB7F\n208/230 VAC");

    expect(result.fields.serial).toBe("23145AB7F");
    expect(result.fields.model).toBe("");
    expect(result.warnings[0]).toContain("No model number");
  });

  it("uses a conservative fallback candidate when the model label is unreadable", () => {
    const result = parseNameplateText(`
      LENNOX INDUSTRIES
      ML17XC1-036-230A01
      208/230 VOLTS
    `);

    expect(result.fields.model).toBe("ML17XC1-036-230A01");
    expect(result.confidence.model).toBe(0.5);
  });

  it("returns explicit missing-field warnings rather than fabricated values", () => {
    const result = parseNameplateText("UL LISTED CENTRAL AIR CONDITIONER\n60 HZ");

    expect(result.fields.model).toBe("");
    expect(result.fields.serial).toBe("");
    expect(result.warnings).toHaveLength(2);
  });
});

describe("vision result normalization", () => {
  it("rejects empty normalized output as unusable", () => {
    expect(hasUsableNameplateData(normalizeVisionExtraction({}))).toBe(false);
    expect(hasUsableNameplateData(normalizeVisionExtraction({ rawText: "MODEL unreadable" }))).toBe(true);
  });

  it("drops unknown types, clamps confidence, and limits untrusted output", () => {
    const result = normalizeVisionExtraction({
      fields: { model: "  4TTR6036N1000A  ", serial: 1234, voltage: "208/230 V\n" },
      confidence: { model: 2, voltage: -1 },
      evidence: { model: "MODEL 4TTR6036N1000A" },
      warnings: ["Check glare", 42],
    });

    expect(result.fields.model).toBe("4TTR6036N1000A");
    expect(result.fields.serial).toBe("");
    expect(result.fields.voltage).toBe("208/230 V");
    expect(result.confidence.model).toBe(1);
    expect(result.confidence.voltage).toBe(0);
    expect(result.evidence.model).toBe("MODEL 4TTR6036N1000A");
    expect(result.warnings).toContain("Check glare");
    expect(result.warnings).toContain("AI vision did not identify a serial number.");
  });

  it("fills empty vision fields from deterministic OCR without overwriting vision values", () => {
    const primary = {
      fields: { ...EMPTY_NAMEPLATE_FIELDS, model: "VISION-MODEL" },
      confidence: { ...EMPTY_NAMEPLATE_CONFIDENCE, model: 0.91 },
      evidence: { model: "MODEL VISION-MODEL" },
      rawText: "SERIAL NO. 1234567890\nR-410A",
      warnings: [],
    };
    const fallback = parseNameplateText(primary.rawText);
    const merged = mergeNameplateExtractions(primary, fallback);

    expect(merged.fields.model).toBe("VISION-MODEL");
    expect(merged.fields.serial).toBe("1234567890");
    expect(merged.fields.refrigerant).toBe("R-410A");
  });

  it("preserves actionable provider warnings when merging extraction methods", () => {
    const primary = {
      fields: { ...EMPTY_NAMEPLATE_FIELDS, model: "VISION-MODEL", serial: "VISION-SERIAL" },
      confidence: { ...EMPTY_NAMEPLATE_CONFIDENCE, model: 0.91, serial: 0.9 },
      evidence: {},
      rawText: "MODEL VISION-MODEL\nSERIAL VISION-SERIAL",
      warnings: ["Glare obscures the electrical ratings."],
    };
    const merged = mergeNameplateExtractions(primary, parseNameplateText(primary.rawText));

    expect(merged.warnings).toContain("Glare obscures the electrical ratings.");
  });
});

describe("formatNameplateSummary", () => {
  it("includes only populated reviewed fields", () => {
    const summary = formatNameplateSummary({
      ...EMPTY_NAMEPLATE_FIELDS,
      manufacturer: "Trane",
      model: "4TWR6036N1000A",
      serial: "23145AB7F",
    });

    expect(summary).toBe("Manufacturer: Trane\nModel: 4TWR6036N1000A\nSerial: 23145AB7F");
  });
});
