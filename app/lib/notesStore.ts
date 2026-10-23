export type PersonalNote = {
  id: string;
  title: string;
  body: string;
  inkPng: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  source: "typed" | "dictated";
};

export function hasPersonalNoteContent(note: PersonalNote | null): boolean {
  return !!note && !!(note.title.trim() || note.body.trim() || note.inkPng);
}

/** A failed final save must keep any nonempty note open so the user can retry. */
export function canLeavePersonalNote(note: PersonalNote | null, saveSucceeded: boolean): boolean {
  return !hasPersonalNoteContent(note) || saveSucceeded;
}

const DB_NAME = "field-copilot-notes";
const DB_VERSION = 2;
const STORE = "notes";
const MAX_TEXT = 20_000;
const MAX_INK = 5_000_000;

function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("The note could not be read."));
  });
}

function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("The note could not be saved."));
    tx.onabort = () => reject(tx.error ?? new Error("The note save was interrupted."));
  });
}

export function validatePersonalNote(note: PersonalNote): string[] {
  const errors: string[] = [];
  if (!note.id || typeof note.id !== "string") errors.push("Note needs an id.");
  if (typeof note.title !== "string" || note.title.length > 200) errors.push("Title is too long.");
  if (typeof note.body !== "string" || note.body.length > MAX_TEXT) errors.push("Note is too long.");
  if (typeof note.inkPng !== "string" || note.inkPng.length > MAX_INK || (note.inkPng && !note.inkPng.startsWith("data:image/png;base64,"))) errors.push("Drawing is invalid or too large.");
  if (typeof note.pinned !== "boolean") errors.push("Pinned state is invalid.");
  if (!Number.isFinite(Date.parse(note.createdAt)) || !Number.isFinite(Date.parse(note.updatedAt))) errors.push("Note date is invalid.");
  if (note.source !== "typed" && note.source !== "dictated") errors.push("Note source is invalid.");
  return errors;
}

export class PersonalNotesStore {
  private opening: Promise<IDBDatabase> | null = null;
  constructor(private readonly factory: IDBFactory = indexedDB) {}

  private db(): Promise<IDBDatabase> {
    if (!this.opening) this.opening = new Promise((resolve, reject) => {
      const open = this.factory.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const db = open.result;
        const notes = db.objectStoreNames.contains(STORE) ? open.transaction!.objectStore(STORE) : db.createObjectStore(STORE, { keyPath: "id" });
        if (!notes.indexNames.contains("updatedAt")) notes.createIndex("updatedAt", "updatedAt");
        if (!notes.indexNames.contains("pinned")) notes.createIndex("pinned", "pinned");
      };
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => { db.close(); this.opening = null; };
        resolve(db);
      };
      open.onerror = () => reject(open.error ?? new Error("Personal notes storage could not open."));
      open.onblocked = () => reject(new Error("Close other Field Copilot tabs so personal notes storage can be upgraded."));
    });
    this.opening.catch(() => { this.opening = null; });
    return this.opening;
  }

  async list(): Promise<PersonalNote[]> {
    const db = await this.db();
    const notes = await result<PersonalNote[]>(db.transaction(STORE).objectStore(STORE).getAll());
    return notes.filter(note => validatePersonalNote(note).length === 0).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async get(id: string): Promise<PersonalNote | null> {
    const db = await this.db();
    const note = await result<PersonalNote | undefined>(db.transaction(STORE).objectStore(STORE).get(id));
    return note && validatePersonalNote(note).length === 0 ? note : null;
  }

  async put(note: PersonalNote): Promise<void> {
    const errors = validatePersonalNote(note);
    if (errors.length) throw new Error(errors.join(" "));
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    const saved = complete(tx);
    tx.objectStore(STORE).put(note);
    await saved;
  }

  async delete(id: string): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(STORE, "readwrite");
    const saved = complete(tx);
    tx.objectStore(STORE).delete(id);
    await saved;
  }
}

let browserStore: PersonalNotesStore | null = null;
export function getPersonalNotesStore(): PersonalNotesStore {
  return browserStore ??= new PersonalNotesStore();
}

export function newNote(id: string, now = new Date().toISOString()): PersonalNote {
  return { id, title: "", body: "", inkPng: "", pinned: false, createdAt: now, updatedAt: now, source: "typed" };
}
