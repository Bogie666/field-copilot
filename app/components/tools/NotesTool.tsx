"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { copyText, fetchJsonWithTimeout } from "../../lib/clientTools";
import { formatStructuredNotes, MAX_TRANSCRIPT_CHARS, validateStructuredNotes, type StructuredNotes } from "../../lib/fieldAi";
import { notesForScope, scopeKey } from "../../lib/job/types";
import { TextField } from "../ui";
import type { ToolContext } from "./context";

type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type TidyPreview = { original: string; proposed: string; provider: string };
const OVERFLOW_STATUS = "Not saved: notes exceed the 12,000-character limit. Copy the full note or shorten it to save. The previous saved note is unchanged.";

/** Scope-keyed editor prevents a preview, dictation event or pending request crossing equipment. */
export default function NotesTool({ ctx }: { ctx: ToolContext }) {
  return <NotesEditor key={`${ctx.api?.job?.id ?? "none"}:${ctx.scope ? scopeKey(ctx.scope) : "none"}`} ctx={ctx} />;
}

function NotesEditor({ ctx }: { ctx: ToolContext }) {
  const { api, system, scope } = ctx;
  const stored = system && scope ? notesForScope(system, scope) : (api?.job?.homeNotes ?? "");
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [preview, setPreview] = useState<TidyPreview | null>(null);
  const [pendingAccept, setPendingAccept] = useState<(TidyPreview & { acceptedAt: string }) | null>(null);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(text);
  const request = useRef<AbortController | null>(null);
  const writeVersion = useRef(0);
  const mounted = useRef(true);
  const acceptingRef = useRef(false);

  function cancelTidy() {
    request.current?.abort();
    request.current = null;
    if (pendingAccept) api?.cancelPendingSave();
    setBusy(false);
    setPreview(null);
    setPendingAccept(null);
  }

  async function commit(value: string) {
    const version = ++writeVersion.current;
    if (value.length > MAX_TRANSCRIPT_CHARS) {
      setStatus(OVERFLOW_STATUS);
      return;
    }
    if (!api || !scope) return;
    setStatus("Saving notes…");
    try {
      const result = await api.dispatch(scope.kind === "system"
        ? { type: "setSystemNotes", systemId: scope.systemId, componentId: scope.componentId, notes: value }
        : { type: "setHomeNotes", notes: value });
      if (!mounted.current || version !== writeVersion.current) return;
      setStatus(result.ok ? (result.persistent ? "Notes saved on this device." : "Notes kept for this session only. Device storage is unavailable; copy your notes before leaving.") : `Not saved: ${result.errors.join(" ")}`);
    } catch (error) {
      if (mounted.current && version === writeVersion.current) setStatus(`Not saved: ${error instanceof Error ? error.message : "Storage failed. Copy your notes before leaving."}`);
    }
  }

  function change(value: string) {
    if (acceptingRef.current) return;
    cancelTidy();
    latest.current = value;
    setText(value);
    void commit(value);
  }

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
      request.current = null;
      if (rec.current) {
        rec.current.onresult = null;
        rec.current.onend = null;
        rec.current.onerror = null;
        rec.current.stop();
      }
    };
  }, []);

  function dictate() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return setStatus("Voice capture is not supported in this browser. Type the note instead.");
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e) => {
      if (!mounted.current || acceptingRef.current) return;
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript.trim() + " ";
      if (add) change((latest.current ? latest.current.replace(/\s*$/, " ") : "") + add.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => { setListening(false); setStatus("Voice capture stopped. You can type the note instead."); };
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function tidy() {
    if (listening) { setStatus("Stop dictation before tidying so every final phrase can be included."); return; }
    if (latest.current.length > MAX_TRANSCRIPT_CHARS) { setStatus("Notes are too long to send. Shorten them without losing your original record."); return; }
    cancelTidy();
    const controller = new AbortController();
    request.current = controller;
    const source = latest.current;
    setBusy(true);
    try {
      const body = await fetchJsonWithTimeout<StructuredNotes & { provider?: string; warning?: string }>("/api/structure-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: source }), signal: controller.signal });
      if (!mounted.current || request.current !== controller || controller.signal.aborted || latest.current !== source) return;
      const valid = validateStructuredNotes(body);
      if (!valid) throw new Error("The service returned incomplete sections. Your original notes are unchanged.");
      setPreview({ original: source, proposed: formatStructuredNotes(valid), provider: body.provider === "template" ? "Template, not AI interpretation" : "AI suggestion" });
      setStatus("Preview ready. Original notes are unchanged. Compare both versions, then accept or discard.");
    } catch (error) {
      if (!mounted.current || request.current !== controller || controller.signal.aborted) return;
      setStatus(error instanceof Error ? error.message : "Tidy failed. Original notes are unchanged.");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  async function acceptPreview() {
    if (!preview || !api || !scope || acceptingRef.current || listening) return;
    if (latest.current !== preview.original) { cancelTidy(); setStatus("Notes changed. Tidy them again to get a current preview."); return; }
    const accepted = { ...preview, acceptedAt: pendingAccept?.original === preview.original && pendingAccept.proposed === preview.proposed ? pendingAccept.acceptedAt : new Date().toISOString() };
    setPendingAccept(accepted);
    rec.current?.stop();
    acceptingRef.current = true;
    setAccepting(true);
    ++writeVersion.current; // An older autosave must not replace this save result message.
    try {
      const result = await api.saveAction({ type: "acceptTidiedNotes", scope, original: accepted.original, notes: accepted.proposed, acceptedAt: accepted.acceptedAt });
      if (!mounted.current) return;
      if (!result.ok) { setStatus(`Edit not accepted: ${result.errors.join(" ")} Original notes and preview remain available.`); return; }
      latest.current = accepted.proposed;
      setText(accepted.proposed);
      setPreview(null);
      setPendingAccept(null);
      setStatus(result.persistent ? "Accepted edit and original notes saved on this device." : "Accepted edit and original kept for this session only. Download the office evidence before leaving; device storage is unavailable.");
    } catch (error) {
      if (mounted.current) setStatus(`Edit not accepted: ${error instanceof Error ? error.message : "Storage failed."} Original notes remain available.`);
    } finally {
      acceptingRef.current = false;
      if (mounted.current) setAccepting(false);
    }
  }

  useLayoutEffect(() => { latest.current = text; }, [text]);
  // A provider-level retry can commit after the original save promise failed.
  // Reconcile only our exact accepted version while the editor is still unchanged.
  const retriedAcceptance = pendingAccept && !api?.error && stored === pendingAccept.proposed && text === pendingAccept.original
    && api?.job?.notesTidyHistory?.some(edit => edit.acceptedAt === pendingAccept.acceptedAt && edit.original === pendingAccept.original && edit.accepted === pendingAccept.proposed && scope && scopeKey(edit.scope) === scopeKey(scope));
  if (retriedAcceptance && pendingAccept) {
    setText(pendingAccept.proposed);
    setPreview(null);
    setPendingAccept(null);
    setStatus(api?.persistent ? "Accepted edit and original notes saved on this device." : "Accepted edit and original kept for this session only. Device storage is unavailable.");
  }

  if (!api || !scope) return <p className="hint">Open this tool from a job to keep notes.</p>;
  const editorLocked = accepting || (!!pendingAccept && api.saving);
  const history = (api.job?.notesTidyHistory ?? []).filter(edit => scopeKey(edit.scope) === scopeKey(scope));
  return (
    <div className="stack">
      <div className="panel">
        <h3>{system ? `Notes for ${system.name}${ctx.component ? ` / ${ctx.component.name}` : ""}` : "Notes for the home"}</h3>
        <p className="hint">Notes stay with the job and are sent to the configured AI provider only when you tap Tidy into sections. Remove customer identifiers before sending. Dictation follows your browser’s speech-service settings.</p>
        <fieldset disabled={editorLocked} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <TextField label="Notes" value={text} onChange={change} multiline maxLength={MAX_TRANSCRIPT_CHARS} />
          <div className="btnRow">
            <button className="btn" type="button" onClick={listening ? () => rec.current?.stop() : dictate}>{listening ? "Stop dictation" : "Dictate"}</button>
            <button className="btn" type="button" disabled={!text.trim() || busy || listening} onClick={() => void tidy()}>{busy ? "Tidying" : "Tidy into sections"}</button>
            <button className="btn ghost" type="button" disabled={!text.trim()} onClick={() => copyText(text).then(() => setStatus("Notes copied."), () => setStatus("Copy failed."))}>Copy notes</button>
            {busy && <button className="btn" type="button" onClick={() => { cancelTidy(); setStatus("Tidy canceled. Original notes are unchanged."); }}>Cancel tidy</button>}
          </div>
        </fieldset>
        <p className="hint" role="status">{text.length > MAX_TRANSCRIPT_CHARS ? OVERFLOW_STATUS : status}</p>
      </div>
      {preview && <section className="panel" aria-label="Review note edit">
        <h3>Review note edit</h3>
        <p className="hint">{preview.provider}. Check every measurement, negation, declined item and action. Stop dictation before accepting an edit. Accepting saves the edit and retains the complete original in this job’s note history. Editing the notes above discards this preview.</p>
        <label className="field">Original notes<textarea aria-label="Original notes" value={preview.original} readOnly /></label>
        <label className="field">Proposed notes<textarea aria-label="Proposed notes" value={preview.proposed} readOnly style={{ minHeight: 260 }} /></label>
        <div className="btnRow">
          <button className="btn primary" type="button" disabled={editorLocked || listening} onClick={() => void acceptPreview()}>{accepting ? "Saving accepted edit…" : "Accept edit and retain original"}</button>
          <button className="btn" type="button" disabled={editorLocked} onClick={() => { cancelTidy(); setStatus("Edit discarded. Original notes are unchanged."); }}>Discard edit</button>
        </div>
      </section>}
      {history.length > 0 && <section className="panel" aria-label="Note edit history">
        <h3>Note edit history</h3>
        <p className="hint">Previous originals and accepted edits are retained with this job. They are included in private office evidence, never sent by the customer-note generator.</p>
        {[...history].reverse().map((edit, index) => <details key={`${edit.acceptedAt}:${index}`}>
          <summary>Accepted {edit.acceptedAt}</summary>
          <label className="field">Original<textarea aria-label={`Retained original ${index + 1}`} value={edit.original} readOnly /></label>
          <label className="field">Accepted edit<textarea aria-label={`Accepted edit ${index + 1}`} value={edit.accepted} readOnly /></label>
        </details>)}
      </section>}
    </div>
  );
}
