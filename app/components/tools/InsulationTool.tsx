"use client";

import { useState } from "react";
import { copyText } from "../../lib/clientTools";
import { assessInsulation, type InsulationInput } from "../../lib/insulation";
import { hashInputs } from "../../lib/job/types";
import type { Reading } from "../../lib/job/types";
import { Callout, Check, ErrorList, NumberField, ResultCard, SelectField } from "../ui";
import type { ToolContext } from "./context";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";
import { useFormState } from "./useFormState";

const EMPTY: InsulationInput = { material: "unknown", depths: [""], zone: "", starting: "other", target: "", gaps: false, uneven: false, compressed: false, moisture: false, vermiculite: false, conditionsReviewed: false, airSealing: "unknown" };
const ZONES = ["1", "2", "3", "4A", "4B", "4C", "5", "6", "7", "8"];
const SAFETY_WORDING = "Stopped work in the area and did not disturb the material. Advised the customer to consult a qualified professional.";

export default function InsulationTool({ ctx }: { ctx: ToolContext }) {
  const [form, , setForm] = useFormState<InsulationInput>(ctx, EMPTY);
  const [copied, setCopied] = useState("");
  const set = <K extends keyof InsulationInput>(key: K, value: InsulationInput[K]) => setForm((c) => ({ ...c, [key]: value }));
  const touched = form.depths.some((d) => d.trim()) || !!form.zone || form.moisture || form.vermiculite;
  const r = assessInsulation(form);
  const valid = r.errors.length === 0 && r.status !== "invalid";
  const blocked = r.status === "blocked";

  const severity = blocked ? "safety" : r.status === "below" || r.status === "condition-review" ? "concern" : r.status === "adequate" ? "ok" : "info";
  const titles: Record<string, string> = { blocked: "Possible moisture or vermiculite in attic", below: "Attic insulation below selected target", "condition-review": "Attic insulation installation issues", adequate: "Attic insulation adequate for selected target" };
  const readings: Reading[] = [
    ...form.depths.flatMap((d, i): Reading[] => {
      const raw = d.trim();
      const value = Number(raw);
      // Safety holds remain saveable even if other form measurements are invalid.
      if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw) || !Number.isFinite(value) || value < 0 || value > 60) return [];
      return [{ label: `Depth ${i + 1}`, value, unit: "in", source: "entered" }];
    }),
    ...(r.materialR ? [{ label: "Material-only R range", value: `${r.materialR[0]} to ${r.materialR[1]}`, unit: "R", source: "computed" as const }] : []),
    ...(ZONES.includes(form.zone) ? [{ label: "Climate zone", value: form.zone, unit: "", source: "entered" as const }] : []),
  ];
  const diagnosis = blocked ? r.summary.split("\n")[0] : [r.materialSummary, r.conditionSummary].filter(Boolean).join(" ");
  const built: BuiltFinding | null =
    touched && (valid || blocked)
      ? { severity, title: titles[r.status] ?? "Attic insulation", diagnosis, readings, reference: blocked ? undefined : [r.benchmark, form.target.trim() ? `Comparison target R${Number(form.target)} was selected by the tech, not local code.` : ""].filter(Boolean).join(" "), inputs: { ...form }, requiresPhotoForSafety: blocked }
      : null;

  async function copySummary() {
    try {
      await copyText(r.summary);
      setCopied("Customer summary copied.");
    } catch (e) {
      setCopied(e instanceof Error ? e.message : "Copy failed.");
    }
  }

  return (
    <div className="stack">
      <div className="panel">
        <h3>Safety checks first</h3>
        <Check label="Moisture or staining seen" checked={form.moisture} onChange={(v) => set("moisture", v)} />
        <Check label="Suspected vermiculite (possible asbestos)" checked={form.vermiculite} onChange={(v) => set("vermiculite", v)} />
        {blocked && <Callout tone="safety" title="Safety hold">Do not disturb, sample, move or cover the material. This blocks any upgrade recommendation until a professional assesses it.</Callout>}
      </div>
      <div className="panel">
        <h3>Measurements</h3>
        <SelectField label="Material" value={form.material} onChange={(v) => set("material", v as InsulationInput["material"])} options={[{ value: "unknown", label: "Unknown" }, { value: "fiberglass", label: "Loose fiberglass" }, { value: "cellulose", label: "Cellulose" }, { value: "batts", label: "Batts" }]} />
        {form.depths.map((d, i) => (
          <NumberField key={i} label={`Depth reading ${i + 1}`} unit="in" value={d} onChange={(v) => set("depths", form.depths.map((x, j) => (j === i ? v : x)))} />
        ))}
        <div className="btnRow">
          {form.depths.length < 8 && <button className="btn" type="button" onClick={() => set("depths", [...form.depths, ""])}>Add reading</button>}
          {form.depths.length > 1 && <button className="btn ghost" type="button" onClick={() => set("depths", form.depths.slice(0, -1))}>Remove last</button>}
        </div>
        <SelectField label="Climate zone" value={form.zone} onChange={(v) => set("zone", v)} placeholder="Choose a zone" options={ZONES.map((z) => ({ value: z, label: `Zone ${z}` }))} hint="You choose the zone for this home. It is not looked up from an address." />
        <SelectField label="Starting condition" value={form.starting} onChange={(v) => set("starting", v as InsulationInput["starting"])} options={[{ value: "other", label: "Other depth" }, { value: "uninsulated", label: "Uninsulated (all readings 0)" }, { value: "3-4", label: "3 to 4 inches" }]} />
        <NumberField label="Total screening target (optional)" unit="R" value={form.target} onChange={(v) => set("target", v)} hint="Leave blank to record without comparing. This is not local code." />
      </div>
      <div className="panel">
        <h3>Installation conditions</h3>
        <Check label="I looked for gaps, uneven depth and compression" checked={!!form.conditionsReviewed} onChange={(v) => set("conditionsReviewed", v)} />
        <Check label="Gaps" checked={form.gaps} onChange={(v) => set("gaps", v)} />
        <Check label="Uneven depth" checked={form.uneven} onChange={(v) => set("uneven", v)} />
        <Check label="Compressed" checked={form.compressed} onChange={(v) => set("compressed", v)} />
        <SelectField label="Air sealing scope (reported)" value={form.airSealing} onChange={(v) => set("airSealing", v as InsulationInput["airSealing"])} options={[{ value: "unknown", label: "Unknown" }, { value: "none", label: "None" }, { value: "attic", label: "Attic" }, { value: "whole-home", label: "Whole home" }]} />
      </div>
      <ErrorList errors={touched ? r.errors : []} />
      {touched && (valid || blocked) && (
        <ResultCard tone={severity === "safety" ? "concern" : severity === "concern" ? "concern" : severity === "ok" ? "ok" : "info"} title="Result">
          <p>{blocked ? diagnosis : r.recommendation}</p>
          {!blocked && r.materialSummary && <p className="hint">{r.materialSummary}</p>}
          {!blocked && r.benchmark && <p className="hint">{r.benchmark}</p>}
          <div className="btnRow">
            <button className="btn" type="button" onClick={copySummary}>Copy customer summary</button>
          </div>
          {copied && <p className="hint" role="status">{copied}</p>}
        </ResultCard>
      )}
      <SaveFinding ctx={ctx} built={built} hash={hashInputs(form)} suggestedSafetyAction={SAFETY_WORDING} suggestedRecommendation={!blocked && valid ? r.recommendation : undefined} />
    </div>
  );
}
