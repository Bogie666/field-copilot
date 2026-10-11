"use client";

import { useEffect, useRef, useState } from "react";
import { prepareNameplateImage, type PreparedNameplateImage } from "../../lib/nameplateImage";
import { EMPTY_NAMEPLATE_FIELDS, NAMEPLATE_FIELD_KEYS, type NameplateFieldKey } from "../../lib/nameplate";
import { readDeviceNameplate, fillNameplateBlanks, fillNameplateBlanksFromOcr } from "../../lib/nameplateScan";
import { ageFromManufacturedDate, EQUIPMENT_TYPES, matchEquipmentType } from "../../lib/nameplateEquipment";
import { componentForScope, equipmentForScope, scopeKey } from "../../lib/job/types";
import { useFormState } from "./useFormState";
import { Callout, SelectField, TextField } from "../ui";
import { ActionBar } from "../ui";
import type { ToolContext } from "./context";

const LABELS: Record<NameplateFieldKey | "tempRiseRange" | "maxExternalStatic", string> = {
  manufacturer: "Manufacturer", model: "Model", serial: "Serial", equipmentType: "Equipment type", manufacturedDate: "Manufactured date (only if printed)",
  refrigerant: "Refrigerant", voltage: "Voltage", phase: "Phase", frequency: "Frequency", mca: "Minimum circuit amps", maxFuseBreaker: "Max fuse or breaker",
  rla: "Rated load amps", lra: "Locked rotor amps", capacity: "Capacity (only if printed)", tempRiseRange: "Temperature rise range (F, for example 35-65)", maxExternalStatic: "Max external static (in. w.c.)",
};
const KEYS = [...NAMEPLATE_FIELD_KEYS, "tempRiseRange", "maxExternalStatic"] as const;
type Key = (typeof KEYS)[number];
type NameplateForm = Record<Key, string> & { age: string; ageMode: string };

export default function NameplateTool({ ctx }: { ctx: ToolContext }) {
  const { api, system } = ctx;
  const component = componentForScope(system, ctx.scope);
  const equipment = equipmentForScope(system, ctx.scope);
  const previousAge = component ? component.equipmentAge : system?.equipmentAge ?? "";
  const previousAgeSource = component ? component.equipmentAgeSource : system?.equipmentAgeSource;
  const [fields, , updateFields] = useFormState<NameplateForm>(ctx, { ...EMPTY_NAMEPLATE_FIELDS, tempRiseRange: "", maxExternalStatic: "", age: "", ageMode: "date" },
    { ...equipment, age: previousAge, ageMode: previousAgeSource === "manual" || (previousAge && previousAgeSource !== "manufactured-date") ? "manual" : "date" });
  const ageSuggestion = ageFromManufacturedDate(fields.manufacturedDate, new Date());
  const age = fields.ageMode === "manual" ? fields.age : ageSuggestion ? String(ageSuggestion.years) : "";
  const edits = useRef(0);
  const [editedSinceLoad, setEditedSinceLoad] = useState(false);
  const hasDraft = !!ctx.scope && !!api?.job?.drafts?.some(draft => draft.toolId === "nameplate" && scopeKey(draft.scope) === scopeKey(ctx.scope!));
  const loadedConfirmation = !editedSinceLoad && !hasDraft && (Object.keys(equipment).length > 0 || !!previousAge);
  const initialSaveNote = loadedConfirmation ? "Previously confirmed equipment loaded. Review current values and age before confirming changes." : "Not saved yet";
  function setFields(update: (current: NameplateForm) => NameplateForm) { edits.current++; setEditedSinceLoad(true); updateFields(update); setSaved(false); setSaveNote(""); }
  function acceptScanFields(next: NameplateForm, previous: NameplateForm): NameplateForm {
    // An uncertain OCR type stays unselected. Existing legacy/custom values are preserved.
    if (next.equipmentType !== previous.equipmentType) next.equipmentType = matchEquipmentType(next.equipmentType) ?? "";
    return next;
  }
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveNote, setSaveNote] = useState("");
  const [prepared, setPrepared] = useState<PreparedNameplateImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const selectedFile = useRef<File | null>(null);
  const [rotation, setRotation] = useState(0);
  useEffect(() => () => { request.current++; controller.current?.abort(); }, []);

  function cancel() {
    request.current++; controller.current?.abort(); controller.current = null;
    setBusy(false); setScanStatus("Scan cancelled. Manual entry is still available.");
  }

  async function scan() {
    if (!prepared || busy) return;
    const id = ++request.current;
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setScanStatus("Loading device OCR…"); setProgress(0);
    try {
      const result = await readDeviceNameplate(prepared.ocrDataUrls, abort.signal, (status, amount) => {
        if (id !== request.current) return;
        setScanStatus(`Device OCR: ${status}`); setProgress(amount);
      });
      if (id !== request.current) return;
      setPaste(result.text);
      const reconciled = fillNameplateBlanksFromOcr(fields, result.passes, edited.current);
      setFields(current => acceptScanFields(fillNameplateBlanksFromOcr(current, result.passes, edited.current).fields, current));
      setSaved(false);
      setScanStatus(
        result.text.trim()
          ? reconciled.conflicts.length
            ? `Scan complete. Conflicting ${reconciled.conflicts.map((key) => LABELS[key as Key] || key).join(", ")} readings were left blank. Check every field against the photo.`
            : "Scan complete. Check every field against the photo before saving."
          : "No readable text. Retake the photo or enter the plate manually.",
      );
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? `${e.message} Try a clearer photo or manual entry.` : "Device OCR failed. Use manual entry.");
    } finally {
      if (id === request.current) { setBusy(false); controller.current = null; }
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
    selectedFile.current = file;
    setRotation(0);
    controller.current?.abort();
    const id = ++request.current;
    setBusy(true); setError(""); setPrepared(null); setScanStatus("");
    try {
      const image = await prepareNameplateImage(file);
      if (id === request.current) setPrepared(image);
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "Could not open this photo.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }

  async function rotate(delta: -90 | 90) {
    const file = selectedFile.current;
    if (!file || busy) return;
    controller.current?.abort();
    const id = ++request.current;
    const nextRotation = (rotation + delta + 360) % 360;
    setBusy(true); setError(""); setScanStatus("Rotating and optimizing photo…");
    try {
      const image = await prepareNameplateImage(file, nextRotation);
      if (id === request.current) {
        setPrepared(image);
        setRotation(nextRotation);
        setScanStatus("Photo rotated. Run the scan again.");
      }
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : "Could not rotate this photo.");
    } finally {
      if (id === request.current) setBusy(false);
    }
  }


  const edited = useRef(new Set<string>());
  function readPasted() {
    setFields(c => acceptScanFields(fillNameplateBlanks(c, paste, edited.current), c));
    setNote("Filled empty fields only. Check every value against the plate before saving.");
    setSaved(false);
  }

  async function save() {
    if (!api || !system || savingRef.current) return;
    const equipment = Object.fromEntries(KEYS.map(k => [k, fields[k].trim()]).filter(([, value]) => value)) as Record<string, string>;
    const version = edits.current;
    savingRef.current = true; setSaving(true); setSaveNote(""); setSaved(false);
    try {
      const result = await api.saveAction({ type: "setEquipment", systemId: system.id, componentId: ctx.scope?.kind === "system" ? ctx.scope.componentId : undefined,
        equipment, age: age.trim(), ageSource: fields.ageMode === "manual" ? "manual" : "manufactured-date" });
      if (!result.ok) { setSaveNote(`Not saved: ${result.errors.join(" ")}`); return; }
      const current = edits.current === version;
      setSaved(current);
      setSaveNote(current ? result.persistent ? "Saved on this device" : "Saved for this session only. Keep this tab open; browser storage is unavailable." : "Earlier values saved. Your newer edits still need confirmation.");
    } catch (error) {
      setSaveNote(`Not saved: ${error instanceof Error ? error.message : "Storage could not save the equipment. Try again."}`);
    } finally { savingRef.current = false; setSaving(false); }
  }

  if (!api || !system) return <p className="hint">Open this tool from a job to save equipment details.</p>;
  return (
    <div className="stack">
      <Callout title="You confirm every field">Check the values against this component’s plate. Age fills from a valid printed manufacture date; approximate dates are labeled. You can override the age. Nothing is decoded from a serial number.</Callout>
      <div className="panel">
        <h3>Camera and device OCR</h3>
        <p className="hint">Fill the frame with a sharp, glare-free plate. The scanner enlarges small text and checks both grayscale and high-contrast versions on this device. The first scan may download OCR language files.</p>
        <input ref={camera} className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a nameplate photo" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={gallery} className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a nameplate photo" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="btnRow">
          <button className="btn" type="button" onClick={() => camera.current?.click()}>Take plate photo</button>
          <button className="btn" type="button" onClick={() => gallery.current?.click()}>Choose plate photo</button>
        </div>
        {prepared && <>
          <img src={prepared.colorDataUrl} alt="Selected equipment nameplate" style={{ width: "100%", height: "auto" }} />
          <div className="btnRow">
            <button className="btn" type="button" disabled={busy} onClick={() => void rotate(-90)}>Rotate left</button>
            <button className="btn" type="button" disabled={busy} onClick={() => void rotate(90)}>Rotate right</button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => void scan()}>Read nameplate</button>
          </div>
        </>}
        {busy && <>
          <progress max={1} value={progress} aria-label="Device OCR progress" />
          <button className="btn" type="button" onClick={cancel}>Cancel scan</button>
        </>}
        <p role="status">{scanStatus || (busy ? "Preparing photo…" : "")}</p>
        {error && <p role="alert">{error}</p>}
      </div>
      <div className="panel">
        <h3>Paste plate text (optional)</h3>
        <TextField label="Text from the plate" value={paste} onChange={setPaste} multiline hint="For example text from a phone's photo text selection. Only blank fields are filled." />
        <button className="btn" type="button" onClick={readPasted} disabled={!paste.trim()}>Fill blank fields</button>
        {note && <p className="hint" role="status">{note}</p>}
      </div>
      <div className="panel">
        <h3>Equipment</h3>
        {KEYS.map(k => k === "equipmentType" ? (
          <SelectField key={k} label={LABELS[k]} value={fields[k]} placeholder="Choose equipment type" options={[
            ...EQUIPMENT_TYPES.map(value => ({ value, label: value })),
            ...(fields[k] && !EQUIPMENT_TYPES.some(value => value === fields[k]) ? [{ value: fields[k], label: `Existing value: ${fields[k]}` }] : []),
          ]} onChange={value => { edited.current.add(k); setFields(current => ({ ...current, [k]: value })); }} hint="A clear printed type may be suggested. Confirm the type of this unit; unknown or ambiguous scans stay unselected." />
        ) : (
          <TextField key={k} label={LABELS[k]} value={fields[k]} onChange={value => { edited.current.add(k); setFields(current => ({ ...current, [k]: value })); }} maxLength={80}
            hint={k === "manufacturedDate" ? "Use YYYY, YYYY-MM, MM/YYYY or YYYY-MM-DD. Only enter a date actually printed on the plate." : undefined} />
        ))}
        <TextField label="Equipment age (years, optional)" value={age} onChange={value => setFields(current => ({ ...current, age: value, ageMode: "manual" }))} maxLength={4}
          hint={fields.ageMode === "manual" ? "Manual override kept. Manufacture-date changes will not replace it." : ageSuggestion ? `${ageSuggestion.label} Confirm the printed date before saving.` : fields.manufacturedDate.trim() ? "Age could not be calculated: check the date format and make sure it is not in the future. You can enter age manually." : "Age fills when a valid printed manufacture date is entered. Blank means unknown."} />
        {fields.ageMode === "manual" && ageSuggestion && <button className="btn" type="button" onClick={() => setFields(current => ({ ...current, ageMode: "date" }))}>Use age from manufacture date</button>}
      </div>
      <ActionBar note={saving ? "Saving equipment…" : saved || saveNote ? saveNote : initialSaveNote}>
        <button className="btn primary" type="button" onClick={() => void save()} disabled={saving || saved || busy}>{saving ? "Saving…" : saved ? "Saved" : "Save equipment"}</button>
      </ActionBar>
    </div>
  );
}
