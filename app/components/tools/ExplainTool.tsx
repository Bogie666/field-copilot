"use client";

import { useState } from "react";
import { EXPLANATION_URGENCIES, MAX_EXPLANATION_FIELD_CHARS, validateExplanationInput, type ExplanationInput } from "../../lib/fieldAi";
import ExplanationPanel from "../ExplanationPanel";
import { SelectField, TextField } from "../ui";
import type { ToolContext } from "./context";

/** Customer note from facts typed by hand. Nothing is read from a job, so nothing is saved. */
export default function ExplainTool({ ctx }: { ctx: ToolContext }) {
  void ctx;
  const [f, setF] = useState({ diagnosis: "", readings: "", recommendation: "", equipmentType: "", age: "", urgency: "not assessed" });
  const set = (k: keyof typeof f) => (v: string) => setF((c) => ({ ...c, [k]: v }));
  const ageNum = f.age.trim() ? Number(f.age) : null;
  const input: ExplanationInput | null = validateExplanationInput({ diagnosis: f.diagnosis, readings: f.readings, recommendation: f.recommendation, equipmentType: f.equipmentType, equipmentAge: ageNum, urgency: f.urgency });
  const issues: string[] = [];
  if (!f.diagnosis.trim()) issues.push("Describe the finding.");
  else if (!input) issues.push("Check the fields. Age must be 0 to 100 or blank.");

  return (
    <div className="stack">
      <div className="panel">
        <h3>Facts for the note</h3>
        <TextField label="Finding" value={f.diagnosis} onChange={set("diagnosis")} multiline maxLength={MAX_EXPLANATION_FIELD_CHARS} hint="What was found and how you confirmed it." />
        <TextField label="Readings and evidence" value={f.readings} onChange={set("readings")} multiline maxLength={MAX_EXPLANATION_FIELD_CHARS} hint="Include the comparison you were given. Do not guess a standard." />
        <TextField label="Recommended next step" value={f.recommendation} onChange={set("recommendation")} multiline maxLength={MAX_EXPLANATION_FIELD_CHARS} />
        <TextField label="Equipment type (optional)" value={f.equipmentType} onChange={set("equipmentType")} maxLength={200} />
        <TextField label="Equipment age in years (optional)" value={f.age} onChange={set("age")} maxLength={3} hint="Blank means unknown. Age alone never sets urgency." />
        <SelectField label="Urgency (optional)" value={f.urgency} onChange={set("urgency")} options={EXPLANATION_URGENCIES.map((u) => ({ value: u, label: u }))} />
      </div>
      <ExplanationPanel input={input} issues={issues} />
    </div>
  );
}
