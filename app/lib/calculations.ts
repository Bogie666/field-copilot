export function roundTo(value: number, places = 1) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, places);
  return Math.round(value * factor) / factor;
}

export function roundDuctDiameter(cfm: number, velocityFpm: number) {
  if (cfm <= 0 || velocityFpm <= 0) return 0;
  const areaSqFt = cfm / velocityFpm;
  const diameterFt = Math.sqrt((4 * areaSqFt) / Math.PI);
  return roundTo(diameterFt * 12, 1);
}

export function rectangularDuctHeight(cfm: number, velocityFpm: number, widthInches: number) {
  if (cfm <= 0 || velocityFpm <= 0 || widthInches <= 0) return 0;
  const areaSqIn = (cfm / velocityFpm) * 144;
  return roundTo(areaSqIn / widthInches, 1);
}

export function velocityFromDuct(cfm: number, widthInches: number, heightInches: number) {
  if (cfm <= 0 || widthInches <= 0 || heightInches <= 0) return 0;
  const areaSqFt = (widthInches * heightInches) / 144;
  return roundTo(cfm / areaSqFt, 0);
}

export function equivalentRound(widthInches: number, heightInches: number) {
  if (widthInches <= 0 || heightInches <= 0) return 0;
  // ASHRAE/Huebscher approximate equivalent diameter for rectangular ducts.
  const a = widthInches;
  const b = heightInches;
  return roundTo(1.3 * Math.pow(a * b, 0.625) / Math.pow(a + b, 0.25), 1);
}

export function cfmFromVelocity(velocityFpm: number, widthInches: number, heightInches: number) {
  if (velocityFpm <= 0 || widthInches <= 0 || heightInches <= 0) return 0;
  return roundTo(velocityFpm * ((widthInches * heightInches) / 144), 0);
}

export function cfmFromRoundDuctVelocity(velocityFpm: number, diameterInches: number) {
  if (velocityFpm <= 0 || diameterInches <= 0) return 0;
  const areaSqFt = Math.PI * Math.pow(diameterInches / 24, 2);
  return roundTo(velocityFpm * areaSqFt, 0);
}

export function sensibleBtuh(cfm: number, deltaT: number) {
  return roundTo(1.08 * cfm * deltaT, 0);
}

export function totalBtuh(cfm: number, enthalpyDelta: number) {
  return roundTo(4.5 * cfm * enthalpyDelta, 0);
}

export function targetCfmFromTons(tons: number, cfmPerTon = 400) {
  if (tons <= 0 || cfmPerTon <= 0) return 0;
  return roundTo(tons * cfmPerTon, 0);
}

export function airflowStatus(cfmPerTon: number) {
  if (!Number.isFinite(cfmPerTon) || cfmPerTon <= 0) return "Enter tonnage and CFM.";
  if (cfmPerTon < 325) return "Low airflow range. Verify filter, blower speed, coil restriction, return sizing, and static pressure.";
  if (cfmPerTon > 475) return "High airflow range. Verify blower settings, duct noise, latent removal, and comfort complaints.";
  return "Typical cooling airflow range. Confirm against equipment data and job conditions.";
}
