import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import DuctTool from "./DuctTool";
import type { BuiltFinding } from "./SaveFinding";

const state = vi.hoisted(() => ({ built: null as BuiltFinding | null }));
vi.mock("./useFormState", () => ({ useFormState: () => [{ cfm: "1000.4", width: "12", height: "12", side: "supply", section: "trunk" }, vi.fn(), vi.fn()] }));
vi.mock("./SaveFinding", () => ({ default: ({ built }: { built: BuiltFinding | null }) => { state.built = built; return null; } }));

it("shows a decimal boundary value and saves the above-range result with raw velocity", () => {
  vi.stubGlobal("React", React);
  const html = renderToStaticMarkup(React.createElement(DuctTool, { ctx: { toolId: "duct", api: null, system: null, scope: null, saved: undefined } }));
  expect(html).toContain("1000.4");
  expect(html).toContain("compares the full-precision calculation");
  expect(state.built).toMatchObject({ severity: "concern", title: "Duct velocity above screening range" });
  expect(state.built?.readings.find(reading => reading.label === "Velocity")?.value).toBe(1000.4);
});
