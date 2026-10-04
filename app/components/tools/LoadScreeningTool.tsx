"use client";

import { assessLoad, climateProfiles, EMPTY_LOAD, loadDiagnosis, loadReadings, type LoadForm } from "../../lib/tools/load";
import { hashInputs } from "../../lib/job/types";
import { ErrorList, NumberField, Plate, ResultCard, SelectField, Callout } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const opt = (...values: string[]) => values.map((v) => ({ value: v, label: v.charAt(0).toUpperCase() + v.slice(1) }));
const n = (v: number) => Math.round(v).toLocaleString("en-US");

export default function LoadScreeningTool({ ctx }: { ctx: ToolContext }) {
  const [form, , setForm] = useFormState<LoadForm>(ctx, EMPTY_LOAD);
  const set = <K extends keyof LoadForm>(key: K, value: LoadForm[K]) => setForm((c) => ({ ...c, [key]: value }));
  const touched = !!(form.squareFeet.trim() || form.ceilingHeight.trim() || form.occupants.trim());
  const { errors, input, result } = assessLoad(form);
  const custom = form.climateProfile === "custom";

  const built: BuiltFinding | null =
    result && input
      ? { severity: "info", title: "Load screening range", diagnosis: loadDiagnosis(result), readings: loadReadings(input, result), reference: "Screening estimate only. Setpoints and appliance gains are assumptions unless changed. Not for final equipment selection.", inputs: { ...form } }
      : null;

  return (
    <div className="stack">
      <Callout title="Screening only">This gives a rough range. It is not an ACCA Manual J calculation and is not for final equipment selection.</Callout>
      <div className="panel">
        <h3>Home facts</h3>
        <div className="fieldRow">
          <NumberField label="Conditioned area" unit="sq ft" value={form.squareFeet} onChange={(v) => set("squareFeet", v)} />
          <NumberField label="Ceiling height" unit="ft" value={form.ceilingHeight} onChange={(v) => set("ceilingHeight", v)} />
        </div>
        <NumberField label="Occupants" value={form.occupants} onChange={(v) => set("occupants", v)} />
        <SelectField label="Climate profile" value={form.climateProfile} onChange={(v) => set("climateProfile", v as LoadForm["climateProfile"])} options={[...Object.entries(climateProfiles).filter(([k]) => k !== "custom").map(([value, p]) => ({ value, label: p.label })), { value: "custom", label: "Custom design values" }]} hint="Profiles are regional presets. Choose custom to enter your own." />
        {custom && (
          <div className="fieldRow">
            <NumberField label="Cooling design temp" unit="F" value={form.customCooling} onChange={(v) => set("customCooling", v)} />
            <NumberField label="Heating design temp" unit="F" value={form.customHeating} onChange={(v) => set("customHeating", v)} />
            <NumberField label="Moisture difference" unit="gr/lb" value={form.customGrains} onChange={(v) => set("customGrains", v)} />
          </div>
        )}
      </div>
      <div className="panel">
        <h3>Assumptions</h3>
        <p className="hint">These start at common values. Change them to match the home.</p>
        <div className="fieldRow">
          <NumberField label="Cooling setpoint" unit="F" value={form.indoorCooling} onChange={(v) => set("indoorCooling", v)} tag="Assumed" />
          <NumberField label="Heating setpoint" unit="F" value={form.indoorHeating} onChange={(v) => set("indoorHeating", v)} tag="Assumed" />
        </div>
        <NumberField label="Appliance gains" unit="BTU/h" value={form.appliances} onChange={(v) => set("appliances", v)} tag="Assumed" />
        <div className="fieldRow">
          <SelectField label="Insulation" value={form.insulation} onChange={(v) => set("insulation", v as LoadForm["insulation"])} options={opt("poor", "average", "good")} />
          <SelectField label="Air tightness" value={form.tightness} onChange={(v) => set("tightness", v as LoadForm["tightness"])} options={opt("leaky", "average", "tight")} />
          <SelectField label="Windows" value={form.windows} onChange={(v) => set("windows", v as LoadForm["windows"])} options={[{ value: "single", label: "Single pane" }, { value: "double", label: "Double pane" }, { value: "lowE", label: "Low-E" }]} />
        </div>
        <div className="fieldRow">
          <SelectField label="Sun exposure" value={form.sun} onChange={(v) => set("sun", v as LoadForm["sun"])} options={opt("shaded", "average", "high")} />
          <SelectField label="Duct location" value={form.ductLocation} onChange={(v) => set("ductLocation", v as LoadForm["ductLocation"])} options={opt("conditioned", "garage", "attic")} />
          <SelectField label="Duct leakage" value={form.ductLeakage} onChange={(v) => set("ductLeakage", v as LoadForm["ductLeakage"])} options={opt("low", "average", "high")} />
        </div>
        <SelectField label="Main glass orientation" value={form.orientation} onChange={(v) => set("orientation", v as LoadForm["orientation"])} options={opt("mixed", "north", "south", "east", "west")} />
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && (
        <ResultCard tone="info" title="Estimated range">
          <Plate
            rows={[
              { label: "Total cooling", value: `${n(result.coolingTotalRange.lowBtuh)} to ${n(result.coolingTotalRange.highBtuh)}`, unit: "BTU/h" },
              { label: "Heating", value: `${n(result.heatingRange.lowBtuh)} to ${n(result.heatingRange.highBtuh)}`, unit: "BTU/h" },
            ]}
          />
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
