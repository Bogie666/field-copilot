import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import AirflowTool from "./AirflowTool";
import type { BuiltFinding } from "./SaveFinding";
import { assessAirflow, EMPTY_AIRFLOW } from "../../lib/tools/airflow";
import { composeExplanationInput } from "../../lib/job/compose";
import { makeFinding } from "../../lib/job/fixtures";

const state = vi.hoisted(() => ({ built: null as BuiltFinding | null }));
vi.mock("./useFormState", () => ({ useFormState: (_ctx: unknown, empty: object) => [{ ...empty, method: "flow-hood", readings: ["600", "600"], tons: "3" }, vi.fn(), vi.fn()], nameplateNote: () => "" }));
vi.mock("./SaveFinding", () => ({ default: ({ built }: { built: BuiltFinding | null }) => { state.built = built; return null; } }));

it("declares repeated whole-system flow-hood readings in UI and saved/AI reference without summing outlets", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(AirflowTool, { ctx: { toolId: "airflow", api: null, system: null, scope: null, saved: undefined } }));
  expect(html).toMatch(/repeated whole-system/i);
  expect(html).toMatch(/not individual outlet/i);
  const result = assessAirflow({ ...EMPTY_AIRFLOW, method: "flow-hood", readings: ["600", "600"], tons: "3" }).result!;
  expect(result.cfm).toBe(600);
  expect(state.built?.reference).toMatch(/repeated whole-system/i);
  const input = composeExplanationInput([makeFinding({ ...state.built!, key: "airflow", toolId: "airflow" })]).input!;
  expect(input.readings).toMatch(/not individual outlet/i);
});
