"use client";

import { useEffect, useRef, useState } from "react";
import { copyText, fetchJsonWithTimeout } from "../../lib/clientTools";
import { formatStructuredNotes, MAX_TRANSCRIPT_CHARS, validateStructuredNotes, type StructuredNotes } from "../../lib/fieldAi";
import { TextField } from "../ui";
import type { ToolContext } from "./context";

type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

const OVERFLOW_STATUS = "Not saved: notes exceed the 12,000-character limit. Copy the full note or shorten it to save. The previous saved note is unchanged.";

/** Free-text notes saved with the job. Voice dictation appends final phrases. Notes are never sent to AI unless the tech taps Tidy. */
export default function NotesTool({ ctx }: { ctx: ToolContext }) {
  const { api, system } = ctx;
  const stored = system ? system.notes : (api?.job?.homeNotes ?? "");
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(text);
  const request = useRef<AbortController | null>(null);
  function cancelTidy() {
    request.current?.abort();
    request.current = null;
    setBusy(false);
  }

  function commit(value: string) {
    if (value.length > MAX_TRANSCRIPT_CHARS) {
      setStatus(OVERFLOW_STATUS);
      return false;
    }
    if (!api) return false;
    if (system) api.dispatch({ type: "setSystemNotes", systemId: system.id, notes: value });
    else api.dispatch({ type: "setHomeNotes", notes: value });
    setStatus("Saved to this job");
    return true;
  }
  function change(value: string) {
    cancelTidy();
    latest.current = value;
    setText(value);
    return commit(value);
  }
  useEffect(
    () => () => {
      request.current?.abort();
      request.current = null;
      if (rec.current) {
        rec.current.onresult = null;
        rec.current.onend = null;
        rec.current.onerror = null;
        rec.current.stop();
      }
    },
    [],
  );

  function dictate() {
    const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) return setStatus("Voice capture is not supported in this browser. Type the note instead.");
    const r = new SR();
    r.continuous = true;
    r.interimResults = false;
    r.lang = "en-US";
    r.onresult = (e) => {
      let add = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add += e.results[i][0].transcript.trim() + " ";
      if (add) change((latest.current ? latest.current.replace(/\s*$/, " ") : "") + add.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setStatus("Voice capture stopped. You can type the note instead.");
    };
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function tidy() {
    if (text.length > MAX_TRANSCRIPT_CHARS) { setStatus("Notes are too long to send. Shorten them without losing your original record."); return; }
    cancelTidy();
    const controller = new AbortController();
    request.current = controller;
    const source = latest.current;
    setBusy(true);
    try {
      const body = await fetchJsonWithTimeout<StructuredNotes & { provider?: string; warning?: string }>("/api/structure-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: source }), signal: controller.signal });
      if (request.current !== controller || controller.signal.aborted || latest.current !== source) return;
      const valid = validateStructuredNotes(body);
      if (!valid) throw new Error("The service returned incomplete sections.");
      if (change(formatStructuredNotes(valid))) {
        setStatus(body.provider === "template" ? "Offline template, not AI interpretation. Review every section." : "Tidied into sections. Review every section.");
      }
    } catch (e) {
      if (request.current !== controller || controller.signal.aborted) return;
      setStatus(e instanceof Error ? e.message : "Tidy failed.");
    } finally {
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }

  if (!api) return <p className="hint">Open this tool from a job to keep notes.</p>;
  return (
    <div className="stack">
      <div className="panel">
        <h3>{system ? `Notes for ${system.name}` : "Notes for the home"}</h3>
        <p className="hint">Notes stay with the job and are sent to the configured AI provider only when you tap Tidy into sections. Dictation follows your browser’s speech-service settings.</p>
        <TextField label="Notes" value={text} onChange={change} multiline maxLength={MAX_TRANSCRIPT_CHARS} />
        <div className="btnRow">
          <button className="btn" type="button" onClick={listening ? () => rec.current?.stop() : dictate}>{listening ? "Stop dictation" : "Dictate"}</button>
          <button className="btn" type="button" disabled={!text.trim() || busy} onClick={tidy}>{busy ? "Tidying" : "Tidy into sections"}</button>
          <button className="btn ghost" type="button" disabled={!text.trim()} onClick={() => copyText(text).then(() => setStatus("Notes copied."), () => setStatus("Copy failed."))}>Copy notes</button>
        </div>
        <p className="hint" role="status">{text.length > MAX_TRANSCRIPT_CHARS ? OVERFLOW_STATUS : status}</p>
      </div>
    </div>
  );
}
