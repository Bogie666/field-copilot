import { describe, expect, it } from "vitest";
import { isFieldCopilotAuthEnabled } from "./accessControl";

describe("field copilot access control", () => {
  it("keeps authentication enabled by default", () => {
    expect(isFieldCopilotAuthEnabled(undefined)).toBe(true);
    expect(isFieldCopilotAuthEnabled("")).toBe(true);
    expect(isFieldCopilotAuthEnabled("true")).toBe(true);
  });

  it("allows an explicit temporary public mode", () => {
    expect(isFieldCopilotAuthEnabled("false")).toBe(false);
    expect(isFieldCopilotAuthEnabled(" FALSE ")).toBe(false);
  });
});
