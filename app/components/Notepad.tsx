"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { MicrophoneIcon } from "./Icons";
import { canLeavePersonalNote, getPersonalNotesStore, hasPersonalNoteContent, newNote, validatePersonalNote, type PersonalNote } from "../lib/notesStore";

type Recognition = { continuous: boolean; interimResults: boolean; lang: string; start(): void; stop(): void; onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type Mode = "text" | "draw";
type Tool = "accent" | "light" | "eraser";

const SAVED_STATUS = "Saved on this device · Never sent to Field Copilot AI. Browser dictation may use your browser, device, or speech vendor.";
const RECOVERY_KEY = "field-copilot-personal-note-recovery-v1";

function readRecovery(expectedId?: string): PersonalNote | null {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(window.localStorage.getItem(RECOVERY_KEY) ?? "null") as PersonalNote | null;
    if (!value || (expectedId && value.id !== expectedId) || validatePersonalNote(value).length) return null;
    return value;
  } catch { return null; }
}

function writeRecovery(note: PersonalNote): void {
  try { window.localStorage.setItem(RECOVERY_KEY, JSON.stringify(note)); }
  catch {
    // Preserve the text even if a large drawing exceeds localStorage's recovery quota.
    try { window.localStorage.setItem(RECOVERY_KEY, JSON.stringify({ ...note, inkPng: "" })); } catch { /* IndexedDB/pagehide remains the fallback. */ }
  }
}

function clearRecovery(note: PersonalNote): void {
  const recovered = readRecovery(note.id);
  if (recovered?.updatedAt === note.updatedAt) window.localStorage.removeItem(RECOVERY_KEY);
}

function makeId() {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  return `note-${suffix}`;
}

export default function Notepad() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const routeId = params.id;
  const [note, setNote] = useState<PersonalNote | null>(() => routeId ? null : readRecovery() ?? newNote(makeId()));
  const [mode, setMode] = useState<Mode>("text");
  const [tool, setTool] = useState<Tool>("accent");
  const [status, setStatus] = useState(routeId ? "Opening note…" : SAVED_STATUS);
  const [saveFailed, setSaveFailed] = useState(false);
  const [listening, setListening] = useState(false);
  const [missing, setMissing] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<PersonalNote | null>(note);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });
  const inkLoaded = useRef(false);
  const quickDictationStarted = useRef(false);

  useEffect(() => { noteRef.current = note; }, [note]);
  useEffect(() => {
    if (!routeId) return;
    let live = true;
    const decodedId = decodeURIComponent(routeId);
    getPersonalNotesStore().get(decodedId).then(found => {
      if (!live) return;
      const recovered = readRecovery(decodedId);
      const opened = recovered && (!found || recovered.updatedAt >= found.updatedAt) ? recovered : found;
      if (!opened) { setMissing(true); setStatus("This note is not on this device."); return; }
      setNote(opened); noteRef.current = opened; setStatus(recovered === opened ? "Recovered the latest on-device edit. Saving…" : SAVED_STATUS); setSaveFailed(false);
      if (recovered === opened) void getPersonalNotesStore().put(opened).then(() => clearRecovery(opened), () => setSaveFailed(true));
    }, error => { if (live) setStatus(error instanceof Error ? error.message : "The note could not be opened."); });
    return () => { live = false; };
  }, [routeId]);

  const persist = useCallback(async (next?: PersonalNote): Promise<boolean> => {
    const current = next ?? noteRef.current;
    if (!current) return false;
    try {
      await getPersonalNotesStore().put(current);
      clearRecovery(current);
      setStatus(SAVED_STATUS);
      setSaveFailed(false);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? `Not saved: ${error.message}` : "Not saved. Device storage is unavailable.");
      setSaveFailed(true);
      return false;
    }
  }, []);

  const scheduleSave = useCallback((next: PersonalNote) => {
    writeRecovery(next);
    noteRef.current = next; setNote(next); setStatus("Saving on this device…"); setSaveFailed(false);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void persist(next), 500);
  }, [persist]);

  useEffect(() => {
    const flush = () => {
      const current = noteRef.current;
      if (!hasPersonalNoteContent(current)) return;
      writeRecovery(current!);
      void getPersonalNotesStore().put(current!).then(() => clearRecovery(current!), () => undefined);
    };
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      flush();
      recognition.current?.stop();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const sizeCanvas = useCallback(() => {
    const canvas = canvasRef.current, surface = surfaceRef.current;
    if (!canvas || !surface) return;
    const rect = surface.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const prior = document.createElement("canvas");
    prior.width = canvas.width; prior.height = canvas.height;
    if (canvas.width && canvas.height) prior.getContext("2d")?.drawImage(canvas, 0, 0);
    canvas.width = Math.round(rect.width * ratio); canvas.height = Math.round(rect.height * ratio);
    canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx && prior.width) ctx.drawImage(prior, 0, 0, canvas.width, canvas.height);
  }, []);

  useEffect(() => {
    sizeCanvas();
    const observer = new ResizeObserver(sizeCanvas);
    if (surfaceRef.current) observer.observe(surfaceRef.current);
    window.addEventListener("resize", sizeCanvas);
    return () => { observer.disconnect(); window.removeEventListener("resize", sizeCanvas); };
  }, [sizeCanvas]);

  useEffect(() => {
    if (!note?.inkPng || inkLoaded.current || !canvasRef.current) return;
    inkLoaded.current = true;
    const image = new Image();
    image.onload = () => { const canvas = canvasRef.current; if (canvas) canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height); };
    image.src = note.inkPng;
  }, [note?.inkPng]);

  function update(field: "title" | "body", value: string) {
    const current = noteRef.current; if (!current) return;
    scheduleSave({ ...current, [field]: value, updatedAt: new Date().toISOString() });
  }
  function saveInk() {
    const current = noteRef.current, canvas = canvasRef.current; if (!current || !canvas) return;
    scheduleSave({ ...current, inkPng: canvas.toDataURL("image/png"), updatedAt: new Date().toISOString() });
  }
  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget, rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height };
  }
  function pointerDown(event: React.PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId); drawing.current = true; last.current = point(event);
  }
  function pointerMove(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = event.currentTarget.getContext("2d"), next = point(event); if (!ctx) return;
    const scale = event.currentTarget.width / event.currentTarget.getBoundingClientRect().width;
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = (tool === "eraser" ? 22 : 3) * scale;
    ctx.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle = tool === "light" ? "#e4e7f5" : "#9184d9";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(next.x, next.y); ctx.stroke(); ctx.restore(); last.current = next;
  }
  function pointerUp() { if (!drawing.current) return; drawing.current = false; saveInk(); }
  function clearInk() {
    const canvas = canvasRef.current; if (!canvas || !window.confirm("Clear the entire drawing?")) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height); saveInk();
  }
  function dictate() {
    if (listening) { recognition.current?.stop(); return; }
    const speechWindow = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const SpeechRecognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) { setStatus("Dictation is not supported here. Type the note instead."); return; }
    const rec = new SpeechRecognition(); rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
    rec.onresult = event => {
      let addition = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) if (event.results[i].isFinal) addition += `${event.results[i][0].transcript.trim()} `;
      const current = noteRef.current;
      if (addition && current) scheduleSave({ ...current, body: `${current.body}${current.body && !/\s$/.test(current.body) ? " " : ""}${addition.trim()}`, source: "dictated", updatedAt: new Date().toISOString() });
    };
    rec.onend = () => setListening(false); rec.onerror = () => { setListening(false); setStatus("Dictation stopped. Your captured words remain on this device."); };
    recognition.current = rec; setListening(true); setStatus("Listening… note data is never sent to Field Copilot AI. Dictation may use your browser, device, or speech vendor."); rec.start();
  }
  useEffect(() => {
    if (routeId || !note || quickDictationStarted.current || typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("dictate") !== "1") return;
    quickDictationStarted.current = true;
    const timer = window.setTimeout(() => document.querySelector<HTMLButtonElement>("[data-dictate-control]")?.click(), 0);
    return () => window.clearTimeout(timer);
  }, [note, routeId]);
  async function finish() {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const current = noteRef.current;
    if (!current) return;
    if (!hasPersonalNoteContent(current)) {
      await getPersonalNotesStore().delete(current.id).catch(() => undefined);
      clearRecovery(current);
      router.push("/notes");
      return;
    }
    const saved = await persist(current);
    if (canLeavePersonalNote(current, saved)) router.push("/notes");
  }
  async function close() {
    const current = noteRef.current;
    if (hasPersonalNoteContent(current)) {
      const saved = await persist(current!);
      if (canLeavePersonalNote(current, saved)) router.push("/notes");
      return;
    }
    if (current) await getPersonalNotesStore().delete(current.id).catch(() => undefined);
    if (current) clearRecovery(current);
    router.push("/notes");
  }

  if (missing) return <main className="notepad"><div className="notepadBar"><button onClick={() => router.push("/notes")} type="button" aria-label="Close">×</button></div><p className="empty">This note is not on this device.</p></main>;
  return <main className="notepad">
    <header className="notepadBar">
      <button onClick={() => void close()} type="button" aria-label="Close note">×</button>
      <div className="drawingTools" aria-label="Drawing tools">
        <button type="button" className="pen accentPen" aria-pressed={tool === "accent"} onClick={() => { setTool("accent"); setMode("draw"); }} aria-label="Accent pen" />
        <button type="button" className="pen lightPen" aria-pressed={tool === "light"} onClick={() => { setTool("light"); setMode("draw"); }} aria-label="Light pen" />
        <button type="button" aria-pressed={tool === "eraser"} onClick={() => { setTool("eraser"); setMode("draw"); }}>Erase</button>
        <button type="button" onClick={clearInk}>Clear</button>
      </div>
      <button className="doneButton" onClick={() => void finish()} type="button">Done</button>
    </header>
    <section className="notepadTitle">
      <input aria-label="Note title" maxLength={200} value={note?.title ?? ""} onChange={event => update("title", event.target.value)} placeholder="Note title" />
      <p>{note ? new Date(note.createdAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Opening"} · personal</p>
    </section>
    <div className="rule" />
    <div className="writingSurface" ref={surfaceRef}>
      <textarea aria-label="Personal note" maxLength={20_000} value={note?.body ?? ""} onChange={event => update("body", event.target.value)} placeholder="Write anything. Note data is never sent to Field Copilot AI." style={{ pointerEvents: mode === "text" ? "auto" : "none" }} />
      <canvas ref={canvasRef} aria-label="Drawing layer" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={pointerUp} onPointerLeave={pointerUp} style={{ pointerEvents: mode === "draw" ? "auto" : "none" }} />
    </div>
    <div className="rule" />
    <footer className="notepadFooter">
      <div className="modeSwitch"><button type="button" aria-pressed={mode === "text"} onClick={() => setMode("text")}>Text</button><button type="button" aria-pressed={mode === "draw"} onClick={() => setMode("draw")}>Draw</button></div>
      <div className="notepadStatus">
        <p role={saveFailed ? "alert" : "status"}>{mode === "draw" ? tool === "eraser" ? "Eraser — drag to erase ink" : "Draw anywhere over the note" : status}</p>
        {saveFailed && <button type="button" className="retryNoteSave" onClick={() => void persist()}>Retry save</button>}
      </div>
      <button className="dictateButton" data-dictate-control type="button" aria-pressed={listening} onClick={dictate} aria-label={listening ? "Stop dictation" : "Dictate"}><MicrophoneIcon /></button>
    </footer>
  </main>;
}
