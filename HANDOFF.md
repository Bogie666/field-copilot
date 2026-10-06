# Handoff

State: all four tiles and every tool pass the end-to-end browser smoke. The baseline and regression browser suites pass, including real on-device WASM OCR, photo markup/rollback/retry, durable drafts/stale findings, late-response note protection and published PT calculations/provenance in both themes. Lint, typecheck, 312 unit tests across 41 files and the production build pass. Independent chart verification passed 1,746 source points, 1,738 interval midpoints and 40 range/nonfinite rejection checks.

## Release hardening

- Provisional PT provenance and warnings persist in saved findings and customer-note source data; the approval flag remains false.
- Unclassified CO readings never create an overall green result. Measurement location/basis remain explicitly unknown until documented; no company threshold was invented.
- Comparisons classify raw values before rounding, preserve inclusive static-pressure equality, and reject nonfinite derived results. Insulation safety observations can be documented without including invalid measurement values.
- Photo references are checked against the current job and scope; deletion prunes unsaved review selections. Legacy missing-photo evidence is marked stale and excluded from AI until reconfirmed.
- Photo markup blob and metadata replacement commits atomically. Serialized writes preserve concurrent notes and prevent pagehide from reverting metadata.
- Notes use a 12,000-character limit throughout persistence and tidying, with oversized results rejected rather than silently truncated. Malformed drafts/history fail closed.
- Runtime dependency audit: no vulnerabilities. Full audit: five existing high advisories in the development-only ESLint/fast-glob/micromatch/braces chain; latest braces 3.0.3 is still affected. No forced framework downgrade was made.

## Open decisions (need an owner)

1. **Pressure-temperature data is PROVISIONAL; technical approval pending.** Published Honeywell (R-410A/R-22), iGas USA (R-32), and Chemours Opteon XL41 (R-454B) chart rows now replace CoolProp estimates. `PT_DATA_APPROVED` remains `false`; source warnings and selected chart provenance persist in saved findings/AI fields. See `scripts/pt-sources/README.md` for exact sources, extraction, hashes and deterministic regeneration. R-454B retains direct chart points through 400 psig, then independent same-source inverse-chart extensions to 728.9 bubble / 723.1 dew psig (charge form input ceiling remains 700). Historical source calculations require explicit Update finding; they are not silently rewritten. Independent technical review is still required before approval.
2. **Furnace CO threshold.** `FURNACE_SAFETY_CONFIG.coThresholdPpm` is `null`, so CO is recorded but not classified. Set a company threshold and wording. Ticked observations always take the safety path.
3. **Fixed-orifice superheat target.** Uses (3 x IWB - 80 - ODB) / 2, valid only for outdoor dry bulb 55 to 115 F and indoor wet bulb 57 to 76 F. Confirm or replace.
4. **House tolerances** for electrical, static and airflow screening bands.
5. **Photo limits.** `MAX_PHOTOS_PER_SYSTEM` is 12, JPEG compressed.
6. **Job label versus job number.** Today a free label. Decide whether to require a work order number.
7. **Climate presets are DFW specific** (`dfw`, `rockwall`, `tyler` in `app/lib/manualJ.ts`). Other brands need their own presets or the custom option.

## Not done or limited

- Nameplate: camera/gallery capture with on-device Tesseract OCR, manual entry and paste parsing. Photos are auto-leveled, enlarged when useful and scanned as both grayscale/block text and high-contrast/sparse text; technicians can rotate a plate before scanning. OCR fills only untouched empty fields. Conflicting readings between passes are left blank, common compact HVAC ratings are excluded from model/serial values, and every value requires technician confirmation. The first device scan downloads OCR assets. Paid vision remains off.
- Photos: arrow/circle/freehand/text annotation with undo, cancel and explicit save. Markup is flattened into the saved photo; the same photo ID and safety attachments are retained.
- Notes: text per system/home, browser dictation, explicit AI tidying with cancellation/stale-edit protection. Manual changes dispatch immediately to avoid a debounce loss window. Browser speech support varies; automatic recognition restart is not implemented.
- No cloud sync. Jobs live in IndexedDB on one device. No offline app shell or service worker.
- Finding-tool inputs and review fields (next step, safety action, photo selections) now persist as separate per-job/per-system/tool drafts in the existing local job store. Drafts reopen before saved inputs or nameplate suggestions. Typing does not save a finding; explicit valid Save clears that tool’s drafts. Standalone tools remain memory-only. Nameplate/OCR/photo-tool pending state is owned by the camera workstream and is not covered by this draft hook.
- Confirmed equipment changes now flag affected system findings as stale: identity fields (manufacturer/model/serial/equipment type) affect all system findings; RLA/voltage/phase affect electrical, refrigerant affects charge, temperature-rise range affects furnace, max external static affects static, and capacity affects airflow. Age and unrelated fields do not invalidate findings. Stale evidence remains visible, including safety actions, but is disabled for customer-note selection and filtered again in the composition layer. Reopening the tool requires an explicit review checkbox and Save to reconfirm; old values are not silently updated. Previous confirmations are retained in local finding history and shown on the summary. The private job-summary copy explicitly labels stale evidence. This is field-dependency invalidation, not a manufacturer-reference or elapsed-time expiry system; old pre-feature replacements cannot be reconstructed.
- Accent button ink now chooses the higher-contrast dark/white foreground. Custom accent links/focus in both themes still need visual review when branding is changed.
- Manifest includes 192/512 PNG icons and an Apple 180 PNG icon, generated from the original SVG.
- The earlier Claude Doc build spec was written for the old repo and is partly superseded.
