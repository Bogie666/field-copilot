import { expect, it, vi } from "vitest";
import { readDeviceNameplate, type OcrWorker, fillNameplateBlanks } from "./nameplateScan";

it("fills only untouched blank fields from text, keeping cleared edits and confirmed values", () => {
  const fields = { model: "CONFIRMED", serial: "", refrigerant: "", equipmentAge: "", manufacturedDate: "" };
  const next = fillNameplateBlanks(fields, "MODEL: NEW12345\nSERIAL: AB123456\nR-410A", new Set(["serial"]));
  expect(next).toEqual({ ...fields, refrigerant: "R-410A" });
  expect(fields.refrigerant).toBe("");
});


it("reads the enhanced image on a worker and releases it after recognition", async () => {
  let terminated = 0;
  let image = "";
  const worker: OcrWorker = {
    recognize: async (source) => { image = source; return { data: { text: "MODEL: TEST1234" } }; },
    terminate: async () => { terminated++; },
  };
  const text = await readDeviceNameplate("enhanced", new AbortController().signal, () => {}, async () => worker);
  expect(text).toBe("MODEL: TEST1234");
  expect(image).toBe("enhanced");
  expect(terminated).toBe(1);
});


it("cancels a worker still loading and never starts stale recognition", async () => {
  const controller = new AbortController();
  let resolve!: (worker: OcrWorker) => void;
  let read = false, terminated = false;
  const pending = readDeviceNameplate("old", controller.signal, () => {}, () => new Promise(r => { resolve = r; }));
  controller.abort();
  resolve({recognize: async () => { read = true; return {data:{text:"stale"}}; }, terminate: async () => {terminated = true;}});
  await expect(pending).rejects.toMatchObject({name:"AbortError"});
  expect(read).toBe(false);
  expect(terminated).toBe(true);
});


it("cancels active recognition promptly and discards a late result", async () => {
  const controller = new AbortController();
  let finish!: (value: {data:{text:string}}) => void;
  let started!: () => void;
  const ready = new Promise<void>(r => { started = r; });
  let terminated = 0;
  const pending = readDeviceNameplate("old", controller.signal, () => {}, async () => ({
    recognize: () => { started(); return new Promise(r => { finish = r; }); },
    terminate: async () => { terminated++; },
  }));
  await ready; controller.abort();
  finish({data:{text:"stale"}});
  await expect(pending).rejects.toMatchObject({name:"AbortError"});
  expect(terminated).toBe(1);
});


vi.mock("tesseract.js", () => ({ createWorker: vi.fn() }));
it("routes Tesseract load errors into the rejected scan rather than an uncaught worker error", async () => {
  const { createWorker } = await import("tesseract.js");
  vi.mocked(createWorker).mockImplementation(async (_lang, _mode, options) => {
    if (!options?.errorHandler) throw new Error("Worker error was uncaught");
    options.errorHandler(new Error("OCR assets unavailable"));
    throw new Error("OCR assets unavailable");
  });
  await expect(readDeviceNameplate("image", new AbortController().signal, () => {})).rejects.toThrow("OCR assets unavailable");
});
