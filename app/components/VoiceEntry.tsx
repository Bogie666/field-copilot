"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { parseVoiceReadings, type VoiceMatch, type VoiceParse } from "../lib/voiceReadings";
import { MicrophoneIcon } from "./Icons";
import { Callout } from "./ui";
import { VoiceRegistryContext, type VoiceRegistry } from "./voiceRegistry";

type Recognition = {
  continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; abort(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((event: { error?: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Fields in on-screen order, for matching ties and the preview list. */
function orderedFields(registry: VoiceRegistry) {
  const order = [...document.querySelectorAll<HTMLElement>("[data-voice-id]")].map((el) => el.dataset.voiceId!);
  return order.filter((id) => registry.has(id)).map((id) => ({ id, ...registry.get(id)! }));
}

export default function VoiceEntry({ children }: { children: ReactNode }) {
  const [registry] = useState<VoiceRegistry>(() => new Map());
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [result, setResult] = useState<VoiceParse | null>(null);
  const [error, setError] = useState("");
  const [hasFields, setHasFields] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const transcript = useRef("");

  useEffect(() => {
    // Feature detection and field discovery need the browser, after the first render.
    const id = window.setTimeout(() => { setSupported(!!recognitionCtor()); setHasFields(registry.size > 0); }, 0);
    return () => { window.clearTimeout(id); rec.current?.abort(); };
  }, [registry]);

  const finish = () => {
    setListening(false);
    const text = transcript.current.trim();
    if (!text) { setError("Nothing was heard. Try again, saying the field name before each number."); return; }
    setResult(parseVoiceReadings(text, orderedFields(registry)));
  };

  const start = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    setError(""); setResult(null); setHeard(""); transcript.current = "";
    const r = new Ctor();
    r.continuous = false; r.interimResults = true; r.lang = "en-US";
    r.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i += 1) text += `${event.results[i][0].transcript} `;
      transcript.current = text;
      setHeard(text.trim());
    };
    r.onerror = (event) => { if (event.error && event.error !== "aborted" && event.error !== "no-speech") setError(event.error === "not-allowed" ? "Microphone access was blocked. Allow it in the browser settings to speak readings." : "Speech recognition stopped. Try again or type the readings."); };
    r.onend = finish;
    rec.current = r;
    setListening(true);
    try { r.start(); } catch { setListening(false); setError("Speech recognition could not start."); }
  };

  const apply = (matches: VoiceMatch[]) => {
    for (const m of matches) registry.get(m.id)?.apply(m.value);
    setResult(null); setHeard("");
  };

  const current = (id: string) => registry.get(id)?.value ?? "";

  return (
    <VoiceRegistryContext.Provider value={registry}>
      {supported && hasFields && (
        <div className="voiceBar noPrint">
          <button type="button" className={listening ? "btn voiceBtn listening" : "btn voiceBtn"} onClick={() => (listening ? rec.current?.stop() : start())} aria-pressed={listening}>
            <MicrophoneIcon /> {listening ? "Listening… tap to stop" : "Speak readings"}
          </button>
          {!listening && !result && !error && <span className="hint">Say the field name, then the number: “suction 118, suction temp 52”.</span>}
          {listening && heard && <p className="voiceHeard">{heard}</p>}
        </div>
      )}
      {error && <div className="voiceResult"><Callout tone="warn"><p>{error}</p></Callout></div>}
      {result && (
        <div className="panel voiceResult" role="dialog" aria-label="Spoken readings">
          <h3>Check before applying</h3>
          <p className="hint">Heard: “{heard}”. Speech may be processed by your browser or device vendor.</p>
          {result.matches.length > 0 ? (
            <ul className="voiceMatches">
              {result.matches.map((m) => (
                <li key={m.id}><span>{m.label}</span><b>{current(m.id) && current(m.id) !== m.value ? <s>{current(m.id)}</s> : null} {m.value}</b></li>
              ))}
            </ul>
          ) : <p>No fields matched. Say the field name before each number.</p>}
          {result.unmatched.length > 0 && <p className="hint">Not matched: {result.unmatched.join(", ")}</p>}
          <div className="btnRow">
            {result.matches.length > 0 && <button type="button" className="btn primary" onClick={() => apply(result.matches)}>Apply {result.matches.length} {result.matches.length === 1 ? "value" : "values"}</button>}
            <button type="button" className="btn" onClick={start}>Try again</button>
            <button type="button" className="btn ghost" onClick={() => { setResult(null); setHeard(""); }}>Cancel</button>
          </div>
        </div>
      )}
      {children}
    </VoiceRegistryContext.Provider>
  );
}
