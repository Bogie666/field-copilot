"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./Icons";

type Theme = "light" | "dark";
const KEY = "fc.theme";
const EVENT = "fc-theme-change";

function current(): Theme {
  const attr = document.documentElement.dataset.theme;
  if (attr === "dark" || attr === "light") return attr;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener(EVENT, listener);
  media.addEventListener("change", listener);
  return () => {
    window.removeEventListener(EVENT, listener);
    media.removeEventListener("change", listener);
  };
}

export default function ThemeToggle() {
  // The layout's inline script applies a stored choice before paint; this reads whatever is active.
  const theme = useSyncExternalStore<Theme>(subscribe, current, () => "light");

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* storage can be blocked; the choice then lasts for this visit only */
    }
    window.dispatchEvent(new Event(EVENT));
  }

  return (
    <button className="iconButton" type="button" onClick={toggle} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
