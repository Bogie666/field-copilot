"use client";

import { useEffect, useRef, useState } from "react";
import { copyText, fetchJsonWithTimeout } from "../../lib/clientTools";
import { formatStructuredNotes, MAX_TRANSCRIPT_CHARS, validateStructuredNotes, type StructuredNotes } from "../../lib/fieldAi";
import { TextField } from "../ui";
import type { ToolContext } from "./context";

type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

/** Free-text notes saved with the job. Voice dictation appends final phrases. Notes are never sent to AI unless the tech taps Tidy. */
export default function NotesTool({ ctx }: { ctx: ToolContext }) {
  const { api, system } = ctx;
  const stored = system ? system.notes : (api?.job?.homeNotes ?? "");
  const [text, setText] = useState(stored);
  const [status, setStatus] = useState("");
  const [listening, setListening] = useState(false);
  const [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rec = useRef<Recognition | null>(null);
  const latest = useRef(text);

  function commit(value: string) {
    if (!api) return;
    if (system) api.dispatch({ type: "setSystemNotes", systemId: system.id, notes: value });
    else api.dispatch({ type: "setHomeNotes", notes: value });
    setStatus("Saved to this job");
  }
  function change(value: string) {
    latest.current = value;
    setText(value);
    setStatus("Saving after you pause");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commit(value), 900);
  }
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        commit(latest.current);
      }
      rec.current?.stop();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    setBusy(true);
    try {
      const body = await fetchJsonWithTimeout<StructuredNotes>("/api/structure-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ transcript: text.slice(0, MAX_TRANSCRIPT_CHARS) }) });
      const valid = validateStructuredNotes(body);
      if (!valid) throw new Error("The service returned incomplete sections.");
      change(formatStructuredNotes(valid));
      setStatus("Tidied into sections. Review every section.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Tidy failed.");
    } finally {
      setBusy(false);
    }
  }

  if (!api) return <p className="hint">Open this tool from a job to keep notes.</p>;
  return (
    <div className="stack">
      <div className="panel">
        <h3>{system ? `Notes for ${system.name}` : "Notes for the home"}</h3>
        <p className="hint">Notes stay with the job and are never sent to AI unless you tap Tidy into sections.</p>
        <TextField label="Notes" value={text} onChange={change} multiline maxLength={MAX_TRANSCRIPT_CHARS} />
        <div className="btnRow">
          <button className="btn" type="button" onClick={listening ? () => rec.current?.stop() : dictate}>{listening ? "Stop dictation" : "Dictate"}</button>
          <button className="btn" type="button" disabled={!text.trim() || busy} onClick={tidy}>{busy ? "Tidying" : "Tidy into sections"}</button>
          <button className="btn ghost" type="button" disabled={!text.trim()} onClick={() => copyText(text).then(() => setStatus("Notes copied."), () => setStatus("Copy failed."))}>Copy notes</button>
        </div>
        <p className="hint" role="status">{status}</p>
      </div>
    </div>
  );
}
