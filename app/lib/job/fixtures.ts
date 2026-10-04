import type { Finding } from "./types";
import { hashInputs } from "./types";

export function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    key: "electrical",
    toolId: "electrical",
    scope: { kind: "system", systemId: "sys_1" },
    severity: "info",
    title: "Electrical readings",
    diagnosis: "Line voltage measured 238 V against 240 V nominal.",
    readings: [{ label: "Line voltage", value: 238, unit: "V", source: "entered" }],
    reference: "Nameplate nominal 240 V (from nameplate)",
    confirmedAt: "2026-10-03T22:00:00.000Z",
    inputsHash: hashInputs({ v: 238 }),
    ...overrides,
  };
}
