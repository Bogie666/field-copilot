"use client";

import { useState } from "react";
import { EMPTY_NAMEPLATE_FIELDS, NAMEPLATE_FIELD_KEYS, parseNameplateText, type NameplateFieldKey } from "../../lib/nameplate";
import { parseNameplateExtras } from "../../lib/nameplateExtras";
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

  function readPasted() {
    const parsed = parseNameplateText(paste);
    const extras = parseNameplateExtras(paste);
    setFields((c) => {
      const next = { ...c };
      for (const k of NAMEPLATE_FIELD_KEYS) if (parsed.fields[k] && !c[k].trim()) next[k] = parsed.fields[k];
      for (const k of ["tempRiseRange", "maxExternalStatic"] as const) if (extras[k] && !c[k].trim()) next[k] = extras[k];
      return next;
    });
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
        <h3>Paste plate text (optional)</h3>
        <TextField label="Text from the plate" value={paste} onChange={setPaste} multiline hint="For example text from a phone's photo text selection. Only blank fields are filled." />
        <button className="btn" type="button" onClick={readPasted} disabled={!paste.trim()}>Fill blank fields</button>
        {note && <p className="hint" role="status">{note}</p>}
      </div>
      <div className="panel">
        <h3>Equipment</h3>
        {KEYS.map((k) => (
          <TextField key={k} label={LABELS[k]} value={fields[k]} onChange={(v) => { setFields((c) => ({ ...c, [k]: v })); setSaved(false); }} maxLength={80} />
        ))}
        <TextField label="Equipment age (years, optional)" value={age} onChange={(v) => { setAge(v); setSaved(false); }} maxLength={3} />
      </div>
      <ActionBar note={saved ? "Saved to this system" : "Not saved yet"}>
        <button className="btn primary" type="button" onClick={save} disabled={saved}>{saved ? "Saved" : "Save equipment"}</button>
      </ActionBar>
    </div>
  );
}
