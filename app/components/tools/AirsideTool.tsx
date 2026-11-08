"use client";

import { hashInputs } from "../../lib/job/types";
import { assessAirside, DRAIN_FLOW, DRAIN_TRAP, EMPTY_AIRSIDE, FILTER_CONDITIONS, PAN_CONDITION, SAFETY_SWITCH, type AirsideInput } from "../../lib/tools/airside";
import { fmt } from "../../lib/tools/numbers";
import { ErrorList, NumberField, Plate, ResultCard, SelectField, TextField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const opts = (list: readonly { value: string; label: string }[]) => list.map(({ value, label }) => ({ value, label }));

export default function AirsideTool({ ctx }: { ctx: ToolContext }) {
  const [form, set] = useFormState<AirsideInput>(ctx, EMPTY_AIRSIDE);
  const { errors, result } = assessAirside(form);
  const touched = Object.values(form).some((v) => !!v.trim());

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.severity === "concern" ? "Filter or condensate needs attention" : "Filter, drain and humidity",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: result.reference || undefined,
    inputs: { ...form },
  } : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Filter</h3>
        <div className="fieldRow">
          <TextField label="Size" value={form.filterSize} onChange={(v) => set("filterSize", v)} maxLength={20} placeholder="16x25x1" />
          <TextField label="Rating" value={form.filterRating} onChange={(v) => set("filterRating", v)} maxLength={20} placeholder="MERV 8" />
        </div>
        <SelectField label="Condition" value={form.filterCondition} onChange={(v) => set("filterCondition", v)} placeholder="Not checked" options={opts(FILTER_CONDITIONS)} />
      </div>
      <div className="panel">
        <h3>Condensate</h3>
        <SelectField label="Primary drain" value={form.drainFlow} onChange={(v) => set("drainFlow", v)} placeholder="Not checked" options={opts(DRAIN_FLOW)} />
        <SelectField label="Trap" value={form.drainTrap} onChange={(v) => set("drainTrap", v)} placeholder="Not checked" options={opts(DRAIN_TRAP)} />
        <SelectField label="Overflow safety switch" value={form.safetySwitch} onChange={(v) => set("safetySwitch", v)} placeholder="Not checked" options={opts(SAFETY_SWITCH)} hint="Test by lifting the float or filling the pan until the system shuts off." />
        <SelectField label="Secondary pan" value={form.pan} onChange={(v) => set("pan", v)} placeholder="Not checked" options={opts(PAN_CONDITION)} />
      </div>
      <div className="panel">
        <h3>Indoor humidity (optional)</h3>
        <div className="fieldRow">
          <NumberField label="Indoor temperature" unit="F" value={form.indoorF} onChange={(v) => set("indoorF", v)} />
          <NumberField label="Relative humidity" unit="%" value={form.indoorRh} onChange={(v) => set("indoorRh", v)} />
        </div>
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity} title="Result">
          {result.dewPointF !== null && <Plate rows={[{ label: "Indoor dew point", value: fmt(result.dewPointF), unit: "F" }]} />}
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
