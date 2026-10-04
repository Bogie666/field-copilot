"use client";

import { assessElectrical, ampsFrom, EMPTY_ELECTRICAL, voltageOptions, type ElectricalInput } from "../../lib/tools/electrical";
import { hashInputs } from "../../lib/job/types";
import { ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

export default function ElectricalTool({ ctx }: { ctx: ToolContext }) {
  const equipment = ctx.system?.equipment ?? {};
  const options = voltageOptions(equipment.voltage);
  const seed: Partial<ElectricalInput> = { nominalVoltage: options.length === 1 ? String(options[0]) : "", rla: ampsFrom(equipment.rla) };
  const [form, set] = useFormState<ElectricalInput>(ctx, EMPTY_ELECTRICAL, seed);
  const { errors, result } = assessElectrical(form);
  const touched = Object.entries(form).some(([k, v]) => v.trim() && k !== "nominalVoltage" && k !== "rla");
  const shownErrors = touched ? errors : [];
  const tagFor = (value: string, suggestion: string) => (suggestion && value.trim() === suggestion ? "From nameplate" : undefined);

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.severity === "concern" ? "Electrical readings need attention" : "Electrical readings",
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: (result.reference + nameplateNote([["nominal voltage", form.nominalVoltage, seed.nominalVoltage ?? ""], ["RLA", form.rla, seed.rla ?? ""]])).trim() || undefined,
          inputs: { ...form },
        }
      : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Reference values</h3>
        {options.length > 1 ? (
          <SelectField label="Nominal voltage (V)" value={form.nominalVoltage} onChange={(v) => set("nominalVoltage", v)} placeholder="Choose" options={options.map((o) => ({ value: String(o), label: `${o} V` }))} hint={`The nameplate lists ${equipment.voltage}. Choose the supply you are measuring.`} />
        ) : (
          <NumberField label="Nominal voltage" unit="V" value={form.nominalVoltage} onChange={(v) => set("nominalVoltage", v)} tag={tagFor(form.nominalVoltage, seed.nominalVoltage ?? "")} />
        )}
        <div className="fieldRow">
          <NumberField label="Compressor RLA" unit="A" value={form.rla} onChange={(v) => set("rla", v)} tag={tagFor(form.rla, seed.rla ?? "")} />
          <NumberField label="Fan FLA" unit="A" value={form.fanFla} onChange={(v) => set("fanFla", v)} hint="From the motor label." />
        </div>
      </div>
      <div className="panel">
        <h3>Measured</h3>
        <NumberField label="Line voltage" unit="V" value={form.measuredVoltage} onChange={(v) => set("measuredVoltage", v)} />
        <div className="fieldRow">
          <NumberField label="Compressor amps" unit="A" value={form.compressorAmps} onChange={(v) => set("compressorAmps", v)} />
          <NumberField label="Fan amps" unit="A" value={form.fanAmps} onChange={(v) => set("fanAmps", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Capacitor</h3>
        <p className="hint">Rated uF and tolerance are printed on the capacitor itself, not the nameplate.</p>
        <div className="fieldRow">
          <NumberField label="Rated" unit="uF" value={form.capacitorRatedUf} onChange={(v) => set("capacitorRatedUf", v)} />
          <NumberField label="Measured" unit="uF" value={form.capacitorMeasuredUf} onChange={(v) => set("capacitorMeasuredUf", v)} />
        </div>
        <NumberField label="Tolerance" unit="plus or minus %" value={form.capacitorTolerancePct} onChange={(v) => set("capacitorTolerancePct", v)} />
      </div>
      <ErrorList errors={shownErrors} />
      {result && touched && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Result">
          <Plate rows={result.items.map((i) => ({ label: i.label, value: i.tone === "ok" ? "In range" : i.tone === "concern" ? "Outside" : "Recorded" }))} />
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {result.items.map((i) => (
              <li key={i.id}>{i.line}</li>
            ))}
          </ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
