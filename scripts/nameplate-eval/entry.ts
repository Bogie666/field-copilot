// Browser entry for the nameplate evaluation: runs the app's real image preparation,
// device OCR passes and reconciliation on one file.
import { EMPTY_NAMEPLATE_FIELDS } from "../../app/lib/nameplate";
import { prepareNameplateImage } from "../../app/lib/nameplateImage";
import { fillNameplateBlanksFromOcr, readDeviceNameplate } from "../../app/lib/nameplateScan";

declare global { interface Window { runPlate: (file: File) => Promise<unknown> } }

window.runPlate = async (file: File) => {
  const started = performance.now();
  const prepared = await prepareNameplateImage(file);
  const result = await readDeviceNameplate(prepared.ocrDataUrls, new AbortController().signal, () => undefined);
  const reconciled = fillNameplateBlanksFromOcr({ ...EMPTY_NAMEPLATE_FIELDS }, result.passes, new Set());
  return { ms: Math.round(performance.now() - started), passes: result.passes, ...reconciled };
};
