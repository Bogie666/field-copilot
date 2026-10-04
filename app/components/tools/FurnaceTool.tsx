"use client";

import { assessFurnace, EMPTY_FURNACE, FURNACE_SAFETY_CONFIG, OBSERVATIONS, parseRiseRange, type FurnaceInput } from "../../lib/tools/furnaceCheck";
import { fmt } from "../../lib/tools/numbers";
import { hashInputs } from "../../lib/job/types";
import { Callout, Check, ErrorList, NumberField, Plate, ResultCard } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

export default function FurnaceTool({ ctx }: { ctx: ToolContext }) {
  const range = parseRiseRange(ctx.system?.equipment.tempRiseRange);
  const seed: Partial<FurnaceInput> = range ? { riseMinF: String(range[0]), riseMaxF: String(range[1]) } : {};
  const [form, , setForm] = useFormState<FurnaceInput>(ctx, EMPTY_FURNACE, seed);
  const set = <K extends keyof FurnaceInput>(key: K, value: FurnaceInput[K]) => setForm((c) => ({ ...c, [key]: value }));
  const { errors, result } = assessFurnace(form);
  const touched = !!(form.returnF || form.supplyF || form.coPpm || Object.values(form.observations).some(Boolean));
  const fromPlate = !!range && form.riseMinF === String(range[0]) && form.riseMaxF === String(range[1]);

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.safety ? "Safety condition observed" : result.severity === "concern" ? "Temperature rise outside nameplate range" : "Furnace check",
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: (result.reference + (fromPlate ? " Taken from the confirmed nameplate." : "")).trim() || undefined,
          inputs: JSON.parse(JSON.stringify(form)) as Record<string, unknown>,
          requiresPhotoForSafety: true,
        }
      : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Temperature rise</h3>
        <div className="fieldRow">
          <NumberField label="Return air" unit="F" value={form.returnF} onChange={(v) => set("returnF", v)} />
          <NumberField label="Supply air" unit="F" value={form.supplyF} onChange={(v) => set("supplyF", v)} />
        </div>
        <div className="fieldRow">
          <NumberField label="Rise range low" unit="F" value={form.riseMinF} onChange={(v) => set("riseMinF", v)} tag={fromPlate ? "From nameplate" : undefined} />
          <NumberField label="Rise range high" unit="F" value={form.riseMaxF} onChange={(v) => set("riseMaxF", v)} tag={fromPlate ? "From nameplate" : undefined} />
        </div>
        <p className="hint">Measure after the furnace has run long enough to reach steady state, with the supply probe out of line of sight of the heat exchanger.</p>
      </div>
      <div className="panel">
        <h3>Combustion safety</h3>
        <NumberField label="Flue CO reading (optional)" unit="ppm" value={form.coPpm} onChange={(v) => set("coPpm", v)} />
        <fieldset className="fieldset">
          <legend>Observed conditions</legend>
          {OBSERVATIONS.map((o) => (
            <Check key={o.id} label={o.label} checked={form.observations[o.id]} onChange={(checked) => set("observations", { ...form.observations, [o.id]: checked })} />
          ))}
          <p className="hint">Tick only what you observed. Any tick makes this a safety finding that needs a photo and a documented action.</p>
        </fieldset>
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity === "safety" ? "safety" : result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title={result.safety ? "Safety condition" : "Result"}>
          {result.rise !== null && <Plate rows={[{ label: "Temperature rise", value: fmt(result.rise), unit: "F" }]} />}
          <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
            {result.items.map((i) => (
              <li key={i.id}>{i.line}</li>
            ))}
          </ul>
          {result.notes.map((n) => (
            <Callout key={n} tone="warn">
              <p>{n}</p>
            </Callout>
          ))}
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} safetyPrompt={FURNACE_SAFETY_CONFIG.safetyActionPrompt} />
    </div>
  );
}
