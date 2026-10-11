import { describe, expect, it } from "vitest";
import { makeFinding } from "./fixtures";
import { jobReducer } from "./reducer";
import { tileById } from "./registry";
import { jobHref, resolveRouteScope } from "./routes";
import { componentForTile, createJob, equipmentForScope, normalizeJobExtensions, notesForScope, scopeForComponent, scopeKey, validateFinding, type FindingScope } from "./types";

const now = "2026-10-11T00:00:00.000Z";
const makeJob = () => createJob("Private address", now, { jobId: "j", systemId: "s" });
const scope = (kind: string, systemId = "s"): FindingScope => ({ kind: "system", systemId, componentId: `${systemId}:${kind}` });

describe("component identities", () => {
  it("saves separate equipment, findings, drafts and notes for indoor/outdoor/attic components", () => {
    let job = makeJob();
    for (const [kind, voltage] of [["condenser", "240"], ["furnace", "120"], ["attic", "24"]]) {
      job = jobReducer(job, { type: "setEquipment", systemId: "s", componentId: `s:${kind}`, equipment: { voltage, model: kind }, now });
      job = jobReducer(job, { type: "upsertFinding", finding: makeFinding({ scope: scope(kind), inputsHash: kind }), now });
      job = jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope: scope(kind), inputs: { measuredVoltage: voltage }, now });
      job = jobReducer(job, { type: "setSystemNotes", systemId: "s", componentId: `s:${kind}`, notes: kind, now });
    }
    expect(job.findings).toHaveLength(3);
    expect(job.drafts).toHaveLength(3);
    expect(equipmentForScope(job.systems[0], scope("condenser")).voltage).toBe("240");
    expect(equipmentForScope(job.systems[0], scope("furnace")).voltage).toBe("120");
    expect(notesForScope(job.systems[0], scope("attic"))).toBe("attic");
    job = jobReducer(job, { type: "setEquipment", systemId: "s", componentId: "s:furnace", equipment: { model: "Replacement" }, now });
    expect(job.findings.filter(f => f.staleAt).map(f => scopeKey(f.scope))).toEqual([scopeKey(scope("furnace"))]);
  });

  it("rejects cross-component photos and missing component identities", () => {
    const job = makeJob();
    job.photos = [{ id: "p", systemId: "s", componentId: "s:furnace", caption: "", mime: "image/jpeg", bytes: 1, createdAt: now }];
    expect(validateFinding(makeFinding({ scope: scope("condenser"), photoIds: ["p"] }), job).join(" ")).toMatch(/different scope/);
    expect(validateFinding(makeFinding({ scope: scope("furnace"), photoIds: ["p"] }), job)).toEqual([]);
    expect(validateFinding(makeFinding({ scope: scope("missing") }), job).join(" ")).toMatch(/component/);
    expect(jobReducer(job, { type: "setToolDraft", toolId: "electrical", scope: scope("missing"), inputs: {}, now })).toBe(job);
  });

  it("migrates legacy evidence without assigning it to the indoor or outdoor unit", () => {
    const job = makeJob();
    delete job.systems[0].components;
    job.systems[0].equipment = { model: "UNKNOWN-UNIT", voltage: "120" };
    job.systems[0].notes = "Original note";
    const oldScope: FindingScope = { kind: "system", systemId: "s" };
    job.findings = [makeFinding({ scope: oldScope, photoIds: ["p"] })];
    job.findingHistory = [makeFinding({ scope: oldScope })];
    job.drafts = [{ toolId: "electrical", scope: oldScope, slot: "form", inputs: { voltage: "117" }, updatedAt: now }];
    job.photos = [{ id: "p", systemId: "s", caption: "Original", mime: "image/jpeg", bytes: 3, createdAt: now }];
    const migrated = normalizeJobExtensions(job);
    expect(componentForTile(migrated.systems[0], "condenser")?.equipment).toEqual({});
    expect(componentForTile(migrated.systems[0], "furnace")?.equipment).toEqual({});
    const legacy = componentForTile(migrated.systems[0], "legacy")!;
    expect(legacy.equipment).toEqual(job.systems[0].equipment);
    expect(legacy.notes).toBe("Original note");
    expect(migrated.findings[0].scope).toEqual(scopeForComponent(migrated.systems[0], legacy));
    expect(migrated.findings[0].staleAt).toBeUndefined();
    expect(migrated.photos[0].componentId).toBe(legacy.id);
    expect(migrated.findingHistory?.[0].scope).toEqual(migrated.findings[0].scope);
    expect(migrated.drafts?.[0].scope).toEqual(migrated.findings[0].scope);
    expect(normalizeJobExtensions(migrated)).toEqual(migrated);
  });

  it("keeps accepted note originals and refuses to overwrite newer text", () => {
    let job = makeJob();
    job = jobReducer(job, { type: "setSystemNotes", systemId: "s", componentId: "s:furnace", notes: "Original", now });
    const stale = jobReducer(job, { type: "acceptTidiedNotes", scope: scope("furnace"), original: "Older", notes: "AI", acceptedAt: now, now });
    expect(stale).toBe(job);
    job = jobReducer(job, { type: "acceptTidiedNotes", scope: scope("furnace"), original: "Original", notes: "Reviewed", acceptedAt: now, now });
    expect(notesForScope(job.systems[0], scope("furnace"))).toBe("Reviewed");
    expect(job.notesTidyHistory?.[0]).toMatchObject({ original: "Original", accepted: "Reviewed", scope: scope("furnace") });
  });

  it("retains historical photo evidence until its system is explicitly deleted", () => {
    let job = makeJob();
    job = jobReducer(job, { type: "addSystem", id: "s2", name: "Second", now });
    job.photos = [{ id: "p", systemId: "s", componentId: "s:furnace", caption: "", mime: "image/jpeg", bytes: 1, createdAt: now }];
    job.findingHistory = [makeFinding({ scope: scope("furnace"), photoIds: ["p"] })];
    expect(jobReducer(job, { type: "removePhoto", photoId: "p", now })).toBe(job);
    const removed = jobReducer(job, { type: "removeSystem", systemId: "s", now });
    expect(removed.findingHistory).toEqual([]);
    expect(removed.photos).toEqual([]);
  });
});

describe("route identity", () => {
  it("round trips system/component identity without any in-memory selection", () => {
    let job = makeJob();
    job = jobReducer(job, { type: "addSystem", id: "second", name: "Second", now });
    const url = new URL(jobHref(job.id, "furnace", "electrical", scope("furnace", "second")), "https://example.com");
    const resolved = resolveRouteScope(job, tileById("furnace")!, url.searchParams.get("system"), url.searchParams.get("component"));
    expect(resolved).toMatchObject({ ok: true, system: { id: "second" }, component: { id: "second:furnace" }, scope: scope("furnace", "second") });
    expect(jobHref(job.id, "home", "load", { kind: "home" })).not.toContain("?");
  });
  it("never substitutes another system/component for missing, invalid, mismatched or deleted identity", () => {
    const job = makeJob();
    const tile = tileById("condenser")!;
    for (const [system, component] of [[null, null], ["deleted", "deleted:condenser"], ["s", "missing"], ["s", "s:furnace"], ["s", null]]) {
      expect(resolveRouteScope(job, tile, system, component).ok).toBe(false);
    }
  });
});

it("preserves conflicting unassigned and existing legacy findings or drafts in separate stable scopes", () => {
  const job = makeJob();
  job.findings = [makeFinding({ scope: { kind: "system", systemId: "s" } })];
  const migrated = normalizeJobExtensions(job);
  migrated.findings.push(makeFinding({ scope: { kind: "system", systemId: "s" }, title: "A different original" }));
  migrated.drafts = [
    { toolId: "electrical", scope: scope("legacy"), slot: "form", inputs: { voltage: "117" }, updatedAt: now },
    { toolId: "electrical", scope: { kind: "system", systemId: "s" }, slot: "form", inputs: { voltage: "238" }, updatedAt: now },
  ];
  const result = normalizeJobExtensions(migrated);
  expect(result.systems[0].components?.filter(c => c.kind === "legacy")).toHaveLength(2);
  expect(new Set(result.findings.map(f => scopeKey(f.scope))).size).toBe(2);
  expect(new Set(result.drafts?.map(d => scopeKey(d.scope))).size).toBe(2);
  expect(normalizeJobExtensions(result)).toEqual(result);
});

it("normalizes malformed component and note history extensions without hiding valid evidence", () => {
  const job = makeJob();
  job.notesTidyHistory = [null, {}, { scope: scope("furnace"), original: "Original", accepted: "Reviewed", acceptedAt: now }, { scope: scope("deleted"), original: "O", accepted: "A", acceptedAt: now }] as unknown as typeof job.notesTidyHistory;
  job.systems[0].components!.push(null as never, { id: "invalid", kind: "unknown" } as never);
  const normalized = normalizeJobExtensions(job);
  expect(normalized.systems[0].components).toHaveLength(3);
  expect(normalized.notesTidyHistory).toHaveLength(1);
  expect(normalized.notesTidyHistory?.[0].original).toBe("Original");
});


it("ignores unserializable optional drafts before building a legacy-collision identity", () => {
  const job = makeJob();
  job.findings = [makeFinding({ scope: { kind: "system", systemId: "s" } })];
  const migrated = normalizeJobExtensions(job);
  migrated.systems[0].equipment = { model: "CONFLICT" };
  migrated.systems[0].components!.find(c => c.kind === "legacy")!.equipment = { model: "ORIGINAL" };
  const circular: Record<string, unknown> = {}; circular.self = circular;
  migrated.drafts = [
    { toolId: "electrical", scope: { kind: "system", systemId: "s" }, slot: "form", inputs: { value: BigInt(1) }, updatedAt: now },
    { toolId: "electrical", scope: { kind: "system", systemId: "s" }, slot: "review", inputs: circular, updatedAt: now },
  ];
  expect(() => normalizeJobExtensions(migrated)).not.toThrow();
  const normalized = normalizeJobExtensions(migrated);
  expect(normalized.drafts).toEqual([]);
  expect(normalized.systems[0].components?.filter(c => c.kind === "legacy")).toHaveLength(2);
});


it("hashes only validated draft fields and discards unknown extension properties", () => {
  const job = makeJob();
  job.findings = [makeFinding({ scope: { kind: "system", systemId: "s" } })];
  const migrated = normalizeJobExtensions(job);
  migrated.systems[0].equipment = { model: "NEW" };
  migrated.systems[0].components!.find(c => c.kind === "legacy")!.equipment = { model: "OLD" };
  const circular: Record<string, unknown> = {}; circular.self = circular;
  migrated.drafts = [{ toolId: "electrical", scope: { kind: "system", systemId: "s", extra: circular }, slot: "form", inputs: { voltage: "117" }, updatedAt: now, extra: BigInt(1) }] as unknown as typeof migrated.drafts;
  const normalized = normalizeJobExtensions(migrated);
  expect(normalized.drafts).toHaveLength(1);
  expect(normalized.drafts?.[0].inputs).toEqual({ voltage: "117" });
  expect(normalized.drafts?.[0]).not.toHaveProperty("extra");
  expect(normalized.drafts?.[0].scope).not.toHaveProperty("extra");
  expect(normalizeJobExtensions(normalized)).toEqual(normalized);
});


it("normalizes invalid persisted age provenance on components and migrated legacy equipment", () => {
  const job = makeJob();
  job.systems[0].components![0] = { ...job.systems[0].components![0], equipmentAge: "10", equipmentAgeSource: "manufactured-date", equipmentAgeAsOf: {} } as never;
  job.systems[0].components![1] = { ...job.systems[0].components![1], equipmentAge: "9", equipmentAgeSource: {}, equipmentAgeAsOf: "not-a-date" } as never;
  job.systems[0].equipmentAge = "12";
  job.systems[0].equipmentAgeSource = {} as never;
  job.systems[0].equipmentAgeAsOf = {} as never;
  const normalized = normalizeJobExtensions(job);
  const [outdoor, indoor] = normalized.systems[0].components!;
  expect(outdoor.equipmentAgeSource).toBe("manufactured-date");
  expect(outdoor.equipmentAgeAsOf).toBeUndefined();
  expect(indoor.equipmentAgeSource).toBeUndefined();
  expect(indoor.equipmentAgeAsOf).toBeUndefined();
  const legacy = componentForTile(normalized.systems[0], "legacy")!;
  expect(legacy.equipmentAge).toBe("12");
  expect(legacy.equipmentAgeSource).toBeUndefined();
  expect(legacy.equipmentAgeAsOf).toBeUndefined();
  expect(normalized.systems[0].equipmentAgeSource).toBeUndefined();
  expect(normalized.systems[0].equipmentAgeAsOf).toBeUndefined();
});
