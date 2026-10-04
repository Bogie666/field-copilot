"use client";

import { assessStatic, EMPTY_STATIC, MAX_COMPONENTS, staticFrom, type StaticInput } from "../../lib/tools/staticPressure";
import { fixed } from "../../lib/tools/numbers";
import { hashInputs } from "../../lib/job/types";
import { ErrorList, NumberField, Plate, ResultCard, TextField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

export default function StaticTool({ ctx }: { ctx: ToolContext }) {
  const suggestion = staticFrom(ctx.system?.equipment.maxExternalStatic);
  const [form, , setForm] = useFormState<StaticInput>(ctx, EMPTY_STATIC, { rated: suggestion });
  const set = <K extends keyof StaticInput>(key: K, value: StaticInput[K]) => setForm((c) => ({ ...c, [key]: value }));
  const { errors, result } = assessStatic(form);
  const touched = !!(form.supply.trim() || form.returnStatic.trim());

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.severity === "concern" ? "Static pressure above rated" : "Static pressure",
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: (result.reference + nameplateNote([["rated external static", form.rated, suggestion]])).trim() || undefined,
          inputs: { ...form },
        }
      : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Readings</h3>
        <p className="hint">Enter each as a positive number. Measure with the blower running at the speed used for the test.</p>
        <div className="fieldRow">
          <NumberField label="Supply static" unit="in. w.c." value={form.supply} onChange={(v) => set("supply", v)} />
          <NumberField label="Return static" unit="in. w.c." value={form.returnStatic} onChange={(v) => set("returnStatic", v)} />
        </div>
        <NumberField label="Rated external static" unit="in. w.c." value={form.rated} onChange={(v) => set("rated", v)} tag={suggestion && form.rated.trim() === suggestion ? "From nameplate" : undefined} hint="Leave blank to record without comparing." />
      </div>
      <div className="panel">
        <h3>Component drops (optional)</h3>
        <p className="hint">Record the pressure drop across a filter or coil if you measured it.</p>
        {form.components.map((c, i) => (
          <div className="fieldRow" key={i}>
            <TextField label={`Component ${i + 1}`} value={c.label} onChange={(v) => set("components", form.components.map((x, j) => (j === i ? { ...x, label: v } : x)))} placeholder="Filter" maxLength={30} />
            <NumberField label="Drop" unit="in. w.c." value={c.value} onChange={(v) => set("components", form.components.map((x, j) => (j === i ? { ...x, value: v } : x)))} />
          </div>
        ))}
        <div className="btnRow">
          {form.components.length < MAX_COMPONENTS && (
            <button className="btn" type="button" onClick={() => set("components", [...form.components, { label: "", value: "" }])}>
              Add component
            </button>
          )}
          {form.components.length > 0 && (
            <button className="btn ghost" type="button" onClick={() => set("components", form.components.slice(0, -1))}>
              Remove last
            </button>
          )}
        </div>
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Total external static">
          <div className="bigReading">
            {fixed(result.tesp, 2)}
            <small>in. w.c.</small>
          </div>
          {result.percentOfRated !== null && <Plate rows={[{ label: "Percent of rated", value: String(Math.round(result.percentOfRated)), unit: "%" }]} />}
          <p>{result.items[0].line}</p>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
