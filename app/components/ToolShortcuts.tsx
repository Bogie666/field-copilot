"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { DIRECTORY, TOOL_GROUPS, type DirectoryEntry } from "../lib/toolDirectory";
import { EMPTY_PREFS, getPrefs, mostUsed, recordToolUse, subscribePrefs, toggleFavorite } from "../lib/toolPrefs";
import { StarIcon } from "./Icons";
import { ListLink } from "./ui";

export function useToolPrefs() {
  return useSyncExternalStore(subscribePrefs, getPrefs, () => EMPTY_PREFS);
}

export function FavoriteButton({ id, title, className = "favButton" }: { id: string; title: string; className?: string }) {
  const { favorites } = useToolPrefs();
  const on = favorites.includes(id);
  return (
    <button type="button" className={className} aria-pressed={on} aria-label={on ? `Remove ${title} from favorites` : `Add ${title} to favorites`} title={on ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(id)}>
      <StarIcon filled={on} />
    </button>
  );
}

/** Counts an opened tool toward "Most used" on this device. */
export function RecordToolUse({ id }: { id: string }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !DIRECTORY.has(id)) return;
    done.current = true;
    recordToolUse(id);
  }, [id]);
  return null;
}

function Row({ entry }: { entry: DirectoryEntry }) {
  return (
    <li className="favRow">
      <ListLink href={entry.href} title={entry.title} meta={entry.meta} />
      <FavoriteButton id={entry.id} title={entry.title} />
    </li>
  );
}

function Section({ id, label, entries, hint }: { id: string; label: string; entries: DirectoryEntry[]; hint?: string }) {
  return (
    <section aria-labelledby={`tools-${id}`}>
      <h2 className="sectionLabel" id={`tools-${id}`}>{label}</h2>
      {hint && <p className="hint favHint">{hint}</p>}
      {entries.length > 0 && <ul className="list">{entries.map((entry) => <Row key={entry.id} entry={entry} />)}</ul>}
    </section>
  );
}

export default function ToolDirectory() {
  const prefs = useToolPrefs();
  const known = [...DIRECTORY.keys()];
  const favorites = prefs.favorites.map((id) => DIRECTORY.get(id)).filter((e): e is DirectoryEntry => !!e);
  const frequent = mostUsed(prefs, known).map((id) => DIRECTORY.get(id)!);
  return (
    <div className="toolGroups">
      <Section id="favorites" label="Favorites" entries={favorites} hint={favorites.length ? undefined : "Tap the star on any tool to pin it here."} />
      {frequent.length > 0 && <Section id="most-used" label="Most used" entries={frequent} />}
      {TOOL_GROUPS.map((group) => (
        <Section key={group.label} id={group.label.toLowerCase().replaceAll(" ", "-")} label={group.label} entries={group.entries} />
      ))}
    </div>
  );
}
