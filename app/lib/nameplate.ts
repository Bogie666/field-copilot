export const NAMEPLATE_FIELD_KEYS = [
  "manufacturer",
  "model",
  "serial",
  "equipmentType",
  "manufacturedDate",
  "refrigerant",
  "voltage",
  "phase",
  "frequency",
  "mca",
  "maxFuseBreaker",
  "rla",
  "lra",
  "capacity",
] as const;

export type NameplateFieldKey = (typeof NAMEPLATE_FIELD_KEYS)[number];
export type NameplateFields = Record<NameplateFieldKey, string>;
export type NameplateConfidence = Record<NameplateFieldKey, number>;
export type NameplateEvidence = Partial<Record<NameplateFieldKey, string>>;

export type NameplateExtraction = {
  fields: NameplateFields;
  confidence: NameplateConfidence;
  evidence: NameplateEvidence;
  rawText: string;
  warnings: string[];
};

export const EMPTY_NAMEPLATE_FIELDS: NameplateFields = {
  manufacturer: "",
  model: "",
  serial: "",
  equipmentType: "",
  manufacturedDate: "",
  refrigerant: "",
  voltage: "",
  phase: "",
  frequency: "",
  mca: "",
  maxFuseBreaker: "",
  rla: "",
  lra: "",
  capacity: "",
};

export const EMPTY_NAMEPLATE_CONFIDENCE: NameplateConfidence = Object.fromEntries(
  NAMEPLATE_FIELD_KEYS.map((key) => [key, 0]),
) as NameplateConfidence;

const MANUFACTURERS: Array<[RegExp, string]> = [
  [/\bTRANE\b/i, "Trane"],
  [/\bAMERICAN\s+STANDARD\b/i, "American Standard"],
  [/\bLENNOX\b/i, "Lennox"],
  [/\bCARRIER\b/i, "Carrier"],
  [/\bBRYANT\b/i, "Bryant"],
  [/\bGOODMAN\b/i, "Goodman"],
  [/\bAMANA\b/i, "Amana"],
  [/\bDAIKIN\b/i, "Daikin"],
  [/\bRHEEM\b/i, "Rheem"],
  [/\bRUUD\b/i, "Ruud"],
  [/\bYORK\b/i, "York"],
  [/\bCOLEMAN\b/i, "Coleman"],
  [/\bICP\b|\bINTERNATIONAL\s+COMFORT\s+PRODUCTS\b/i, "International Comfort Products"],
  [/\bMITSUBISHI(?:\s+ELECTRIC)?\b/i, "Mitsubishi Electric"],
  [/\bFUJITSU\b/i, "Fujitsu"],
  [/\bLG(?:\s+ELECTRONICS)?\b/i, "LG"],
  [/\bBOSCH\b/i, "Bosch"],
  [/\bNAVIEN\b/i, "Navien"],
  [/\bRINNAI\b/i, "Rinnai"],
  [/\bAO\s*SMITH\b/i, "A. O. Smith"],
];

const EQUIPMENT_TYPES: Array<[RegExp, string]> = [
  [/\bHEAT\s*PUMP\b/i, "Heat pump"],
  [/\bAIR\s*CONDITION(?:ER|ING)\b|\bCONDENSING\s+UNIT\b/i, "Air conditioner"],
  [/\bGAS\s+FURNACE\b|\bFURNACE\b/i, "Furnace"],
  [/\bAIR\s+HANDLER\b|\bFAN\s+COIL\b/i, "Air handler"],
  [/\bPACKAGED\s+(?:UNIT|SYSTEM)\b/i, "Packaged unit"],
  [/\bMINI[- ]?SPLIT\b|\bDUCTLESS\b/i, "Mini-split"],
  [/\bWATER\s+HEATER\b/i, "Water heater"],
  [/\bBOILER\b/i, "Boiler"],
];

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeLine(line: string): string {
  return line
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[|]+/g, "I")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanCandidate(value: string): string {
  return value
    .trim()
    .replace(/^[\s:#=.-]+/, "")
    .replace(/[\s,;:.]+$/, "")
    .replace(/\s*([/_.-])\s*/g, "$1")
    .toUpperCase();
}

function labeledValue(
  lines: string[],
  label: RegExp,
  value: RegExp = /([A-Z0-9][A-Z0-9/_.-]{3,})/i,
): { value: string; line: string; confidence: number } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const direct = line.match(new RegExp(`${label.source}\\s*(?:NO\\.?|NUMBER)?\\s*[:#=.-]?\\s*${value.source}`, "i"));
    if (direct?.[1]) {
      return { value: cleanCandidate(direct[1]), line, confidence: 0.94 };
    }

    if (new RegExp(`^\\s*${label.source}\\s*(?:NO\\.?|NUMBER)?\\s*[:#=.-]?\\s*$`, "i").test(line)) {
      const nextLine = lines[index + 1] || "";
      const next = nextLine.match(new RegExp(`^\\s*${value.source}`, "i"));
      const candidate = next?.[1] ? cleanCandidate(next[1]) : "";
      if (candidate && !/^(?:MODEL|MOD|MDL|SERIAL|SER|VOLTAGE|PHASE|REFRIGERANT|MCA|MOCP)$/i.test(candidate)) {
        return { value: candidate, line: `${line} ${nextLine}`, confidence: 0.72 };
      }
    }
  }
  return null;
}

function firstPattern(
  lines: string[],
  pattern: RegExp,
  format: (match: RegExpMatchArray) => string = (match) => match[1] || match[0],
): { value: string; line: string } | null {
  for (const line of lines) {
    const match = line.match(pattern);
    if (match) return { value: format(match), line };
  }
  return null;
}

const REJECTED_FALLBACK_TOKENS = /^(?:AHRI|ANSI|ASHRAE|UL|ETL|CSA|FCC|HVAC|BTUH?|R\d{2,4}A?|VAC|VOLT|HERTZ|PHASE|MODEL|SERIAL)$/i;

function fallbackModel(lines: string[]): { value: string; line: string; confidence: number } | null {
  const candidates: Array<{ value: string; line: string; score: number }> = [];
  for (const line of lines) {
    if (/(?:\bSER(?:IAL)?\b|S\s*\/\s*N|VOLT(?:AGE|S)?|REFRIGERANT|\bMCA\b|\bMOCP\b|MAX(?:IMUM)?\s+(?:FUSE|BREAKER)|\bRLA\b|\bLRA\b|CAPACITY|BTU)/i.test(line)) continue;
    const tokens = line.toUpperCase().match(/\b[A-Z0-9][A-Z0-9/_.-]{5,24}\b/g) || [];
    for (const token of tokens) {
      if (REJECTED_FALLBACK_TOKENS.test(token)) continue;
      if (/^\d+(?:\.\d+)?$/.test(token)) continue;
      if (!/[A-Z]/.test(token) || !/\d/.test(token)) continue;
      if (/^(?:208|230|240|460|480)[/-]/.test(token)) continue;
      let score = 0;
      if (token.length >= 8 && token.length <= 20) score += 2;
      if (/[-/]/.test(token)) score += 1;
      if (/\d{2,}/.test(token)) score += 1;
      if (/MODEL|M\/N/i.test(line)) score += 4;
      candidates.push({ value: cleanCandidate(token), line, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.value.length - a.value.length);
  return candidates[0] ? { ...candidates[0], confidence: 0.5 } : null;
}

function setResult(
  extraction: NameplateExtraction,
  key: NameplateFieldKey,
  value: string,
  confidence: number,
  evidence?: string,
) {
  const normalized = value.trim();
  if (!normalized) return;
  extraction.fields[key] = normalized;
  extraction.confidence[key] = clampConfidence(confidence);
  if (evidence) extraction.evidence[key] = evidence;
}

export function parseNameplateText(rawText: string): NameplateExtraction {
  const normalizedText = String(rawText || "").replace(/\u0000/g, "").trim();
  const lines = normalizedText.split(/\r?\n/).map(normalizeLine).filter(Boolean);
  const extraction: NameplateExtraction = {
    fields: { ...EMPTY_NAMEPLATE_FIELDS },
    confidence: { ...EMPTY_NAMEPLATE_CONFIDENCE },
    evidence: {},
    rawText: normalizedText,
    warnings: [],
  };

  for (const [pattern, manufacturer] of MANUFACTURERS) {
    const line = lines.find((item) => pattern.test(item));
    if (line) {
      setResult(extraction, "manufacturer", manufacturer, 0.96, line);
      break;
    }
  }

  for (const [pattern, equipmentType] of EQUIPMENT_TYPES) {
    const line = lines.find((item) => pattern.test(item));
    if (line) {
      setResult(extraction, "equipmentType", equipmentType, 0.9, line);
      break;
    }
  }

  const model = labeledValue(lines, /(?:MODEL|MOD|MDL|M\s*[/.]\s*N)/i);
  const serial = labeledValue(lines, /(?:SERIAL|SER|S\s*[/.]\s*N)/i);
  const modelCandidate = model || fallbackModel(lines);
  if (modelCandidate) setResult(extraction, "model", modelCandidate.value, modelCandidate.confidence, modelCandidate.line);
  if (serial) setResult(extraction, "serial", serial.value, serial.confidence, serial.line);

  const refrigerant = firstPattern(lines, /\bR\s*[- ]?\s*(22|32|1234YF|134A|404A|407A|407C|410A|454B|507A)\b/i, (match) => `R-${match[1].toUpperCase()}`);
  if (refrigerant) setResult(extraction, "refrigerant", refrigerant.value, 0.96, refrigerant.line);

  const voltage = firstPattern(
    lines,
    /\b((?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600)(?:\s*[/\-]\s*(?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600))?)\s*(?:V(?:AC)?|VOLTS?)\b/i,
    (match) => `${match[1].replace(/\s/g, "")} V`,
  );
  if (voltage) setResult(extraction, "voltage", voltage.value, 0.92, voltage.line);

  const phase = firstPattern(lines, /\b(?:PHASE|PH|Ø)\s*[:#=.-]?\s*([13])\b|\b([13])\s*(?:PHASE|PH|Ø)\b/i, (match) => `${match[1] || match[2]} phase`);
  if (phase) setResult(extraction, "phase", phase.value, 0.9, phase.line);

  const frequency = firstPattern(lines, /\b(?:HZ|HERTZ)\s*[:#=.-]?\s*(50|60)\b|\b(50|60)\s*(?:HZ|HERTZ)\b/i, (match) => `${match[1] || match[2]} Hz`);
  if (frequency) setResult(extraction, "frequency", frequency.value, 0.92, frequency.line);

  const mca = firstPattern(lines, /\b(?:MCA|MIN(?:IMUM)?\s+CIRCUIT\s+AMP(?:ACITY|S)?)\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`);
  if (mca) setResult(extraction, "mca", mca.value, 0.94, mca.line);

  const maxFuse = firstPattern(lines, /\b(?:MOCP|MAX(?:IMUM)?\s+(?:FUSE|BREAKER|OVERCURRENT(?:\s+PROTECTION)?)|MAX\s+CKT\s+BKR)\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`);
  if (maxFuse) setResult(extraction, "maxFuseBreaker", maxFuse.value, 0.94, maxFuse.line);

  const rla = firstPattern(lines, /\bRLA\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`);
  if (rla) setResult(extraction, "rla", rla.value, 0.94, rla.line);

  const lra = firstPattern(lines, /\bLRA\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`);
  if (lra) setResult(extraction, "lra", lra.value, 0.94, lra.line);

  const capacity = firstPattern(lines, /\b(\d{2,6}(?:,\d{3})?)\s*(BTU(?:\/H|H)?|MBH)\b/i, (match) => `${match[1]} ${match[2].toUpperCase()}`);
  if (capacity) setResult(extraction, "capacity", capacity.value, 0.86, capacity.line);

  const manufacturedDate = firstPattern(lines, /\b(?:MFG|MFD|MANUFACTURED|DATE)\s*(?:DATE)?\s*[:#=.-]?\s*((?:0?[1-9]|1[0-2])[/-](?:19|20)?\d{2}|(?:19|20)\d{2}[/-](?:0?[1-9]|1[0-2]))\b/i);
  if (manufacturedDate) setResult(extraction, "manufacturedDate", manufacturedDate.value, 0.82, manufacturedDate.line);

  if (!extraction.fields.model) extraction.warnings.push("No model number was identified. Verify the image is sharp and the full plate is visible.");
  if (!extraction.fields.serial) extraction.warnings.push("No serial number was identified. Enter it manually or retake the photo closer to the plate.");
  if (!normalizedText) extraction.warnings.push("No readable text was returned from the image.");

  return extraction;
}

function readString(record: Record<string, unknown>, key: NameplateFieldKey): string {
  const value = record[key];
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

export function normalizeVisionExtraction(value: unknown): NameplateExtraction {
  const record = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const fieldRecord = record.fields && typeof record.fields === "object" ? record.fields as Record<string, unknown> : record;
  const confidenceRecord = record.confidence && typeof record.confidence === "object" ? record.confidence as Record<string, unknown> : {};
  const evidenceRecord = record.evidence && typeof record.evidence === "object" ? record.evidence as Record<string, unknown> : {};
  const fields = { ...EMPTY_NAMEPLATE_FIELDS };
  const confidence = { ...EMPTY_NAMEPLATE_CONFIDENCE };
  const evidence: NameplateEvidence = {};

  for (const key of NAMEPLATE_FIELD_KEYS) {
    fields[key] = readString(fieldRecord, key);
    confidence[key] = fields[key] ? clampConfidence(confidenceRecord[key]) : 0;
    const evidenceValue = evidenceRecord[key];
    if (typeof evidenceValue === "string" && evidenceValue.trim()) evidence[key] = evidenceValue.trim().slice(0, 240);
  }

  const rawText = typeof record.rawText === "string" ? record.rawText.replace(/\u0000/g, "").trim().slice(0, 20_000) : "";
  const warnings = Array.isArray(record.warnings)
    ? record.warnings.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 240)).filter(Boolean).slice(0, 8)
    : [];

  if (!fields.model) warnings.push("AI vision did not identify a model number.");
  if (!fields.serial) warnings.push("AI vision did not identify a serial number.");

  return { fields, confidence, evidence, rawText, warnings: Array.from(new Set(warnings)) };
}

export function mergeNameplateExtractions(primary: NameplateExtraction, fallback: NameplateExtraction): NameplateExtraction {
  const merged: NameplateExtraction = {
    fields: { ...primary.fields },
    confidence: { ...primary.confidence },
    evidence: { ...primary.evidence },
    rawText: primary.rawText || fallback.rawText,
    warnings: [],
  };

  for (const key of NAMEPLATE_FIELD_KEYS) {
    if (!merged.fields[key] && fallback.fields[key]) {
      merged.fields[key] = fallback.fields[key];
      merged.confidence[key] = fallback.confidence[key];
      merged.evidence[key] = fallback.evidence[key];
    }
  }

  const identifierWarning = /(?:did not identify|no)\s+(?:a\s+)?(?:model|serial)\s+number/i;
  merged.warnings = Array.from(new Set(
    [...primary.warnings, ...fallback.warnings].filter((warning) => !identifierWarning.test(warning)),
  ));
  if (!merged.fields.model) merged.warnings.push("No model number was identified. Verify it directly on the plate.");
  if (!merged.fields.serial) merged.warnings.push("No serial number was identified. Verify it directly on the plate.");
  return merged;
}

export function hasUsableNameplateData(extraction: NameplateExtraction): boolean {
  return Boolean(extraction.rawText.trim()) || NAMEPLATE_FIELD_KEYS.some((key) => extraction.fields[key].trim());
}

export function formatNameplateSummary(fields: NameplateFields): string {
  const labels: Record<NameplateFieldKey, string> = {
    manufacturer: "Manufacturer",
    model: "Model",
    serial: "Serial",
    equipmentType: "Equipment type",
    manufacturedDate: "Manufactured date",
    refrigerant: "Refrigerant",
    voltage: "Voltage",
    phase: "Phase",
    frequency: "Frequency",
    mca: "MCA",
    maxFuseBreaker: "Max fuse / breaker",
    rla: "RLA",
    lra: "LRA",
    capacity: "Capacity",
  };

  return NAMEPLATE_FIELD_KEYS
    .filter((key) => fields[key].trim())
    .map((key) => `${labels[key]}: ${fields[key].trim()}`)
    .join("\n");
}
