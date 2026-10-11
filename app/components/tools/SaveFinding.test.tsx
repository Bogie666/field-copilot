import React, { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobApi, SaveResult } from "../JobProvider";
import { createJob, hashInputs, type FindingScope } from "../../lib/job/types";
import { makeFinding } from "../../lib/job/fixtures";
import { ActionBar, TextField } from "../ui";
import type { ToolContext } from "./context";
import PhotoPicker from "./PhotoPicker";
import SaveFinding, { type BuiltFinding } from "./SaveFinding";

const hooks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
const form = vi.hoisted(() => ({ review: { recommendation: "", safetyAction: "", actionTaken: "", verification: "", photoIds: [] as string[] } }));
vi.mock("react", async (load) => {
  const actual = await load<typeof import("react")>();
  return {
    ...actual,
    useState<T>(initial: T | (() => T)) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? (initial as () => T)() : initial;
      return [hooks.slots[index], (value: T) => { hooks.slots[index] = value; }];
    },
    useRef<T>(initial: T) {
      const index = hooks.cursor++;
      if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
      return hooks.slots[index];
    },
  };
});
vi.mock("./useFormState", () => ({
  useFormState: () => [form.review, (key: keyof typeof form.review, value: never) => { form.review = { ...form.review, [key]: value }; }],
}));

type Props = { children?: ReactNode; onClick?: () => unknown; disabled?: boolean; note?: string; label?: string; value?: string; required?: boolean; selected?: string[]; scope?: FindingScope; onChange?: (value: string) => void };
function nodes(tree: ReactNode): React.ReactElement<Props>[] {
  if (!React.isValidElement<Props>(tree)) return [];
  return [tree, ...React.Children.toArray(tree.props.children).flatMap(nodes)];
}
function text(node: ReactNode): string {
  if (typeof node === "string") return node;
  if (!React.isValidElement<Props>(node)) return "";
  return React.Children.toArray(node.props.children).map(text).join("");
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function setup(overrides: Partial<BuiltFinding> = {}) {
  const job = createJob("Synthetic", "2026-10-11T00:00:00Z", { systemId: "s" });
  const scope: FindingScope = { kind: "system", systemId: "s" };
  const saveFinding = vi.fn<() => Promise<SaveResult>>().mockResolvedValue({ ok: true, persistent: true });
  const saveAction = vi.fn<() => Promise<SaveResult>>().mockResolvedValue({ ok: true, persistent: true });
  const api = { job, saveFinding, saveAction, persistent: true } as unknown as JobApi;
  const ctx: ToolContext = { toolId: "electrical", api, scope, system: job.systems[0], saved: undefined };
  const built: BuiltFinding = { severity: "ok", title: "Readings recorded", diagnosis: "Measured 230 V.", readings: [{ label: "Voltage", value: 230, unit: "V", source: "entered" }], inputs: { voltage: "230" }, ...overrides };
  const render = () => { hooks.cursor = 0; return nodes(SaveFinding({ ctx, built, hash: hashInputs(built.inputs) })); };
  const button = (name: string) => render().find(n => n.type === "button" && text(n) === name)!;
  const note = () => render().find(n => n.type === ActionBar)?.props.note;
  return { ctx, built, render, button, note, saveFinding, saveAction };
}

beforeEach(() => {
  vi.stubGlobal("React", React);
  hooks.slots = [];
  hooks.cursor = 0;
  form.review = { recommendation: "", safetyAction: "", actionTaken: "", verification: "", photoIds: [] };
});

describe("finding review and committed save", () => {
  it("offers optional scoped photo evidence for ordinary findings and action/verification fields", () => {
    const view = setup();
    const picker = view.render().find(n => n.type === PhotoPicker)!;
    expect(picker.props.scope).toEqual(view.ctx.scope);
    expect(picker.props.required).toBe(false);
    expect(view.render().filter(n => n.type === TextField).map(n => n.props.label)).toContain("Action taken (optional)");
    expect(view.render().filter(n => n.type === TextField).map(n => n.props.label)).toContain("Verification after action (optional)");
  });

  it("waits for committed storage and blocks duplicate presses", async () => {
    const view = setup();
    const pending = deferred<SaveResult>();
    view.saveFinding.mockReturnValue(pending.promise);
    const press = view.button("Save finding").props.onClick!;
    press();
    press();
    expect(view.saveFinding).toHaveBeenCalledTimes(1);
    expect(view.note()).toBe("Saving finding…");
    expect(view.button("Saving…").props.disabled).toBe(true);
    pending.resolve({ ok: true, persistent: true });
    await pending.promise;
    await Promise.resolve();
    expect(view.note()).toBe("Finding saved on this device.");
  });

  it("shows failed persistence and permits retry without a false saved message", async () => {
    const view = setup();
    view.saveFinding.mockResolvedValue({ ok: false, errors: ["Another tab changed this job."] });
    view.button("Save finding").props.onClick!();
    await Promise.resolve();
    expect(view.note()).not.toMatch(/saved on this device/i);
    expect(view.button("Save finding").props.disabled).toBe(false);
    expect(view.render().some(n => (n.props as { errors?: string[] }).errors?.includes("Another tab changed this job."))).toBe(true);
  });

  it("explicitly labels volatile storage and records actual actions separately from recommendations", async () => {
    const view = setup();
    form.review.actionTaken = "Replaced the approved capacitor.";
    form.review.verification = "Recheck: 230 V; started normally.";
    form.review.recommendation = "Schedule filter replacement.";
    view.saveFinding.mockResolvedValue({ ok: true, persistent: false });
    view.button("Save finding").props.onClick!();
    await Promise.resolve();
    expect(view.note()).toMatch(/session only/);
    expect(view.saveFinding).toHaveBeenCalledWith(expect.objectContaining({ actionTaken: form.review.actionTaken, verification: form.review.verification, recommendation: form.review.recommendation }));
  });

  it("keeps safety action and required-photo gates", () => {
    const view = setup({ severity: "safety", requiresPhotoForSafety: true });
    expect(view.button("Save finding").props.disabled).toBe(true);
    form.review.safetyAction = "Isolated affected equipment.";
    expect(view.button("Save finding").props.disabled).toBe(true);
    expect(view.render().find(n => n.type === PhotoPicker)?.props.required).toBe(true);
  });

  it("does not treat an action or verification edit as already saved", () => {
    const view = setup();
    view.ctx.saved = makeFinding({ ...view.built, scope: view.ctx.scope!, inputsHash: hashInputs(view.built.inputs) });
    expect(view.button("Saved").props.disabled).toBe(true);
    form.review.verification = "Not tested; follow-up required.";
    expect(view.button("Update finding").props.disabled).toBe(false);
  });
});
