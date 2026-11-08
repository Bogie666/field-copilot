"use client";

import { hashInputs } from "../../lib/job/types";
import { assessEvacuation, EMPTY_EVACUATION, type EvacuationInput } from "../../lib/tools/evacuation";
import { fmt } from "../../lib/tools/numbers";
import { ErrorList, NumberField, Plate, ResultCard } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

export default function EvacuationTool({ ctx }: { ctx: ToolContext }) {
  const [form, set] = useFormState<EvacuationInput>(ctx, EMPTY_EVACUATION);
  const { errors, result } = assessEvacuation(form);
  const touched = Object.values(form).some((v) => !!v.trim());

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.severity === "concern" ? "Pressure test or evacuation did not meet the target" : "Pressure test and evacuation",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: result.reference || undefined,
    inputs: { ...form },
  } : null;

  const plate = result ? [
    result.correctedLossPsig !== null ? { label: "Pressure loss", value: fmt(Math.max(result.correctedLossPsig, 0)), unit: "psig" } : null,
    result.riseMicrons !== null ? { label: "Decay rise", value: fmt(result.riseMicrons, 0), unit: "microns" } : null,
  ].filter((row): row is { label: string; value: string; unit: string } => row !== null) : [];

  return (
    <div className="stack">
      <div className="panel">
        <h3>Nitrogen pressure test</h3>
        <p className="hint">Use the test pressure from the manufacturer, never above the lowest rated component. Record line or ambient temperature at start and end so a temperature change is not mistaken for a leak.</p>
        <div className="fieldRow">
          <NumberField label="Start" unit="psig" value={form.n2StartPsig} onChange={(v) => set("n2StartPsig", v)} />
          <NumberField label="End" unit="psig" value={form.n2EndPsig} onChange={(v) => set("n2EndPsig", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Start temperature" unit="F" value={form.n2StartF} onChange={(v) => set("n2StartF", v)} />
          <NumberField label="End temperature" unit="F" value={form.n2EndF} onChange={(v) => set("n2EndF", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Duration" unit="min" value={form.n2Minutes} onChange={(v) => set("n2Minutes", v)} />
          <NumberField label="Allowed drop" unit="psig" value={form.n2AllowedDropPsig} onChange={(v) => set("n2AllowedDropPsig", v)} hint="From your procedure. Leave blank to record only." />
        </div>
      </div>
      <div className="panel">
        <h3>Evacuation and decay test</h3>
        <p className="hint">Read the gauge at the system, not at the pump. A rise that levels off usually means moisture; a steady climb usually means a leak.</p>
        <div className="fieldRow">
          <NumberField label="Final vacuum" unit="microns" value={form.finalMicrons} onChange={(v) => set("finalMicrons", v)} />
          <NumberField label="Target" unit="microns" value={form.targetMicrons} onChange={(v) => set("targetMicrons", v)} hint="From the manufacturer or company procedure." />
        </div>
        <div className="fieldRow">
          <NumberField label="Isolated for" unit="min" value={form.holdMinutes} onChange={(v) => set("holdMinutes", v)} />
          <NumberField label="Reading after hold" unit="microns" value={form.holdEndMicrons} onChange={(v) => set("holdEndMicrons", v)} />
        </div>
        <NumberField label="Maximum after hold" unit="microns" value={form.maxHoldMicrons} onChange={(v) => set("maxHoldMicrons", v)} />
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity} title="Result">
          {plate.length > 0 && <Plate rows={plate} />}
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
