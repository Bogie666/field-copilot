import { describe, expect, it } from "vitest";
import { assessStatic, EMPTY_STATIC, staticFrom } from "./staticPressure";
import { nameplateNote } from "../../components/tools/useFormState";
import { composeExplanationInput } from "../job/compose";
import { makeFinding } from "../job/fixtures";
import { hashInputs, validateFinding, type Finding } from "../job/types";

const run = (over: Partial<typeof EMPTY_STATIC>) => assessStatic({ ...EMPTY_STATIC, ...over });

describe("assessStatic", () => {
  it("sums supply and return into total external static", () => {
    const r = run({ supply: "0.55", returnStatic: "0.37", rated: "0.5" }).result!;
    expect(r.tesp).toBeCloseTo(0.92, 5);
    expect(r.severity).toBe("concern");
    expect(r.percentOfRated).toBeCloseTo(184, 0);
    expect(r.reference).toContain("0.50");
  });

  it("treats a total equal to the rating as within", () => {
    expect(run({ supply: "0.3", returnStatic: "0.2", rated: "0.5" }).result!.severity).toBe("ok");
  });

  it("records without comparing when no rating is entered", () => {
    const r = run({ supply: "0.3", returnStatic: "0.2" }).result!;
    expect(r.severity).toBe("info");
    expect(r.items[0].tone).toBe("info");
  });

  it("requires both readings and rejects negatives and implausible values", () => {
    expect(run({ supply: "0.3" }).errors.join(" ")).toMatch(/return static/i);
    expect(run({ supply: "0.3", returnStatic: "-0.2" }).errors.join(" ")).toMatch(/positive/);
    expect(run({ supply: "9", returnStatic: "0.2" }).errors.join(" ")).toMatch(/at most/);
    expect(run({ supply: "x", returnStatic: "0.2" }).errors.join(" ")).toMatch(/plain number/);
  });

  it("records component drops and validates them", () => {
    const r = run({ supply: "0.3", returnStatic: "0.2", components: [{ label: "Filter", value: "0.15" }] }).result!;
    expect(r.readings.some((x) => x.label === "Filter drop")).toBe(true);
    expect(run({ supply: "0.3", returnStatic: "0.2", components: [{ label: "Coil", value: "abc" }] }).errors.length).toBe(1);
  });

  it("pulls the number from a nameplate value", () => {
    expect(staticFrom("0.50 in. w.c.")).toBe("0.5");
    expect(staticFrom(undefined)).toBe("");
  });

  it.each([".5", "0.5", ".50 in. w.c.", "0.50 IN WC", '.5" W.C.', ".5 in H2O", ".5 inches water column"])("keeps %s correct from the reviewed plate through a saved/composed finding", (plateValue) => {
    const equipment = { maxExternalStatic: plateValue };
    const suggestion = staticFrom(equipment.maxExternalStatic);
    const form = { ...EMPTY_STATIC, rated: suggestion, supply: ".3", returnStatic: ".3" };
    const assessment = assessStatic(form);
    expect(assessment.errors).toEqual([]);
    const result = assessment.result!;
    expect(form.rated).toBe("0.5");
    expect(result.tesp).toBeCloseTo(0.6, 10);
    expect(result.percentOfRated).toBe(120);
    expect(result.severity).toBe("concern");
    expect(result.items[0].tone).toBe("concern");
    expect(result.items[0].line).toBe("0.60 in. w.c. total is 120 percent of the 0.50 in. w.c. rating, above the rating.");

    const finding = makeFinding({
      key: "static", toolId: "static", title: "Static pressure above rated",
      severity: result.severity, diagnosis: result.diagnosis, readings: result.readings,
      reference: result.reference + nameplateNote([["rated external static", form.rated, suggestion]]),
      inputs: form, inputsHash: hashInputs(form),
    });
    expect(validateFinding(finding)).toEqual([]);
    const saved = JSON.parse(JSON.stringify(finding)) as Finding;
    expect(saved.reference).toBe("rated external static 0.50 in. w.c. Taken from the confirmed nameplate: rated external static.");
    expect(saved.inputs?.rated).toBe("0.5");
    expect(saved.readings.find((reading) => reading.label === "Total external static")?.value).toBe(0.6);
    const composed = composeExplanationInput([saved]);
    expect(composed.input?.diagnosis).toContain("120 percent of the 0.50 in. w.c. rating, above");
    expect(composed.input?.readings).toContain(saved.reference);
  });

  it.each(["-.5", "-0.5 in. w.c.", "-0 IN WC"])("does not turn negative rating %s into a positive reference", (value) => {
    const rated = staticFrom(value);
    expect(rated.startsWith("-")).toBe(true);
    const assessment = run({ supply: ".3", returnStatic: ".3", rated });
    expect(assessment.result).toBeNull();
    expect(assessment.errors.join(" ")).toMatch(/greater than zero/);
  });

  it.each([".5/.8", ".5-.8 in. w.c.", "0.5 0.8", "1e-1", "0.5.0", "max .5", ".5 kPa", ".5 in WC at 1200 CFM"])("does not seed an ambiguous static rating %s", (value) => {
    expect(staticFrom(value)).toBe("");
    const result = run({ supply: ".3", returnStatic: ".3", rated: staticFrom(value) }).result!;
    expect(result.severity).toBe("info");
    expect(result.percentOfRated).toBeNull();
    expect(result.reference).toBe("");
  });
});
