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

export type OcrReconciliation<T> = { fields: T; conflicts: string[] };

/** Reconcile independent OCR passes. Agreement fills blanks; disagreement stays blank for technician review. */
export function fillNameplateBlanksFromOcr<T extends Record<string, string>>(
  current: T,
  passes: readonly string[],
  edited: ReadonlySet<string>,
): OcrReconciliation<T> {
  const parsed: Array<Record<string, string>> = passes.map((text) => ({ ...parseNameplateText(text).fields, ...parseNameplateExtras(text) }));
  const next = { ...current };
  const conflicts: string[] = [];
  for (const key of Object.keys(current)) {
    if (current[key].trim() || edited.has(key)) continue;
    const values = Array.from(new Map(
      parsed
        .map((result) => result[key]?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => [value.toUpperCase(), value]),
    ).values());
    if (values.length === 1) next[key as keyof T] = values[0] as T[keyof T];
    else if (values.length > 1) conflicts.push(key);
  }
  return { fields: next, conflicts };
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
