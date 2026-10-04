"use client";

import { assessAirflow, directCfm, EMPTY_AIRFLOW, FLOW_HOOD_READING_SCOPE, METHOD_LABELS, tonsFromCapacity, type AirflowInput } from "../../lib/tools/airflow";
import { hashInputs } from "../../lib/job/types";
import { fmt } from "../../lib/tools/numbers";
import { ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

const MAX_READINGS = 8;

export default function AirflowTool({ ctx }: { ctx: ToolContext }) {
  const suggestion = tonsFromCapacity(ctx.system?.equipment.capacity);
  const [form, , setForm] = useFormState<AirflowInput>(ctx, EMPTY_AIRFLOW, { tons: suggestion });
  const set = <K extends keyof AirflowInput>(key: K, value: AirflowInput[K]) => setForm((c) => ({ ...c, [key]: value }));
  const direct = directCfm(form.method);
  const unit = direct ? "CFM" : "FPM";
  const touched = form.readings.some((r) => r.trim()) && !!form.method;
  const { errors, result } = assessAirflow(form);
  const setList = (key: "readings" | "afterReadings", i: number, v: string) => set(key, form[key].map((x, j) => (j === i ? v : x)));

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.band === "within" ? "Airflow within screening band" : result.band === "none" ? "Airflow" : `Airflow ${result.band} screening band`,
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: (result.reference + nameplateNote([["tonnage", form.tons, suggestion]])).trim(),
          inputs: { ...form },
        }
      : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Measurement</h3>
        <SelectField label="Method" value={form.method} onChange={(v) => set("method", v as AirflowInput["method"])} placeholder="Choose a method" options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))} />
        <SelectField label="Mode" value={form.mode} onChange={(v) => set("mode", v as AirflowInput["mode"])} options={[{ value: "cooling", label: "Cooling" }, { value: "heating", label: "Heating" }]} />
        <NumberField label="System tonnage" unit="tons" value={form.tons} onChange={(v) => set("tons", v)} tag={suggestion && form.tons.trim() === suggestion ? "From nameplate" : undefined} hint="Type the tonnage. A confirmed nameplate capacity suggests it." />
        {!direct && form.method && (
          <>
            <SelectField label="Duct shape" value={form.shape} onChange={(v) => set("shape", v as AirflowInput["shape"])} options={[{ value: "rect", label: "Rectangular" }, { value: "round", label: "Round" }]} />
            {form.shape === "rect" ? (
              <div className="fieldRow">
                <NumberField label="Duct width" unit="in" value={form.width} onChange={(v) => set("width", v)} />
                <NumberField label="Duct height" unit="in" value={form.height} onChange={(v) => set("height", v)} />
              </div>
            ) : (
              <NumberField label="Duct diameter" unit="in" value={form.diameter} onChange={(v) => set("diameter", v)} />
            )}
          </>
        )}
      </div>
      <div className="panel">
        <h3>Readings</h3>
        {form.method === "flow-hood" && <p className="hint">{FLOW_HOOD_READING_SCOPE} The same scope applies to after readings.</p>}
        {form.readings.map((r, i) => (
          <NumberField key={i} label={`${direct ? "Airflow" : "Velocity"} reading ${i + 1}`} unit={unit} value={r} onChange={(v) => setList("readings", i, v)} />
        ))}
        <div className="btnRow">
          {form.readings.length < MAX_READINGS && (
            <button className="btn" type="button" onClick={() => set("readings", [...form.readings, ""])}>
              Add reading
            </button>
          )}
          {form.readings.length > 1 && (
            <button className="btn ghost" type="button" onClick={() => set("readings", form.readings.slice(0, -1))}>
              Remove last
            </button>
          )}
        </div>
      </div>
      <details className="panel">
        <summary>After readings and capacity (optional)</summary>
        {form.afterReadings.map((r, i) => (
          <NumberField key={i} label={`After reading ${i + 1}`} unit={unit} value={r} onChange={(v) => setList("afterReadings", i, v)} />
        ))}
        <div className="btnRow">
          {form.afterReadings.length < MAX_READINGS && (
            <button className="btn" type="button" onClick={() => set("afterReadings", [...form.afterReadings, ""])}>
              Add after reading
            </button>
          )}
        </div>
        <div className="fieldRow">
          <NumberField label="Delta-T" unit="F" value={form.deltaT} onChange={(v) => set("deltaT", v)} hint="Gives sensible capacity." />
          <NumberField label="Enthalpy delta" unit="BTU/lb" value={form.enthalpy} onChange={(v) => set("enthalpy", v)} hint="Gives total capacity." />
        </div>
      </details>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Airflow per ton">
          <div className="bigReading">
            {fmt(result.cfmPerTon, 0)}
            <small>CFM/ton</small>
          </div>
          <Plate
            rows={[
              { label: "Estimated airflow", value: fmt(result.cfm, 0), unit: "CFM" },
              ...(result.changeCfm !== null ? [{ label: "Change after", value: fmt(result.changeCfm, 0), unit: "CFM" }] : []),
              ...(result.sensible !== null ? [{ label: "Sensible capacity", value: fmt(result.sensible, 0), unit: "BTU/h" }] : []),
              ...(result.total !== null ? [{ label: "Total capacity", value: fmt(result.total, 0), unit: "BTU/h" }] : []),
            ]}
          />
          <p>{result.statusText}</p>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
