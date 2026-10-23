"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EXPLANATION_URGENCIES } from "../lib/fieldAi";
import { copyText } from "../lib/clientTools";
import { composeExplanationInput, suggestUrgency, type Urgency } from "../lib/job/compose";
import { TOOLS } from "../lib/job/registry";
import { equipmentForScope, scopeKey, type Finding } from "../lib/job/types";
import { customerCloseoutText, EXPORT_LIMITS, findingId, officeEvidenceRecord, officeEvidenceText, recordedEquipmentAge, REPORT_LIMITS } from "../lib/job/report";
import { exportOfficeHtml, HTML_EXPORT_LIMITS } from "../lib/job/htmlReport";
import { safeScopeLabel } from "../lib/job/provenance";
import ExplanationPanel from "./ExplanationPanel";
import SaveIndicator from "./SaveIndicator";
import { useJob } from "./JobProvider";
import { Callout, Crumbs, EmptyState, PageHead, Plate, SelectField, SeverityChip, TextField } from "./ui";

function downloadText(text: string, filename: string, mime = "text/plain") {
  const url = URL.createObjectURL(new Blob([text], { type: `${mime};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Leave the object URL alive until the browser has handled the download navigation.
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

const ORDER = { safety: 0, concern: 1, ok: 2, info: 3 } as const;

export default function SummaryPage() {
  const { job, dispatch, getPhotoBlob } = useJob();
  const [selected, setSelected] = useState<Set<string>>(() => new Set(job?.findings.filter((f) => f.severity === "safety" || f.severity === "concern").map(findingId) ?? []));
  const [urgencyChoice, setUrgencyChoice] = useState<Urgency | "">("");
  const [typeOverride, setTypeOverride] = useState<{ scope: string; value: string } | null>(null);
  const [ageOverride, setAgeOverride] = useState<{ scope: string; value: string } | null>(null);
  const [copyMessage, setCopyMessage] = useState("");
  const [exportingPhotos, setExportingPhotos] = useState(false);
  const [reviewedCloseout, setReviewedCloseout] = useState<string | null>(null);

  const chosen = useMemo(() => (job ? job.findings.filter((f) => !f.staleAt && selected.has(findingId(f))) : []), [job, selected]);
  const soleScope = useMemo(() => {
    const scopes = new Map(chosen.map(finding => [scopeKey(finding.scope), finding.scope]));
    return scopes.size === 1 ? [...scopes.values()][0] : null;
  }, [chosen]);

  if (!job) return null;

  const soleSystem = soleScope?.kind === "system" ? job.systems.find(system => system.id === soleScope.systemId) : null;
  const soleComponent = soleScope?.kind === "system" ? soleSystem?.components?.find(component => component.id === soleScope.componentId) : null;
  const detailsScope = `${job.id}:${soleScope ? scopeKey(soleScope) : "mixed-or-none"}`;
  const equipmentType = (typeOverride?.scope === detailsScope ? typeOverride.value : null) ?? (soleSystem && soleScope ? equipmentForScope(soleSystem, soleScope).equipmentType : "") ?? "";
  const ageRecord = soleComponent ?? soleSystem;
  const dateDerivedAge = ageRecord?.equipmentAgeSource === "manufactured-date";
  const ageText = (ageOverride?.scope === detailsScope ? ageOverride.value : null) ?? (dateDerivedAge ? "" : ageRecord?.equipmentAge) ?? "";
  const age = ageText.trim() ? Number(ageText) : null;
  const suggested = suggestUrgency(chosen);
  const urgency = urgencyChoice || suggested;
  const composed = composeExplanationInput(chosen, { systems: job.systems, equipmentType, equipmentAge: age, urgency });
  const customerCloseout = customerCloseoutText(job, chosen);
  const closeoutReviewed = reviewedCloseout === customerCloseout;
  const issues = chosen.length === 0 ? [] : composed.issues;
  const safetyChosen = chosen.some((f) => f.severity === "safety");
  const sortedAll = [...job.findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const safetyAny = job.findings.some((f) => f.severity === "safety");

  const groupMap = new Map<string, { id: string; title: string; findings: Finding[] }>();
  for (const finding of sortedAll) {
    // Keep every safety row ahead of all other rows, even when findings span scopes.
    const id = `${finding.severity === "safety" ? "0-safety" : "1-standard"}:${scopeKey(finding.scope)}`;
    const system = finding.scope.kind === "system" ? job.systems.find(system => finding.scope.kind === "system" && system.id === finding.scope.systemId) : null;
    const component = finding.scope.kind === "system" ? system?.components?.find(component => finding.scope.kind === "system" && component.id === finding.scope.componentId) : null;
    const title = `${safeScopeLabel(finding.scope, job.systems)}${system ? `: ${system.name}` : ""}${component ? ` / ${component.name}` : ""}`;
    if (!groupMap.has(id)) groupMap.set(id, { id, title, findings: [] });
    groupMap.get(id)!.findings.push(finding);
  }
  const groups = [...groupMap.values()];

  function toggle(f: Finding) {
    setSelected((current) => {
      const next = new Set(current);
      const id = findingId(f);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadReport(kind: "office" | "structured" | "customer") {
    if (!job) return;
    try {
      const filename = `field-copilot-${job.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      if (kind === "structured") downloadText(JSON.stringify(officeEvidenceRecord(job), null, 2), `${filename}-evidence.json`, "application/json");
      else downloadText(kind === "office" ? officeEvidenceText(job) : customerCloseout, `${filename}-${kind}.txt`);
      setCopyMessage("Download prepared. Check your browser’s downloads. Images are not included; this is not a restorable backup.");
    } catch (error) { setCopyMessage(error instanceof Error ? error.message : "Download failed. Copy the report instead."); }
  }

  async function downloadPhotoReport() {
    if (!job || exportingPhotos) return;
    setExportingPhotos(true);
    setCopyMessage("Preparing the private report and saved photos…");
    try {
      const result = await exportOfficeHtml(job, getPhotoBlob);
      downloadText(result.html, `field-copilot-${job.id.replace(/[^a-zA-Z0-9_-]/g, "_")}-office-with-photos.html`, "text/html");
      setCopyMessage(result.missingPhotoIds.length ? `Report prepared with ${result.missingPhotoIds.length} missing image(s), listed inside the report. Check your browser’s downloads.` : "Office report with saved photos prepared. Check your browser’s downloads. This is not a restorable backup.");
    } catch (error) { setCopyMessage(error instanceof Error ? error.message : "The photo report could not be prepared. Try the text export."); }
    finally { setExportingPhotos(false); }
  }

  const closeoutSection = <section className="panel closeoutPanel" aria-label="Customer closeout without AI">
    <h2>Customer closeout without AI</h2>
    <p className="hint">Uses the selected current findings, with every current safety finding and all pending reconfirmation notices always included. No AI request is needed. Private job labels, equipment identifiers, notes, history and photos are excluded. Review finding text for private details before sharing.</p>
    <label className="field">Customer visit summary<textarea aria-label="Customer visit summary" value={customerCloseout} readOnly /></label>
    <label className="check"><input type="checkbox" checked={closeoutReviewed} onChange={event => setReviewedCloseout(event.target.checked ? customerCloseout : null)} /><span>I reviewed this summary against the documented facts, pending checks and safety actions.</span></label>
    <div className="btnRow">
      <button className="btn primary" type="button" disabled={!closeoutReviewed} onClick={() => { copyText(customerCloseout).then(() => setCopyMessage("Customer visit summary copied."), () => setCopyMessage("Copy failed. Download the summary instead.")); }}>Copy customer visit summary</button>
      <button className="btn" type="button" disabled={!closeoutReviewed} onClick={() => downloadReport("customer")}>Download customer summary</button>
    </div>
  </section>;

  return (
    <main className="page summaryPage">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: `/job/${job.id}`, label: job.label || "Job" }, { label: "Summary" }]} />
      <PageHead title="Summary" lede="Review the visit, download private office evidence, and prepare a customer summary with or without AI."><SaveIndicator /></PageHead>

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
              <section key={g.id} className="panel" aria-label={g.title} data-finding-group>
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
                            <summary>Readings</summary>
                            <Plate rows={f.readings.map((r) => ({ label: r.label, value: String(r.value), unit: r.unit }))} />
                            {f.reference && <p className="hint" style={{ marginTop: 6 }}>Reference: {f.reference}</p>}
                          </details>
                        )}
                        {f.actionTaken && <p><strong>Action taken:</strong> {f.actionTaken}</p>}
                        {f.verification && <p><strong>Verification:</strong> {f.verification}</p>}
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
            <TextField label="Equipment type (optional)" value={equipmentType} onChange={value => setTypeOverride({ scope: detailsScope, value })} maxLength={60} hint={soleSystem ? `From ${soleSystem.name}${soleComponent ? ` / ${soleComponent.name}` : ""}. Edit if needed.` : "Blank means unknown."} />
            <TextField label="Equipment age (years, optional)" value={ageText} onChange={(v) => { setAgeOverride({ scope: detailsScope, value: v }); if (soleScope?.kind === "system") dispatch({ type: "setEquipmentAge", systemId: soleScope.systemId, componentId: soleScope.componentId, age: v }); }} hint={dateDerivedAge && ageRecord ? `${recordedEquipmentAge(ageRecord)}. Date-derived age is not sent in the AI age field. Enter a technician-confirmed age here only if appropriate.` : "Type it from the customer or records. Never guessed from the serial number."} />
            <SelectField label="Documented urgency (optional)" value={urgency} onChange={(v) => setUrgencyChoice(v as Urgency)} options={EXPLANATION_URGENCIES.map((u) => ({ value: u, label: u }))} hint={`Suggested from the selected findings: ${suggested}. Urgency is not inferred from age.`} />
          </section>

          <div className="closeoutPair">
            {closeoutSection}
            <ExplanationPanel input={composed.input} issues={issues} safetyPresent={safetyChosen} />
          </div>


        </>
      )}
      {job.findings.length === 0 && closeoutSection}
      <section className="panel" aria-label="Private office evidence">
        <h2>Private office evidence</h2>
        <p className="hint">Includes equipment, readings and sources, actions, verification, notes, previous findings, accepted note originals, unconfirmed drafts, references and photo metadata. It includes private job labels and equipment identifiers; review the recipient before sharing.</p>
        <p className="hint">{REPORT_LIMITS} {EXPORT_LIMITS}</p>
        <div className="btnRow evidenceActions">
          <button className="btn" type="button" onClick={() => { copyText(officeEvidenceText(job)).then(() => setCopyMessage("Private office evidence copied. Images are not included."), () => setCopyMessage("Copy failed. Download the report instead.")); }}>Copy office evidence</button>
          <button className="btn" type="button" onClick={() => downloadReport("office")}>Download office report (.txt)</button>
          <button className="btn" type="button" onClick={() => downloadReport("structured")}>Download structured evidence (.json)</button>
          <button className="btn" type="button" disabled={exportingPhotos} onClick={() => void downloadPhotoReport()}>{exportingPhotos ? "Preparing photos…" : "Download office report with photos (.html)"}</button>
        </div>
        <p className="hint">{HTML_EXPORT_LIMITS}</p>
        <p className="hint" role="status">{copyMessage}</p>
      </section>
      {(job.findingHistory?.length ?? 0) > 0 && <section className="panel" aria-label="Finding history">
        <h2>Finding history</h2>
        <p className="hint">Previous confirmations, for technician records only. These are never selected or sent to the customer-note generator.</p>
        {[...(job.findingHistory ?? [])].reverse().map((f, index) => <details key={`${findingId(f)}:${f.confirmedAt}:${index}`}>
          <summary>{f.title} — {f.confirmedAt}{f.staleAt ? " (stale when replaced)" : " (replaced)"}</summary>
          <p>{safeScopeLabel(f.scope, job.systems)}{f.scope.kind === "system" ? `: ${job.systems.find(system => f.scope.kind === "system" && system.id === f.scope.systemId)?.name ?? "Unavailable system"} / ${job.systems.find(system => f.scope.kind === "system" && system.id === f.scope.systemId)?.components?.find(component => f.scope.kind === "system" && component.id === f.scope.componentId)?.name ?? "Unassigned equipment"}` : ""}</p>
          <p>{f.diagnosis}</p>
          <Plate rows={f.readings.map((r) => ({ label: r.label, value: String(r.value), unit: r.unit }))} />
          {f.reference && <p>Reference: {f.reference}</p>}
          {f.recommendation && <p>Next step: {f.recommendation}</p>}
          {f.actionTaken && <p>Action taken: {f.actionTaken}</p>}
          {f.verification && <p>Verification: {f.verification}</p>}
          {f.safetyAction && <p>Safety action: {f.safetyAction}</p>}
          {f.staleReason && <p>{f.staleReason}</p>}
        </details>)}
      </section>}
    </main>
  );
}
