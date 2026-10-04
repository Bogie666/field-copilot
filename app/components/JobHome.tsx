"use client";

import Link from "next/link";
import { useState } from "react";
import { newId } from "../lib/job/types";
import { TILES, tileStatus, tileStatusLabel, type TileDef, type TileId, type TileStatus } from "../lib/job/registry";
import { AtticIcon, CondenserIcon, FurnaceIcon, HomeIcon, PlusIcon } from "./Icons";
import { useJob } from "./JobProvider";
import { ActionBar, Chip, ConfirmDialog, Crumbs, PageHead, TextField } from "./ui";

const GLYPH: Record<TileId, (props: { className?: string }) => React.ReactElement> = {
  condenser: (p) => <CondenserIcon {...p} />,
  furnace: (p) => <FurnaceIcon {...p} />,
  attic: (p) => <AtticIcon {...p} />,
  home: (p) => <HomeIcon {...p} />,
};

function chipFor(status: TileStatus) {
  if (status === "safety") return <Chip tone="safety">Safety</Chip>;
  if (status === "attention") return <Chip tone="concern">Attention</Chip>;
  if (status === "done") return <Chip tone="ok">Done</Chip>;
  if (status === "in-progress") return <Chip tone="accent">In progress</Chip>;
  return null;
}

export default function JobHome() {
  const { job, activeSystem, setActiveSystemId, dispatch } = useJob();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState("");
  if (!job || !activeSystem) return null;

  const findingCount = job.findings.length;
  const safetyCount = job.findings.filter((f) => f.severity === "safety").length;

  function addSystem() {
    if (!job) return;
    const id = newId("sys");
    dispatch({ type: "addSystem", id, name: `System ${job.systems.length + 1}` });
    setActiveSystemId(id);
  }

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { label: job.label || "Untitled job" }]} />
      <PageHead title="What are we working on?" lede={job.systems.length > 1 ? "Pick a system, then the part you are checking." : "Pick the part of the system you are checking."}>
        {editingLabel ? (
          <form
            className="form"
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: "setLabel", label });
              setEditingLabel(false);
            }}
          >
            <TextField label="Job label" value={label} onChange={setLabel} maxLength={80} hint="Stays on this device. Never sent to an AI provider." />
            <div className="btnRow">
              <button className="btn primary" type="submit">
                Save label
              </button>
              <button className="btn" type="button" onClick={() => setEditingLabel(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            className="btn ghost"
            type="button"
            style={{ justifySelf: "start", padding: 0, minHeight: 32 }}
            onClick={() => {
              setLabel(job.label);
              setEditingLabel(true);
            }}
          >
            {job.label ? `Job: ${job.label}. Edit label` : "Add a job label"}
          </button>
        )}
      </PageHead>

      <div className="systemBar" role="group" aria-label="System">
        {job.systems.map((s) => (
          <button key={s.id} className="segment" type="button" aria-pressed={s.id === activeSystem.id} onClick={() => setActiveSystemId(s.id)}>
            {s.name}
          </button>
        ))}
        <button className="segment add" type="button" onClick={addSystem} aria-label="Add a system">
          <PlusIcon style={{ width: 16, height: 16, verticalAlign: "-2px", marginRight: 4 }} />
          Add system
        </button>
      </div>

      <div className="tileGrid">
        {TILES.map((tile: TileDef) => {
          const status = tileStatus(job, tile, tile.scope === "home" ? null : activeSystem);
          const Glyph = GLYPH[tile.id];
          return (
            <Link key={tile.id} className={`tile ${tile.scope === "home" ? "" : ""}`} data-status={status} href={`/job/${job.id}/${tile.id}`} aria-label={`${tile.label}: ${tileStatusLabel(status, tile, job, activeSystem)}`}>
              <Glyph className="tileGlyph" />
              <span>
                <span className="tileTitle">{tile.label}</span>
                <span className="tileMeta" style={{ display: "block" }}>
                  {tile.description}
                </span>
                <span style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, flexWrap: "wrap" }}>
                  {chipFor(status)}
                  <span className="hint">{tileStatusLabel(status, tile, job, activeSystem)}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>

      <div className="btnRow noPrint" style={{ marginTop: 20 }}>
        <button
          className="btn"
          type="button"
          onClick={() => {
            setName(activeSystem.name);
            setRenaming(true);
          }}
        >
          Rename {activeSystem.name}
        </button>
        {job.systems.length > 1 && (
          <button className="btn danger" type="button" onClick={() => setRemoving(true)}>
            Remove {activeSystem.name}
          </button>
        )}
      </div>

      {renaming && (
        <div className="dialogScrim" role="presentation" onClick={() => setRenaming(false)}>
          <form
            className="dialog"
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              dispatch({ type: "renameSystem", systemId: activeSystem.id, name });
              setRenaming(false);
            }}
          >
            <h2>Rename system</h2>
            <TextField label="System name" value={name} onChange={setName} maxLength={40} hint="For example: Upstairs, Attic unit, Main floor." />
            <div className="btnRow">
              <button className="btn" type="button" onClick={() => setRenaming(false)}>
                Cancel
              </button>
              <button className="btn primary" type="submit" disabled={!name.trim()}>
                Save name
              </button>
            </div>
          </form>
        </div>
      )}
      {removing && (
        <ConfirmDialog
          title={`Remove ${activeSystem.name}?`}
          body={`Its findings, photos and notes will be deleted from this job. This cannot be undone.`}
          confirmLabel="Remove system"
          onConfirm={() => {
            const next = job.systems.find((s) => s.id !== activeSystem.id);
            dispatch({ type: "removeSystem", systemId: activeSystem.id });
            if (next) setActiveSystemId(next.id);
            setRemoving(false);
          }}
          onCancel={() => setRemoving(false)}
        />
      )}

      <ActionBar note={findingCount ? `${findingCount} saved ${findingCount === 1 ? "finding" : "findings"}${safetyCount ? `, ${safetyCount} safety` : ""}` : "Findings you save will collect here"}>
        <Link className="btn primary" href={`/job/${job.id}/summary`}>
          Summary and customer note
        </Link>
      </ActionBar>
    </main>
  );
}
