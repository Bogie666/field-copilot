import { expect, it } from "vitest";
import { assessCharge, EMPTY_CHARGE, orificeTargetSuperheatF } from "./refrigerantCharge";
import { PT_DATA_APPROVED, PT_DATA_SOURCE } from "./ptData";
import { composeExplanationInput } from "../job/compose";
import { makeFinding } from "../job/fixtures";

it.each([[NaN, 95], [65, NaN], [Infinity, 95], [65, -Infinity]])("rejects nonfinite fixed-orifice formula input %s / %s", (wetBulb, dryBulb) => {
  expect(orificeTargetSuperheatF(wetBulb, dryBulb).ok).toBe(false);
});

it("preserves provisional charge classification and PT provenance in saved and AI fields", () => {
  const result = assessCharge({ ...EMPTY_CHARGE, refrigerant: "R-410A", device: "txv", suctionPsig: "118", suctionLineF: "55", liquidPsig: "418", liquidLineF: "110", targetSubcoolingF: "10", subcoolingTolF: "2" }).result!;
  expect(PT_DATA_APPROVED).toBe(false);
  expect(result.diagnosis).toMatch(/provisional/i);
  expect(result.reference).toContain(PT_DATA_SOURCE);
  expect(result.reference).toMatch(/not approved/i);
  const saved = JSON.parse(JSON.stringify(makeFinding({ ...result, toolId: "charge", key: "charge", title: "Charge" })));
  const input = composeExplanationInput([saved]).input!;
  expect(input.diagnosis).toMatch(/provisional/i);
  expect(input.readings).toContain(PT_DATA_SOURCE);
  expect(input.readings).toMatch(/not approved/i);
});
