"use client";

import { useSyncExternalStore } from "react";
import { ACCENT_EVENT, ACCENTS, applyAccent, currentAccent, type AccentId } from "../lib/accentTheme";

function subscribe(listener: () => void) {
  window.addEventListener(ACCENT_EVENT, listener);
  return () => window.removeEventListener(ACCENT_EVENT, listener);
}

export default function AccentPicker() {
  const active = useSyncExternalStore<AccentId>(subscribe, currentAccent, () => "purple");
  return (
    <div className="accentPicker" role="radiogroup" aria-label="Theme color">
      {ACCENTS.map((accent) => (
        <button key={accent.id} type="button" role="radio" aria-checked={active === accent.id} className="accentOption" onClick={() => applyAccent(accent.id)}>
          <span className="accentSwatch" style={{ background: accent.swatch }} aria-hidden="true" />
          <span>{accent.label}</span>
        </button>
      ))}
    </div>
  );
}
