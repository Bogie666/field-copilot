import { describe, expect, it } from "vitest";
import { assessFurnace, EMPTY_FURNACE, FURNACE_SAFETY_CONFIG, parseRiseRange, type FurnaceInput } from "./furnaceCheck";

const run = (over: Partial<FurnaceInput>, config = FURNACE_SAFETY_CONFIG) => assessFurnace({ ...EMPTY_FURNACE, ...over }, config);
const obs = (over: Partial<FurnaceInput["observations"]>) => ({ ...EMPTY_FURNACE.observations, ...over });

describe("assessFurnace", () => {
  it("computes temperature rise and compares it with the range, inclusive at both ends", () => {
    expect(run({ returnF: "68", supplyF: "123", riseMinF: "35", riseMaxF: "65" }).result!.items[0].tone).toBe("ok");
    expect(run({ returnF: "70", supplyF: "135", riseMinF: "35", riseMaxF: "65" }).result!.items[0].tone).toBe("ok");
    expect(run({ returnF: "70", supplyF: "105", riseMinF: "35", riseMaxF: "65" }).result!.items[0].tone).toBe("ok");
    const above = run({ returnF: "68", supplyF: "140", riseMinF: "35", riseMaxF: "65" }).result!;
    expect(above.items[0].line).toMatch(/above the 35 to 65 F range/);
    expect(above.severity).toBe("concern");
    expect(run({ returnF: "68", supplyF: "95", riseMinF: "35", riseMaxF: "65" }).result!.items[0].line).toMatch(/below/);
  });

  it("records rise without comparing when no range is entered", () => {
    const r = run({ returnF: "68", supplyF: "120" }).result!;
    expect(r.rise).toBe(52);
    expect(r.severity).toBe("info");
  });

  it("requires both temperatures and both range ends together", () => {
    expect(run({ returnF: "68" }).errors.join(" ")).toMatch(/both return and supply/);
    expect(run({ returnF: "68", supplyF: "120", riseMinF: "35" }).errors.join(" ")).toMatch(/both ends/);
    expect(run({ returnF: "68", supplyF: "120", riseMinF: "65", riseMaxF: "35" }).errors.join(" ")).toMatch(/must not exceed/);
  });

  it("requires something to assess", () => {
    expect(run({}).errors.join(" ")).toMatch(/Enter temperatures/);
  });

  it("any ticked observation makes the result a safety finding", () => {
    const r = run({ observations: obs({ crackedExchanger: true }) }).result!;
    expect(r.safety).toBe(true);
    expect(r.severity).toBe("safety");
    expect(r.safetyReasons).toEqual(["Cracked or perforated heat exchanger"]);
  });

  it("does not classify CO when no threshold is configured, and says so", () => {
    const r = run({ coPpm: "250" }).result!;
    expect(r.safety).toBe(false);
    expect(r.items.find((i) => i.id === "co")!.tone).toBe("info");
    expect(r.notes.join(" ")).toMatch(/No CO threshold is configured/);
  });

  it("classifies CO as safety at or above a configured threshold", () => {
    const config = { ...FURNACE_SAFETY_CONFIG, coThresholdPpm: 100 };
    expect(run({ coPpm: "100" }, config).result!.safety).toBe(true);
    expect(run({ coPpm: "99" }, config).result!.safety).toBe(false);
  });

  it("a safety observation outranks an in-range rise", () => {
    const r = run({ returnF: "68", supplyF: "123", riseMinF: "35", riseMaxF: "65", observations: obs({ rollout: true }) }).result!;
    expect(r.severity).toBe("safety");
  });
});

describe("parseRiseRange", () => {
  it("parses ranges from nameplate text", () => {
    expect(parseRiseRange("35-65 F")).toEqual([35, 65]);
    expect(parseRiseRange("65 to 35")).toEqual([35, 65]);
    expect(parseRiseRange("40")).toBeNull();
    expect(parseRiseRange(undefined)).toBeNull();
  });
});
