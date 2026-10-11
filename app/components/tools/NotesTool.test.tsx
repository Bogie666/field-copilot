import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobApi, JobActionInput, SaveResult } from "../JobProvider";
import { MAX_TRANSCRIPT_CHARS } from "../../lib/fieldAi";
import { jobReducer } from "../../lib/job/reducer";
import { createJob, scopeForComponent } from "../../lib/job/types";
import NotesTool from "./NotesTool";
import type { ToolContext } from "./context";

const host = vi.hoisted(() => ({ slots: [] as unknown[], index: 0, fetch: vi.fn(), copy: vi.fn(), cleanups: [] as Array<() => void> }));
vi.mock("../../lib/clientTools", () => ({ fetchJsonWithTimeout: host.fetch, copyText: host.copy }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useEffect: (effect: () => undefined | (() => void)) => {
    const index = host.index++;
    if (!(index in host.slots)) { host.slots[index] = true; const cleanup = effect(); if (cleanup) host.cleanups.push(cleanup); }
  },
  useLayoutEffect: (effect: () => void) => effect(),
  useRef: (initial: unknown) => { const index = host.index++; return host.slots[index] ??= { current: initial }; },
  useState: (initial: unknown) => {
    const index = host.index++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [host.slots[index], (value: unknown) => { host.slots[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(host.slots[index]) : value; }];
  },
}));
type Props = Record<string, unknown>;
function find(node: unknown, predicate: (props: Props) => boolean): Props {
  if (Array.isArray(node)) {
    for (const child of node) { const result = find(child, predicate); if (Object.keys(result).length) return result; }
  } else if (node && typeof node === "object") {
    const props = (node as { props?: Props }).props;
    if (props && predicate(props)) return props;
    if (props?.children) return find(props.children, predicate);
  }
  return {};
}
const response = { provider: "mock-only", workPerformed: "Recorded work", measurementsReadings: "238 V", diagnosisFindings: "Proposed wording", recommendations: "Not documented", customerDeclinedWork: "Not documented" };
const button = (tree: unknown, name: string) => find(tree, props => props.type === "button" && props.children === name);
const notes = (tree: unknown) => find(tree, props => props.label === "Notes");
const status = (tree: unknown) => find(tree, props => props.role === "status").children;
const click = (props: Props) => (props.onClick as () => void)();
const change = (props: Props, value: string) => (props.onChange as (value: string) => void)(value);
const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

function fixture(stored = "Original note. NO leak observed; declined work must survive.", home = false) {
  const now = "2026-10-05T00:00:00.000Z";
  const job = createJob("Private label", now, { systemId: "s1" });
  const component = job.systems[0].components![1];
  component.notes = stored;
  if (home) job.homeNotes = stored;
  const api = { job, error: "", persistent: true, saving: false, cancelPendingSave: vi.fn() } as unknown as JobApi;
  const apply = async (action: JobActionInput): Promise<SaveResult> => {
    api.job = jobReducer(api.job!, { ...action, now });
    return { ok: true as const, persistent: true };
  };
  const dispatch = vi.fn(apply);
  const saveAction = vi.fn(apply);
  api.dispatch = dispatch;
  api.saveAction = saveAction;
  const ctx: ToolContext = { toolId: "notes", api, system: home ? null : job.systems[0], component: home ? null : component, scope: home ? { kind: "home" } : scopeForComponent(job.systems[0], component), saved: undefined };
  const render = () => {
    host.index = 0;
    if (!home) { ctx.system = api.job!.systems[0]; ctx.component = ctx.system.components![1]; }
    const shell = NotesTool({ ctx });
    return (shell.type as (props: { ctx: ToolContext }) => React.ReactNode)(shell.props);
  };
  return { api, ctx, render, dispatch, saveAction, original: component.notes, apply };
}

class SpeechRecognition {
  static current: SpeechRecognition;
  onresult: ((event: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { SpeechRecognition.current = this; }
  start() {}
  stop() { this.onend?.(); }
  emit(transcript: string) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] }); }
}

beforeEach(() => {
  host.cleanups.splice(0).forEach(cleanup => cleanup());
  host.slots = []; host.index = 0;
  host.fetch.mockReset(); host.fetch.mockResolvedValue(response);
  host.copy.mockReset(); host.copy.mockResolvedValue(undefined);
  vi.stubGlobal("React", React); vi.stubGlobal("window", { SpeechRecognition });
});

describe("reviewed note edits", () => {
  it("previews both versions and discards without changing the saved original", async () => {
    const { render, original, saveAction, api } = fixture();
    click(button(render(), "Tidy into sections")); await settle();
    const tree = render();
    expect(notes(tree).value).toBe(original);
    expect(find(tree, props => props["aria-label"] === "Original notes").value).toBe(original);
    expect(find(tree, props => props["aria-label"] === "Proposed notes").value).toContain("Proposed wording");
    expect(saveAction).not.toHaveBeenCalled();
    click(button(tree, "Discard edit"));
    expect(find(render(), props => props["aria-label"] === "Proposed notes")).toEqual({});
    expect(api.job!.notesTidyHistory).toBeUndefined();
    expect(api.job!.systems[0].components![1].notes).toBe(original);
  });

  it("waits for explicit acceptance to commit and retains the exact original", async () => {
    const { render, original, saveAction, api, apply } = fixture();
    click(button(render(), "Tidy into sections")); await settle();
    let release!: () => void;
    saveAction.mockImplementationOnce(action => new Promise(resolve => { release = () => { void apply(action).then(resolve); }; }));
    click(button(render(), "Accept edit and retain original"));
    expect(notes(render()).value).toBe(original);
    expect(button(render(), "Saving accepted edit…").disabled).toBe(true);
    expect(saveAction).toHaveBeenCalledWith(expect.objectContaining({ type: "acceptTidiedNotes", original, scope: { kind: "system", systemId: "s1", componentId: "s1:furnace" } }));
    release(); await settle();
    expect(notes(render()).value).toContain("Proposed wording");
    expect(api.job!.notesTidyHistory![0].original).toBe(original);
    expect(status(render())).toContain("original notes saved");
  });

  it("ignores late responses and invalidates a visible preview when notes change", async () => {
    const { render, saveAction } = fixture();
    let release!: (value: unknown) => void;
    host.fetch.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    click(button(render(), "Tidy into sections"));
    change(notes(render()), "Newer note");
    release(response); await settle();
    expect(notes(render()).value).toBe("Newer note");
    expect(button(render(), "Accept edit and retain original")).toEqual({});
    click(button(render(), "Tidy into sections")); await settle();
    expect(button(render(), "Accept edit and retain original").disabled).toBe(false);
    change(notes(render()), "Even newer note");
    expect(button(render(), "Accept edit and retain original")).toEqual({});
    expect(saveAction).not.toHaveBeenCalled();
  });

  it("keeps original and preview when acceptance fails, and cancels a staged retry on discard", async () => {
    const { render, original, saveAction, api } = fixture();
    click(button(render(), "Tidy into sections")); await settle();
    saveAction.mockResolvedValueOnce({ ok: false, errors: ["Storage is full"] });
    click(button(render(), "Accept edit and retain original")); await settle();
    expect(notes(render()).value).toBe(original);
    expect(status(render())).toContain("Edit not accepted: Storage is full");
    expect(button(render(), "Accept edit and retain original").disabled).toBe(false);
    click(button(render(), "Discard edit"));
    expect(api.cancelPendingSave).toHaveBeenCalledOnce();
  });

  it("does not let a delayed autosave claim newer unsaved text was saved", async () => {
    const { render, dispatch } = fixture();
    let release!: () => void;
    dispatch.mockImplementationOnce(() => new Promise(resolve => { release = () => resolve({ ok: true, persistent: true }); }));
    dispatch.mockResolvedValueOnce({ ok: false, errors: ["Storage full"] });
    change(notes(render()), "First edit");
    change(notes(render()), "Second edit"); await settle();
    expect(status(render())).toContain("Not saved: Storage full");
    release(); await settle();
    expect(status(render())).toContain("Not saved: Storage full");
    expect(notes(render()).value).toBe("Second edit");
  });

  it("labels successful volatile storage honestly", async () => {
    const { render, dispatch } = fixture();
    dispatch.mockResolvedValueOnce({ ok: true, persistent: false });
    change(notes(render()), "Session note"); await settle();
    expect(status(render())).toContain("session only");
    expect(status(render())).not.toContain("saved on this device");
  });

  it("reconciles a provider retry that commits the exact accepted edit", async () => {
    const { render, saveAction, apply } = fixture();
    click(button(render(), "Tidy into sections")); await settle();
    saveAction.mockResolvedValueOnce({ ok: false, errors: ["Storage full"] });
    click(button(render(), "Accept edit and retain original")); await settle();
    const action = saveAction.mock.calls[0][0];
    await apply(action);
    render(); // Reconciles an external commit without changing newer editor text.
    expect(notes(render()).value).toContain("Proposed wording");
    expect(button(render(), "Accept edit and retain original")).toEqual({});
  });
});


describe("notes persistence bounds and dictation", () => {
  it("saves through the exact limit and rejects overflow without truncating the editor", async () => {
    const { render, api, dispatch } = fixture();
    const tail = " CRITICAL TAIL!";
    const atLimit = "x".repeat(MAX_TRANSCRIPT_CHARS - tail.length) + tail;
    change(notes(render()), atLimit); await settle();
    expect(api.job!.systems[0].components![1].notes).toBe(atLimit);
    expect(status(render())).toBe("Notes saved on this device.");
    dispatch.mockClear();
    change(notes(render()), atLimit + "!"); await settle();
    expect(notes(render()).value).toBe(atLimit + "!");
    expect(api.job!.systems[0].components![1].notes).toBe(atLimit);
    expect(dispatch).not.toHaveBeenCalled();
    expect(status(render())).toMatch(/not saved/i);
  });

  it("ignores a late response after newer dictation", async () => {
    const { render, api } = fixture();
    let release!: (value: unknown) => void;
    host.fetch.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    click(button(render(), "Tidy into sections"));
    click(button(render(), "Dictate"));
    SpeechRecognition.current.emit("Newer dictated evidence");
    expect((host.fetch.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    release(response); await settle();
    expect(notes(render()).value).toContain("Newer dictated evidence");
    expect(api.job!.systems[0].components![1].notes).toContain("Newer dictated evidence");
    expect(button(render(), "Accept edit and retain original")).toEqual({});
  });

  it.each([false, true])("retains overflowing dictation for copy/shortening (home=%s)", async home => {
    const original = "x".repeat(11995);
    const { render, api, dispatch } = fixture(original, home);
    click(button(render(), "Dictate"));
    SpeechRecognition.current.emit("CRITICAL TAIL");
    const overflow = original + " CRITICAL TAIL";
    expect(notes(render()).value).toBe(overflow);
    expect(home ? api.job!.homeNotes : api.job!.systems[0].components![1].notes).toBe(original);
    expect(dispatch).not.toHaveBeenCalled();
    expect(status(render())).toMatch(/not saved.*12,000/i);
    click(button(render(), "Copy notes")); await settle();
    expect(host.copy).toHaveBeenCalledWith(overflow);
    SpeechRecognition.current.onerror?.();
    expect(status(render())).toMatch(/not saved/i);
    change(notes(render()), "Shortened with CRITICAL TAIL"); await settle();
    expect(home ? api.job!.homeNotes : api.job!.systems[0].components![1].notes).toBe("Shortened with CRITICAL TAIL");
    expect(status(render())).toBe("Notes saved on this device.");
  });

  it("aborts on unmount and disconnects speech callbacks", async () => {
    const { render, saveAction } = fixture();
    let release!: (value: unknown) => void;
    host.fetch.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    click(button(render(), "Tidy into sections"));
    click(button(render(), "Dictate"));
    host.cleanups.splice(0).forEach(cleanup => cleanup());
    expect((host.fetch.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    expect(SpeechRecognition.current.onresult).toBeNull();
    release(response); await settle();
    expect(saveAction).not.toHaveBeenCalled();
  });
});


it("requires dictation to finish before starting or accepting tidy", async () => {
  const { render, saveAction } = fixture();
  click(button(render(), "Dictate"));
  expect(button(render(), "Tidy into sections").disabled).toBe(true);
  click(button(render(), "Tidy into sections")); await settle();
  expect(host.fetch).not.toHaveBeenCalled();
  SpeechRecognition.current.onend?.();
  click(button(render(), "Tidy into sections")); await settle();
  click(button(render(), "Dictate"));
  expect(button(render(), "Accept edit and retain original").disabled).toBe(true);
  click(button(render(), "Accept edit and retain original")); await settle();
  expect(saveAction).not.toHaveBeenCalled();
});
