import { beforeEach, describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { canLeavePersonalNote, newNote, PersonalNotesStore, validatePersonalNote } from "./notesStore";

describe("PersonalNotesStore", () => {
  let store: PersonalNotesStore;
  beforeEach(() => { store = new PersonalNotesStore(new IDBFactory()); });

  it("persists personal text and ink independently of jobs", async () => {
    const note = { ...newNote("note-1", "2026-10-23T10:00:00.000Z"), title: "Roof sketch", body: "Return with flashing.", inkPng: "data:image/png;base64,AA==" };
    await store.put(note);
    expect(await store.get(note.id)).toEqual(note);
    expect(await store.list()).toEqual([note]);
  });

  it("sorts newest first and deletes without affecting other notes", async () => {
    await store.put(newNote("old", "2026-10-22T10:00:00.000Z"));
    await store.put({ ...newNote("new", "2026-10-23T10:00:00.000Z"), pinned: true });
    expect((await store.list()).map(note => note.id)).toEqual(["new", "old"]);
    await store.delete("new");
    expect((await store.list()).map(note => note.id)).toEqual(["old"]);
  });

  it("rejects malformed or oversized private data", async () => {
    const invalid = { ...newNote("bad"), body: "x".repeat(20_001) };
    expect(validatePersonalNote(invalid)).toContain("Note is too long.");
    await expect(store.put(invalid)).rejects.toThrow("Note is too long");
  });

  it("keeps a nonempty note open after a failed final save", () => {
    const note = { ...newNote("unsaved"), body: "Do not lose this." };
    expect(canLeavePersonalNote(note, false)).toBe(false);
    expect(canLeavePersonalNote(note, true)).toBe(true);
    expect(canLeavePersonalNote(newNote("blank"), false)).toBe(true);
  });
});
