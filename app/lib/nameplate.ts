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
  /** Conflicting printed values must not be rescued by another OCR pass. */
  conflicts?: NameplateFieldKey[];
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

// Whole headings/type fields only. A mention in instructions or compatibility text
// does not identify the unit, and a generic furnace does not establish its fuel.
const EQUIPMENT_TYPES: Array<[RegExp, string]> = [
  [/^(?:(?:CENTRAL|SPLIT[- ]SYSTEM) )?HEAT ?PUMP(?: (?:UNIT|OUTDOOR UNIT))?$/i, "Heat pump"],
  [/^(?:(?:CENTRAL|SPLIT[- ]SYSTEM) )?AIR CONDITION(?:ER|ING)(?: UNIT)?$|^CONDENSING UNIT$/i, "Air conditioner"],
  [/^(?:(?:NATURAL|LP) )?GAS FURNACE$|^PROPANE FURNACE$/i, "Gas furnace"],
  [/^ELECTRIC(?:AL)? FURNACE$/i, "Electric furnace"],
  [/^FURNACE$/i, "Furnace"],
  [/^AIR ?HANDLER$|^AIR HANDLING UNIT$|^FAN COIL(?: UNIT)?$/i, "Air handler"],
  [/^PACKAGE[D]? (?:UNIT|SYSTEM)$/i, "Packaged unit"],
  [/^(?:DUCTLESS )?MINI[- ]?SPLIT(?: SYSTEM)?$|^DUCTLESS(?: SYSTEM)?$/i, "Mini-split"],
  [/^EVAPORATOR(?: COIL)?$/i, "Evaporator coil"],
  [/^WATER HEATER$/i, "Water heater"],
  [/^(?:(?:GAS|ELECTRIC|HOT WATER|STEAM) )?BOILER$/i, "Boiler"],
];
const EQUIPMENT_TYPE_LABEL = /^(?:(?:EQUIPMENT|UNIT|SYSTEM|PRODUCT)\s+)?TYPE\b\s*[:#=.-]?\s*/i;
const EQUIPMENT_MENTIONS = /\b(?:HEAT\s*PUMP|AIR\s*CONDITION(?:ER|ING)|CONDENSING\s+UNIT|(?:(?:NATURAL|LP)\s+)?GAS\s+FURNACE|PROPANE\s+FURNACE|ELECTRIC(?:AL)?\s+FURNACE|FURNACE|AIR\s*HANDLER|AIR\s+HANDLING\s+UNIT|FAN\s+COIL(?:\s+UNIT)?|PACKAGED?\s+(?:UNIT|SYSTEM)|(?:DUCTLESS\s+)?MINI[- ]?SPLIT(?:\s+SYSTEM)?|DUCTLESS(?:\s+SYSTEM)?|EVAPORATOR(?:\s+COIL)?|WATER\s+HEATER|(?:(?:GAS|ELECTRIC|HOT\s+WATER|STEAM)\s+)?BOILER)\b/gi;

type PrintedCandidate = { value: string; line: string };

function equipmentTypeCandidates(lines: string[]): PrintedCandidate[] {
  const candidates: PrintedCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = EQUIPMENT_TYPE_LABEL.exec(line);
    let heading = label ? line.slice(label[0].length) : line;
    let evidence = line;
    if (label && !heading) {
      heading = lines[index + 1] || "";
      evidence += ` ${heading}`;
    }
    heading = heading.replace(/^(?:(?:UL|ETL|CSA)\s+)?(?:LISTED|CERTIFIED)\s+/i, "").replace(/[.:;]+$/, "").trim();
    const matched = EQUIPMENT_TYPES.find(([pattern]) => pattern.test(heading));
    if (matched) {
      candidates.push({ value: matched[1], line: evidence });
      continue;
    }

    // A heading that lists alternatives is ambiguous, even if another pass
    // drops one of those alternatives. Ignore unrelated instructional prose.
    const mentions = Array.from(heading.matchAll(EQUIPMENT_MENTIONS));
    const remainder = heading.replace(EQUIPMENT_MENTIONS, "").replace(/\b(?:OR|AND|CENTRAL|SPLIT[- ]SYSTEM)\b/gi, "").replace(/[\s/&,()+-]/g, "");
    if (mentions.length > 1 && !remainder) {
      for (const mention of mentions) {
        const type = EQUIPMENT_TYPES.find(([pattern]) => pattern.test(mention[0]));
        if (type) candidates.push({ value: type[1], line: evidence });
      }
    }
  }
  return candidates;
}

const MANUFACTURE_LABEL = /\b(?:(?:MFR|MFG|MFD)\.?(?:\s*DATE)?|MANUFACTURED(?:\s+(?:DATE|ON|IN))?|MANUFACTUR(?:E|ING)\s+DATE|DATE\s+OF\s+MANUFACTURE)\b/i;
const DATE_FIELD_BOUNDARY = /\b(?:MODEL|M[O0]DEL|MOD|MDL|SERIAL|SER[I1L]AL|S\/N|INSTALL(?:ED|ATION)?|SERVICE|INSPECT(?:ED|ION)?|WARRANTY|REPAIR|REPLACED|DATE|MFR|MFG|MFD|MANUFACTURED|MANUFACTURE|MANUFACTURING|REFRIGERANT|VOLT(?:AGE|S?)?|PHASE|HZ|MCA|MOCP|RLA|LRA|CAPACITY|MAX(?:IMUM)?\s+(?:FUSE|BREAKER))\b/i;

function printedDateCandidate(text: string): string {
  // Preserve the entire printed date, including unsupported or invalid dates.
  // The age helper validates it later; never turn 08/09/2023 into 08/09 or
  // 2023-08-15 into 2023-08 and accidentally invent a usable manufacture date.
  const value = text.replace(/^[\s:#=.|~-]+/, "").replace(/[\s,;.|]+$/, "").trim();
  if (/^[\d?]{1,4}(?:\s*[/.-]\s*[\d?]{1,4}){0,2}(?:\s+(?:OR|TO)\s+[\d?]{1,4}(?:\s*[/.-]\s*[\d?]{1,4}){0,2})?$/i.test(value)) return value;
  if (/^(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)\.?\s+(?:\d{1,2},?\s+)?\d{4}$/i.test(value)) return value;
  if (/^(?:UNKNOWN|UNREADABLE|ILLEGIBLE|N\/A)$/i.test(value)) return value;
  return "";
}

function manufacturedDateCandidates(lines: string[]): PrintedCandidate[] {
  const candidates: PrintedCandidate[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    for (const label of lines[index].matchAll(new RegExp(MANUFACTURE_LABEL.source, "gi"))) {
      const tail = lines[index].slice(label.index! + label[0].length);
      const boundary = DATE_FIELD_BOUNDARY.exec(tail);
      const value = printedDateCandidate(boundary ? tail.slice(0, boundary.index) : tail);
      if (value) {
        candidates.push({ value, line: lines[index] });
        continue;
      }
      // Only a genuinely empty label may borrow a standalone value below it.
      // Do not cross any other labeled field to find a nearby date.
      if (tail.replace(/[^A-Z0-9]/gi, "")) continue;
      for (let next = index + 1; next <= Math.min(index + 2, lines.length - 1); next += 1) {
        if (DATE_FIELD_BOUNDARY.test(lines[next])) break;
        const below = printedDateCandidate(lines[next]);
        if (below) {
          candidates.push({ value: below, line: lines.slice(index, next + 1).join(" ") });
          break;
        }
        // Tolerate a short isolated OCR fragment (the real plate produces "Pr"),
        // not an intervening instruction or a different unlabeled field.
        if (!/^[^A-Z0-9]*[A-Z]{1,3}[^A-Z0-9]*$/i.test(lines[next])) break;
      }
    }
  }
  return candidates;
}

function setUnambiguousPrintedValue(
  extraction: NameplateExtraction,
  key: "equipmentType" | "manufacturedDate",
  candidates: PrintedCandidate[],
  confidence: number,
) {
  const values = new Set(candidates.map(({ value }) => value.toUpperCase()));
  if (values.size > 1) {
    (extraction.conflicts ??= []).push(key);
    const label = key === "equipmentType" ? "equipment types" : "manufacture dates";
    extraction.warnings.push(`Conflicting ${label} were identified. Verify the printed value before selecting it.`);
  } else if (candidates[0]) {
    setResult(extraction, key, candidates[0].value, confidence, candidates[0].line);
  }
}

function clampConfidence(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(1, numeric));
}

function normalizeLine(line: string): string {
  return line
    .replace(/[\u2010-\u2015]/g, "-")
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

const MODEL_LABEL = /(?:\bM[O0]DEL\b|\bMOD(?:EL)?\b|\bMDL\b|\bM\s*[/.]\s*N\b)/i;
// Tesseract commonly turns "SER NO." into "sen wo." or "sean 0." on small stamped plates.
// Keep fuzzy substitutions confined to the complete label, never the identifier candidate.
const SERIAL_LABEL = /(?:\bSER[I1L]AL(?=\s|[:#=.-]|N[O0]\b|NUMBER\b)(?:\s*(?:N[O0]\.?|NUMBER))?|\bSER\b|\bS\s*[/.]\s*N\b|\bSE(?:N|AN)\b\s+(?:[NW][O0]|[O0])\.?)/i;
const IDENTIFIER_STOP_TOKEN = /^(?:MODEL|M0DEL|MOD|MDL|SERIAL|SERLAL|SER1AL|SER|REFRIGERANT|REFRIG|VOLTAGE|VOLTS?|V|VAC|PHASE|PH|HZ|HERTZ|MCA|MOCP|RLA|LRA|CAPACITY|BTU|BTUH|DATE|MFG|MFD|MAX|MAXIMUM|FUSE|BREAKER|BKR|AMPS?|CKT|CIRCUIT)$/i;
const RATING_VALUE_TOKEN = /^(?:(?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600)(?:[/-](?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600))?(?:V(?:AC)?|VOLTS?)?|[13](?:PH|PHASE)|(?:50|60)(?:HZ|HERTZ)|\d+\.\d+(?:A|AMPS?)?|\d+(?:\.\d+)?(?:AMPS?|BTUH?|MBH|TONS?))$/i;

function identifierCandidate(text: string): string {
  const cleaned = text
    .replace(/^\s*[:#=.-]*\s*(?:(?:N[O0]\.?|NUMBER|NUM(?:BER)?)\s*)?[:#=.-]?\s*/i, "")
    .trim();
  if (!cleaned) return "";
  if (/[|]/.test(cleaned)) return "";

  const tokens = cleaned.match(/[A-Z0-9][A-Z0-9/_.-]*/gi) || [];
  const chunks: string[] = [];
  for (const token of tokens) {
    if (IDENTIFIER_STOP_TOKEN.test(token) || RATING_VALUE_TOKEN.test(token) || (chunks.length > 0 && /^\d{1,3}A$/i.test(token))) break;
    if (/^(?:N[O0]|NUMBER|NUM)$/i.test(token) && chunks.length === 0) continue;
    if (!/^[A-Z0-9][A-Z0-9/_.-]*$/i.test(token)) break;
    if (!/\d/.test(token) && token.length > 3) break;
    if (!/\d/.test(token) && chunks.length > 0 && token.length > 1) break;
    chunks.push(token);
    if (chunks.join("").length >= 32 || chunks.length >= 5) break;
  }

  const candidate = cleanCandidate(chunks.join(""));
  if (candidate.length < 4 || candidate.length > 40 || !/\d/.test(candidate) || RATING_VALUE_TOKEN.test(candidate)) return "";
  return candidate;
}

function pairedIdentifiers(lines: string[]): { model?: { value: string; line: string; confidence: number }; serial?: { value: string; line: string; confidence: number } } {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const modelMatch = MODEL_LABEL.exec(line);
    const serialMatch = SERIAL_LABEL.exec(line);
    if (!modelMatch || !serialMatch) continue;

    const modelFirst = modelMatch.index < serialMatch.index;
    const first = modelFirst ? modelMatch : serialMatch;
    const second = modelFirst ? serialMatch : modelMatch;
    const firstValue = identifierCandidate(line.slice(first.index + first[0].length, second.index));
    const secondValue = identifierCandidate(line.slice(second.index + second[0].length));
    if (firstValue || secondValue) {
      return modelFirst
        ? {
            ...(firstValue ? { model: { value: firstValue, line, confidence: 0.94 } } : {}),
            ...(secondValue ? { serial: { value: secondValue, line, confidence: 0.94 } } : {}),
          }
        : {
            ...(secondValue ? { model: { value: secondValue, line, confidence: 0.94 } } : {}),
            ...(firstValue ? { serial: { value: firstValue, line, confidence: 0.94 } } : {}),
          };
    }

    const nextLine = lines[index + 1] || "";
    if (/[|]/.test(nextLine)) continue;
    const values = (nextLine.match(/[A-Z0-9][A-Z0-9/_.-]{3,}/gi) || [])
      .map(cleanCandidate)
      .filter((value) => /\d/.test(value) && !IDENTIFIER_STOP_TOKEN.test(value) && !RATING_VALUE_TOKEN.test(value));
    if (values.length >= 2) {
      return modelFirst
        ? {
            model: { value: values[0], line: `${line} ${nextLine}`, confidence: 0.78 },
            serial: { value: values[1], line: `${line} ${nextLine}`, confidence: 0.78 },
          }
        : {
            serial: { value: values[0], line: `${line} ${nextLine}`, confidence: 0.78 },
            model: { value: values[1], line: `${line} ${nextLine}`, confidence: 0.78 },
          };
    }
  }
  return {};
}

function labeledValue(
  lines: string[],
  label: RegExp,
): { value: string; line: string; confidence: number } | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (MODEL_LABEL.test(line) && SERIAL_LABEL.test(line)) continue;
    const match = new RegExp(label.source, "i").exec(line);
    if (!match) continue;

    const candidate = identifierCandidate(line.slice(match.index + match[0].length));
    if (candidate) return { value: candidate, line, confidence: 0.94 };

    const nextLine = lines[index + 1] || "";
    const nextCandidate = identifierCandidate(nextLine);
    const nextHasLabel = MODEL_LABEL.test(nextLine) || SERIAL_LABEL.test(nextLine) || IDENTIFIER_STOP_TOKEN.test(nextLine.split(/\s+/)[0] || "");
    if (nextCandidate && !nextHasLabel) {
      return { value: nextCandidate, line: `${line} ${nextLine}`, confidence: 0.72 };
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

function patternNearLabel(
  lines: string[],
  label: RegExp,
  value: RegExp,
  lookAhead = 2,
): { value: string; line: string } | null {
  const interveningField = /\b(?:MODEL|M[O0]DEL|MOD|MDL|SERIAL|SER[I1L]AL|INSTALL(?:ED|ATION)?|SERVICE|VOLT(?:AGE|S?)?|MCA|MOCP|MAX(?:IMUM)?\s+(?:FUSE|BREAKER))\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    const labelMatch = new RegExp(label.source, "i").exec(lines[index]);
    if (!labelMatch) continue;
    const last = Math.min(lines.length - 1, index + lookAhead);
    for (let candidateIndex = index; candidateIndex <= last; candidateIndex += 1) {
      const candidateLine = lines[candidateIndex];
      if (candidateIndex > index && interveningField.test(candidateLine)) break;
      const match = candidateLine.match(value);
      if (!match) continue;
      const isSameLine = candidateIndex === index;
      if (isSameLine) {
        const afterLabel = labelMatch.index + labelMatch[0].length;
        if ((match.index ?? -1) < afterLabel) continue;
        const between = candidateLine.slice(afterLabel, match.index).replace(/[^A-Z0-9]/gi, "");
        if (between) continue;
      }
      const remainder = candidateLine.replace(match[0], "").replace(/[^A-Z0-9]/gi, "");
      if (!isSameLine && remainder) continue;
      return {
        value: match[1] || match[0],
        line: lines.slice(index, candidateIndex + 1).join(" "),
      };
    }
  }
  return null;
}

const REJECTED_FALLBACK_TOKENS = /^(?:AHRI|ANSI|ASHRAE|UL|ETL|CSA|FCC|HVAC|BTUH?|R\d{2,4}A?|VAC|VOLT|HERTZ|PHASE|MODEL|SERIAL)$/i;

function fallbackModel(lines: string[]): { value: string; line: string; confidence: number } | null {
  const candidates: Array<{ value: string; line: string; score: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/[|]/.test(line)) continue;
    if (SERIAL_LABEL.test(line) || (index > 0 && SERIAL_LABEL.test(lines[index - 1]))) continue;
    if (/(?:\bSER(?:IAL)?\b|S\s*\/\s*N|VOLT(?:AGE|S)?|REFRIGERANT|\bMCA\b|\bMOCP\b|MAX(?:IMUM)?\s+(?:FUSE|BREAKER)|\bRLA\b|\bLRA\b|CAPACITY|BTU)/i.test(line)) continue;
    const tokens = line.toUpperCase().match(/\b[A-Z0-9][A-Z0-9/_.-]{5,24}\b/g) || [];
    for (const token of tokens) {
      if (REJECTED_FALLBACK_TOKENS.test(token)) continue;
      if (RATING_VALUE_TOKEN.test(token)) continue;
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

  setUnambiguousPrintedValue(extraction, "equipmentType", equipmentTypeCandidates(lines), 0.9);

  const paired = pairedIdentifiers(lines);
  const model = paired.model || labeledValue(lines, MODEL_LABEL);
  const serial = paired.serial || labeledValue(lines, SERIAL_LABEL);
  const hasModelLabel = lines.some((line) => MODEL_LABEL.test(line));
  const modelCandidate = model || (hasModelLabel ? null : fallbackModel(lines));
  if (modelCandidate) setResult(extraction, "model", modelCandidate.value, modelCandidate.confidence, modelCandidate.line);
  if (serial) setResult(extraction, "serial", serial.value, serial.confidence, serial.line);

  const refrigerant = firstPattern(
    lines,
    /\b(?:R|HFC)\s*[-~ ]*\s*(22|32|1234\s*YF|134\s*A|404\s*A|407\s*A|407\s*C|410\s*A|454\s*B|507\s*A)\b/i,
    (match) => `R-${match[1].replace(/\s/g, "").toUpperCase()}`,
  );
  if (refrigerant) setResult(extraction, "refrigerant", refrigerant.value, 0.96, refrigerant.line);

  const voltageLines = lines.filter((line) => !/\b\d{3}\s*(?:-+\s*\/+|\/+\s*-+)\s*\d{3}\b/.test(line));
  const voltage = firstPattern(
    voltageLines,
    /\b(?:VOLT(?:AGE|S?)?|V[O0](?:[RU])?S)\s*[:#=.\-~]*\s*((?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600)(?:\s*(?:-+|\/+)\s*(?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600))?)(?!\s*[/-])\b|\b((?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600)(?:\s*(?:-+|\/+)\s*(?:110|115|120|200|208|220|230|240|265|277|380|400|415|440|460|480|575|600))?)(?!\s*[/-])\s*(?:V(?:AC)?|VOLTS?)\b/i,
    (match) => `${(match[1] || match[2]).replace(/\s/g, "").replace(/-+/g, "-").replace(/\/+/g, "/")} V`,
  );
  if (voltage) setResult(extraction, "voltage", voltage.value, 0.92, voltage.line);

  const phase = firstPattern(lines, /\b(?:PHASE|PH|Ø)\s*[:#=.\-~]*\s*([13])\b|\b([13])\s*(?:PHASE|PH|Ø)\b/i, (match) => `${match[1] || match[2]} phase`);
  if (phase) setResult(extraction, "phase", phase.value, 0.9, phase.line);

  const frequency = firstPattern(lines, /\b(?:HZ|HERTZ)\s*[:#=.\-~]*\s*(50|60)\b|\b(50|60)\s*(?:HZ|HERTZ)\b/i, (match) => `${match[1] || match[2]} Hz`)
    || firstPattern(
      lines.filter((line) => /\b(?:PHASE|PH|Ø)\s*[:#=.\-~]*\s*[13]\b|\b[13]\s*(?:PHASE|PH|Ø)\b/i.test(line)),
      /\b(?:H[UZ]|W[I1L])\s*[:#=.\-~]*\s*(50|60)\b/i,
      (match) => `${match[1]} Hz`,
    );
  if (frequency) setResult(extraction, "frequency", frequency.value, 0.86, frequency.line);

  const mca = firstPattern(
    lines,
    /\b(?:MCA|MIN(?:IMUM)?\s+CIRCUIT\s+AMP(?:ACITY|S)?)\s*[:#=.\-~]*\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i,
    (match) => match[1],
  ) || patternNearLabel(
    lines,
    /\b(?:MCA|MIN(?:IMUM)?\s+CIRCUIT\s+AMP(?:ACITY|S)?)\b/i,
    /^\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\s*$/i,
    1,
  );
  if (mca) setResult(extraction, "mca", `${mca.value} A`, 0.94, mca.line);

  const maxFuse = firstPattern(lines, /\b(?:MOCP|MAX(?:IMUM)?\s+(?:FUSE(?:\s*\/\s*BREAKER)?|BREAKER|OVERCURRENT(?:\s+PROTECTION)?)|MAX\s+CKT\s+BKR)(?:\s*\([A-Z0-9]+\))?\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`);
  if (maxFuse) setResult(extraction, "maxFuseBreaker", maxFuse.value, 0.94, maxFuse.line);

  const rla = lines.reduce<{ value: string; line: string } | null>((found, line, index) => {
    if (found) return found;
    const label = /\b(?:RLA|ALA)\b/i.exec(line);
    if (!label) return null;

    const beforeText = line.slice(0, label.index);
    const afterText = line.slice(label.index + label[0].length);
    const before = /(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\s*$/i.exec(beforeText);
    const after = /^\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i.exec(afterText);
    const beforePrefix = before ? beforeText.slice(0, before.index) : "";
    const beforeIsCompressorNumber = Boolean(before && /^\d$/.test(before[1]) && /\b(?:COMPRESSOR|COMPR?|COMP)\s*$/i.test(beforePrefix));
    const value = before && !beforeIsCompressorNumber ? before[1] : after?.[1] || before?.[1];
    if (!value) return null;

    // The sparse pass returned "COMPH" then "3 RLA" after dropping "20.".
    // Reject only that exact broken continuation so a useful primary pass can win.
    const isStandaloneBeforeLabel = /^\s*\d\s*(?:A|AMPS?)?\s*(?:RLA|ALA)\s*$/i.test(line);
    if (isStandaloneBeforeLabel && /^COMPH$/i.test(lines[index - 1] || "")) return null;
    return { value: `${value} A`, line };
  }, null);
  if (rla) setResult(extraction, "rla", rla.value, 0.9, rla.line);

  const lra = firstPattern(lines, /\bLRA\s*[:#=.-]?\s*(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\b/i, (match) => `${match[1]} A`)
    || firstPattern(lines, /\b(\d+(?:\.\d+)?)\s*(?:A|AMPS?)?\s*LRA\b/i, (match) => `${match[1]} A`);
  if (lra) setResult(extraction, "lra", lra.value, 0.94, lra.line);

  const capacity = firstPattern(lines, /\b(\d{2,6}(?:,\d{3})?)\s*(BTU(?:\/H|H)?|MBH)\b/i, (match) => `${match[1]} ${match[2].toUpperCase()}`);
  if (capacity) setResult(extraction, "capacity", capacity.value, 0.86, capacity.line);

  setUnambiguousPrintedValue(extraction, "manufacturedDate", manufacturedDateCandidates(lines), 0.82);

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
