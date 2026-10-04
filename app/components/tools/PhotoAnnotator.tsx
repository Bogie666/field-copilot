"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { JobApi } from "../JobProvider";

type Point = { x: number; y: number };
type Mark = { type: "arrow" | "circle" | "pen" | "label"; points: Point[]; text?: string };

/** Edits the existing photo ID, preserving all finding attachments. Cancel never writes. */
export default function PhotoAnnotator({ photoId, api, onClose, onSaved }: { photoId: string; api: JobApi; onClose: () => void; onSaved: () => void }) {
  const { getPhotoBlob } = api;
  const canvas = useRef<HTMLCanvasElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const draft = useRef<Mark | null>(null);
  const alive = useRef(true);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [marks, setMarks] = useState<Mark[]>([]);
  const [tool, setTool] = useState<Mark["type"]>("arrow");
  const [label, setLabel] = useState("");

  const render = useCallback((pending: Mark | null = null) => {
    const c = canvas.current, original = image.current;
    const x = c?.getContext("2d");
    if (!c || !original || !x) return;
    x.clearRect(0, 0, c.width, c.height); x.drawImage(original, 0, 0);
    const width = Math.max(3, c.width / 180);
    for (const m of [...marks, ...(pending ? [pending] : [])]) {
      x.save(); x.strokeStyle = "#ff3030"; x.fillStyle = "#ff3030"; x.lineWidth = width; x.lineCap = "round"; x.lineJoin = "round";
      const start = m.points[0], end = m.points[m.points.length - 1];
      x.beginPath();
      if (m.type === "label") {
        const size = Math.max(18, c.width / 28);
        x.font = `bold ${size}px Arial`; x.textBaseline = "top";
        const boxWidth = Math.min(c.width, x.measureText(m.text || "").width + 16);
        const px = Math.max(0, Math.min(start.x, c.width - boxWidth));
        const py = Math.max(0, Math.min(start.y, c.height - size - 16));
        x.fillStyle = "rgba(0,0,0,.85)"; x.fillRect(px, py, boxWidth, size + 16);
        x.fillStyle = "#ffffff"; x.fillText(m.text || "", px + 8, py + 8, Math.max(1, boxWidth - 16));
      } else if (m.type === "circle") {
        x.ellipse((start.x + end.x) / 2, (start.y + end.y) / 2, Math.abs(end.x - start.x) / 2, Math.abs(end.y - start.y) / 2, 0, 0, Math.PI * 2); x.stroke();
      } else {
        x.moveTo(start.x, start.y); m.points.slice(1).forEach(p => x.lineTo(p.x, p.y)); x.stroke();
        if (m.type === "arrow") {
          const angle = Math.atan2(end.y - start.y, end.x - start.x), head = width * 4;
          x.beginPath(); x.moveTo(end.x, end.y);
          x.lineTo(end.x - head * Math.cos(angle - Math.PI / 6), end.y - head * Math.sin(angle - Math.PI / 6));
          x.lineTo(end.x - head * Math.cos(angle + Math.PI / 6), end.y - head * Math.sin(angle + Math.PI / 6));
          x.closePath(); x.fill();
        }
      }
      x.restore();
    }
  }, [marks]);

  useEffect(() => {
    alive.current = true;
    let current = true, url: string | null = null;
    getPhotoBlob(photoId).then(async blob => {
      if (!blob) throw new Error("This photo is no longer available.");
      if (!current) return;
      url = URL.createObjectURL(blob);
      const original = new Image(); original.src = url; await original.decode();
      if (!current || !canvas.current) return;
      canvas.current.width = original.naturalWidth; canvas.current.height = original.naturalHeight;
      image.current = original; setReady(true);
    }).catch(e => { if (current) setError(e instanceof Error ? e.message : "Could not open this photo."); });
    return () => { current = false; alive.current = false; if (url) URL.revokeObjectURL(url); };
  }, [getPhotoBlob, photoId]);
  useEffect(() => { if (ready) render(); }, [ready, render]);

  function point(e: PointerEvent<HTMLCanvasElement>): Point {
    const c = e.currentTarget, r = c.getBoundingClientRect();
    return { x: Math.max(0, Math.min(c.width, (e.clientX - r.left) * c.width / r.width)), y: Math.max(0, Math.min(c.height, (e.clientY - r.top) * c.height / r.height)) };
  }
  function down(e: PointerEvent<HTMLCanvasElement>) {
    if (!ready || busy) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    if (tool === "label") { if (label.trim()) setMarks(c => [...c, { type: "label", points: [point(e)], text: label.trim() }]); return; }
    draft.current = { type: tool, points: [point(e), point(e)] };
  }
  function move(e: PointerEvent<HTMLCanvasElement>) {
    const m = draft.current; if (!m) return;
    if (m.type === "pen") m.points.push(point(e)); else m.points[1] = point(e);
    render(m);
  }
  function up(e: PointerEvent<HTMLCanvasElement>) {
    const m = draft.current; if (!m) return;
    if (m.type === "pen") m.points.push(point(e)); else m.points[1] = point(e);
    draft.current = null; setMarks(c => [...c, m]);
  }
  async function save() {
    if (!canvas.current || !marks.length || busy) return;
    setBusy(true); setError(""); render();
    try {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.current!.toBlob(b => b ? resolve(b) : reject(new Error("Could not export markup.")), "image/jpeg", 0.9));
      await api.replacePhotoBlob(photoId, blob);
      if (alive.current) onSaved();
    } catch (e) { if (alive.current) setError(e instanceof Error ? e.message : "Could not save markup. Try again."); }
    finally { if (alive.current) setBusy(false); }
  }

  return <section className="panel stack" aria-label="Photo annotation editor">
    <h3>Annotate photo</h3>
    <p className="hint">Draw with your finger or pointer. Saving replaces this photo, keeping its finding attachments. Markup is flattened and cannot be removed after saving.</p>
    <label>Markup tool<select value={tool} onChange={e => setTool(e.target.value as Mark["type"])} disabled={busy}><option value="arrow">Arrow</option><option value="circle">Circle</option><option value="pen">Freehand</option><option value="label">Label</option></select></label>
    <label>Annotation label<input value={label} maxLength={80} onChange={e => setLabel(e.target.value)} disabled={busy} /></label>
    <button className="btn" type="button" disabled={!ready || !label.trim() || busy} onClick={() => { const c = canvas.current!; setMarks(m => [...m, {type:"label", points:[{x:c.width / 2,y:c.height / 2}], text:label.trim()}]); }}>Add label at center</button>
    {!ready && !error && <p role="status">Opening photo…</p>}
    <canvas ref={canvas} aria-label="Photo markup canvas" style={{ width:"100%", height:"auto", touchAction:"none", border:"1px solid var(--line)" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { draft.current = null; render(); }} />
    <div className="pillrow">
      <button className="btn" type="button" disabled={!marks.length || busy} onClick={() => setMarks(c => c.slice(0, -1))}>Undo markup</button>
      <button className="btn primary" type="button" disabled={!ready || !marks.length || busy} onClick={() => void save()}>{busy ? "Saving markup…" : "Save markup"}</button>
      <button className="btn" type="button" disabled={busy} onClick={onClose}>Cancel markup</button>
    </div>
    {error && <p role="alert">{error}</p>}
  </section>;
}
