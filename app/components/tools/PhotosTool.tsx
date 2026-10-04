"use client";

import { useRef, useState } from "react";
import { MAX_PHOTOS_PER_SYSTEM } from "../../lib/photoCompress";
import { EmptyState } from "../ui";
import type { ToolContext } from "./context";
import PhotoThumb from "./PhotoThumb";
import PhotoAnnotator from "./PhotoAnnotator";

export default function PhotosTool({ ctx }: { ctx: ToolContext }) {
  const { api, system } = ctx;
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  if (!api || !api.job) return <p className="hint">Open this tool from a job to keep photos.</p>;
  const systemId = system?.id ?? null;
  const photos = api.job.photos.filter((p) => p.systemId === systemId);

  async function onFile(file: File | undefined) {
    if (!file || !api) return;
    setBusy(true);
    setError("");
    const r = await api.addPhoto(file, systemId, "");
    setBusy(false);
    if (!r.ok) setError(r.error);
    if (input.current) input.current.value = "";
  }

  return (
    <div className="stack">
      {editing && <PhotoAnnotator key={editing} photoId={editing} api={api} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); setMessage("Markup saved to this photo."); }} />}
      {message && <p role="status">{message}</p>}
      <div className="panel">
        <h3>Photos ({photos.length} of {MAX_PHOTOS_PER_SYSTEM})</h3>
        <p className="hint">Photos stay on this device with the job. They are never sent to AI. Attach them to a finding when you save it.</p>
        {photos.length === 0 ? (
          <EmptyState title="No photos yet" body="Take a photo of the equipment, the problem area or the plate." />
        ) : (
          <div className="photoGrid">
            {photos.map((p, i) => (
              <div key={p.id}>
                <PhotoThumb photoId={p.id} alt={`Photo ${i + 1}`} />
                <button className="btn" type="button" aria-label={`Annotate photo ${i + 1}`} disabled={busy} onClick={() => { setEditing(p.id); setMessage(""); }}>Annotate</button>
                <button className="btn ghost" type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => void api.removePhoto(p.id).then((r) => !r.ok && setError(r.error ?? "Could not remove the photo."))}>
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={input} className="visuallyHidden" type="file" accept="image/*" capture="environment" aria-label="Take or choose a photo" onChange={(e) => void onFile(e.target.files?.[0])} />
        <button className="btn primary" type="button" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Saving photo" : "Take photo"}
        </button>
        {error && <p className="hint" role="alert" style={{ color: "var(--safety)" }}>{error}</p>}
      </div>
    </div>
  );
}
