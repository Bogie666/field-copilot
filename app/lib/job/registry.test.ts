import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { TILES, TOOLS, tileById, tileStatus, tileStatusLabel } from "./registry";
import { createJob, type Job } from "./types";

const job = (): Job => createJob("x", "2026-10-03T22:00:00.000Z", { jobId: "j", systemId: "sys_1" });
const condenser = tileById("condenser")!;
const home = tileById("home")!;

describe("registry", () => {
  it("only references tools that exist, and finding tools have finding keys", () => {
    for (const tile of TILES) {
      for (const tool of tile.tools) expect(TOOLS[tool]).toBeDefined();
      for (const key of tile.expected) {
        expect(Object.values(TOOLS).some((t) => t.findingKey === key)).toBe(true);
      }
    }
    for (const tool of Object.values(TOOLS)) {
      if (tool.kind === "finding") expect(tool.findingKey).toBeTruthy();
    }
  });
});

describe("tileStatus", () => {
  it("starts not-started", () => {
    const j = job();
    expect(tileStatus(j, condenser, j.systems[0])).toBe("not-started");
    expect(tileStatusLabel("not-started", condenser, j, j.systems[0])).toBe("Not started");
  });

  it("is in-progress with equipment or some findings", () => {
    const j = job();
    j.systems[0].equipment = { model: "X" };
    expect(tileStatus(j, condenser, j.systems[0])).toBe("in-progress");
    const k = job();
    k.findings.push(makeFinding());
    expect(tileStatus(k, condenser, k.systems[0])).toBe("in-progress");
    expect(tileStatusLabel("in-progress", condenser, k, k.systems[0])).toBe("1 of 2 saved");
  });

  it("is done when all expected findings are saved with no concerns", () => {
    const j = job();
    j.findings.push(makeFinding(), makeFinding({ key: "charge", toolId: "charge", severity: "ok" }));
    expect(tileStatus(j, condenser, j.systems[0])).toBe("done");
  });

  it("flags attention for a concern and safety for a safety finding", () => {
    const j = job();
    j.findings.push(makeFinding({ severity: "concern" }));
    expect(tileStatus(j, condenser, j.systems[0])).toBe("attention");
    j.findings.push(makeFinding({ key: "charge", toolId: "charge", severity: "safety", safetyAction: "Off." }));
    expect(tileStatus(j, condenser, j.systems[0])).toBe("safety");
  });

  it("scopes findings to the selected system and to home", () => {
    const j = job();
    j.systems.push({ id: "sys_2", name: "System 2", equipment: {}, equipmentAge: "", notes: "" });
    j.findings.push(makeFinding());
    expect(tileStatus(j, condenser, j.systems[1])).toBe("not-started");
    j.findings.push(makeFinding({ key: "load", toolId: "load", scope: { kind: "home" } }));
    expect(tileStatus(j, home, null)).toBe("done");
  });
});
