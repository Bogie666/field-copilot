import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDbJobStore } from "./indexedDbStore";
import { makeFinding } from "./fixtures";
import { MemoryJobStore, type JobStore } from "./store";
import { createJob } from "./types";

const makers: Array<[string, () => JobStore]> = [
  ["memory", () => new MemoryJobStore(true)],
  ["indexeddb", () => new IndexedDbJobStore(new IDBFactory())],
];

describe.each(makers)("%s job store", (_name, make) => {
  it("round-trips a job and lists newest first", async () => {
    const store = make();
    const older = createJob("older", "2026-10-01T00:00:00.000Z", { jobId: "a", systemId: "s" });
    const newer = createJob("newer", "2026-10-02T00:00:00.000Z", { jobId: "b", systemId: "s" });
    newer.findings.push(makeFinding({ scope: { kind: "system", systemId: "s" } }));
    await store.put(older);
    await store.put(newer);
    expect((await store.list()).map((j) => j.id)).toEqual(["b", "a"]);
    expect((await store.list())[0].findingCount).toBe(1);
    expect(await store.get("b")).toEqual(newer);
    expect(await store.get("missing")).toBeNull();
  });

  it("overwrites on put and removes on delete, including photos", async () => {
    const store = make();
    const job = createJob("x", "2026-10-01T00:00:00.000Z", { jobId: "a", systemId: "s" });
    job.photos.push({ id: "p1", systemId: "s", caption: "", mime: "image/jpeg", bytes: 3, createdAt: job.createdAt });
    await store.put(job);
    await store.putPhoto("p1", new Blob(["abc"], { type: "image/jpeg" }));
    expect(await store.getPhoto("p1")).not.toBeNull();
    await store.put({ ...job, label: "renamed" });
    expect((await store.get("a"))!.label).toBe("renamed");
    await store.delete("a");
    expect(await store.get("a")).toBeNull();
    expect(await store.getPhoto("p1")).toBeNull();
  });

  it("deletes a single photo", async () => {
    const store = make();
    await store.putPhoto("p1", new Blob(["abc"]));
    await store.deletePhoto("p1");
    expect(await store.getPhoto("p1")).toBeNull();
  });
});
