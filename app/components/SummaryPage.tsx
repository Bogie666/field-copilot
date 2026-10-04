"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EXPLANATION_URGENCIES } from "../lib/fieldAi";
import { copyText } from "../lib/clientTools";
import { composeExplanationInput, suggestUrgency, type Urgency } from "../lib/job/compose";
import { TOOLS } from "../lib/job/registry";
import { scopeKey, type Finding } from "../lib/job/types";
import ExplanationPanel from "./ExplanationPanel";
import { useJob } from "./JobProvider";
import { Callout, Crumbs, EmptyState, PageHead, Plate, SelectField, SeverityChip, TextField } from "./ui";

function findingId(f: Finding) {
  return `${f.key}|${scopeKey(f.scope)}`;
}

const ORDER = { safety: 0, concern: 1, ok: 2, info: 3 } as const;

export default function SummaryPage() {
  const { job, dispatch } = useJob();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(job?.findings.filter((f) => f.severity === "safety" || f.severity === "concern").map(findingId) ?? []));
  const [urgencyChoice, setUrgencyChoice] = useState<Urgency | "">("");
  const [typeOverride, setTypeOverride] = useState<string | null>(null);
  const [ageOverride, setAgeOverride] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState("");

  const chosen = useMemo(() => (job ? job.findings.filter((f) => !f.staleAt && selected.has(findingId(f))) : []), [job, selected]);
  const soleSystem = useMemo(() => {
    if (!job) return null;
    const ids = new Set(chosen.flatMap((f) => (f.scope.kind === "system" ? [f.scope.systemId] : [])));
    return ids.size === 1 ? (job.systems.find((s) => s.id === [...ids][0]) ?? null) : null;
  }, [job, chosen]);

  if (!job) return null;

  const equipmentType = typeOverride ?? soleSystem?.equipment.equipmentType ?? "";
  const ageText = ageOverride ?? soleSystem?.equipmentAge ?? "";
  const age = ageText.trim() ? Number(ageText) : null;
  const suggested = suggestUrgency(chosen);
  const urgency = urgencyChoice || suggested;
  const composed = composeExplanationInput(chosen, { equipmentType, equipmentAge: age, urgency });
  const issues = chosen.length === 0 ? [] : composed.issues;
  const safetyChosen = chosen.some((f) => f.severity === "safety");
  const sortedAll = [...job.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const safetyAny = job.findings.some((f) => f.severity === "safety");

  const groups: Array<{ title: string; findings: Finding[] }> = [
    ...job.systems.map((s) => ({ title: s.name, findings: sortedAll.filter((f) => f.scope.kind === "system" && f.scope.systemId === s.id) })),
    { title: "Whole home", findings: sortedAll.filter((f) => f.scope.kind === "home") },
  ].filter((g) => g.findings.length > 0);

  function toggle(f: Finding) {
    setSelected((current) => {
      const next = new Set(current);
      const id = findingId(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function jobSummaryText(): string {
    if (!job) return "";
    const lines: string[] = [`Job: ${job.label || "Untitled"}`];
    for (const g of groups) {
      lines.push("", g.title.toUpperCase());
      for (const f of g.findings) {
        lines.push(`- [${f.staleAt ? "STALE - needs reconfirmation; " : ""}${f.severity}] ${f.title}: ${f.diagnosis}`);
        if (f.reference) lines.push(`  Reference: ${f.reference}`);
        if (f.recommendation) lines.push(`  Next step: ${f.recommendation}`);
        if (f.safetyAction) lines.push(`  Safety action: ${f.safetyAction}`);
      }
    }
    return lines.join("\n");
  }

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: `/job/${job.id}`, label: job.label || "Job" }, { label: "Summary" }]} />
      <PageHead title="Summary" lede="Everything you saved on this job. Pick the findings that belong on the estimate, then draft the customer note." />

      {job.findings.length === 0 ? (
        <EmptyState title="No findings saved yet" body="Open a tile, run a tool and save the result. Saved findings collect here.">
          <Link className="btn primary" href={`/job/${job.id}`}>
            Back to the job
          </Link>
        </EmptyState>
      ) : (
        <>
          {safetyAny && (
            <Callout tone="safety" title="Safety findings on this job">
              <p>Safety findings are listed first. A note that includes them must describe the condition and the action taken.</p>
            </Callout>
          )}
          <div className="stack" style={{ marginTop: 14 }}>
            {groups.map((g) => (
              <section key={g.title} className="panel" aria-label={g.title}>
                <h2>{g.title}</h2>
                <ul className="list">
                  {g.findings.map((f) => {
                    const id = findingId(f);
                    return (
                      <li key={id} className="listItem" style={{ alignItems: "stretch", flexDirection: "column", gap: 8 }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                          <span className="severityBar" data-severity={f.severity} aria-hidden="true" style={{ alignSelf: "stretch" }} />
                          <label className="check" style={{ flex: "1 1 180px", minWidth: 0, border: 0, padding: 0, background: "transparent" }}>
                            <input type="checkbox" disabled={!!f.staleAt} checked={!f.staleAt && selected.has(id)} onChange={() => toggle(f)} />
                            <span>
                              <strong>{f.title}</strong>
                              <span style={{ display: "block" }} className="hint">
                                {TOOLS[f.toolId as keyof typeof TOOLS]?.label ?? f.toolId}
                              </span>
                            </span>
                          </label>
                          <SeverityChip severity={f.severity} />
                        </div>
                        {f.staleAt && <Callout title="Finding needs reconfirmation"><p>{f.staleReason}</p><p>Excluded from customer notes. Reopen this tool to review and reconfirm; historical readings are retained.</p></Callout>}
                        <p>{f.diagnosis}</p>
                        {f.readings.length > 0 && (
                          <details>
                            <summary style={{ cursor: "pointer", minHeight: 36, display: "flex", alignItems: "center" }}>Readings</summary>
                            <Plate rows={f.readings.map((r) => ({ label: r.label, value: String(r.value), unit: r.unit }))} />
                            {f.reference && <p className="hint" style={{ marginTop: 6 }}>Reference: {f.reference}</p>}
                          </details>
                        )}
                        {f.safetyAction && <p><strong>Safety action:</strong> {f.safetyAction}</p>}
                        {f.recommendation && <p><strong>Next step:</strong> {f.recommendation}</p>}
                        {f.photoIds && f.photoIds.length > 0 && <p className="hint">{f.photoIds.length} photo{f.photoIds.length === 1 ? "" : "s"} attached</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <section className="panel" aria-label="Estimate details">
            <h2>For the estimate note</h2>
            <p className="hint">{chosen.length} {chosen.length === 1 ? "finding" : "findings"} selected.</p>
            <TextField label="Equipment type (optional)" value={equipmentType} onChange={setTypeOverride} maxLength={60} hint={soleSystem ? `From ${soleSystem.name}. Edit if needed.` : "Blank means unknown."} />
            <TextField label="Equipment age (years, optional)" value={ageText} onChange={(v) => { setAgeOverride(v); if (soleSystem) dispatch({ type: "setEquipmentAge", systemId: soleSystem.id, age: v }); }} hint="Type it from the customer or records. Never guessed from the serial number." />
            <SelectField label="Documented urgency (optional)" value={urgency} onChange={(v) => setUrgencyChoice(v as Urgency)} options={EXPLANATION_URGENCIES.map((u) => ({ value: u, label: u }))} hint={`Suggested from the selected findings: ${suggested}. Urgency is not inferred from age.`} />
          </section>

          <ExplanationPanel input={composed.input} issues={issues} safetyPresent={safetyChosen} />

          <section className="panel" aria-label="Private job summary">
            <h2>Private job summary</h2>
            <p className="hint">A plain-text copy of every finding for your own records or a work order. It includes the job label if you set one, so do not paste it into customer-facing text.</p>
            <button
              className="btn block"
              type="button"
              onClick={() => {
                copyText(jobSummaryText()).then(
                  () => setCopyMessage("Job summary copied."),
                  (e: unknown) => setCopyMessage(e instanceof Error ? e.message : "Copy failed. Try again."),
                );
              }}
            >
              Copy job summary
            </button>
            <p className="hint" role="status">{copyMessage}</p>
          </section>
        </>
      )}
      {(job.findingHistory?.length ?? 0) > 0 && <section className="panel" aria-label="Finding history">
        <h2>Finding history</h2>
        <p className="hint">Previous confirmations, for technician records only. These are never selected or sent to the customer-note generator.</p>
        {[...(job.findingHistory ?? [])].reverse().map((f, index) => <details key={`${findingId(f)}:${f.confirmedAt}:${index}`}>
          <summary>{f.title} — {f.confirmedAt}{f.staleAt ? " (stale when replaced)" : " (replaced)"}</summary>
          <p>{f.scope.kind === "home" ? "Whole home" : job.systems.find((s) => f.scope.kind === "system" && s.id === f.scope.systemId)?.name ?? f.scope.systemId}</p>
          <p>{f.diagnosis}</p>
          <Plate rows={f.readings.map((r) => ({ label: r.label, value: String(r.value), unit: r.unit }))} />
          {f.reference && <p>Reference: {f.reference}</p>}
          {f.recommendation && <p>Next step: {f.recommendation}</p>}
          {f.safetyAction && <p>Safety action: {f.safetyAction}</p>}
          {f.staleReason && <p>{f.staleReason}</p>}
        </details>)}
      </section>}
    </main>
  );
}
