import { expect, it, vi } from "vitest";
import { readDeviceNameplate, type OcrWorker, fillNameplateBlanks, fillNameplateBlanksFromOcr } from "./nameplateScan";

it("fills only untouched blank fields from text, keeping cleared edits and confirmed values", () => {
  const fields = { model: "CONFIRMED", serial: "", refrigerant: "", equipmentAge: "", manufacturedDate: "" };
  const next = fillNameplateBlanks(fields, "MODEL: NEW12345\nSERIAL: AB123456\nR-410A", new Set(["serial"]));
  expect(next).toEqual({ ...fields, refrigerant: "R-410A" });
  expect(fields.refrigerant).toBe("");
});

it("fills complementary OCR fields but leaves conflicting readings blank", () => {
  const fields = { model: "", serial: "", refrigerant: "" };
  const result = fillNameplateBlanksFromOcr(fields, [
    "MODEL: WRONG123\nSERIAL: AB123456",
    "MODEL: RIGHT456\nSERIAL: AB123456\nR-410A",
  ], new Set());

  expect(result.fields).toEqual({ model: "", serial: "AB123456", refrigerant: "R-410A" });
  expect(result.conflicts).toEqual(["model"]);
});

it("keeps a one-character material model disagreement blank", () => {
  const fields = { model: "", serial: "" };
  const result = fillNameplateBlanksFromOcr(fields, [
    "MODEL: ABCD1234A\nSERIAL: SAME1234",
    "MODEL: ABCD1234B\nSERIAL: SAME1234",
  ], new Set());

  expect(result.fields).toEqual({ model: "", serial: "SAME1234" });
  expect(result.conflicts).toEqual(["model"]);
});

it("keeps inserted model characters and different amp ratings as conflicts", () => {
  const insertedModel = fillNameplateBlanksFromOcr({ model: "", serial: "" }, [
    "MODEL: ABCD1234A\nSERIAL: SAME1234",
    "MODEL: ABCD12345A\nSERIAL: SAME1234",
  ], new Set());
  const differentMca = fillNameplateBlanksFromOcr({ mca: "" }, ["MCA 20.3 A", "MCA 3 A"], new Set());

  expect(insertedModel.fields).toEqual({ model: "", serial: "SAME1234" });
  expect(insertedModel.conflicts).toEqual(["model"]);
  expect(differentMca.fields).toEqual({ mca: "" });
  expect(differentMca.conflicts).toEqual(["mca"]);
});

it("recovers complementary fields from the latest Trane scan without treating minor OCR damage as a material conflict", () => {
  const fields = {
    manufacturer: "", model: "", serial: "", equipmentType: "", manufacturedDate: "",
    refrigerant: "", voltage: "", phase: "", frequency: "", mca: "", maxFuseBreaker: "",
    rla: "", lra: "", capacity: "",
  };
  const firstPass = `
    EE ————— — 1
    \\& rane XJ MFRDATE | BA
    NAV spe
    _MoD. No. ATTV7X48A1000AA vos 208 —230
    SERIALNO. 23351TCCJF ~~ PH~ 1 1 60 ;
    | MINIMUM CIRCUIT AMPACITY ~~ 42.0 AMPS |
    OVERCURRENT PROTECTIVE DEVICE ~~ USA CANADA.
    MAX FUSE / BREAKER (HACR) 45 45
    HFC — 410A 1118S. 09 02. Or 5.24 kg(SI)
    TRANE Te Sy
    COMPR. MOT. 20.3 RLA 208-230 | 12.0 LRA
    0.D. MOT. 2.3 FLA 245-385 §y 1/2 HP
  `;
  const secondPass = `
    rane X\\/
    MFR DATE
    8/2023
    MOD. No. ATTV7X48A1 D00AA
    yours 208 —-230
    SERIAL NO. 23351TCCJF
    PH~ 1
    HZ 60
    MINIMUM CIRCUIT AMPACITY
    42.0
    AMPS
    MAX Sb’ / BREAKER (HACR)
    410A
    COMPH
    3 RLA
    208 —230
    12.0 LRA
  `;

  const result = fillNameplateBlanksFromOcr(fields, [firstPass, secondPass], new Set());

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
  expect(result.conflicts).toEqual([]);
});

it("recovers complementary fields from the real Trane scan while rejecting conflicting model readings", () => {
  const fields = {
    manufacturer: "", model: "", serial: "", equipmentType: "", manufacturedDate: "",
    refrigerant: "", voltage: "", phase: "", frequency: "", mca: "", maxFuseBreaker: "",
    rla: "", lra: "", capacity: "",
  };
  const firstPass = `
    ££" TRANE X\\/ MFR DATE
    — 8/2023
    woo wo. ATTV7X48A1000AA vous 208-230
    sen wo. 23351TCCJF PH~ 1 Wi 60
    MINIMUM CIRCUIT AMPACITY 42.0 AMPS
    MAX FUSE / BREAKER (HACR) 45 45
    HFC —~ 410A 11s 09 02. OR 5.24 kg(SI)
    COMPR. MOT. 20.3 ALA 208-230 § 12.0 LRA
  `;
  const secondPass = `
    MFR DATE
    Pr
    8/2023
    aTTVIX4BA1000AA vors 208 —230
    PH- 1
    Hu 60
    sean 0. 23351TCCJF
    42.0
    "AMPS
    MINIMUM CIRCUIT AMPACITY
    FC
    410A
    20 LRA
  `;

  const result = fillNameplateBlanksFromOcr(fields, [firstPass, secondPass], new Set());

  expect(result.fields).toMatchObject({
    manufacturer: "Trane",
    model: "",
    serial: "23351TCCJF",
    manufacturedDate: "8/2023",
    refrigerant: "R-410A",
    voltage: "208-230 V",
    phase: "1 phase",
    frequency: "60 Hz",
    mca: "42.0 A",
    maxFuseBreaker: "45 A",
    rla: "20.3 A",
    lra: "",
  });
  expect(result.conflicts).toEqual(["model", "lra"]);
});


it("reads the enhanced image on a worker and releases it after recognition", async () => {
  let terminated = 0;
  let image = "";
  const worker: OcrWorker = {
    recognize: async (source) => { image = source; return { data: { text: "MODEL: TEST1234" } }; },
    terminate: async () => { terminated++; },
  };
  const result = await readDeviceNameplate("enhanced", new AbortController().signal, () => {}, async () => worker);
  expect(result).toEqual({ text: "MODEL: TEST1234", passes: ["MODEL: TEST1234"] });
  expect(image).toBe("enhanced");
  expect(terminated).toBe(1);
});

it("combines complementary OCR passes and changes page segmentation", async () => {
  const images: string[] = [];
  const parameters: Array<Record<string, string>> = [];
  let pass = 0;
  const worker: OcrWorker = {
    setParameters: async (value) => { parameters.push(value); },
    recognize: async (source) => {
      images.push(source);
      pass += 1;
      return { data: { text: pass === 1 ? "MODEL: 4TTR6036N1000A" : "SERIAL: 23145AB7F\nR-410A" } };
    },
    terminate: async () => undefined,
  };

  const result = await readDeviceNameplate(["grayscale", "threshold"], new AbortController().signal, () => {}, async () => worker);

  expect(images).toEqual(["grayscale", "threshold"]);
  expect(parameters).toHaveLength(2);
  expect(new Set(parameters.map((item) => item.tessedit_pageseg_mode))).toEqual(new Set(["6", "11"]));
  expect(result.text).toContain("MODEL: 4TTR6036N1000A");
  expect(result.text).toContain("SERIAL: 23145AB7F");
  expect(result.passes).toHaveLength(2);
});

it("keeps a successful first pass when a supplemental OCR pass fails", async () => {
  let pass = 0;
  const worker: OcrWorker = {
    recognize: async () => {
      pass += 1;
      if (pass === 2) throw new Error("supplemental pass failed");
      return { data: { text: "MODEL: TEST1234" } };
    },
    terminate: async () => undefined,
  };

  await expect(readDeviceNameplate(["first", "second"], new AbortController().signal, () => {}, async () => worker)).resolves.toEqual({
    text: "MODEL: TEST1234",
    passes: ["MODEL: TEST1234"],
  });
});

it("tries the second derivative when the first OCR pass fails", async () => {
  let pass = 0;
  const worker: OcrWorker = {
    recognize: async () => {
      pass += 1;
      if (pass === 1) throw new Error("first pass failed");
      return { data: { text: "SERIAL: AB123456" } };
    },
    terminate: async () => undefined,
  };

  await expect(readDeviceNameplate(["first", "second"], new AbortController().signal, () => {}, async () => worker)).resolves.toEqual({
    text: "SERIAL: AB123456",
    passes: ["SERIAL: AB123456"],
  });
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

it("cancels while OCR parameters are being applied", async () => {
  const controller = new AbortController();
  let parametersStarted!: () => void;
  const ready = new Promise<void>((resolve) => { parametersStarted = resolve; });
  let terminated = 0;
  const pending = readDeviceNameplate("old", controller.signal, () => {}, async () => ({
    setParameters: () => { parametersStarted(); return new Promise(() => undefined); },
    recognize: async () => ({ data: { text: "stale" } }),
    terminate: async () => { terminated += 1; },
  }));

  await ready;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: "AbortError" });
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
