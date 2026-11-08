// Turns a spoken phrase such as "suction 118 suction temp 52 liquid 365" into proposed
// field values. Pure and deterministic: the technician reviews every match before it is applied.

export type VoiceTarget = { id: string; label: string; unit?: string };
export type VoiceMatch = { id: string; label: string; value: string; heard: string };
export type VoiceParse = { matches: VoiceMatch[]; unmatched: string[] };

const SMALL: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const DIGIT_WORD: Record<string, string> = { zero: "0", oh: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };

/**
 * Spoken number words to digits: "two hundred thirty eight" and "two thirty eight" -> 238,
 * "three point five" -> 3.5, "point two five" -> 0.25. Digits already present pass through.
 */
export function wordsToDigits(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  const isNumberWord = (w: string) => w in SMALL || w in TENS || w === "hundred" || w === "thousand";
  const isDigit = (w: string | undefined) => !!w && (w in DIGIT_WORD || /^\d$/.test(w));
  let i = 0;
  while (i < words.length) {
    const w = words[i];
    if ((w === "point" || w === "dot") && isDigit(words[i + 1])) {
      let digits = "";
      i += 1;
      while (isDigit(words[i])) { digits += DIGIT_WORD[words[i]] ?? words[i]; i += 1; }
      const previous = out[out.length - 1];
      if (previous !== undefined && /^\d+$/.test(previous)) out[out.length - 1] = `${previous}.${digits}`;
      else out.push(`0.${digits}`);
      continue;
    }
    if (!isNumberWord(w) || (w === "oh" && !isNumberWord(words[i + 1] ?? ""))) { out.push(w); i += 1; continue; }
    let total = 0, current = 0;
    while (i < words.length && isNumberWord(words[i])) {
      const word = words[i];
      const next = words[i + 1];
      if (word in SMALL) {
        const n = SMALL[word];
        // "two thirty eight", "one eighteen": a single digit before tens or teens is hundreds.
        if (current === 0 && n >= 1 && n <= 9 && next && (next in TENS || (next in SMALL && SMALL[next] >= 10))) current = n * 100;
        else current += n;
      } else if (word in TENS) current += TENS[word];
      else if (word === "hundred") current = (current || 1) * 100;
      else { total += (current || 1) * 1000; current = 0; }
      i += 1;
    }
    out.push(String(total + current));
  }
  return out.join(" ");
}

const STOP = new Set(["the", "is", "at", "and", "of", "a", "an", "to", "was", "reading", "reads", "read", "my", "i", "got", "about", "it", "its", "set", "on", "for", "with", "um", "uh", "okay", "ok", "then", "next"]);
const UNIT_WORDS = new Set(["volts", "volt", "v", "amps", "amp", "a", "psi", "psig", "pounds", "degrees", "degree", "f", "fahrenheit", "microns", "micron", "ohms", "ohm", "percent", "inches", "inch", "in", "wc", "water", "column", "microamps", "micro", "uf", "microfarads", "mfd", "kw", "kilowatts", "seconds", "second", "minutes", "minute", "feet", "foot", "ft", "cfm", "megohms", "megohm", "btu", "btuh"]);
const SYNONYMS: Record<string, string> = {
  temp: "temperature", temperatures: "temperature", volts: "voltage", volt: "voltage", amperage: "amps", amp: "amps", current: "amps",
  pressures: "pressure", superheat: "superheat", "super": "superheat", subcool: "subcooling", subcooled: "subcooling", subcooling: "subcooling",
  cap: "capacitor", capacitance: "capacitor", microfarads: "uf", mfd: "uf", wet: "wet", dry: "dry", db: "dry", wb: "wet",
  head: "high", discharge: "high", low: "low", vapor: "suction", micron: "microns", vacuum: "vacuum", ohm: "ohms", megohm: "megohm", megger: "megohm",
  rla: "rla", fla: "fla", lra: "lra", mca: "mca", ambient: "outdoor", outside: "outdoor", inside: "indoor", returning: "return",
};

function stem(word: string): string {
  const w = SYNONYMS[word] ?? word;
  return w.length > 4 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
}

export function labelWords(label: string): string[] {
  return label.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/).filter((w) => w && !STOP.has(w)).map(stem);
}

function normalize(transcript: string): string {
  const lowered = transcript.toLowerCase().replace(/(\d),(\d{3})\b/g, "$1$2").replace(/[^a-z0-9.\s-]/g, " ").replace(/-/g, " ");
  // Join split words speech engines often produce.
  return wordsToDigits(lowered.replace(/\bsub cooling\b/g, "subcooling").replace(/\bsuper heat\b/g, "superheat").replace(/\bwet bulb\b/g, "wet bulb").replace(/\s+/g, " ").trim());
}

/** Splits into (phrase, number) pairs and matches each phrase to the best field. */
export function parseVoiceReadings(transcript: string, targets: readonly VoiceTarget[]): VoiceParse {
  const text = normalize(transcript);
  const fields = targets.map((t, order) => ({ ...t, order, words: new Set(labelWords(`${t.label} ${t.unit ?? ""}`)), size: labelWords(t.label).length }));
  const matches = new Map<string, VoiceMatch>();
  const unmatched: string[] = [];
  const pattern = /([a-z][a-z\s]*?)\s*(\d+(?:\.\d+)?|\.\d+)(?=\s|$)/g;
  let match: RegExpExecArray | null;
  let first = true;
  while ((match = pattern.exec(text))) {
    let phraseWords = match[1].trim().split(/\s+/).filter(Boolean);
    // A unit spoken after the previous number ("238 volts compressor 13") belongs to that number.
    if (!first) while (phraseWords.length > 1 && UNIT_WORDS.has(phraseWords[0])) phraseWords = phraseWords.slice(1);
    first = false;
    const words = phraseWords.filter((w) => !STOP.has(w)).map(stem);
    const value = match[2].startsWith(".") ? `0${match[2]}` : match[2];
    const heard = `${phraseWords.join(" ")} ${value}`.trim();
    if (!words.length) { unmatched.push(heard); continue; }
    let best: (typeof fields)[number] | null = null;
    let bestScore = 0;
    for (const field of fields) {
      const hits = words.filter((w) => field.words.has(w)).length;
      if (!hits) continue;
      // Prefer more matching words, then labels with fewer extra words, then page order.
      const score = hits * 100 - (field.size - hits);
      if (score > bestScore) { best = field; bestScore = score; }
    }
    if (!best) { unmatched.push(heard); continue; }
    matches.set(best.id, { id: best.id, label: best.label, value, heard });
  }
  const ordered = [...matches.values()].sort((a, b) => fields.find((f) => f.id === a.id)!.order - fields.find((f) => f.id === b.id)!.order);
  return { matches: ordered, unmatched };
}
