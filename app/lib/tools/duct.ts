import { equivalentRound, roundDuctDiameter, roundTo, velocityFromDuct } from "../calculations";
import { ductVelocityGuidance, ductVelocityState, nearbyStandardSizes, type BandState, type DuctContext } from "../fieldScreening";
import type { Reading } from "../job/types";
import { fmt, parseDecimal } from "./numbers";

export type DuctInput = { side: DuctContext["side"]; section: DuctContext["section"]; cfm: string; width: string; height: string };
export const EMPTY_DUCT: DuctInput = { side: "supply", section: "trunk", cfm: "", width: "", height: "" };

export function targetVelocity(context: DuctContext): number {
  return context.side === "supply" ? (context.section === "trunk" ? 850 : 650) : context.section === "trunk" ? 650 : 550;
}

export type DuctResult = {
  velocity: number;
  areaSqFt: number;
  equivalentRoundIn: number;
  roundAtTargetIn: number;
  target: number;
  band: BandState;
  guidance: string;
  suggestions: { round: number[]; rectangular: string[] };
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type DuctAssessment = { errors: string[]; result: DuctResult | null };

export function assessDuct(input: DuctInput): DuctAssessment {
  const errors: string[] = [];
  const cfm = parseDecimal(input.cfm, "Airflow", { positive: true, max: 20000 });
  const width = parseDecimal(input.width, "Duct width", { positive: true, max: 200 });
  const height = parseDecimal(input.height, "Duct height", { positive: true, max: 200 });
  for (const [p, label] of [[cfm, "airflow"], [width, "duct width"], [height, "duct height"]] as const) {
    if (p.ok === false) errors.push(p.error);
    if (p.ok === "blank") errors.push(`Enter the ${label}.`);
  }
  if (errors.length || cfm.ok !== true || width.ok !== true || height.ok !== true) return { errors, result: null };
  const context = { side: input.side, section: input.section };
  const velocity = velocityFromDuct(cfm.value, width.value, height.value);
  const area = width.value * height.value;
  const target = targetVelocity(context);
  const band = ductVelocityState(context, velocity);
  const guidance = ductVelocityGuidance(context, velocity);
  const suggestions = nearbyStandardSizes((cfm.value / target) * 144);
  const severity = band === "within" ? "ok" : band === "none" ? "info" : "concern";
  return {
    errors: [],
    result: {
      velocity,
      areaSqFt: roundTo(area / 144, 2),
      equivalentRoundIn: equivalentRound(width.value, height.value),
      roundAtTargetIn: roundDuctDiameter(cfm.value, target),
      target,
      band,
      guidance,
      suggestions,
      severity,
      diagnosis: `${input.side} ${input.section}: ${fmt(cfm.value, 0)} CFM through ${fmt(width.value)} x ${fmt(height.value)} in gives ${fmt(velocity, 0)} FPM. ${guidance}`,
      readings: [
        { label: "Airflow", value: cfm.value, unit: "CFM", source: "entered" },
        { label: "Duct width", value: width.value, unit: "in", source: "entered" },
        { label: "Duct height", value: height.value, unit: "in", source: "entered" },
        { label: "Velocity", value: velocity, unit: "FPM", source: "computed" },
      ],
      reference: `Nominal area velocity screening for ${input.side} ${input.section}. Does not include friction rate, fittings or a Manual D design.`,
    },
  };
}
