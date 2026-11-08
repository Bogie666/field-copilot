"use client";

import Link from "next/link";
import { tileById, TOOLS } from "../../lib/job/registry";
import { jobHref } from "../../lib/job/routes";
import { hashInputs, scopeKey } from "../../lib/job/types";
import { assessMaintenance, CHECKLISTS, EMPTY_MAINTENANCE, type ChecklistState, type ChecklistUnit, type MaintenanceInput } from "../../lib/tools/maintenance";
import { ErrorList, ResultCard, SelectField, TextField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const STATES: Array<{ value: Exclude<ChecklistState, "">; label: string }> = [
  { value: "pass", label: "Pass" },
  { value: "fail", label: "Fail" },
  { value: "na", label: "N/A" },
];

export default function MaintenanceTool({ ctx }: { ctx: ToolContext }) {
  const kind = ctx.component?.kind;
  const fixedUnit: ChecklistUnit | "" = kind === "condenser" ? "outdoor" : kind === "furnace" ? "indoor" : "";
  const [form, set] = useFormState<MaintenanceInput>(ctx, EMPTY_MAINTENANCE, fixedUnit ? { unit: fixedUnit } : undefined);
  const unit = fixedUnit || form.unit;
  const effective: MaintenanceInput = { ...form, unit, checks: form.checks ?? {} };
  const { errors, result } = assessMaintenance(effective);
  const touched = Object.values(effective.checks).some(Boolean) || !!form.notes.trim();

  const job = ctx.api?.job ?? null;
  const tile = kind ? tileById(kind) : undefined;
  const savedTools = new Set(job && ctx.scope ? job.findings.filter((f) => scopeKey(f.scope) === scopeKey(ctx.scope!) && !f.staleAt).map((f) => f.toolId) : []);

  const built: BuiltFinding | null = result && touched ? {
    severity: result.severity,
    title: result.counts.fail ? "Tune-up items need attention" : "Tune-up checklist",
    diagnosis: result.diagnosis,
    readings: result.readings,
    inputs: JSON.parse(JSON.stringify(effective)) as Record<string, unknown>,
  } : null;

  const setCheck = (id: string, value: ChecklistState) => set("checks", { ...effective.checks, [id]: effective.checks[id] === value ? "" : value });

  return (
    <div className="stack">
      {!fixedUnit && (
        <div className="panel">
          <SelectField label="Checklist" value={form.unit} onChange={(v) => set("unit", v as MaintenanceInput["unit"])} placeholder="Choose" options={[{ value: "outdoor", label: "Outdoor unit" }, { value: "indoor", label: "Indoor unit" }]} />
        </div>
      )}
      {unit && (
        <div className="panel">
          <h3>{CHECKLISTS[unit].label}</h3>
          <p className="hint">Tap again to clear. Mark items that do not apply to this equipment as N/A. Readings are recorded in their own tools.</p>
          <ul className="checklist">
            {CHECKLISTS[unit].items.map((item) => {
              const current = effective.checks[item.id] ?? "";
              const linked = item.tool && job && tile?.tools.includes(item.tool) && ctx.scope ? item.tool : null;
              return (
                <li key={item.id} className="checklistRow">
                  <div className="checklistLabel">
                    <span>{item.label}</span>
                    {linked && <Link className="checklistLink" href={jobHref(job!.id, tile!.id, linked, ctx.scope!)}>{savedTools.has(linked) ? `${TOOLS[linked].label} saved` : `Open ${TOOLS[linked].label.toLowerCase()}`}</Link>}
                  </div>
                  <div className="segmented" role="group" aria-label={item.label}>
                    {STATES.map((s) => (
                      <button key={s.value} type="button" className="segment" data-state={s.value} aria-pressed={current === s.value} onClick={() => setCheck(item.id, s.value)}>{s.label}</button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
          <TextField label="Notes (optional)" value={form.notes} onChange={(v) => set("notes", v)} multiline maxLength={600} />
        </div>
      )}
      <ErrorList errors={touched ? errors : []} />
      {result && touched && (
        <ResultCard tone={result.severity} title="Checklist">
          <ul className="resultLines">{result.items.map((i) => <li key={i.id}>{i.line}</li>)}</ul>
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(effective)} />
    </div>
  );
}
