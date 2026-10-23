"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MicrophoneIcon } from "./Icons";
import { EmptyState, PageHead } from "./ui";
import { getPersonalNotesStore, type PersonalNote } from "../lib/notesStore";

function isToday(iso: string) { return new Date(iso).toDateString() === new Date().toDateString(); }
function stamp(iso: string) {
  const date = new Date(iso);
  return isToday(iso) ? date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export default function NotesList() {
  const [notes, setNotes] = useState<PersonalNote[] | null>(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { let live = true; getPersonalNotesStore().list().then(v => { if (live) setNotes(v); }, e => { if (live) { setError(e instanceof Error ? e.message : "Personal notes could not be opened."); setNotes([]); } }); return () => { live = false; }; }, []);
  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    return (notes ?? []).filter(note => !q || `${note.title}\n${note.body}`.toLocaleLowerCase().includes(q));
  }, [notes, search]);
  const groups = [
    { title: "Pinned", notes: filtered.filter(note => note.pinned) },
    { title: "Today", notes: filtered.filter(note => !note.pinned && isToday(note.updatedAt)) },
    { title: "Earlier", notes: filtered.filter(note => !note.pinned && !isToday(note.updatedAt)) },
  ];
  async function togglePin(note: PersonalNote) {
    const updated = { ...note, pinned: !note.pinned, updatedAt: new Date().toISOString() };
    try { await getPersonalNotesStore().put(updated); setNotes(current => current?.map(item => item.id === note.id ? updated : item).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) ?? current); }
    catch (e) { setError(e instanceof Error ? e.message : "The note could not be updated."); }
  }
  return <main className="page notesPage">
    <div className="notesHeader"><PageHead title="Notes" lede={`Yours — not tied to any job · ${notes?.length ?? 0} notes`} /><Link className="btn primary" href="/notes/new">+ New</Link></div>
    <label className="noteSearch"><span className="visuallyHidden">Search notes</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes" type="search" /></label>
    {error && <div className="callout" data-tone="warn" role="alert">{error}</div>}
    {notes === null ? <p className="hint" role="status">Opening personal notes…</p> : filtered.length === 0 ? <EmptyState title={search ? "No matching notes" : "No personal notes yet"} body={search ? "Try a different word." : "Create a text note, dictate a thought, or sketch over the page."} /> : groups.map(group => group.notes.length > 0 && <section className="noteGroup" key={group.title}>
      <h2 className="sectionLabel">{group.title}</h2>
      <ul className="noteList">{group.notes.map(note => <li className="noteRow" key={note.id}>
        <time dateTime={note.updatedAt}>{stamp(note.updatedAt)}</time>
        <Link href={`/notes/${encodeURIComponent(note.id)}`}><strong>{note.title || "Untitled note"}</strong><span>{note.body || (note.inkPng ? "Drawing" : "Empty note")}</span><small>{note.source === "dictated" ? "Dictated · " : ""}Saved on this device</small></Link>
        <button type="button" onClick={() => void togglePin(note)} aria-label={`${note.pinned ? "Unpin" : "Pin"} ${note.title || "note"}`}>{note.pinned ? "Unpin" : "Pin"}</button>
      </li>)}</ul>
    </section>)}
    <Link className="dictateFab" href="/notes/new?dictate=1" aria-label="Quick dictate a personal note"><MicrophoneIcon /></Link>
  </main>;
}
