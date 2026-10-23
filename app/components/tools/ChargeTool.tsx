"use client";

import { equipmentForScope } from "../../lib/job/types";
import { assessCharge, EMPTY_CHARGE, ORIFICE_FORMULA_LABEL, type ChargeInput } from "../../lib/charge/refrigerantCharge";
import { PT_DATA_APPROVED, ptSourceReference, ptRefrigerants } from "../../lib/charge/ptData";
import { fmt } from "../../lib/tools/numbers";
import { hashInputs } from "../../lib/job/types";
import { Callout, ErrorList, NumberField, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

function matchRefrigerant(text: string | undefined): string {
  const t = (text ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return ptRefrigerants().find((r) => r.id.toUpperCase().replace(/[^A-Z0-9]/g, "") === t)?.id ?? "";
}

export default function ChargeTool({ ctx }: { ctx: ToolContext }) {
  const suggestion = matchRefrigerant(equipmentForScope(ctx.system, ctx.scope).refrigerant);
  const [form, set] = useFormState<ChargeInput>(ctx, EMPTY_CHARGE, { refrigerant: suggestion });
  const { errors, result } = assessCharge(form);
  const touched = !!(form.suctionPsig || form.suctionLineF || form.liquidPsig || form.liquidLineF);
  const orifice = form.device === "orifice";
  const findingInputs = { ...form, ptSource: ptSourceReference(form.refrigerant) };

  const built: BuiltFinding | null =
    result && touched
      ? {
          severity: result.severity,
          title: result.severity === "concern" ? "Superheat or subcooling outside target" : "Superheat and subcooling",
          diagnosis: result.diagnosis,
          readings: result.readings,
          reference: result.reference + (suggestion && form.refrigerant === suggestion ? " Refrigerant taken from the confirmed nameplate." : ""),
          inputs: findingInputs,
        }
      : null;

  return (
    <div className="stack">
      {!PT_DATA_APPROVED && (
        <Callout tone="warn" title="Provisional pressure-temperature data">
          <p>Manufacturer/supplier published sources; technical approval pending. These comparisons remain provisional and not approved. Check a reading against your gauge set or the manufacturer chart before relying on it.</p>
          <p>{ptSourceReference(form.refrigerant)}</p>
        </Callout>
      )}
      {result && touched && (
        <ResultCard tone={result.severity === "concern" ? "concern" : result.severity === "ok" ? "ok" : "info"} title="Charge result">
          <div className="chargeReadings">
            <div><span className="bigReading">{fmt(result.superheatF)}<small>°F</small></span><span>Superheat</span></div>
            <div><span className="bigReading">{fmt(result.subcoolingF)}<small>°F</small></span><span>Subcooling{!orifice && form.targetSubcoolingF ? ` · target ${form.targetSubcoolingF} ± ${form.subcoolingTolF || "—"}` : ""}</span></div>
          </div>
          <p className="chargeStatus">{result.severity === "ok" ? "In range" : result.severity === "concern" ? "Needs attention" : "Recorded"}</p>
          <ul className="resultLines">{result.items.map(item => <li key={item.id}>{item.line}</li>)}</ul>
          {result.notes.map(note => <Callout key={note} tone="warn"><p>{note}</p></Callout>)}
          <p className="hint">This compares readings with a target. It does not say why they differ.</p>
        </ResultCard>
      )}
      <div className="panel">
        <h3>System</h3>
        <SelectField label="Refrigerant" value={form.refrigerant} onChange={(v) => set("refrigerant", v)} placeholder="Choose" options={ptRefrigerants().map((r) => ({ value: r.id, label: `${r.id} (${r.safetyClass})` }))} hint={suggestion && form.refrigerant === suggestion ? "From nameplate. Confirm it matches the unit." : undefined} />
        <SelectField label="Metering device" value={form.device} onChange={(v) => set("device", v as ChargeInput["device"])} placeholder="Choose" options={[{ value: "txv", label: "TXV or EEV" }, { value: "orifice", label: "Fixed orifice or piston" }]} />
      </div>
      <div className="panel">
        <h3>Gauge and line readings</h3>
        <div className="fieldRow">
          <NumberField label="Suction pressure" unit="psig" value={form.suctionPsig} onChange={(v) => set("suctionPsig", v)} />
          <NumberField label="Suction line temp" unit="F" value={form.suctionLineF} onChange={(v) => set("suctionLineF", v)} />
          <NumberField label="Liquid pressure" unit="psig" value={form.liquidPsig} onChange={(v) => set("liquidPsig", v)} />
          <NumberField label="Liquid line temp" unit="F" value={form.liquidLineF} onChange={(v) => set("liquidLineF", v)} />
        </div>
        <p className="hint">Measure line temperature with a clamp probe, insulated, close to the service valve for suction and near the condenser outlet for liquid.</p>
      </div>
      {form.device && (
        <details className="moreFields">
          <summary>More fields</summary>
          <div className="panel">
          <h3>{orifice ? "Superheat target and guidance" : "Subcooling target and guidance"}</h3>
          {orifice ? (
            <>
              <p className="hint">{ORIFICE_FORMULA_LABEL}</p>
              <div className="fieldRow">
                <NumberField label="Indoor wet bulb" unit="F" value={form.indoorWetBulbF} onChange={(v) => set("indoorWetBulbF", v)} />
                <NumberField label="Outdoor dry bulb" unit="F" value={form.outdoorDryBulbF} onChange={(v) => set("outdoorDryBulbF", v)} />
              </div>
              <NumberField label="Allowed tolerance" unit="plus or minus F" value={form.superheatTolF} onChange={(v) => set("superheatTolF", v)} hint="Needed to classify against the screening target." />
            </>
          ) : (
            <div className="fieldRow">
              <NumberField label="Manufacturer target" unit="F subcooling" value={form.targetSubcoolingF} onChange={(v) => set("targetSubcoolingF", v)} hint="From the unit data plate or install manual." />
              <NumberField label="Allowed tolerance" unit="plus or minus F" value={form.subcoolingTolF} onChange={(v) => set("subcoolingTolF", v)} />
            </div>
          )}
          </div>
        </details>
      )}
      <ErrorList errors={touched ? errors : []} />
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(findingInputs)} showPhotoAction />
    </div>
  );
}
