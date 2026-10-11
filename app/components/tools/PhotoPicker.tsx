"use client";

import { useRef, useState } from "react";
import { photoMatchesScope, type FindingScope } from "../../lib/job/types";
import { useJob } from "../JobProvider";
import PhotoThumb from "./PhotoThumb";

/** Lets the tech attach existing system photos to a finding, or take a new one. */
export default function PhotoPicker({ systemId, scope: selectedScope, selected, onChange, required }: { systemId?: string; scope?: FindingScope; selected: string[]; onChange: (ids: string[]) => void; required?: boolean }) {
  const { job, addPhoto } = useJob();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scope: FindingScope = selectedScope ?? (systemId ? { kind: "system", systemId } : { kind: "home" });
  const photos = job?.photos.filter(p => photoMatchesScope(p, scope)) ?? [];

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    const result = await addPhoto(file, scope.kind === "system" ? scope.systemId : null, "", scope.kind === "system" ? scope.componentId : undefined);
    setBusy(false);
    if (result.ok) onChange([...selected, result.photo.id]);
    else setError(result.error);
    if (input.current) input.current.value = "";
  }

  return (
    <fieldset className="fieldset">
      <legend>{required ? "Photos (at least one required)" : "Photos"}</legend>
      {photos.length > 0 && (
        <div className="photoGrid">
          {photos.map((p, i) => {
            const on = selected.includes(p.id);
            return (
              <button key={p.id} type="button" className="photoThumb" aria-pressed={on} aria-label={`${on ? "Remove" : "Attach"} photo ${i + 1}`} onClick={() => onChange(on ? selected.filter((id) => id !== p.id) : [...selected, p.id])}>
                <PhotoThumb photoId={p.id} alt={`Photo ${i + 1}`} />
              </button>
            );
          })}
        </div>
      )}
      <p className="hint">{photos.length ? "Tap a photo to attach it to this finding." : "No photos for this component yet."}</p>
      <input ref={input} className="visuallyHidden" type="file" accept="image/*" capture="environment" aria-label="Take or choose a photo" onChange={(e) => void onFile(e.target.files?.[0])} />
      <button className="btn" type="button" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Saving photo" : "Take photo"}
      </button>
      {error && <p className="hint" role="alert" style={{ color: "var(--safety)" }}>{error}</p>}
    </fieldset>
  );
}
