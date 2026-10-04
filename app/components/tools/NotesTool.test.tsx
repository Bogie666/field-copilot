import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { jobReducer, type JobAction } from "../../lib/job/reducer";
import { createJob } from "../../lib/job/types";
import { MAX_TRANSCRIPT_CHARS, notesFallback } from "../../lib/fieldAi";
import { TextField } from "../ui";
import type { JobApi } from "../JobProvider";
import type { ToolContext } from "./context";
import NotesTool from "./NotesTool";

// Stateful hook harness runs the actual component callbacks and job reducer,
// without requiring a browser server or substituting the component under test.
const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, cleanups: [] as Array<() => void> }));
const clients = vi.hoisted(() => ({ copy: vi.fn(), fetch: vi.fn() }));
vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initial: T) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = initial;
      return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
    },
    useRef<T>(initial: T) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
    useEffect(effect: () => (() => void) | undefined) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) {
        hooks.slots[index] = true;
        const cleanup = effect();
        if (cleanup) hooks.cleanups.push(cleanup);
      }
    },
  };
});
vi.mock("../../lib/clientTools", () => ({ copyText: clients.copy, fetchJsonWithTimeout: clients.fetch }));

class SpeechRecognition {
  static current: SpeechRecognition;
  continuous = false;
  interimResults = false;
  lang = "";
  onresult: ((event: { resultIndex: number; results: Array<Array<{ transcript: string }> & { isFinal: boolean }> }) => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() { SpeechRecognition.current = this; }
  start() {}
  stop() {}
  emit(transcript: string) {
    this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript }], { isFinal: true })] });
  }
}

type NodeProps = { children?: ReactNode; label?: string; value?: string; role?: string; onChange?: (value: string) => void; onClick?: () => unknown };
function nodes(tree: ReactNode): Array<React.ReactElement<NodeProps>> {
  if (!React.isValidElement<NodeProps>(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}
function mount(stored: string, systemNotes = false) {
  let job = createJob("x", "2026-10-04T00:00:00.000Z", { systemId: "s" });
  if (systemNotes) job.systems[0].notes = stored;
  else job.homeNotes = stored;
  const dispatch = vi.fn((action: JobAction) => { job = jobReducer(job, action); });
  const ctx: ToolContext = { toolId: "notes", api: { job, dispatch } as unknown as JobApi, scope: systemNotes ? { kind: "system", systemId: "s" } : { kind: "home" }, system: systemNotes ? job.systems[0] : null, saved: undefined };
  function render() {
    hooks.cursor = 0;
    return nodes(NotesTool({ ctx }));
  }
  const editor = () => render().find(node => node.type === TextField)!;
  const status = () => render().find(node => node.props.role === "status")!.props.children;
  const button = (label: string) => render().find(node => node.type === "button" && node.props.children === label)!;
  return { editor, status, dispatch, button, persisted: () => systemNotes ? job.systems[0].notes : job.homeNotes };
}

beforeEach(() => {
  hooks.cleanups.splice(0).forEach(cleanup => cleanup());
  hooks.slots = [];
  hooks.cursor = 0;
  vi.clearAllMocks();
  clients.copy.mockResolvedValue(undefined);
  vi.stubGlobal("React", React);
  vi.stubGlobal("window", { SpeechRecognition });
});

describe("NotesTool persistence bounds", () => {
  it("saves normal edits through the exact limit but rejects programmatic overflow without truncation", () => {
    const app = mount("Original");
    const tail = " CRITICAL TAIL";
    const atLimit = "x".repeat(MAX_TRANSCRIPT_CHARS - tail.length) + tail;
    app.editor().props.onChange!(atLimit);
    expect(app.persisted()).toBe(atLimit);
    expect(app.status()).toBe("Saved to this job");
    app.dispatch.mockClear();
    app.editor().props.onChange!(atLimit + "!");
    expect(app.editor().props.value).toBe(atLimit + "!");
    expect(app.persisted()).toBe(atLimit);
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.status()).toMatch(/not saved/i);
  });

  it.each(["edit", "dictation"])("ignores a late tidy response after newer %s", async (path) => {
    const app = mount("Original technician note");
    let release!: (value: unknown) => void;
    clients.fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const pending = app.button("Tidy into sections").props.onClick!();
    if (path === "edit") app.editor().props.onChange!("Newer technician edits");
    else {
      app.button("Dictate").props.onClick!();
      SpeechRecognition.current.emit("Newer dictated details");
    }
    const newer = app.editor().props.value;
    expect((clients.fetch.mock.calls[0][1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    release(notesFallback("Old tidy result"));
    await pending;
    expect(app.editor().props.value).toBe(newer);
    expect(app.persisted()).toBe(newer);
    expect(app.status()).toBe("Saved to this job");
  });

  it.each([false, true])("retains unsaved dictation overflow for copy or shortening (system=%s)", async (systemNotes) => {
    const original = "x".repeat(11995);
    const app = mount(original, systemNotes);
    app.button("Dictate").props.onClick!();
    SpeechRecognition.current.emit("CRITICAL TAIL");
    const overflow = original + " CRITICAL TAIL";
    expect(app.editor().props.value).toBe(overflow);
    expect(app.persisted()).toBe(original);
    expect(app.dispatch).not.toHaveBeenCalled();
    expect(app.status()).toMatch(/not saved.*12,000/i);
    expect(app.status()).not.toMatch(/Saved to this job/);
    await app.button("Copy notes").props.onClick!();
    expect(clients.copy).toHaveBeenCalledWith(overflow);
    SpeechRecognition.current.onerror?.();
    expect(app.status()).toMatch(/not saved/i);
    app.editor().props.onChange!("Shortened with CRITICAL TAIL");
    expect(app.persisted()).toBe("Shortened with CRITICAL TAIL");
    expect(app.status()).toBe("Saved to this job");
  });
});
