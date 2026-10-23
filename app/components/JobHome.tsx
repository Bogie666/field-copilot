"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { jobHref } from "../lib/job/routes";
import { componentForTile, componentsForSystem, newId, scopeForComponent } from "../lib/job/types";
import { TILES, tileStatus, tileStatusLabel, type TileDef } from "../lib/job/registry";
import { AtticIcon, CondenserIcon, FurnaceIcon, HomeIcon, PlusIcon } from "./Icons";
import { useJob } from "./JobProvider";
import { Callout, ConfirmDialog, Crumbs, EmptyState, PageHead, TextField } from "./ui";
import SaveIndicator from "./SaveIndicator";

const GLYPH: Record<string, (props: { className?: string }) => React.ReactElement> = {
  condenser: (p) => <CondenserIcon {...p} />,
  furnace: (p) => <FurnaceIcon {...p} />,
  attic: (p) => <AtticIcon {...p} />,
  home: (p) => <HomeIcon {...p} />,
};

export default function JobHome() {
  const { job, activeSystem: selectedSystem, setActiveSystemId, dispatch } = useJob();
  const params = useSearchParams();
  const router = useRouter();
  const requestedSystem = params.get("system");
  const activeSystem = requestedSystem ? job?.systems.find(s => s.id === requestedSystem) ?? null : selectedSystem;
  function selectSystem(id: string) {
    setActiveSystemId(id);
    if (job) router.push(jobHref(job.id, undefined, undefined, { kind: "system", systemId: id }));
  }
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState("");
  const [removing, setRemoving] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [label, setLabel] = useState("");
  if (!job) return null;
  if (!activeSystem) return <main className="page"><EmptyState title="Choose a system" body="The system in this link is no longer available. No other equipment has been selected automatically.">{job.systems.map(s => <button key={s.id} className="btn" type="button" onClick={() => selectSystem(s.id)}>{s.name}</button>)}</EmptyState></main>;

  const findingCount = job.findings.filter(f => !f.staleAt).length;
  const staleCount = job.findings.filter(f => f.staleAt).length;
  const legacyComponents = componentsForSystem(activeSystem).filter(c => c.kind === "legacy");
  const safetyCount = job.findings.filter((f) => f.severity === "safety").length;

  function addSystem() {
    if (!job) return;
    const id = newId("sys");
    dispatch({ type: "addSystem", id, name: `System ${job.systems.length + 1}` });
    selectSystem(id);
  }

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { label: job.label || "Untitled job" }]} />
      <PageHead title={job.label || "Untitled job"} lede={`${activeSystem.name} · ${job.systems.length > 1 ? "Choose a system and equipment" : "Choose equipment"}`}>
        <SaveIndicator />
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
          <button key={s.id} className="segment" type="button" aria-pressed={s.id === activeSystem.id} onClick={() => selectSystem(s.id)}>
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
          const component = componentForTile(activeSystem, tile.id);
          if (tile.scope !== "home" && !component) return <div key={tile.id} className="tile"><span>{tile.label}: component unavailable</span></div>;
          return (
            <Link key={tile.id} className={`tile ${tile.scope === "home" ? "" : ""}`} data-status={status} href={jobHref(job.id, tile.id, undefined, tile.scope === "home" ? { kind: "home" } : scopeForComponent(activeSystem, component!))} aria-label={`${tile.label}: ${tileStatusLabel(status, tile, job, activeSystem)}`}>
              <Glyph className="tileGlyph" />
              <span className="tileBody">
                <span className="tileTitle">{tile.label}</span>
                <span className="tileMeta">
                  {tile.description}
                </span>
              </span>
              <span className="tileStatus">{tileStatusLabel(status, tile, job, activeSystem)}</span>
            </Link>
          );
        })}
      </div>

      {legacyComponents.length > 0 && <Callout title="Unassigned legacy equipment and evidence">
        Earlier records have been preserved separately because their indoor/outdoor identity was not recorded.
        {legacyComponents.map(legacy => <p key={legacy.id}><Link className="btn" href={jobHref(job.id, "legacy", undefined, scopeForComponent(activeSystem, legacy))}>Review {legacy.name.toLowerCase()}</Link></p>)}
      </Callout>}
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
          body={`Its components, findings, previous confirmations, photos, notes and original-note history will be deleted from this job. This cannot be undone.`}
          confirmLabel="Remove system"
          onConfirm={() => {
            const next = job.systems.find((s) => s.id !== activeSystem.id);
            dispatch({ type: "removeSystem", systemId: activeSystem.id });
            if (next) selectSystem(next.id);
            setRemoving(false);
          }}
          onCancel={() => setRemoving(false)}
        />
      )}

      <div className="summaryLedger noPrint">
        <p>{findingCount || staleCount ? `${findingCount} current ${findingCount === 1 ? "finding" : "findings"}${staleCount ? ` · ${staleCount} need review` : ""}${safetyCount ? ` · ${safetyCount} safety` : ""}` : "Findings you save will collect here"}</p>
        <Link className="btn primary" href={`/job/${job.id}/summary`}>Summary &amp; customer note</Link>
      </div>
    </main>
  );
}
