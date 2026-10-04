"use client";

import { useCallback, useRef, useState, type SetStateAction } from "react";
import { scopeKey, validToolDraft } from "../../lib/job/types";
import type { ToolContext } from "./context";

type FormOptions = { slot?: string; savedInputs?: Record<string, unknown> };

/** Drafts are persisted on edits, never promoted to findings without an explicit Save.
 * Draft > saved inputs > nameplate suggestions. Standalone tools remain in memory.
 * The host remounts on job/tool/scope changes; saving clears persisted drafts without
 * erasing the values displayed in the form. Separate review slots avoid lost updates.
 */
export function useFormState<T extends Record<string, unknown>>(ctx: ToolContext, empty: T, seed?: Partial<T>, options: FormOptions = {}) {
  const slot = options.slot ?? "form";
  const [state, setState] = useState<T>(() => {
    const drafts = ctx.api?.job?.drafts;
    const draft = ctx.scope && Array.isArray(drafts) ? drafts.find((d) => validToolDraft(d, ctx.api?.job ?? undefined) && d.toolId === ctx.toolId && d.slot === slot && scopeKey(d.scope) === scopeKey(ctx.scope!)) : undefined;
    const saved = options.savedInputs ?? ctx.saved?.inputs;
    const source = draft?.inputs ?? saved ?? seed ?? {};
    const restored = { ...empty };
    for (const key of Object.keys(empty) as Array<keyof T>) {
      const value = source[key as string];
      const fallback = empty[key];
      // Measurement rows may be blank; only attachment IDs must be nonempty.
      if (Array.isArray(fallback)) {
        const valid = Array.isArray(value) && (key === "components"
          ? value.every(row => row !== null && typeof row === "object" && !Array.isArray(row) && typeof row.label === "string" && typeof row.value === "string")
          : value.every(item => typeof item === "string" && (key !== "photoIds" || !!item)));
        if (valid) restored[key] = value as T[typeof key];
      } else if (value !== null && typeof value === typeof fallback && (typeof value !== "number" || Number.isFinite(value))) restored[key] = value as T[typeof key];
    }
    return restored;
  });
  const current = useRef(state);
  const { api, scope, toolId } = ctx;
  const update = useCallback((value: SetStateAction<T>) => {
    const next = typeof value === "function" ? value(current.current) : value;
    current.current = next;
    setState(next);
    if (api && scope) api.dispatch({ type: "setToolDraft", toolId, scope, slot, inputs: next });
  }, [api, scope, toolId, slot]);
  const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => update((previous) => ({ ...previous, [key]: value })), [update]);
  return [state, set, update] as const;
}

/** Names the fields whose values still equal their nameplate suggestion, for the finding's reference text. */
export function nameplateNote(pairs: Array<[label: string, value: string, suggestion: string]>): string {
  const used = pairs.filter(([, value, suggestion]) => suggestion && value.trim() === suggestion).map(([label]) => label);
  return used.length ? ` Taken from the confirmed nameplate: ${used.join(", ")}.` : "";
}
