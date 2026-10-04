"use client";

import { useCallback, useState } from "react";
import type { ToolContext } from "./context";

/**
 * Form state for a tool. Starts from the saved finding's inputs when reopening, otherwise blank.
 * `seed` offers nameplate-based suggestions that only apply when nothing was saved.
 */
export function useFormState<T extends Record<string, unknown>>(ctx: ToolContext, empty: T, seed?: Partial<T>) {
  const [state, setState] = useState<T>(() => {
    const saved = ctx.saved?.inputs;
    if (saved) return { ...empty, ...(saved as Partial<T>) };
    return { ...empty, ...(seed ?? {}) };
  });
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => setState((current) => ({ ...current, [key]: value })), []);
  return [state, set, setState] as const;
}

/** Names the fields whose values still equal their nameplate suggestion, for the finding's reference text. */
export function nameplateNote(pairs: Array<[label: string, value: string, suggestion: string]>): string {
  const used = pairs.filter(([, value, suggestion]) => suggestion && value.trim() === suggestion).map(([label]) => label);
  return used.length ? ` Taken from the confirmed nameplate: ${used.join(", ")}.` : "";
}
