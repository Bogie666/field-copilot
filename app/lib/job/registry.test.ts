import { describe, expect, it } from "vitest";
import { makeFinding as originalFinding } from "./fixtures";
import { TILES, TOOLS, tileById, tileStatus, tileStatusLabel } from "./registry";
import { createJob, type Job } from "./types";

const job = (): Job => createJob("x", "2026-10-03T22:00:00.000Z", { jobId: "j", systemId: "sys_1" });
const makeFinding = (overrides: Parameters<typeof originalFinding>[0] = {}) => originalFinding({ scope: { kind: "system", systemId: "sys_1", componentId: "sys_1:condenser" }, ...overrides });
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
    j.systems[0].components![0].equipment = { model: "X" };
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


describe("component completion", () => {
  it("never counts one component's shared electrical tool toward another", () => {
    const j = job();
    j.findings = [makeFinding()];
    expect(tileStatus(j, tileById("furnace")!, j.systems[0])).toBe("not-started");
  });
  it("shows stale evidence as needs review instead of completed and keeps safety prominent", () => {
    const j = job();
    j.findings = [makeFinding({ staleAt: j.updatedAt }), makeFinding({ key: "charge", toolId: "charge", severity: "ok" })];
    expect(tileStatus(j, condenser, j.systems[0])).toBe("needs-review");
    expect(tileStatusLabel("needs-review", condenser, j, j.systems[0])).toBe("Needs review · 1 of 2 current");
    j.findings[0].severity = "safety";
    expect(tileStatus(j, condenser, j.systems[0])).toBe("safety");
    expect(tileStatusLabel("safety", condenser, j, j.systems[0])).toContain("Needs review");
  });
  it("keeps optional electrical safety and stale states visible on the furnace tile", () => {
    const j = job();
    const furnace = tileById("furnace")!;
    j.findings = [makeFinding({ scope: { kind: "system", systemId: "sys_1", componentId: "sys_1:furnace" }, staleAt: j.updatedAt })];
    expect(tileStatus(j, furnace, j.systems[0])).toBe("needs-review");
    j.findings[0].severity = "safety";
    expect(tileStatus(j, furnace, j.systems[0])).toBe("safety");
  });
});

it("reports the exact legacy component selected by the route", () => {
  const j = job();
  const first = { id: "legacy-first", kind: "legacy" as const, name: "First", equipment: {}, equipmentAge: "", notes: "" };
  const second = { ...first, id: "legacy-second", name: "Second" };
  j.systems[0].components!.push(first, second);
  j.findings = [makeFinding({ scope: { kind: "system", systemId: "sys_1", componentId: second.id }, severity: "safety", staleAt: j.updatedAt })];
  const tile = tileById("legacy")!;
  expect(tileStatus(j, tile, j.systems[0], first)).toBe("not-started");
  expect(tileStatus(j, tile, j.systems[0], second)).toBe("safety");
  expect(tileStatusLabel("safety", tile, j, j.systems[0], second)).toBe("1 preserved finding · Safety finding · Needs review");
});


it("shows progress for a current optional electrical finding on the indoor component", () => {
  const j = job();
  j.findings = [makeFinding({ scope: { kind: "system", systemId: "sys_1", componentId: "sys_1:furnace" } })];
  expect(tileStatus(j, tileById("furnace")!, j.systems[0])).toBe("in-progress");
});
