import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import InsulationTool from "./InsulationTool";
import type { BuiltFinding } from "./SaveFinding";
import type { InsulationInput } from "../../lib/insulation";
import { makeFinding } from "../../lib/job/fixtures";
import { validateFinding } from "../../lib/job/types";

const state = vi.hoisted(() => ({ form: {} as InsulationInput, built: null as BuiltFinding | null }));
vi.mock("./useFormState", () => ({ useFormState: () => [state.form, vi.fn(), vi.fn()] }));
vi.mock("./SaveFinding", () => ({ default: ({ built }: { built: BuiltFinding | null }) => { state.built = built; return null; } }));

beforeEach(() => {
  vi.stubGlobal("React", React);
  state.built = null;
  state.form = { material: "unknown", depths: ["NaN", "4", "", "-1", "61", "1e2", "Infinity"], zone: "", starting: "other", target: "", gaps: false, uneven: false, compressed: false, moisture: true, vermiculite: false, conditionsReviewed: false, airSealing: "unknown" };
});

it("keeps moisture hazard saveable while omitting invalid depths instead of fabricating zero", () => {
  renderToStaticMarkup(React.createElement(InsulationTool, { ctx: { toolId: "insulation", api: null, system: null, scope: null, saved: undefined } }));
  expect(state.built?.severity).toBe("safety");
  expect(state.built?.diagnosis).toMatch(/moisture/);
  expect(state.built?.readings).toEqual([{ label: "Depth 2", value: 4, unit: "in", source: "entered" }]);
  const finding = makeFinding({ ...state.built!, key: "insulation", toolId: "insulation", safetyAction: "Stopped work and advised professional assessment.", photoIds: ["photo_1"] });
  expect(validateFinding(finding)).toEqual([]);
});

it("omits an invalid climate zone from a safety hold while retaining an explicitly entered zero depth", () => {
  state.form.depths = ["NaN", "0"];
  state.form.zone = "NaN";
  renderToStaticMarkup(React.createElement(InsulationTool, { ctx: { toolId: "insulation", api: null, system: null, scope: null, saved: undefined } }));
  expect(state.built?.readings).toEqual([{ label: "Depth 2", value: 0, unit: "in", source: "entered" }]);
});
