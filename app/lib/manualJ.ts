export type ClimateProfileKey = "dfw" | "rockwall" | "tyler" | "custom";
export type Quality = "poor" | "average" | "good";
export type AirTightness = "leaky" | "average" | "tight";
export type WindowQuality = "single" | "double" | "lowE";
export type SunExposure = "shaded" | "average" | "high";
export type DuctLocation = "conditioned" | "garage" | "attic";
export type DuctLeakage = "low" | "average" | "high";
export type Orientation = "mixed" | "north" | "south" | "east" | "west";

export const climateProfiles: Record<ClimateProfileKey, {
  label: string;
  coolingDesignTempF: number;
  heatingDesignTempF: number;
  grainsDifference?: number;
}> = {
  dfw: { label: "Dallas / Fort Worth", coolingDesignTempF: 99, heatingDesignTempF: 22, grainsDifference: 55 },
  rockwall: { label: "Rockwall", coolingDesignTempF: 98, heatingDesignTempF: 22, grainsDifference: 55 },
  tyler: { label: "Tyler / East Texas", coolingDesignTempF: 96, heatingDesignTempF: 24, grainsDifference: 60 },
  custom: { label: "Custom", coolingDesignTempF: 99, heatingDesignTempF: 22, grainsDifference: 55 },
};

export const manualJClimateDependencyNotes = {
  manualJ: "A load calculation requires local design temperatures, usually 1% cooling and 99% heating design conditions, plus humidity assumptions for latent load.",
  targetSuperheat: "Target superheat uses outdoor dry bulb and indoor wet bulb. It requires current field weather and indoor readings, not climate normals.",
  psychrometrics: "Psychrometrics requires current local indoor and outdoor temperature, humidity, wet bulb, or pressure readings depending on the calculation.",
  airflow: "Airflow and CFM screening does not require local weather or climate data. It uses measured velocity, duct dimensions, operating mode, tonnage, delta-T, or enthalpy.",
  ductulator: "Duct area and velocity screening does not require weather or climate data. It uses airflow, velocity, duct dimensions, and system context.",
  refrigerantCharge: "Charging diagnostics use current outdoor temperature, indoor wet bulb and dry bulb, pressure, and line temperature readings.",
};

export type ManualJInput = {
  squareFeet: number;
  ceilingHeight: number;
  occupants: number;
  climateProfile: ClimateProfileKey;
  customCoolingDesignTemp?: number;
  customHeatingDesignTemp?: number;
  customGrainsDifference?: number;
  indoorCoolingTemp: number;
  indoorHeatingTemp: number;
  insulationQuality: Quality;
  airTightness: AirTightness;
  windowQuality: WindowQuality;
  sunExposure: SunExposure;
  ductLocation: DuctLocation;
  ductLeakage: DuctLeakage;
  orientation: Orientation;
  appliancesBtuh: number;
};

type LoadBreakdown = {
  envelopeBtuh: number;
  infiltrationBtuh: number;
  windowSolarBtuh: number;
  internalGainBtuh: number;
  ductLossBtuh: number;
  latentBtuh: number;
  sensibleBtuh: number;
  totalBtuh: number;
};

type EstimateRange = { lowBtuh: number; highBtuh: number };

export type ManualJResult = {
  climate: { label: string; coolingDesignTempF: number; heatingDesignTempF: number };
  volumeCubicFeet: number;
  estimatedWindowAreaSqFt: number;
  cooling: LoadBreakdown;
  heating: LoadBreakdown;
  coolingSensibleRange: EstimateRange;
  coolingTotalRange: EstimateRange;
  heatingRange: EstimateRange;
  assumptions: string[];
  caveats: string[];
};

const insulationUA: Record<Quality, number> = { poor: 0.42, average: 0.30, good: 0.20 };
const infiltrationACH: Record<AirTightness, number> = { leaky: 0.75, average: 0.45, tight: 0.25 };
const windowSolar: Record<WindowQuality, number> = { single: 95, double: 68, lowE: 42 };
const exposureFactor: Record<SunExposure, number> = { shaded: 0.75, average: 1, high: 1.25 };
const orientationFactor: Record<Orientation, number> = { north: 0.85, east: 0.95, mixed: 1, south: 1.05, west: 1.18 };
const ductLocationFactor: Record<DuctLocation, number> = { conditioned: 0.02, garage: 0.08, attic: 0.14 };
const ductLeakageFactor: Record<DuctLeakage, number> = { low: 0.02, average: 0.06, high: 0.12 };

function round(value: number, places = 0) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function assertFinite(name: string, value: number) {
  if (!Number.isFinite(value)) throw new RangeError(`${name} is required and must be a valid number.`);
}

export function validateManualJInput(input: ManualJInput): string[] {
  const errors: string[] = [];
  const positive: Array<[string, number]> = [
    ["Conditioned area", input.squareFeet], ["Ceiling height", input.ceilingHeight],
    ["Indoor cooling setpoint", input.indoorCoolingTemp], ["Indoor heating setpoint", input.indoorHeatingTemp],
  ];
  positive.forEach(([name, value]) => {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${name} must be greater than zero.`);
  });
  if (!Number.isFinite(input.occupants) || input.occupants < 0 || !Number.isInteger(input.occupants)) errors.push("Occupants must be a whole number of zero or more.");
  if (!Number.isFinite(input.appliancesBtuh) || input.appliancesBtuh < 0) errors.push("Appliance gain must be zero or more.");
  if (!climateProfiles[input.climateProfile]) errors.push("Choose a valid climate profile.");

  const profile = climateProfiles[input.climateProfile] || climateProfiles.dfw;
  const coolingDesign = input.climateProfile === "custom" ? input.customCoolingDesignTemp : profile.coolingDesignTempF;
  const heatingDesign = input.climateProfile === "custom" ? input.customHeatingDesignTemp : profile.heatingDesignTempF;
  if (!Number.isFinite(coolingDesign)) errors.push("Cooling design temperature is required.");
  if (!Number.isFinite(heatingDesign)) errors.push("Heating design temperature is required.");
  if (input.climateProfile === "custom" && (!Number.isFinite(input.customGrainsDifference) || Number(input.customGrainsDifference) < 0)) errors.push("Custom moisture difference must be zero or more grains per pound.");
  if (Number.isFinite(coolingDesign) && Number.isFinite(input.indoorCoolingTemp) && Number(coolingDesign) <= input.indoorCoolingTemp) errors.push("Cooling design temperature must be above the indoor cooling setpoint.");
  if (Number.isFinite(heatingDesign) && Number.isFinite(input.indoorHeatingTemp) && Number(heatingDesign) >= input.indoorHeatingTemp) errors.push("Heating design temperature must be below the indoor heating setpoint.");
  if (!(input.insulationQuality in insulationUA)) errors.push("Choose an insulation quality.");
  if (!(input.airTightness in infiltrationACH)) errors.push("Choose an air tightness.");
  if (!(input.windowQuality in windowSolar)) errors.push("Choose a window type.");
  if (!(input.sunExposure in exposureFactor)) errors.push("Choose a sun exposure.");
  if (!(input.orientation in orientationFactor)) errors.push("Choose an orientation.");
  if (!(input.ductLocation in ductLocationFactor)) errors.push("Choose a duct location.");
  if (!(input.ductLeakage in ductLeakageFactor)) errors.push("Choose a duct leakage level.");
  return errors;
}

function range(value: number): EstimateRange {
  return { lowBtuh: round(value * 0.85), highBtuh: round(value * 1.15) };
}

export function calculateManualJEstimate(input: ManualJInput): ManualJResult {
  const errors = validateManualJInput(input);
  if (errors.length) throw new RangeError(errors.join(" "));
  assertFinite("Conditioned area", input.squareFeet);
  const profile = climateProfiles[input.climateProfile];
  const coolingDesignTempF = input.climateProfile === "custom" ? input.customCoolingDesignTemp as number : profile.coolingDesignTempF;
  const heatingDesignTempF = input.climateProfile === "custom" ? input.customHeatingDesignTemp as number : profile.heatingDesignTempF;
  const coolingDelta = coolingDesignTempF - input.indoorCoolingTemp;
  const heatingDelta = input.indoorHeatingTemp - heatingDesignTempF;
  const volume = input.squareFeet * input.ceilingHeight;
  const estimatedWallRoofArea = input.squareFeet * 1.75;
  const estimatedWindowArea = input.squareFeet * 0.16;
  const ua = insulationUA[input.insulationQuality];
  const ach = infiltrationACH[input.airTightness];
  const infiltrationCfm = volume * ach / 60;
  const coolingEnvelope = estimatedWallRoofArea * ua * coolingDelta;
  const heatingEnvelope = estimatedWallRoofArea * ua * heatingDelta;
  const coolingInfiltration = 1.08 * infiltrationCfm * coolingDelta;
  const heatingInfiltration = 1.08 * infiltrationCfm * heatingDelta;
  const solar = estimatedWindowArea * windowSolar[input.windowQuality] * exposureFactor[input.sunExposure] * orientationFactor[input.orientation];
  const internal = input.occupants * 230 + input.appliancesBtuh;
  const grainsDifference = input.climateProfile === "custom" ? input.customGrainsDifference as number : (profile.grainsDifference || 55);
  const latent = input.occupants * 200 + grainsDifference * infiltrationCfm * 0.68;
  const ductFactor = ductLocationFactor[input.ductLocation] + ductLeakageFactor[input.ductLeakage];
  const coolingSensibleSubtotal = coolingEnvelope + coolingInfiltration + solar + internal;
  const coolingSubtotal = coolingSensibleSubtotal + latent;
  const heatingSubtotal = heatingEnvelope + heatingInfiltration;
  const coolingDuct = coolingSubtotal * ductFactor;
  const heatingDuct = heatingSubtotal * ductFactor;
  const coolingTotal = coolingSubtotal + coolingDuct;
  const coolingSensible = coolingSensibleSubtotal + coolingDuct * (coolingSensibleSubtotal / coolingSubtotal);
  const heatingTotal = heatingSubtotal + heatingDuct;

  return {
    climate: { label: profile.label, coolingDesignTempF, heatingDesignTempF },
    volumeCubicFeet: round(volume),
    estimatedWindowAreaSqFt: round(estimatedWindowArea),
    cooling: {
      envelopeBtuh: round(coolingEnvelope), infiltrationBtuh: round(coolingInfiltration),
      windowSolarBtuh: round(solar), internalGainBtuh: round(internal), ductLossBtuh: round(coolingDuct),
      latentBtuh: round(latent), sensibleBtuh: round(coolingSensible), totalBtuh: round(coolingTotal),
    },
    heating: {
      envelopeBtuh: round(heatingEnvelope), infiltrationBtuh: round(heatingInfiltration),
      windowSolarBtuh: 0, internalGainBtuh: 0, ductLossBtuh: round(heatingDuct), latentBtuh: 0,
      sensibleBtuh: round(heatingTotal), totalBtuh: round(heatingTotal),
    },
    coolingSensibleRange: range(coolingSensible),
    coolingTotalRange: range(coolingTotal),
    heatingRange: range(heatingTotal),
    assumptions: [
      "Approximate wall and roof area is 1.75 times floor area; window area is 16% of floor area.",
      `Envelope, infiltration, solar, internal, latent, and ${input.ductLocation} duct effects are screened from selected conditions.`,
      `Latent screening uses an indoor-to-outdoor moisture difference of ${grainsDifference} grains per pound.`,
      "Displayed ranges are plus or minus 15% to reflect limited field inputs, not measured uncertainty.",
    ],
    caveats: [
      "This is a load screening estimate. It is not an ACCA Manual J calculation or final equipment sizing.",
      "Do not select equipment from this result. Final design requires room-by-room envelope, window, infiltration, ventilation, and local design-condition data.",
    ],
  };
}

export function formatLoadScreeningSummary(input: ManualJInput, result: ManualJResult): string {
  const format = (value: number) => Math.round(value).toLocaleString("en-US");
  return [
    "LOAD SCREENING ESTIMATE",
    `Home: ${format(input.squareFeet)} sq ft, ${input.ceilingHeight} ft average ceiling, ${input.occupants} occupants`,
    `Climate: ${result.climate.label}, ${result.climate.coolingDesignTempF} F cooling / ${result.climate.heatingDesignTempF} F heating design`,
    `Estimated sensible cooling: ${format(result.coolingSensibleRange.lowBtuh)} to ${format(result.coolingSensibleRange.highBtuh)} BTU/h`,
    `Estimated total cooling: ${format(result.coolingTotalRange.lowBtuh)} to ${format(result.coolingTotalRange.highBtuh)} BTU/h`,
    `Estimated heating: ${format(result.heatingRange.lowBtuh)} to ${format(result.heatingRange.highBtuh)} BTU/h`,
    "Scope: Screening only. Not ACCA Manual J or final equipment sizing. Do not select equipment from this result.",
  ].join("\n");
}
