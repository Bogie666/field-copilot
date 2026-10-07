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

  it("recovers identifiers when OCR confuses letters in the labels", () => {
    const result = parseNameplateText(`
      CARRIER CORPORATION
      M0DEL N0: 24ACC636A003
      SERlAL N0: 1923E12345
      REFRIGERANT R 410 A
      208 / 230 V 1 PH 60 HZ
    `);

    expect(result.fields.model).toBe("24ACC636A003");
    expect(result.fields.serial).toBe("1923E12345");
    expect(result.fields.refrigerant).toBe("R-410A");
    expect(result.fields.voltage).toBe("208/230 V");
  });

  it("joins an identifier split into chunks by OCR", () => {
    const result = parseNameplateText(`
      LENNOX
      MODEL NO. ML17XC1 036 230A01
      SERIAL NO. 5823 D 12345
    `);

    expect(result.fields.model).toBe("ML17XC1036230A01");
    expect(result.fields.serial).toBe("5823D12345");
  });

  it("maps model and serial values printed below paired table headings", () => {
    const result = parseNameplateText(`
      AMERICAN STANDARD
      MODEL NUMBER        SERIAL NUMBER
      4A7A6036N1000A      23145AB7F
      208/230 VAC 1 PH 60 HZ
    `);

    expect(result.fields.model).toBe("4A7A6036N1000A");
    expect(result.fields.serial).toBe("23145AB7F");
  });

  it("extracts identifiers when both labels and values share one OCR line", () => {
    const result = parseNameplateText("MODEL: GSXN403610 SERIAL: 2404123456");

    expect(result.fields.model).toBe("GSXN403610");
    expect(result.fields.serial).toBe("2404123456");
  });

  it("stops identifiers before ratings on the same OCR line", () => {
    const result = parseNameplateText(`
      MODEL: 24ACC636A003 208/230 V 1 PH 60 HZ
      SERIAL: 1923E12345 MAX FUSE 30 AMPS
    `);

    expect(result.fields.model).toBe("24ACC636A003");
    expect(result.fields.serial).toBe("1923E12345");
  });

  it("does not treat electrical ratings below missing identifiers as identifiers", () => {
    const spaced = parseNameplateText(`
      MODEL NUMBER        SERIAL NUMBER
      208/230 VAC 1 PH 60 HZ
    `);
    const compact = parseNameplateText(`
      MODEL NUMBER        SERIAL NUMBER
      208/230VAC 1PH 60HZ
    `);
    const compactSingleVoltage = parseNameplateText(`
      MODEL NUMBER        SERIAL NUMBER
      208VAC 1PH 60HZ
    `);

    expect(spaced.fields.model).toBe("");
    expect(spaced.fields.serial).toBe("");
    expect(compact.fields.model).toBe("");
    expect(compact.fields.serial).toBe("");
    expect(compactSingleVoltage.fields.model).toBe("");
    expect(compactSingleVoltage.fields.serial).toBe("");
  });

  it("stops identifiers before compact amp ratings without rejecting an identifier ending in A", () => {
    const result = parseNameplateText("MODEL: TEST1234 5.8 A\nSERIAL: 987654321A");

    expect(result.fields.model).toBe("TEST1234");
    expect(result.fields.serial).toBe("987654321A");
  });

  it("does not treat a voltage below a single model label as a model", () => {
    const result = parseNameplateText("MODEL NUMBER\n208/230 VAC 1 PH 60 HZ");

    expect(result.fields.model).toBe("");
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
    const sameLine = parseNameplateText("SERIAL NO. 23145AB7F\n208/230 VAC");
    const splitLine = parseNameplateText("SERIAL NO.\n23145AB7F");
    const damagedSplitLine = parseNameplateText("sen wo.\n23351TCCJF");

    expect(sameLine.fields.serial).toBe("23145AB7F");
    expect(sameLine.fields.model).toBe("");
    expect(sameLine.warnings[0]).toContain("No model number");
    expect(splitLine.fields).toMatchObject({ model: "", serial: "23145AB7F" });
    expect(damagedSplitLine.fields).toMatchObject({ model: "", serial: "23351TCCJF" });
  });

  it("keeps a damaged serial label from becoming a fallback model", () => {
    const result = parseNameplateText("sen wo. 23351TCCJF");

    expect(result.fields.serial).toBe("23351TCCJF");
    expect(result.fields.model).toBe("");
  });

  it("requires a number suffix on fuzzy serial labels and rejects ambiguous identifier glyphs", () => {
    expect(parseNameplateText("SEAN 12345678").fields.serial).toBe("");
    expect(parseNameplateText("SEN SENSOR1234").fields.serial).toBe("");
    expect(parseNameplateText("SERIAL NO. AB|234").fields.serial).toBe("");
    expect(parseNameplateText("ABC123|DEF456").fields.model).toBe("");

    const paired = parseNameplateText("MODEL NUMBER SERIAL NUMBER\nABCD|1234 EFGH5678");
    expect(paired.fields.model).toBe("");
    expect(paired.fields.serial).toBe("");
  });

  it("requires electrical context for heavily corrupted frequency labels", () => {
    expect(parseNameplateText("WI 60").fields.frequency).toBe("");
    expect(parseNameplateText("HU 60").fields.frequency).toBe("");
    expect(parseNameplateText("PH~ 1 WI 60").fields.frequency).toBe("60 Hz");
  });

  it("does not attach installation dates to a separated manufacture-date label", () => {
    const result = parseNameplateText("MFR DATE\nMODEL ABC123\nINSTALL DATE 9/2024");

    expect(result.fields.manufacturedDate).toBe("");
    expect(parseNameplateText("MFR DATE INSTALL DATE 9/2024").fields.manufacturedDate).toBe("");
    expect(parseNameplateText("MFR DATE SERVICE DATE 9/2024").fields.manufacturedDate).toBe("");
    expect(parseNameplateText("DATE 8/2023").fields.manufacturedDate).toBe("8/2023");
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

  it("recovers ratings from a real Trane OCR pass with damaged and split labels", () => {
    const result = parseNameplateText(`
      ££" TRANE X\\/ MFR DATE
      — 8/2023
      woo wo. ATTV7X48A1000AA vous 208-230
      sen wo. 23351TCCJF PH~ 1 Wi 60
      MINIMUM CIRCUIT AMPACITY 42.0 AMPS
      MAX FUSE / BREAKER (HACR) 45 45
      HFC —~ 410A 11s 09 02. OR 5.24 kg(SI)
      COMPR. MOT. 20.3 ALA 208-230 § 12.0 LRA
    `);

    expect(result.fields).toMatchObject({
      manufacturer: "Trane",
      model: "ATTV7X48A1000AA",
      serial: "23351TCCJF",
      manufacturedDate: "8/2023",
      refrigerant: "R-410A",
      voltage: "208-230 V",
      phase: "1 phase",
      frequency: "60 Hz",
      mca: "42.0 A",
      maxFuseBreaker: "45 A",
      rla: "20.3 A",
      lra: "12.0 A",
    });
  });

  it("rejects only the exact sparse-pass RLA fragment and preserves source order", () => {
    expect(parseNameplateText("COMPH\n3 RLA").fields.rla).toBe("");
    expect(parseNameplateText("COMPH 2\n3 RLA").fields.rla).toBe("3 A");
    expect(parseNameplateText("COMP H\n3 RLA").fields.rla).toBe("3 A");
    expect(parseNameplateText("COMPRESSOR\n3 RLA").fields.rla).toBe("3 A");
    expect(parseNameplateText("COMPR. MOT. 20.3 RLA 208-230 | 12.0 LRA").fields.rla).toBe("20.3 A");
    expect(parseNameplateText("RLA 12.3\nCOMPRESSOR 2: 9.1 RLA").fields.rla).toBe("12.3 A");
    expect(parseNameplateText("COMPRESSOR 1 RLA 12.3 LRA 64").fields.rla).toBe("12.3 A");
    expect(parseNameplateText("RLA 12.3 9.1 RLA").fields.rla).toBe("12.3 A");
  });

  it("does not treat ordinary prose or malformed mixed ranges as voltage", () => {
    expect(parseNameplateText("YOURS 230").fields.voltage).toBe("");
    expect(parseNameplateText("VOS 208/-230").fields.voltage).toBe("");
    expect(parseNameplateText("208/-230 V").fields.voltage).toBe("");
    expect(parseNameplateText("VOS 208/-230 V").fields.voltage).toBe("");
    expect(parseNameplateText("VOS 208 --230").fields.voltage).toBe("208-230 V");
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
