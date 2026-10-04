import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createJob } from "../../lib/job/types";
import type { JobApi } from "../JobProvider";
import type { ToolContext } from "./context";
import { useFormState } from "./useFormState";

function restored(drafts: unknown, savedInputs?: Record<string, unknown>) {
  const job = createJob("x", "2026-10-04T00:00:00.000Z", { systemId: "s" });
  job.drafts = drafts as typeof job.drafts;
  const ctx: ToolContext = { toolId: "furnace", api: { job } as JobApi, scope: { kind: "system", systemId: "s" }, system: job.systems[0], saved: undefined };
  let result: unknown;
  function Probe() {
    [result] = useFormState(ctx, { recommendation: "", safetyAction: "", photoIds: [] as string[] }, undefined, { slot: "review", savedInputs });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}
function restoredForm(empty: Record<string, unknown>, inputs: Record<string, unknown>, fromDraft: boolean) {
  const job = createJob("x", "2026-10-04T00:00:00.000Z", { systemId: "s" });
  const scope = { kind: "system" as const, systemId: "s" };
  if (fromDraft) job.drafts = [{ toolId: "airflow", scope, slot: "form", inputs, updatedAt: "2026-10-04T00:00:00.000Z" }];
  const ctx: ToolContext = { toolId: "airflow", api: { job } as JobApi, scope, system: job.systems[0], saved: undefined };
  let result: unknown;
  function Probe() {
    [result] = useFormState(ctx, empty, undefined, { savedInputs: fromDraft ? undefined : inputs });
    return null;
  }
  renderToStaticMarkup(createElement(Probe));
  return result;
}

describe.each([true, false])("measurement restoration (draft=%s)", (fromDraft) => {
  it.each([
    [{ readings: [""], afterReadings: [] }, { readings: ["1200", ""], afterReadings: [""] }],
    [{ depths: [""] }, { depths: ["4", ""] }],
    [{ components: [] }, { components: [{ label: "Filter", value: "0.12" }, { label: "", value: "" }] }],
  ])("preserves valid rows %j", (empty, inputs) => {
    expect(restoredForm(empty, inputs, fromDraft)).toEqual(inputs);
  });
  it.each([
    [{ readings: [""], afterReadings: [] }, { readings: ["1200", null], afterReadings: [{}] }],
    [{ depths: [""] }, { depths: [4, ""] }],
    [{ components: [] }, { components: [null] }],
    [{ components: [] }, { components: [{ label: "Filter", value: 0.12 }] }],
    [{ components: [] }, { components: [{ label: {}, value: "0.12" }] }],
    [{ components: [] }, { components: ["Filter"] }],
    [{ photoIds: [] }, { photoIds: ["p", ""] }],
  ])("rejects malformed array fields %j", (empty, inputs) => {
    expect(restoredForm(empty, inputs, fromDraft)).toEqual(empty);
  });
});

const draft = (inputs: unknown) => ({ toolId: "furnace", scope: { kind: "system", systemId: "s" }, slot: "review", inputs, updatedAt: "2026-10-04T00:00:00.000Z" });
describe("restored review draft guards", () => {
  it.each([{}, "bad", [null, { toolId: "furnace", slot: "review" }]])("ignores malformed draft containers %j", (drafts) => {
    expect(restored(drafts)).toEqual({ recommendation: "", safetyAction: "", photoIds: [] });
  });
  it("restores only fields matching the form shape, never malformed review text or IDs", () => {
    expect(restored([draft({ recommendation: {}, safetyAction: 42, photoIds: "p", extra: "bad" })])).toEqual({ recommendation: "", safetyAction: "", photoIds: [] });
    expect(restored([draft({ recommendation: "Valid", safetyAction: "Stopped", photoIds: ["p", null, {}] })])).toEqual({ recommendation: "Valid", safetyAction: "Stopped", photoIds: [] });
  });
  it.each([
    { updatedAt: "bad" },
    { scope: { kind: "system", systemId: "missing" } },
    { toolId: "not-a-tool" },
    { slot: "bad-slot" },
  ])("ignores malformed or mismatched draft metadata %j", (metadata) => {
    expect(restored([{ ...draft({ recommendation: "Must not restore", photoIds: ["p"] }), ...metadata }])).toEqual({ recommendation: "", safetyAction: "", photoIds: [] });
  });
  it("guards malformed saved inputs too", () => {
    expect(restored(undefined, { recommendation: {}, safetyAction: null, photoIds: 42 })).toEqual({ recommendation: "", safetyAction: "", photoIds: [] });
  });
});
