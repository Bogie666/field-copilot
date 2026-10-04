# Handoff

State: all four tiles and every tool work end to end in the browser smoke test. Lint, typecheck, 163 unit tests and the production build pass.

## Open decisions (need an owner)

1. **Pressure-temperature data is PROVISIONAL.** Generated from CoolProp 8.0.0 by `scripts/generate-pt-data.py` (R-410A, R-32, R-454B, R-22). `PT_DATA_APPROVED` in `app/lib/charge/ptData.ts` is `false` and the charge tool shows a warning. Approve a source (manufacturer or AHRI tables), compare, then flip the flag. R-454B tops out near 462 psig.
2. **Furnace CO threshold.** `FURNACE_SAFETY_CONFIG.coThresholdPpm` is `null`, so CO is recorded but not classified. Set a company threshold and wording. Ticked observations always take the safety path.
3. **Fixed-orifice superheat target.** Uses (3 x IWB - 80 - ODB) / 2, valid only for outdoor dry bulb 55 to 115 F and indoor wet bulb 57 to 76 F. Confirm or replace.
4. **House tolerances** for electrical, static and airflow screening bands.
5. **Photo limits.** `MAX_PHOTOS_PER_SYSTEM` is 12, JPEG compressed.
6. **Job label versus job number.** Today a free label. Decide whether to require a work order number.
7. **Climate presets are DFW specific** (`dfw`, `rockwall`, `tyler` in `app/lib/manualJ.ts`). Other brands need their own presets or the custom option.

## Not done or limited

- Nameplate: manual entry plus "paste plate text" parsing only. The old camera OCR (tesseract.js) and vision flow are not ported. `app/api/nameplate-ocr` and `app/lib/nameplateImage.ts` are ready to wire in. AI vision is off by default.
- Photos: no annotation or markup (the old `PhotoAnnotator` is not ported). `replacePhotoBlob` exists in the job API for it.
- Notes: single text field per system or home. Dictation uses the browser's speech API, without the old restart logic.
- No cloud sync. Jobs live in IndexedDB on one device. No offline app shell or service worker.
- Unsaved tool inputs are not persisted as drafts. Only saved findings reopen.
- No detection that a finding is out of date after the nameplate changes.
- The accent override applies in dark mode too, which may reduce contrast.
- Manifest icons are SVG only. Add PNG sizes for older Android and iOS.
- The earlier Claude Doc build spec was written for the old repo and is partly superseded.
