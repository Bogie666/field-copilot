"use client";

import { useEffect, useRef, useState } from "react";
import { prepareNameplateImage, type PreparedNameplateImage } from "../../lib/nameplateImage";
import { EMPTY_NAMEPLATE_FIELDS, NAMEPLATE_FIELD_KEYS, type NameplateFieldKey } from "../../lib/nameplate";
import { readDeviceNameplate, fillNameplateBlanks } from "../../lib/nameplateScan";
import { Callout, TextField } from "../ui";
import { ActionBar } from "../ui";
import type { ToolContext } from "./context";

const LABELS: Record<NameplateFieldKey | "tempRiseRange" | "maxExternalStatic", string> = {
  manufacturer: "Manufacturer", model: "Model", serial: "Serial", equipmentType: "Equipment type", manufacturedDate: "Manufactured date (only if printed)",
  refrigerant: "Refrigerant", voltage: "Voltage", phase: "Phase", frequency: "Frequency", mca: "Minimum circuit amps", maxFuseBreaker: "Max fuse or breaker",
  rla: "Rated load amps", lra: "Locked rotor amps", capacity: "Capacity (only if printed)", tempRiseRange: "Temperature rise range (F, for example 35-65)", maxExternalStatic: "Max external static (in. w.c.)",
};
const KEYS = [...NAMEPLATE_FIELD_KEYS, "tempRiseRange", "maxExternalStatic"] as const;
type Key = (typeof KEYS)[number];

export default function NameplateTool({ ctx }: { ctx: ToolContext }) {
  const { api, system } = ctx;
  const [fields, setFields] = useState<Record<Key, string>>(() => ({ ...EMPTY_NAMEPLATE_FIELDS, tempRiseRange: "", maxExternalStatic: "", ...(system?.equipment ?? {}) }));
  const [age, setAge] = useState(system?.equipmentAge ?? "");
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [prepared, setPrepared] = useState<PreparedNameplateImage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const [scanStatus, setScanStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
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
      const text = await readDeviceNameplate(prepared.enhancedDataUrl, abort.signal, (status, amount) => {
        if (id !== request.current) return;
        setScanStatus(`Device OCR: ${status}`); setProgress(amount);
      });
      if (id !== request.current) return;
      setPaste(text);
      setFields(c => fillNameplateBlanks(c, text, edited.current));
      setSaved(false);
      setScanStatus(text.trim() ? "Scan complete. Check every field against the photo before saving." : "No readable text. Retake the photo or enter the plate manually.");
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? `${e.message} Try a clearer photo or manual entry.` : "Device OCR failed. Use manual entry.");
    } finally {
      if (id === request.current) { setBusy(false); controller.current = null; }
    }
  }

  async function choose(file: File | undefined) {
    if (!file) return;
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


  const edited = useRef(new Set<string>());
  function readPasted() {
    setFields((c) => fillNameplateBlanks(c, paste, edited.current));
    setNote("Filled empty fields only. Check every value against the plate before saving.");
    setSaved(false);
  }

  function save() {
    if (!api || !system) return;
    const equipment = Object.fromEntries(KEYS.map((k) => [k, fields[k].trim()]).filter(([, v]) => v)) as Record<string, string>;
    api.dispatch({ type: "setEquipment", systemId: system.id, equipment });
    api.dispatch({ type: "setEquipmentAge", systemId: system.id, age: age.trim() });
    setSaved(true);
  }

  if (!api || !system) return <p className="hint">Open this tool from a job to save equipment details.</p>;
  return (
    <div className="stack">
      <Callout title="You confirm every field">Type the values from the plate. Nothing is read from a serial number. Age is whatever you enter, and blank means unknown.</Callout>
      <div className="panel">
        <h3>Camera and device OCR</h3>
        <p className="hint">Fill the frame with a sharp, glare-free plate. Device OCR keeps the photo in this browser; no paid vision is used. The first scan may download OCR language files.</p>
        <input ref={camera} className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" aria-label="Take a nameplate photo" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <input ref={gallery} className="visuallyHidden" type="file" accept="image/jpeg,image/png,image/webp" aria-label="Choose a nameplate photo" onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }} />
        <div className="pillrow">
          <button className="btn" type="button" onClick={() => camera.current?.click()}>Take plate photo</button>
          <button className="btn" type="button" onClick={() => gallery.current?.click()}>Choose plate photo</button>
        </div>
        {prepared && <>
          <img src={prepared.colorDataUrl} alt="Selected equipment nameplate" style={{ width: "100%", height: "auto" }} />
          <button className="btn" type="button" disabled={busy} onClick={() => void scan()}>Read on device</button>
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
        {KEYS.map((k) => (
          <TextField key={k} label={LABELS[k]} value={fields[k]} onChange={(v) => { edited.current.add(k); setFields((c) => ({ ...c, [k]: v })); setSaved(false); }} maxLength={80} />
        ))}
        <TextField label="Equipment age (years, optional)" value={age} onChange={(v) => { setAge(v); setSaved(false); }} maxLength={3} />
      </div>
      <ActionBar note={saved ? "Saved to this system" : "Not saved yet"}>
        <button className="btn primary" type="button" onClick={save} disabled={saved}>{saved ? "Saved" : "Save equipment"}</button>
      </ActionBar>
    </div>
  );
}
