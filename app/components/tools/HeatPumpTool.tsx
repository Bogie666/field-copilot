"use client";

import { matchPtRefrigerant, PT_DATA_APPROVED, ptRefrigerants } from "../../lib/charge/ptData";
import { equipmentForScope, hashInputs } from "../../lib/job/types";
import { fmt } from "../../lib/tools/numbers";
import { assessHeatPump, DEFROST_CHECKS, EMPTY_HEAT_PUMP, type DefrostState, type HeatPumpInput } from "../../lib/tools/heatPump";
import { Callout, ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { nameplateNote, useFormState } from "./useFormState";

const DEFROST_OPTIONS = [{ value: "yes", label: "Worked" }, { value: "no", label: "Did not happen" }];

export default function HeatPumpTool({ ctx }: { ctx: ToolContext }) {
  const suggestion = matchPtRefrigerant(equipmentForScope(ctx.system, ctx.scope).refrigerant);
  const [form, set] = useFormState<HeatPumpInput>(ctx, EMPTY_HEAT_PUMP, { refrigerant: suggestion });
  const { errors, result } = assessHeatPump(form);
  const touched = Object.entries(form).some(([k, v]) => k !== "refrigerant" && (typeof v === "string" ? !!v.trim() : Object.values(v ?? {}).some(Boolean)));

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.severity === "concern" ? "Heat pump heating needs attention" : "Heat pump heating check",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: (result.reference + nameplateNote([["refrigerant", form.refrigerant, suggestion]])).trim() || undefined,
    inputs: JSON.parse(JSON.stringify(form)) as Record<string, unknown>,
  } : null;

  const plate = result ? [
    result.riseF !== null ? { label: "Temperature rise", value: fmt(result.riseF), unit: "F" } : null,
    result.superheatF !== null ? { label: "Superheat", value: fmt(result.superheatF), unit: "F" } : null,
    result.subcoolingF !== null ? { label: "Subcooling", value: fmt(result.subcoolingF), unit: "F" } : null,
    result.stripKw !== null ? { label: "Heat strips", value: fmt(result.stripKw, 2), unit: "kW" } : null,
  ].filter((row): row is { label: string; value: string; unit: string } => row !== null) : [];

  return (
    <div className="stack">
      <div className="panel">
        <h3>Heating performance</h3>
        <p className="hint">Run in heating with auxiliary heat off for at least 10 minutes. Targets come from the manufacturer heating chart.</p>
        <NumberField label="Outdoor temperature" unit="F" value={form.outdoorF} onChange={(v) => set("outdoorF", v)} />
        <div className="fieldRow">
          <NumberField label="Return air" unit="F" value={form.returnF} onChange={(v) => set("returnF", v)} />
          <NumberField label="Supply air" unit="F" value={form.supplyF} onChange={(v) => set("supplyF", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Chart rise low (optional)" unit="F" value={form.riseMinF} onChange={(v) => set("riseMinF", v)} />
          <NumberField label="Chart rise high" unit="F" value={form.riseMaxF} onChange={(v) => set("riseMaxF", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Refrigerant side (optional)</h3>
        {!PT_DATA_APPROVED && <Callout tone="warn"><p>Pressure-temperature data is provisional. Check readings against your gauge set or the manufacturer chart.</p></Callout>}
        <SelectField label="Refrigerant" value={form.refrigerant} onChange={(v) => set("refrigerant", v)} placeholder="Choose" options={ptRefrigerants().map((r) => ({ value: r.id, label: `${r.id} (${r.safetyClass})` }))} hint={suggestion && form.refrigerant === suggestion ? "From nameplate. Confirm it matches the unit." : undefined} />
        <p className="hint">In heating, read the low side at the compressor suction port, not the vapor line valve, which is the high side in heating.</p>
        <div className="fieldRow">
          <NumberField label="Low-side pressure" unit="psig" value={form.lowPsig} onChange={(v) => set("lowPsig", v)} />
          <NumberField label="Suction line temp" unit="F" value={form.suctionLineF} onChange={(v) => set("suctionLineF", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="High-side pressure" unit="psig" value={form.highPsig} onChange={(v) => set("highPsig", v)} />
          <NumberField label="Liquid line temp" unit="F" value={form.liquidLineF} onChange={(v) => set("liquidLineF", v)} hint="Leaving the indoor coil." />
        </div>
        <div className="fieldRow">
          <NumberField label="Heating target subcooling" unit="F" value={form.targetSubcoolingF} onChange={(v) => set("targetSubcoolingF", v)} />
          <NumberField label="Tolerance" unit="F" value={form.subcoolingTolF} onChange={(v) => set("subcoolingTolF", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Auxiliary heat strips (optional)</h3>
        <p className="hint">Measure with all stages energized. Enter total amps for the kit on a single-phase supply.</p>
        <div className="fieldRow">
          <NumberField label="Measured voltage" unit="V" value={form.stripVolts} onChange={(v) => set("stripVolts", v)} />
          <NumberField label="Measured amps" unit="A" value={form.stripAmps} onChange={(v) => set("stripAmps", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Rated kW" unit="kW" value={form.stripRatedKw} onChange={(v) => set("stripRatedKw", v)} />
          <NumberField label="At rated voltage" unit="V" value={form.stripRatedVolts} onChange={(v) => set("stripRatedVolts", v)} hint="From the heat kit label." />
        </div>
        <NumberField label="Tolerance" unit="plus or minus %" value={form.stripTolPct} onChange={(v) => set("stripTolPct", v)} hint="Leave blank to record without classifying." />
      </div>
      <div className="panel">
        <h3>Defrost check (optional)</h3>
        {DEFROST_CHECKS.map((c) => (
          <SelectField key={c.id} label={c.label} value={form.defrost?.[c.id] ?? ""} onChange={(v) => set("defrost", { ...form.defrost, [c.id]: v as DefrostState })} placeholder="Not checked" options={DEFROST_OPTIONS} />
        ))}
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Heating result">
          {plate.length > 0 && <Plate rows={plate} />}
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
          {result.notes.map((note) => <Callout key={note} tone="warn"><p>{note}</p></Callout>)}
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} />
    </div>
  );
}
