import type { Reading } from "../job/types";
import { fixed, fmt, numbersIn, parseDecimal, type ResultItem } from "./numbers";

export type StaticInput = {
  supply: string;
  returnStatic: string;
  rated: string;
  components: Array<{ label: string; value: string }>;
};

export const EMPTY_STATIC: StaticInput = { supply: "", returnStatic: "", rated: "", components: [] };
export const MAX_COMPONENTS = 4;
const MAX_PLAUSIBLE = 5;

export type StaticResult = {
  tesp: number;
  percentOfRated: number | null;
  items: ResultItem[];
  severity: "ok" | "concern" | "info";
  diagnosis: string;
  readings: Reading[];
  reference: string;
};

export type StaticAssessment = { errors: string[]; result: StaticResult | null };

/** Pulls the first number from a nameplate value such as "0.50 in. w.c.". */
export function staticFrom(nameplateValue: string | undefined): string {
  const n = numbersIn(nameplateValue ?? "")[0];
  return n === undefined ? "" : String(n);
}

export function assessStatic(input: StaticInput): StaticAssessment {
  const errors: string[] = [];
  const supply = parseDecimal(input.supply.replace(/^\s*-/, ""), "Supply static", { max: MAX_PLAUSIBLE });
  const ret = parseDecimal(input.returnStatic.replace(/^\s*-/, ""), "Return static", { max: MAX_PLAUSIBLE });
  const rated = parseDecimal(input.rated, "Rated external static", { positive: true, max: MAX_PLAUSIBLE });
  for (const parsed of [supply, ret, rated]) if (parsed.ok === false) errors.push(parsed.error);
  if (/^\s*-/.test(input.supply)) errors.push("Enter supply static as a positive number (the size of the reading).");
  if (/^\s*-/.test(input.returnStatic)) errors.push("Enter return static as a positive number (the size of the reading, not the minus sign).");
  if (supply.ok === "blank") errors.push("Enter the supply static reading.");
  if (ret.ok === "blank") errors.push("Enter the return static reading.");

  const components = input.components.map((c, i) => ({ label: c.label.trim() || `Component ${i + 1}`, parsed: parseDecimal(c.value, `${c.label.trim() || `Component ${i + 1}`} drop`, { min: 0, max: MAX_PLAUSIBLE }) }));
  for (const c of components) if (c.parsed.ok === false) errors.push(c.parsed.error);
  if (errors.length || supply.ok !== true || ret.ok !== true) return { errors, result: null };

  const tesp = supply.value + ret.value;
  const readings: Reading[] = [
    { label: "Supply static", value: supply.value, unit: "in. w.c.", source: "entered" },
    { label: "Return static", value: ret.value, unit: "in. w.c.", source: "entered" },
    { label: "Total external static", value: Number(tesp.toFixed(3)), unit: "in. w.c.", source: "computed" },
  ];
  for (const c of components) if (c.parsed.ok === true) readings.push({ label: `${c.label} drop`, value: c.parsed.value, unit: "in. w.c.", source: "entered" });

  const items: ResultItem[] = [];
  let percentOfRated: number | null = null;
  let severity: StaticResult["severity"] = "info";
  let reference = "";
  if (rated.ok === true) {
    percentOfRated = (tesp / rated.value) * 100;
    const above = tesp > rated.value;
    severity = above ? "concern" : "ok";
    reference = `rated external static ${fixed(rated.value, 2)} in. w.c.`;
    items.push({
      id: "tesp",
      label: "Total external static",
      line: `${fixed(tesp, 2)} in. w.c. total is ${fmt(percentOfRated, 0)} percent of the ${fixed(rated.value, 2)} in. w.c. rating, ${above ? "above" : "at or below"} the rating.`,
      tone: above ? "concern" : "ok",
    });
  } else {
    items.push({ id: "tesp", label: "Total external static", line: `${fixed(tesp, 2)} in. w.c. total. No rated value entered, so it is not compared.`, tone: "info" });
  }

  const compText = components.filter((c) => c.parsed.ok === true).map((c) => `${c.label} ${fixed((c.parsed as { value: number }).value, 2)}`);
  const diagnosis = `${items[0].line} Supply ${fixed(supply.value, 2)} plus return ${fixed(ret.value, 2)}.${compText.length ? ` Component drops recorded: ${compText.join(", ")} in. w.c.` : ""}`;
  return { errors: [], result: { tesp, percentOfRated, items, severity, diagnosis, readings, reference } };
}
