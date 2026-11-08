"use client";

import { equipmentForScope, hashInputs } from "../../lib/job/types";
import { assessRefrigerantLog, EMPTY_REFRIGERANT_LOG, formatLbOz, type RefrigerantLogInput } from "../../lib/tools/refrigerantLog";
import { ErrorList, NumberField, Plate, ResultCard, TextField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

export default function RefrigerantLogTool({ ctx }: { ctx: ToolContext }) {
  const suggestion = (equipmentForScope(ctx.system, ctx.scope).refrigerant ?? "").trim();
  const [form, set] = useFormState<RefrigerantLogInput>(ctx, EMPTY_REFRIGERANT_LOG, { refrigerant: suggestion });
  const { errors, result } = assessRefrigerantLog(form);
  const touched = Object.entries(form).some(([k, v]) => k !== "refrigerant" && !!v.trim());

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: "Refrigerant record",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: (result.reference + nameplateNote([["refrigerant", form.refrigerant, suggestion]])).trim() || undefined,
    inputs: { ...form },
  } : null;

  const plate = result ? [
    result.addedOz !== null ? { label: "Added", value: formatLbOz(result.addedOz) } : null,
    result.recoveredOz !== null ? { label: "Recovered", value: formatLbOz(result.recoveredOz) } : null,
    result.adjustmentOz !== null ? { label: "Line set adjustment", value: formatLbOz(result.adjustmentOz) } : null,
  ].filter((row): row is { label: string; value: string } => row !== null) : [];

  return (
    <div className="stack">
      <div className="panel">
        <h3>Refrigerant handled</h3>
        <TextField label="Refrigerant" value={form.refrigerant} onChange={(v) => set("refrigerant", v)} maxLength={20} placeholder="R-410A" hint={suggestion && form.refrigerant.trim() === suggestion ? "From nameplate. Confirm it matches the unit." : undefined} />
        <div className="fieldRow">
          <NumberField label="Added" unit="lb" value={form.addedLb} onChange={(v) => set("addedLb", v)} />
          <NumberField label="and" unit="oz" value={form.addedOz} onChange={(v) => set("addedOz", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Recovered" unit="lb" value={form.recoveredLb} onChange={(v) => set("recoveredLb", v)} />
          <NumberField label="and" unit="oz" value={form.recoveredOz} onChange={(v) => set("recoveredOz", v)} />
        </div>
        <TextField label="Cylinder or lot (optional)" value={form.cylinder} onChange={(v) => set("cylinder", v)} maxLength={40} />
        <TextField label="Reason (optional)" value={form.reason} onChange={(v) => set("reason", v)} maxLength={200} placeholder="Leak repaired at evaporator coil" />
      </div>
      <div className="panel">
        <h3>Line set charge adjustment (optional)</h3>
        <p className="hint">Use the values from the outdoor unit installation manual.</p>
        <div className="fieldRow">
          <NumberField label="Line set length" unit="ft" value={form.lineLengthFt} onChange={(v) => set("lineLengthFt", v)} />
          <NumberField label="Included in factory charge" unit="ft" value={form.includedLengthFt} onChange={(v) => set("includedLengthFt", v)} />
        </div>
        <NumberField label="Adjustment per foot" unit="oz/ft" value={form.ozPerFt} onChange={(v) => set("ozPerFt", v)} />
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone="info" title="Record">
          {plate.length > 0 && <Plate rows={plate} />}
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
