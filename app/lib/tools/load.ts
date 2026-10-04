import { calculateManualJEstimate, climateProfiles, validateManualJInput, type AirTightness, type ClimateProfileKey, type DuctLeakage, type DuctLocation, type ManualJInput, type ManualJResult, type Orientation, type Quality, type SunExposure, type WindowQuality } from "../manualJ";
import type { Reading } from "../job/types";
import { parseDecimal } from "./numbers";

export type LoadForm = {
  squareFeet: string;
  ceilingHeight: string;
  occupants: string;
  climateProfile: ClimateProfileKey;
  customCooling: string;
  customHeating: string;
  customGrains: string;
  indoorCooling: string;
  indoorHeating: string;
  appliances: string;
  insulation: Quality;
  tightness: AirTightness;
  windows: WindowQuality;
  sun: SunExposure;
  ductLocation: DuctLocation;
  ductLeakage: DuctLeakage;
  orientation: Orientation;
};

/** Home facts start blank. Setpoints and appliance gains start at common assumptions, shown as such in the UI. */
export const EMPTY_LOAD: LoadForm = {
  squareFeet: "",
  ceilingHeight: "",
  occupants: "",
  climateProfile: "dfw",
  customCooling: "",
  customHeating: "",
  customGrains: "",
  indoorCooling: "75",
  indoorHeating: "70",
  appliances: "1200",
  insulation: "average",
  tightness: "average",
  windows: "double",
  sun: "average",
  ductLocation: "attic",
  ductLeakage: "average",
  orientation: "mixed",
};

export type LoadAssessment = { errors: string[]; input: ManualJInput | null; result: ManualJResult | null };

const num = (text: string, label: string, opts: Parameters<typeof parseDecimal>[2], errors: string[], required: boolean): number => {
  const p = parseDecimal(text, label, opts);
  if (p.ok === false) errors.push(p.error);
  if (p.ok === "blank") {
    if (required) errors.push(`Enter ${label.toLowerCase()}.`);
    return Number.NaN;
  }
  return p.ok === true ? p.value : Number.NaN;
};

export function assessLoad(form: LoadForm): LoadAssessment {
  const errors: string[] = [];
  const custom = form.climateProfile === "custom";
  const squareFeet = num(form.squareFeet, "Conditioned area", { positive: true, max: 20000 }, errors, true);
  const ceilingHeight = num(form.ceilingHeight, "Ceiling height", { positive: true, max: 30 }, errors, true);
  const occupants = num(form.occupants, "Occupants", { min: 0, max: 50 }, errors, true);
  const indoorCooling = num(form.indoorCooling, "Indoor cooling setpoint", { min: 60, max: 90 }, errors, true);
  const indoorHeating = num(form.indoorHeating, "Indoor heating setpoint", { min: 50, max: 85 }, errors, true);
  const appliances = num(form.appliances, "Appliance gains", { min: 0, max: 20000 }, errors, true);
  const customCooling = custom ? num(form.customCooling, "Cooling design temperature", { min: 50, max: 130 }, errors, true) : 99;
  const customHeating = custom ? num(form.customHeating, "Heating design temperature", { min: -40, max: 60 }, errors, true) : 22;
  const customGrains = custom ? num(form.customGrains, "Moisture difference", { min: 0, max: 200 }, errors, true) : 55;
  if (errors.length) return { errors, input: null, result: null };
  const input: ManualJInput = {
    squareFeet, ceilingHeight, occupants, climateProfile: form.climateProfile,
    customCoolingDesignTemp: customCooling, customHeatingDesignTemp: customHeating, customGrainsDifference: customGrains,
    indoorCoolingTemp: indoorCooling, indoorHeatingTemp: indoorHeating,
    insulationQuality: form.insulation, airTightness: form.tightness, windowQuality: form.windows,
    sunExposure: form.sun, ductLocation: form.ductLocation, ductLeakage: form.ductLeakage, orientation: form.orientation, appliancesBtuh: appliances,
  };
  const libErrors = validateManualJInput(input);
  if (libErrors.length) return { errors: libErrors, input: null, result: null };
  try {
    return { errors: [], input, result: calculateManualJEstimate(input) };
  } catch (e) {
    return { errors: [e instanceof Error ? e.message : "The estimate could not be calculated."], input: null, result: null };
  }
}

const n = (v: number) => Math.round(v).toLocaleString("en-US");

export function loadDiagnosis(result: ManualJResult): string {
  const c = result.coolingTotalRange;
  const h = result.heatingRange;
  return `Load screening estimate for ${result.climate.label}: total cooling ${n(c.lowBtuh)} to ${n(c.highBtuh)} BTU/h, heating ${n(h.lowBtuh)} to ${n(h.highBtuh)} BTU/h. This is a screening range, not an ACCA Manual J calculation, and is not for final equipment selection.`;
}

export function loadReadings(input: ManualJInput, result: ManualJResult): Reading[] {
  return [
    { label: "Conditioned area", value: input.squareFeet, unit: "sq ft", source: "entered" },
    { label: "Ceiling height", value: input.ceilingHeight, unit: "ft", source: "entered" },
    { label: "Occupants", value: input.occupants, unit: "", source: "entered" },
    { label: "Total cooling range", value: `${n(result.coolingTotalRange.lowBtuh)} to ${n(result.coolingTotalRange.highBtuh)}`, unit: "BTU/h", source: "computed" },
    { label: "Heating range", value: `${n(result.heatingRange.lowBtuh)} to ${n(result.heatingRange.highBtuh)}`, unit: "BTU/h", source: "computed" },
  ];
}

export { climateProfiles };
