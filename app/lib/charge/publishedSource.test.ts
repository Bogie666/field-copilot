import { expect, it } from "vitest";
import { assessCharge, EMPTY_CHARGE } from "./refrigerantCharge";
import { composeExplanationInput } from "../job/compose";
import { makeFinding } from "../job/fixtures";

it("persists the selected published source and its data revision into AI provenance", () => {
  const result = assessCharge({ ...EMPTY_CHARGE, refrigerant: "R-454B", device: "txv", suctionPsig: "120", suctionLineF: "56", liquidPsig: "400", liquidLineF: "110" }).result!;
  expect(result.superheatF).toBe(10);
  expect(result.subcoolingF).toBeCloseTo(10.8, 10);
  expect(result.reference).toContain("Chemours");
  expect(result.reference).toContain("https://www.opteon.com/");
  expect(result.reference).toContain("2023-07");
  expect(result.reference).toMatch(/SHA-256: [a-f0-9]{64}/);
  expect(result.reference).toMatch(/not approved/i);
  expect(result.reference).not.toMatch(/CoolProp|Honeywell/);
  const saved = JSON.parse(JSON.stringify(makeFinding({ ...result, toolId: "charge", key: "charge", title: "Charge" })));
  expect(composeExplanationInput([saved]).input!.readings).toContain(result.reference);
});
