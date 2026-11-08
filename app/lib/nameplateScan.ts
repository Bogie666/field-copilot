import { parseNameplateText } from "./nameplate";
import { parseNameplateExtras } from "./nameplateExtras";

/** OCR and paste may fill blanks, never a technician's edit (even an intentional blank). */
export function fillNameplateBlanks<T extends Record<string, string>>(current: T, text: string, edited: ReadonlySet<string>): T {
  const candidates: Record<string, string> = { ...parseNameplateText(text).fields, ...parseNameplateExtras(text) };
  const next = { ...current };
  for (const key of Object.keys(current)) {
    if (!current[key].trim() && !edited.has(key) && candidates[key]) next[key as keyof T] = candidates[key] as T[keyof T];
  }
  return next;
}

export type OcrReconciliation<T> = { fields: T; conflicts: string[]; checks: string[] };

/** Glyphs Tesseract confuses on stamped and printed plates. Only same-group swaps count as damage. */
const CONFUSABLE_GROUPS = ["0ODQ", "1IL7T", "4A", "8B", "5S", "2Z", "6G"];
const sameGroup = (a: string, b: string) => CONFUSABLE_GROUPS.some((group) => group.includes(a) && group.includes(b));

/** Positions where two same-length identifier reads differ only by look-alike glyphs, or null. */
export function confusableDifferences(primary: string, supplemental: string): number[] | null {
  const a = primary.toUpperCase();
  const b = supplemental.toUpperCase();
  if (a.length < 8 || a.length !== b.length) return null;
  const positions: number[] = [];
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) continue;
    if (!sameGroup(a[index], b[index])) return null;
    positions.push(index);
  }
  // Long identifiers tolerate one more damaged glyph; anything beyond that is a conflict.
  return positions.length <= (a.length >= 12 ? 4 : 3) ? positions : null;
}

function reconcileOcrValues(key: string, values: string[]): { value: string; check?: string } | null {
  if (values.length === 1) return { value: values[0] };
  if (values.length !== 2) return null;

  // PSM 6 is the primary block-reading pass. When the sparse pass differs only by
  // look-alike glyphs (7/I, 8/B, 0/D), keep the primary read and name the characters
  // to check. Any other difference, including insertions, stays a conflict.
  if (key === "model" || key === "serial") {
    const positions = confusableDifferences(values[0], values[1]);
    if (positions) {
      const chars = positions.map((index) => `${values[0][index]} (character ${index + 1})`).join(", ");
      return { value: values[0], check: `${key === "model" ? "Model" : "Serial"}: two scans disagreed on look-alike characters ${chars}. Check them on the plate.` };
    }
  }
  return null;
}

/**
 * Trane and American Standard residential model numbers start with a digit (4TTV, 2TTB, 4A7A).
 * Tesseract often reads that leading 4 as "A" and 2 as "Z". Correct only that first character,
 * only for these brands and series shapes, and always ask for a visual check.
 */
export function correctModelLeadingDigit(manufacturer: string, model: string): { value: string; check?: string } {
  if (!/^(?:TRANE|AMERICAN STANDARD)$/i.test(manufacturer.trim())) return { value: model };
  const match = /^([AZ])(T[A-Z]{2}\d|A\d[A-Z])/i.exec(model);
  if (!match) return { value: model };
  const digit = match[1].toUpperCase() === "A" ? "4" : "2";
  return { value: `${digit}${model.slice(1)}`, check: `Model: the first character was read as "${match[1].toUpperCase()}" and changed to "${digit}", because ${manufacturer.trim()} model numbers start with a digit. Check it on the plate.` };
}

/** Reconcile independent OCR passes. Agreement fills blanks; disagreement stays blank for technician review. */
export function fillNameplateBlanksFromOcr<T extends Record<string, string>>(
  current: T,
  passes: readonly string[],
  edited: ReadonlySet<string>,
): OcrReconciliation<T> {
  const extractions = passes.map(parseNameplateText);
  const parsed: Array<Record<string, string>> = extractions.map((result, index) => ({ ...result.fields, ...parseNameplateExtras(passes[index]) }));
  const ambiguousFields = new Set<string>(extractions.flatMap((result) => result.conflicts ?? []));
  const next = { ...current };
  const conflicts: string[] = [];
  const checks: string[] = [];
  for (const key of Object.keys(current)) {
    if (current[key].trim() || edited.has(key)) continue;
    if (ambiguousFields.has(key)) {
      conflicts.push(key);
      continue;
    }
    const values = Array.from(new Map(
      parsed
        .map((result) => result[key]?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toUpperCase(), value]),
    ).values());
    const reconciled = reconcileOcrValues(key, values);
    if (reconciled) {
      next[key as keyof T] = reconciled.value as T[keyof T];
      if (reconciled.check) checks.push(reconciled.check);
    } else if (values.length > 1) conflicts.push(key);
  }
  const manufacturer = typeof next.manufacturer === "string" ? next.manufacturer : "";
  if ("model" in next && next.model && next.model !== current.model) {
    const corrected = correctModelLeadingDigit(manufacturer, next.model);
    if (corrected.check) {
      next["model" as keyof T] = corrected.value as T[keyof T];
      checks.push(corrected.check);
    }
  }
  return { fields: next, conflicts, checks };
}

export type OcrWorker = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  setParameters?: (parameters: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};
export type DeviceNameplateResult = { text: string; passes: string[] };
type Progress = (status: string, progress: number) => void;
type WorkerFactory = (progress: Progress) => Promise<OcrWorker>;

async function createDeviceWorker(progress: Progress): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  return createWorker("eng", undefined, {
    logger: (message) => progress(message.status, message.progress ?? 0),
    errorHandler: () => undefined,
  });
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException("Cancelled", "AbortError");
}

function raceAbort<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(abortError(signal));
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(abortError(signal));
    signal.addEventListener("abort", abort, { once: true });
    operation.then(
      (value) => { signal.removeEventListener("abort", abort); resolve(value); },
      (error) => { signal.removeEventListener("abort", abort); reject(error); },
    );
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : Boolean(error && typeof error === "object" && "name" in error && error.name === "AbortError");
}

export async function readDeviceNameplate(
  image: string | readonly string[],
  signal: AbortSignal,
  progress: Progress,
  create: WorkerFactory = createDeviceWorker,
): Promise<DeviceNameplateResult> {
  let worker: OcrWorker | undefined;
  let termination: Promise<unknown> | undefined;
  const terminate = () => {
    if (!worker) return Promise.resolve();
    return termination ??= worker.terminate().catch(() => undefined);
  };

  const workerPromise = create((status, amount) => { if (!signal.aborted) progress(status, amount); });
  void workerPromise.then((created) => {
    if (signal.aborted && !worker) void created.terminate().catch(() => undefined);
  }, () => undefined);

  try {
    worker = await raceAbort(workerPromise, signal);
    signal.throwIfAborted();
    const sources = Array.isArray(image) ? image : [image];
    const passes: string[] = [];
    const errors: unknown[] = [];

    for (let index = 0; index < sources.length; index += 1) {
      signal.throwIfAborted();
      try {
        if (worker.setParameters) {
          await raceAbort(worker.setParameters({ tessedit_pageseg_mode: index % 2 === 0 ? "6" : "11" }), signal);
        }
        const result = await raceAbort(worker.recognize(sources[index]), signal);
        signal.throwIfAborted();
        const text = result.data.text.trim();
        if (text) passes.push(text);
      } catch (error) {
        if (signal.aborted || isAbort(error)) throw error;
        errors.push(error);
      }
    }

    if (!passes.length && errors.length) throw errors[0];
    const unique = Array.from(new Set(passes));
    return { text: unique.join("\n\n"), passes };
  } finally {
    await terminate();
  }
}
