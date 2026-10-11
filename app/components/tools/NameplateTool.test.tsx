import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { JobApi } from "../JobProvider";
import { createJob, scopeForComponent } from "../../lib/job/types";
import NameplateTool from "./NameplateTool";
import type { ToolContext } from "./context";

const host = vi.hoisted(() => ({ slots: [] as unknown[], index: 0 }));
vi.mock("react", async original => ({
  ...await original<typeof import("react")>(),
  useCallback: (fn: unknown) => fn,
  useEffect: () => undefined,
  useRef: (initial: unknown) => {
    const index = host.index++;
    return host.slots[index] ??= { current: initial };
  },
  useState: (initial: unknown) => {
    const index = host.index++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    return [host.slots[index], (value: unknown) => { host.slots[index] = typeof value === "function" ? (value as (previous: unknown) => unknown)(host.slots[index]) : value; }];
  },
}));

// Exercise real form callbacks without adding a DOM test dependency.
type Node = { props?: Record<string, unknown> };
function find(node: unknown, predicate: (props: Record<string, unknown>) => boolean): Record<string, unknown> {
  if (Array.isArray(node)) {
    for (const item of node) { const found = find(item, predicate); if (Object.keys(found).length) return found; }
  } else if (node && typeof node === "object") {
    const props = (node as Node).props;
    if (props && predicate(props)) return props;
    if (props?.children) return find(props.children, predicate);
  }
  return {};
}
const makeContext = () => {
  const job = createJob("Local", "2026-10-11T00:00:00Z", { jobId: "j", systemId: "s" });
  job.systems[0].equipment = { model: "Wrong legacy plate" };
  const component = job.systems[0].components![1];
  component.equipment = { model: "INDOOR", equipmentType: "Custom legacy type" };
  const saveAction = vi.fn().mockResolvedValue({ ok: true, persistent: true });
  const api = { job, dispatch: vi.fn(), saveAction } as unknown as JobApi;
  return { ctx: { toolId: "nameplate", api, system: job.systems[0], component, scope: scopeForComponent(job.systems[0], component), saved: undefined } as ToolContext, saveAction };
};
const render = (ctx: ToolContext) => { host.index = 0; return NameplateTool({ ctx }); };
const field = (tree: unknown, label: string) => find(tree, props => props.label === label);
const button = (tree: unknown, label: string) => find(tree, props => props.children === label && props.type === "button");
const change = (props: Record<string, unknown>, value: string) => (props.onChange as (value: string) => void)(value);
const click = (props: Record<string, unknown>) => (props.onClick as () => unknown)();

beforeEach(() => { host.slots = []; host.index = 0; vi.stubGlobal("React", React); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T12:00:00Z")); });

describe("component nameplate review", () => {
  it("uses the component plate and preserves an existing custom equipment type as a selectable option", () => {
    const { ctx } = makeContext();
    const tree = render(ctx);
    expect(field(tree, "Model").value).toBe("INDOOR");
    const type = field(tree, "Equipment type");
    expect(type.value).toBe("Custom legacy type");
    expect(type.options).toContainEqual({ value: "Custom legacy type", label: "Existing value: Custom legacy type" });
    expect(type.options).toContainEqual({ value: "Heat pump", label: "Heat pump" });
  });

  it("fills age from a printed date, labels its precision, and preserves manual overrides", () => {
    const { ctx } = makeContext();
    let tree = render(ctx);
    change(field(tree, "Manufactured date (only if printed)"), "2016-10");
    tree = render(ctx);
    expect(field(tree, "Equipment age (years, optional)").value).toBe("10");
    expect(field(tree, "Equipment age (years, optional)").hint).toMatch(/About 10 years.*month and year/);
    change(field(tree, "Equipment age (years, optional)"), "8");
    tree = render(ctx);
    change(field(tree, "Manufactured date (only if printed)"), "2010-01-02");
    tree = render(ctx);
    expect(field(tree, "Equipment age (years, optional)").value).toBe("8");
    expect(field(tree, "Equipment age (years, optional)").hint).toMatch(/Manual override kept/);
    click(button(tree, "Use age from manufacture date"));
    tree = render(ctx);
    expect(field(tree, "Equipment age (years, optional)").value).toBe("16");
    change(field(tree, "Manufactured date (only if printed)"), "2099-01");
    tree = render(ctx);
    expect(field(tree, "Equipment age (years, optional)").value).toBe("");
    expect(field(tree, "Equipment age (years, optional)").hint).toMatch(/could not be calculated/);
  });

  it("populates age after paste parsing and saves equipment plus age as one component-scoped commit", async () => {
    const { ctx, saveAction } = makeContext();
    let tree = render(ctx);
    change(field(tree, "Text from the plate"), "MANUFACTURED: 2016-03");
    tree = render(ctx); click(button(tree, "Fill blank fields"));
    tree = render(ctx);
    expect(field(tree, "Equipment age (years, optional)").value).toBe("10");
    let release!: (value: unknown) => void;
    saveAction.mockReturnValueOnce(new Promise(resolve => { release = resolve; }));
    click(button(tree, "Save equipment"));
    tree = render(ctx);
    expect(button(tree, "Saving…").disabled).toBe(true);
    expect(saveAction).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "setEquipment", systemId: "s", componentId: "s:furnace", age: "10", ageSource: "manufactured-date", equipment: expect.objectContaining({ manufacturedDate: "2016-03" }) }));
    release({ ok: true, persistent: false });
    await Promise.resolve(); await Promise.resolve();
    tree = render(ctx);
    expect(find(tree, props => typeof props.note === "string" && props.note.includes("Saved for this session only")).note).toMatch(/session only/);
  });

  it("never displays saved on a rejected commit and permits retry", async () => {
    const { ctx, saveAction } = makeContext();
    saveAction.mockResolvedValueOnce({ ok: false, errors: ["Storage is full"] });
    click(button(render(ctx), "Save equipment"));
    await Promise.resolve(); await Promise.resolve();
    const tree = render(ctx);
    expect(button(tree, "Save equipment").disabled).toBe(false);
    expect(button(tree, "Saved")).toEqual({});
    expect(find(tree, props => typeof props.note === "string" && props.note.includes("Not saved")).note).toContain("Storage is full");
  });
});


it("preserves a deliberately blank manual age across a fresh tool mount", () => {
  const { ctx } = makeContext();
  ctx.component!.equipment.manufacturedDate = "2016-01";
  ctx.component!.equipmentAge = "";
  ctx.component!.equipmentAgeSource = "manual";
  const tree = render(ctx);
  expect(field(tree, "Equipment age (years, optional)").value).toBe("");
  expect(field(tree, "Equipment age (years, optional)").hint).toMatch(/Manual override kept/);
  expect(button(tree, "Use age from manufacture date").type).toBe("button");
});


it("never borrows a legacy system age override for a different component", () => {
  const { ctx } = makeContext();
  ctx.system!.equipmentAgeSource = "manual";
  ctx.system!.equipmentAge = "22";
  ctx.component!.equipment.manufacturedDate = "2016-01";
  const tree = render(ctx);
  expect(field(tree, "Equipment age (years, optional)").value).toBe("10");
  expect(field(tree, "Equipment age (years, optional)").hint).toMatch(/manufacture month and year/);
});


it("clears a committed-save message as soon as the technician edits the plate again", async () => {
  const { ctx } = makeContext();
  click(button(render(ctx), "Save equipment"));
  await Promise.resolve(); await Promise.resolve();
  let tree = render(ctx);
  expect(find(tree, props => props.note === "Saved on this device").note).toBe("Saved on this device");
  change(field(tree, "Model"), "LATER-EDIT");
  tree = render(ctx);
  expect(find(tree, props => props.note === "Not saved yet").note).toBe("Not saved yet");
  expect(button(tree, "Save equipment").disabled).toBe(false);
});
