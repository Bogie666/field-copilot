import { expect, it } from "vitest";
import { assessFurnace, EMPTY_FURNACE, FURNACE_SAFETY_CONFIG } from "./furnaceCheck";
import { composeExplanationInput } from "../job/compose";
import { makeFinding } from "../job/fixtures";
import { assessStatic, EMPTY_STATIC } from "./staticPressure";
import { assessAirflow, EMPTY_AIRFLOW } from "./airflow";
import { assessElectrical, EMPTY_ELECTRICAL } from "./electrical";

const tiny = "0." + "0".repeat(320) + "1";
const nearOverflow = "0." + "0".repeat(307) + "1";
it.each([
  ["static rating", () => assessStatic({ ...EMPTY_STATIC, supply: "0.1", returnStatic: "0.2", rated: tiny })],
  ["compressor RLA", () => assessElectrical({ ...EMPTY_ELECTRICAL, rla: tiny, compressorAmps: "10" })],
  ["fan FLA", () => assessElectrical({ ...EMPTY_ELECTRICAL, fanFla: tiny, fanAmps: "1" })],
  ["capacitor rating", () => assessElectrical({ ...EMPTY_ELECTRICAL, capacitorRatedUf: tiny, capacitorMeasuredUf: "10", capacitorTolerancePct: "5" })],
  ["airflow tonnage", () => assessAirflow({ ...EMPTY_AIRFLOW, method: "estimated", readings: ["1200"], tons: tiny })],
  ["airflow percent change", () => assessAirflow({ ...EMPTY_AIRFLOW, method: "estimated", readings: [tiny], afterReadings: ["1200"], tons: "3" })],
  ["capacitor display percentage", () => assessElectrical({ ...EMPTY_ELECTRICAL, capacitorRatedUf: nearOverflow, capacitorMeasuredUf: "0.01", capacitorTolerancePct: "5" })],
] as const)("explicitly rejects nonfinite derived results from subnormal %s", (_label, run) => {
  const assessment = run();
  expect(assessment.result).toBeNull();
  expect(assessment.errors.join(" ")).toMatch(/nonfinite|non-finite/i);
});

it("classifies airflow using the raw ratio before display rounding", () => {
  const result = assessAirflow({ ...EMPTY_AIRFLOW, method: "estimated", readings: ["1049"], tons: "3" }).result!;
  expect(result.cfmPerTon).toBe(350);
  expect(result.band).toBe("below");
  expect(result.severity).toBe("concern");
  expect(result.statusText).toMatch(/below/i);
});

it("treats decimal static equality as inclusive without masking a real excess", () => {
  const equal = assessStatic({ ...EMPTY_STATIC, supply: "0.1", returnStatic: "0.2", rated: "0.3" }).result!;
  expect(equal.severity).toBe("ok");
  expect(equal.diagnosis).toMatch(/at or below/);
  expect(assessStatic({ ...EMPTY_STATIC, supply: "0.100001", returnStatic: "0.2", rated: "0.3" }).result!.severity).toBe("concern");
});

it("keeps unclassified CO separate from normal rise and preserves unknown measurement context in AI", () => {
  const result = assessFurnace({ ...EMPTY_FURNACE, returnF: "68", supplyF: "123", riseMinF: "35", riseMaxF: "65", coPpm: "250" }).result!;
  expect(FURNACE_SAFETY_CONFIG.coThresholdPpm).toBeNull();
  expect(result.items.find((i) => i.id === "rise")?.tone).toBe("ok");
  expect(result.severity).toBe("info");
  expect(result.safety).toBe(false);
  expect(result.diagnosis).toMatch(/CO.*not classified/i);
  expect(result.diagnosis).toContain(FURNACE_SAFETY_CONFIG.pendingCoNote);
  expect(result.reference).toMatch(/location.*unknown.*basis.*unknown/i);
  const saved = JSON.parse(JSON.stringify(makeFinding({ ...result, toolId: "furnace", key: "furnace", title: "Furnace check" })));
  const input = composeExplanationInput([saved]).input!;
  expect(input.diagnosis).toMatch(/not classified/i);
  expect(input.readings).toMatch(/location.*unknown.*basis.*unknown/i);
});
