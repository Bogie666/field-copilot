import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import ChargeTool from "../../components/tools/ChargeTool";
import { makeFinding } from "../job/fixtures";
import { hashInputs } from "../job/types";
import type { ToolContext } from "../../components/tools/context";
import { EMPTY_CHARGE } from "./refrigerantCharge";

it("shows the selected actual source with technical approval still pending", () => {
  const html = renderToStaticMarkup(<ChargeTool ctx={{ toolId: "charge", api: null, scope: null, system: null, saved: makeFinding({ inputs: { ...EMPTY_CHARGE, refrigerant: "R-32" } }) }} />);
  expect(html).toContain("iGas USA");
  expect(html).toContain("https://www.igasusa.com/files/R32-PT-Chart.pdf");
  expect(html).toMatch(/technical approval pending/i);
  expect(html).not.toContain("not a manufacturer chart");
});


it("offers explicit update for a historical form-only hash without changing historical readings", () => {
  const form = { ...EMPTY_CHARGE, refrigerant: "R-410A", device: "txv", suctionPsig: "118.1", suctionLineF: "55", liquidPsig: "416.9", liquidLineF: "110" };
  const saved = makeFinding({ toolId: "charge", key: "charge", inputs: form, inputsHash: hashInputs(form), reference: "CoolProp 8.0.0", readings: [{ label: "Superheat", value: 15.2, unit: "F", source: "computed" }] });
  const before = JSON.stringify(saved);
  const ctx = { toolId: "charge", api: { job: null }, scope: saved.scope, system: null, saved } as unknown as ToolContext;
  const html = renderToStaticMarkup(<ChargeTool ctx={ctx} />);
  expect(html).toContain("Update finding");
  expect(html).not.toMatch(/disabled=""[^>]*>Saved/);
  expect(JSON.stringify(saved)).toBe(before);
});
