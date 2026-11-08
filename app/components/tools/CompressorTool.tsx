"use client";

import { hashInputs } from "../../lib/job/types";
import { assessCompressor, EMPTY_COMPRESSOR, WINDING_SUM_TOLERANCE_PCT, type CompressorInput } from "../../lib/tools/compressor";
import { Callout, Check, ErrorList, NumberField, ResultCard } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const WINDINGS = [
  { label: "C-S (start)", ohms: "csOhms", open: "csOpen" },
  { label: "C-R (run)", ohms: "crOhms", open: "crOpen" },
  { label: "S-R", ohms: "srOhms", open: "srOpen" },
] as const;

export default function CompressorTool({ ctx }: { ctx: ToolContext }) {
  const [form, set] = useFormState<CompressorInput>(ctx, EMPTY_COMPRESSOR);
  const { errors, result } = assessCompressor(form);
  const touched = Object.entries(form).some(([k, v]) => k !== "hotShell" && (typeof v === "string" ? !!v.trim() : v === true));

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.severity === "concern" ? "Compressor winding test needs attention" : "Compressor winding test",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: result.reference || undefined,
    inputs: { ...form },
  } : null;

  return (
    <div className="stack">
      <Callout tone="warn"><p>Lock out power and discharge the capacitor before removing compressor leads. Single-phase compressors only.</p></Callout>
      <div className="panel">
        <h3>Winding resistance</h3>
        <p className="hint">Zero your meter leads first. S-R should be close to C-S plus C-R (house screening band plus or minus {WINDING_SUM_TOLERANCE_PCT} percent).</p>
        {WINDINGS.map((w) => (
          <div className="fieldRow" key={w.ohms}>
            <NumberField label={w.label} unit="ohm" value={form[w.ohms]} onChange={(v) => set(w.ohms, v)} />
            <Check label="Reads open (OL)" checked={form[w.open]} onChange={(checked) => set(w.open, checked)} />
          </div>
        ))}
        <Check label="Compressor shell is hot" checked={form.hotShell} onChange={(checked) => set("hotShell", checked)} />
      </div>
      <div className="panel">
        <h3>Insulation to ground (optional)</h3>
        <div className="fieldRow">
          <NumberField label="Winding to ground" unit="megohm" value={form.groundMegohm} onChange={(v) => set("groundMegohm", v)} />
          <NumberField label="Minimum" unit="megohm" value={form.groundMinMegohm} onChange={(v) => set("groundMinMegohm", v)} hint="From the compressor maker or your procedure." />
        </div>
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity} title="Result">
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
          {result.notes.map((note) => <Callout key={note} tone="warn"><p>{note}</p></Callout>)}
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
