"use client";

import { hashInputs } from "../../lib/job/types";
import { assessGas, EMPTY_GAS, GAS_SAFETY_PROMPT, type GasFuel, type GasInput } from "../../lib/tools/gas";
import { Callout, Check, ErrorList, NumberField, Plate, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const WC = "in. w.c.";

export default function GasTool({ ctx }: { ctx: ToolContext }) {
  const [form, set] = useFormState<GasInput>(ctx, EMPTY_GAS);
  const { errors, result } = assessGas(form);
  const touched = form.gasLeak || Object.entries(form).some(([k, v]) => k !== "fuel" && typeof v === "string" && !!v.trim());

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.severity === "safety" ? "Gas leak found" : result.severity === "concern" ? "Gas pressure or input needs attention" : "Gas pressure and input",
    diagnosis: result.diagnosis,
    readings: result.readings,
    reference: result.reference || undefined,
    inputs: { ...form },
  } : null;

  return (
    <div className="stack">
      <div className="panel">
        <h3>Supply</h3>
        <SelectField label="Fuel" value={form.fuel} onChange={(v) => set("fuel", v as GasFuel)} placeholder="Choose" options={[{ value: "natural", label: "Natural gas" }, { value: "lp", label: "LP (propane)" }]} />
        <p className="hint">Use the inlet and manifold ranges from the rating plate or installation manual for this fuel.</p>
        <div className="fieldRow">
          <NumberField label="Inlet static (off)" unit={WC} value={form.inletStatic} onChange={(v) => set("inletStatic", v)} />
          <NumberField label="Inlet running (all on)" unit={WC} value={form.inletRunning} onChange={(v) => set("inletRunning", v)} hint="With every gas appliance in the home firing." />
        </div>
        <div className="fieldRow">
          <NumberField label="Minimum inlet" unit={WC} value={form.inletMin} onChange={(v) => set("inletMin", v)} />
          <NumberField label="Maximum inlet" unit={WC} value={form.inletMax} onChange={(v) => set("inletMax", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Manifold</h3>
        <NumberField label="High fire" unit={WC} value={form.manifoldHigh} onChange={(v) => set("manifoldHigh", v)} />
        <div className="fieldRow">
          <NumberField label="High fire range low" unit={WC} value={form.manifoldHighMin} onChange={(v) => set("manifoldHighMin", v)} />
          <NumberField label="High fire range high" unit={WC} value={form.manifoldHighMax} onChange={(v) => set("manifoldHighMax", v)} />
        </div>
        <NumberField label="Low fire (two-stage, optional)" unit={WC} value={form.manifoldLow} onChange={(v) => set("manifoldLow", v)} />
        <div className="fieldRow">
          <NumberField label="Low fire range low" unit={WC} value={form.manifoldLowMin} onChange={(v) => set("manifoldLowMin", v)} />
          <NumberField label="Low fire range high" unit={WC} value={form.manifoldLowMax} onChange={(v) => set("manifoldLowMax", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Clock the meter (optional)</h3>
        <p className="hint">Turn off every other gas appliance, time one full revolution of the test dial, and use the heating value from the utility.</p>
        <div className="fieldRow">
          <NumberField label="Test dial size" unit="cu ft" value={form.dialCuFt} onChange={(v) => set("dialCuFt", v)} />
          <NumberField label="Seconds per revolution" unit="s" value={form.secondsPerRev} onChange={(v) => set("secondsPerRev", v)} />
        </div>
        <NumberField label="Heating value" unit="BTU/cu ft" value={form.heatingValue} onChange={(v) => set("heatingValue", v)} />
        <div className="fieldRow">
          <NumberField label="Rated input" unit="BTU/h" value={form.ratedInputBtuh} onChange={(v) => set("ratedInputBtuh", v)} />
          <NumberField label="Tolerance" unit="plus or minus %" value={form.inputTolPct} onChange={(v) => set("inputTolPct", v)} />
        </div>
      </div>
      <div className="panel">
        <h3>Ignition and safety</h3>
        <div className="fieldRow">
          <NumberField label="Flame signal" unit="uA" value={form.flameUa} onChange={(v) => set("flameUa", v)} />
          <NumberField label="Minimum flame signal" unit="uA" value={form.flameMinUa} onChange={(v) => set("flameMinUa", v)} hint="From the control board or manual." />
        </div>
        <Check label="Gas odor or leak found" checked={form.gasLeak} onChange={(checked) => set("gasLeak", checked)} />
        {form.gasLeak && <Callout tone="safety"><p>{GAS_SAFETY_PROMPT}</p></Callout>}
      </div>
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity} title={result.severity === "safety" ? "Safety condition" : "Result"}>
          {result.clockedBtuh !== null && <Plate rows={[{ label: "Clocked input", value: Math.round(result.clockedBtuh).toLocaleString("en-US"), unit: "BTU/h" }]} />}
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} safetyPrompt={GAS_SAFETY_PROMPT} />
    </div>
  );
}
