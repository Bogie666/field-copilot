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


export type OcrWorker = {
  recognize: (image: string) => Promise<{ data: { text: string } }>;
  terminate: () => Promise<unknown>;
};
type Progress = (status: string, progress: number) => void;
type WorkerFactory = (progress: Progress) => Promise<OcrWorker>;
async function createDeviceWorker(progress: Progress): Promise<OcrWorker> {
  const { createWorker } = await import("tesseract.js");
  // Tesseract rejects the job promise itself; its default handler also throws globally.
  return createWorker("eng", undefined, { logger: (m) => progress(m.status, m.progress ?? 0), errorHandler: () => undefined });
}

export async function readDeviceNameplate(image: string, signal: AbortSignal, progress: Progress, create: WorkerFactory = createDeviceWorker): Promise<string> {
  const worker = await create((status, amount) => { if (!signal.aborted) progress(status, amount); });
  let termination: Promise<unknown> | undefined;
  const terminate = () => termination ??= worker.terminate().catch(() => undefined);
  let abort!: () => void;
  const cancelled = new Promise<never>((_, reject) => {
    abort = () => { void terminate(); reject(signal.reason ?? new DOMException("Cancelled", "AbortError")); };
    signal.addEventListener("abort", abort, { once: true });
  });
  try {
    signal.throwIfAborted();
    const result = await Promise.race([worker.recognize(image), cancelled]);
    signal.throwIfAborted();
    return result.data.text;
  } finally {
    signal.removeEventListener("abort", abort);
    await terminate();
  }
}
