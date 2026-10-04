"use client";

import { assessDuct, EMPTY_DUCT, type DuctInput } from "../../lib/tools/duct";
import { hashInputs } from "../../lib/job/types";
import { fmt } from "../../lib/tools/numbers";
import { ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

export default function DuctTool({ ctx }: { ctx: ToolContext }) {
  const [form, , setForm] = useFormState<DuctInput>(ctx, EMPTY_DUCT);
  const set = <K extends keyof DuctInput>(key: K, value: DuctInput[K]) => setForm((c) => ({ ...c, [key]: value }));
  const touched = !!(form.cfm.trim() || form.width.trim() || form.height.trim());
  const { errors, result } = assessDuct(form);

  const built: BuiltFinding | null = result
    ? { severity: result.severity, title: result.band === "within" ? "Duct velocity within screening range" : result.band === "none" ? "Duct sizing" : `Duct velocity ${result.band} screening range`, diagnosis: result.diagnosis, readings: result.readings, reference: result.reference, inputs: { ...form } }
    : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Duct run</h3>
        <div className="fieldRow">
          <SelectField label="Side" value={form.side} onChange={(v) => set("side", v as DuctInput["side"])} options={[{ value: "supply", label: "Supply" }, { value: "return", label: "Return" }]} />
          <SelectField label="Section" value={form.section} onChange={(v) => set("section", v as DuctInput["section"])} options={[{ value: "trunk", label: "Trunk" }, { value: "branch", label: "Branch" }]} />
        </div>
        <NumberField label="Airflow" unit="CFM" value={form.cfm} onChange={(v) => set("cfm", v)} />
        <div className="fieldRow">
          <NumberField label="Duct width" unit="in" value={form.width} onChange={(v) => set("width", v)} />
          <NumberField label="Duct height" unit="in" value={form.height} onChange={(v) => set("height", v)} />
        </div>
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Duct velocity">
          <div className="bigReading">
            {fmt(result.velocity, 0)}
            <small>FPM</small>
          </div>
          <Plate
            rows={[
              { label: "Area", value: fmt(result.areaSqFt, 2), unit: "sq ft" },
              { label: "Equivalent round", value: fmt(result.equivalentRoundIn), unit: "in" },
              { label: "Round at target velocity", value: fmt(result.roundAtTargetIn), unit: "in" },
            ]}
          />
          <p>{result.guidance}</p>
          {result.suggestions.round.length > 0 && <p className="hint">Nearby round sizes: {result.suggestions.round.join(", ")} in. Rectangular: {result.suggestions.rectangular.join(", ")}.</p>}
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
