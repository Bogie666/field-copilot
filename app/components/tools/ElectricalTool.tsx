"use client";

import { equipmentForScope } from "../../lib/job/types";
import { assessElectrical, ampsFrom, CONTACTOR_LABELS, EMPTY_ELECTRICAL, voltageOptions, type ElectricalInput } from "../../lib/tools/electrical";
import { hashInputs } from "../../lib/job/types";
import { ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

export default function ElectricalTool({ ctx }: { ctx: ToolContext }) {
  const equipment = equipmentForScope(ctx.system, ctx.scope);
  const options = voltageOptions(equipment.voltage);
  const seed: Partial<ElectricalInput> = { nominalVoltage: options.length === 1 ? String(options[0]) : "", rla: ampsFrom(equipment.rla), mocp: ampsFrom(equipment.maxFuseBreaker), mca: ampsFrom(equipment.mca), lra: ampsFrom(equipment.lra) };
  const seededKeys = ["nominalVoltage", "rla", "mocp", "mca", "lra"];
  const [form, set] = useFormState<ElectricalInput>(ctx, EMPTY_ELECTRICAL, seed);
  const { errors, result } = assessElectrical(form);
  const touched = Object.entries(form).some(([k, v]) => v.trim() && !seededKeys.includes(k));
  const shownErrors = touched ? errors : [];
  const tagFor = (value: string, suggestion: string) => (suggestion && value.trim() === suggestion ? "From nameplate" : undefined);

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.severity === "concern" ? "Electrical readings need attention" : "Electrical readings",
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: (result.reference + nameplateNote([["nominal voltage", form.nominalVoltage, seed.nominalVoltage ?? ""], ["RLA", form.rla, seed.rla ?? ""], ["maximum overcurrent protection", form.mocp, seed.mocp ?? ""], ["MCA", form.mca, seed.mca ?? ""], ["LRA", form.lra, seed.lra ?? ""]])).trim() || undefined,
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
        <p className="hint">Rated uF and tolerance are printed on the capacitor itself, not the nameplate. For a dual capacitor, enter the HERM (compressor) section here and the FAN section below.</p>
        <div className="fieldRow">
          <NumberField label="Rated" unit="uF" value={form.capacitorRatedUf} onChange={(v) => set("capacitorRatedUf", v)} />
          <NumberField label="Measured" unit="uF" value={form.capacitorMeasuredUf} onChange={(v) => set("capacitorMeasuredUf", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="FAN section rated (optional)" unit="uF" value={form.fanCapRatedUf} onChange={(v) => set("fanCapRatedUf", v)} />
          <NumberField label="FAN section measured" unit="uF" value={form.fanCapMeasuredUf} onChange={(v) => set("fanCapMeasuredUf", v)} />
        </div>
        <NumberField label="Tolerance" unit="plus or minus %" value={form.capacitorTolerancePct} onChange={(v) => set("capacitorTolerancePct", v)} />
      </div>
      <div className="panel">
        <h3>Circuit and starting (optional)</h3>
        <div className="fieldRow">
          <NumberField label="Breaker or fuse installed" unit="A" value={form.breakerAmps} onChange={(v) => set("breakerAmps", v)} />
          <NumberField label="Max fuse or breaker (MOCP)" unit="A" value={form.mocp} onChange={(v) => set("mocp", v)} tag={tagFor(form.mocp, seed.mocp ?? "")} />
        </div>
        <NumberField label="Minimum circuit ampacity (MCA)" unit="A" value={form.mca} onChange={(v) => set("mca", v)} tag={tagFor(form.mca, seed.mca ?? "")} hint="Recorded as a reference for checking conductor size. It is not compared with the breaker." />
        <div className="fieldRow">
          <NumberField label="Compressor inrush" unit="A" value={form.inrushAmps} onChange={(v) => set("inrushAmps", v)} hint="Peak reading from a meter inrush function." />
          <NumberField label="Compressor LRA" unit="A" value={form.lra} onChange={(v) => set("lra", v)} tag={tagFor(form.lra, seed.lra ?? "")} />
        </div>
        <SelectField label="Contactor" value={form.contactor} onChange={(v) => set("contactor", v as ElectricalInput["contactor"])} placeholder="Not inspected" options={Object.entries(CONTACTOR_LABELS).map(([value, label]) => ({ value, label }))} />
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
