export const INSULATION_SOURCES = {
  checked: "2026-10-04",
  material: "https://basc.pnnl.gov/redcalc/tool/loose-fill-insulation",
  benchmark: "https://www.energystar.gov/saveathome/seal_insulate/identify-problems-you-want-fix/diy-checks-inspections/insulation-r-values",
  savings: "https://www.energystar.gov/saveathome/seal_insulate/methodology",
};
export const SAVINGS_CONTEXT = "Comfort and energy context: insulation resists heat flow; air sealing reduces drafts and leakage. EPA estimates an average 15% on heating and cooling costs (11% on total energy costs) for a modeled combined package of home air sealing plus insulation in attics, floors over crawl spaces, and accessible basement rim joists. These are national averages, not attic-only or personalized savings. No savings percentage is assigned to this assessment, including insulation-only work; actual results depend on the home, climate, installation and scope.";
const sourceContext = `Sources checked ${INSULATION_SOURCES.checked} (static review, not automatically updated): PNNL User Guide Table 1 (DOE Loose-Fill Insulations, May 1995), settled loose-fill fiberglass R2.2–2.7/in and cellulose R3.2–3.8/in depend on density and settled depth. Verify manufacturer coverage/label; these generic ranges do not override product specifications. Material: ${INSULATION_SOURCES.material}\nExisting wood-framed retrofit benchmark (2021 IECC basis): ${INSULATION_SOURCES.benchmark}\nEPA savings methodology: ${INSULATION_SOURCES.savings}`;
export type InsulationInput = {
  material: "fiberglass" | "cellulose" | "batts" | "unknown";
  depths: string[]; zone: string; starting: "uninsulated" | "3-4" | "other"; target: string;
  gaps: boolean; uneven: boolean; compressed: boolean; moisture: boolean; vermiculite: boolean;
  conditionsReviewed?: boolean;
  airSealing: "unknown" | "none" | "attic" | "whole-home";
};
// ENERGY STAR: existing wood-framed building retrofit, Add Insulation to Attic.
const atticAdditions: Record<string, [number, number]> = { "1": [30, 25], "2": [49, 38], "3": [49, 38], "4A": [60, 49], "4B": [60, 49], "4C": [60, 49], "5": [60, 49], "6": [60, 49], "7": [60, 49], "8": [60, 49] };
export function assessInsulation(input: InsulationInput) {
  const decimal = /^(?:\d+(?:\.\d+)?|\.\d+)$/;
  const errors: string[] = [];
  if (!["uninsulated", "3-4", "other"].includes(input.starting)) errors.push("Select a valid starting condition.");
  if (!["fiberglass", "cellulose", "batts", "unknown"].includes(input.material)) errors.push("Select a valid material.");
  if (!["unknown", "none", "attic", "whole-home"].includes(input.airSealing)) errors.push("Select a valid air sealing scope.");
  if (!input.depths.length) errors.push("At least one depth reading is required.");
  input.depths.forEach((value, i) => { if (!decimal.test(value.trim()) || Number(value) > 60) errors.push(`Depth ${i + 1} must be a decimal from 0 to 60 inches.`); });
  if (input.target.trim() && (!decimal.test(input.target.trim()) || Number(input.target) <= 0 || Number(input.target) > 100)) errors.push("Total screening target must be a decimal greater than 0 and at most R100.");
  if (!Object.hasOwn(atticAdditions, input.zone)) errors.push("Select a documented climate zone; zone 4 needs A, B, or C.");
  if (input.starting === "uninsulated" && input.depths.some((d) => Number(d) !== 0)) errors.push("Uninsulated requires every depth reading to be zero.");
  if (input.starting === "3-4" && input.depths.some((d) => Number(d) < 3 || Number(d) > 4)) errors.push("The 3–4 inch starting condition requires every reading from 3 to 4 inches.");
  if (input.moisture || input.vermiculite) return { errors, materialR: null, depthRange: null, status: "blocked", summary: `Safety hold: ${[input.moisture && "moisture", input.vermiculite && "suspected vermiculite (possible asbestos)"].filter(Boolean).join("; ")}. Do not disturb, sample, move, or cover the material. Consult a qualified professional first to assess the hazard and resolve it before any upgrade recommendation.\n${sourceContext}` };
  if (errors.length) return { errors, materialR: null, depthRange: null, status: "invalid", summary: "" };
  const depths = input.depths.map(Number);
  const depthRange: [number, number] = [Math.min(...depths), Math.max(...depths)];
  const rates = input.material === "fiberglass" ? [2.2, 2.7] : input.material === "cellulose" ? [3.2, 3.8] : null;
  const materialR: [number, number] | null = rates ? [Number((depthRange[0] * rates[0]).toFixed(1)), Number((depthRange[0] * rates[1]).toFixed(1))] : null;
  const conditions = [input.gaps && "gaps", (input.uneven || depthRange[0] !== depthRange[1]) && "uneven depth", input.compressed && "compression"].filter(Boolean);
  const status = !input.conditionsReviewed ? "inspection-needed" : !input.target.trim() ? "no-selected-target" : !materialR ? "unknown" : materialR[1] < Number(input.target) ? "below" : conditions.length ? "condition-review" : depthRange[0] * rates![0] >= Number(input.target) ? "adequate" : "uncertain";
  const recommendation = status === "inspection-needed" ? "Conditions not fully reviewed; complete a safe inspection before an upgrade decision." : status === "no-selected-target" ? "No total screening target selected; measurements and published retrofit guidance are informational, not an upgrade decision." : status === "adequate" ? "No insulation upgrade indicated by this screening; preserve the current installation." : status === "condition-review" ? `Condition review: ${conditions.join(", ")}. Thermal impact not quantified; inspect and correct installation issues rather than assuming more insulation is the answer.` : status === "below" ? "Measured material-only range is below the selected target. Consider professional evaluation of air sealing and insulation after safety and installation checks." : status === "uncertain" ? "The material range overlaps the target. Verify product density and label before deciding whether any upgrade is needed." : "Verify material or batt label before recommending an insulation upgrade.";
  const materialSummary = materialR ? `Approximate material-only R${materialR[0]}–R${materialR[1]} at minimum measured depth ${depthRange[0]} in (range ${depthRange.join("–")} in). Not whole-attic effective R.` : "No R-value claim: identify material or verify the batt manufacturer label and installation before comparing thermal performance.";
  const conditionSummary = conditions.length ? `Condition assessment: ${conditions.join(", ")}. Thermal impact not quantified; do not average away thin spots or gaps.` : input.conditionsReviewed ? "Condition assessment: no listed concerns observed." : "Conditions not fully reviewed; unchecked concerns are not confirmed absent.";
  const benchmark = input.starting === "other" ? "The ENERGY STAR Add Insulation to Attic table does not directly classify other existing depths; do not extrapolate its starting-condition bins." : `ENERGY STAR Add Insulation to Attic, zone ${input.zone}, ${input.starting === "uninsulated" ? "uninsulated" : "existing 3–4 inches"}: add R${atticAdditions[input.zone][input.starting === "uninsulated" ? 0 : 1]} (ADDITIONAL, not a final total). Existing wood-framed retrofit guidance, based on 2021 IECC Table R402.1.3; not a determination of local code compliance.`;
  return { errors, materialR, depthRange, status, summary: `What we found: ${input.material}; depths ${depths.join(", ")} in. Climate zone ${input.zone} (technician selected; verify for this home). ${depths.length === 1 ? "Single reading: limited sample; inspect additional locations safely." : "Sampled locations only; not full attic coverage."}\n${materialSummary}\n${conditionSummary}\n${input.target.trim() ? `Comparison: technician-selected total screening target R${Number(input.target)}; not local code or an approved company standard.` : "No total screening target selected."}\n${benchmark}\n${recommendation}\nAir sealing scope: ${input.airSealing} (technician reported; not a measured leakage result).\n${SAVINGS_CONTEXT}\n${sourceContext}` };
}
