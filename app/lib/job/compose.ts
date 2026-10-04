import { EXPLANATION_URGENCIES, MAX_EXPLANATION_FIELD_CHARS, validateExplanationInput, type ExplanationInput } from "../fieldAi";
import type { Finding, Reading } from "./types";

export type Urgency = (typeof EXPLANATION_URGENCIES)[number];

export type ComposeOptions = {
  equipmentType?: string;
  /** Years, typed by the technician. Never decoded from a serial number. */
  equipmentAge?: number | null;
  /** Technician's choice. When omitted, the suggestion is used. */
  urgency?: Urgency;
};

export type ComposeResult = {
  /** Exactly the six fields the explain endpoint accepts, or null when it cannot be built. */
  input: ExplanationInput | null;
  /** Reasons the input could not be built. Empty when input is present. */
  issues: string[];
  suggestedUrgency: Urgency;
};

const ORDER: Record<Finding["severity"], number> = { safety: 0, concern: 1, ok: 2, info: 3 };

/** The customer-note validator rejects em dashes, so tech text is normalized before sending. */
export function normalizeDashes(text: string): string {
  return text.replace(/\s*—\s*/g, ", ").replace(/–/g, "-");
}

export function suggestUrgency(findings: Finding[]): Urgency {
  if (findings.some((f) => f.severity === "safety")) return "urgent safety concern";
  if (findings.some((f) => f.severity === "concern")) return "fix soon";
  return "not assessed";
}

function formatReading(r: Reading): string {
  return `${r.label}: ${r.value}${r.unit ? ` ${r.unit}` : ""}`;
}

/**
 * Pure and deterministic. Builds the six explain fields from selected findings.
 * It never invents a recommendation, never returns "routine" on its own, never truncates,
 * and never reads the job label or any customer-identifying field.
 */
export function composeExplanationInput(findings: Finding[], options: ComposeOptions = {}): ComposeResult {
  const suggestedUrgency = suggestUrgency(findings);
  const issues: string[] = [];
  if (findings.length === 0) return { input: null, issues: ["Select at least one finding."], suggestedUrgency };

  const sorted = [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.title.localeCompare(b.title));

  const diagnosis = sorted
    .map((f) => f.diagnosis.trim())
    .filter(Boolean)
    .join("\n");

  const readings = sorted
    .map((f) => {
      const lines = f.readings.map(formatReading);
      if (f.reference?.trim()) lines.push(`Reference: ${f.reference.trim()}`);
      return lines.length ? `${f.title}: ${lines.join("; ")}` : "";
    })
    .filter(Boolean)
    .join("\n");

  const recommendation = sorted
    .flatMap((f) => [f.safetyAction?.trim() ? `Safety action: ${f.safetyAction.trim()}` : "", f.recommendation?.trim() ?? ""])
    .filter(Boolean)
    .join("\n");

  const fields = {
    diagnosis: normalizeDashes(diagnosis),
    readings: normalizeDashes(readings),
    recommendation: normalizeDashes(recommendation),
    equipmentType: normalizeDashes((options.equipmentType ?? "").trim()),
  };

  (Object.keys(fields) as Array<keyof typeof fields>).forEach((key) => {
    if (fields[key].length > MAX_EXPLANATION_FIELD_CHARS) {
      issues.push(`The ${key} text is too long to send at once (${fields[key].length} of ${MAX_EXPLANATION_FIELD_CHARS} characters). Deselect some findings.`);
    }
  });
  if (!fields.diagnosis) issues.push("The selected findings have no documented diagnosis.");
  if (issues.length) return { input: null, issues, suggestedUrgency };

  const input = validateExplanationInput({
    ...fields,
    equipmentAge: options.equipmentAge ?? null,
    urgency: options.urgency ?? suggestedUrgency,
  });
  if (!input) return { input: null, issues: ["The details could not be validated. Check equipment age (0 to 100 years or blank)."], suggestedUrgency };
  return { input, issues: [], suggestedUrgency };
}
