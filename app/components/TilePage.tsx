"use client";

import { notFound, useParams } from "next/navigation";
import { scopeKey } from "../lib/job/types";
import { TOOLS, tileById, tileStatus, tileStatusLabel } from "../lib/job/registry";
import { useJob } from "./JobProvider";
import { Chip, Crumbs, ListLink, PageHead, SeverityChip } from "./ui";

export default function TilePage() {
  const { id, tile: tileId } = useParams<{ id: string; tile: string }>();
  const { job, activeSystem } = useJob();
  const tile = tileById(tileId);
  if (!tile) notFound();
  if (!job || !activeSystem) return null;
  const system = tile.scope === "home" ? null : activeSystem;
  const scope = tile.scope === "home" ? "home" : scopeKey({ kind: "system", systemId: activeSystem.id });
  const status = tileStatus(job, tile, system);
  const photoCount = job.photos.filter((p) => (tile.scope === "home" ? p.systemId === null : p.systemId === activeSystem.id)).length;

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: `/job/${id}`, label: job.label || "Job" }, { label: tile.label }]} />
      <PageHead title={tile.label} lede={tile.scope === "home" ? "Applies to the whole home." : `${activeSystem.name}. ${tileStatusLabel(status, tile, job, activeSystem)}.`} />
      <ul className="list">
        {tile.tools.map((toolId) => {
          const tool = TOOLS[toolId];
          const finding = tool.findingKey ? job.findings.find((f) => f.key === tool.findingKey && scopeKey(f.scope) === scope) : undefined;
          let right: React.ReactNode;
          let meta = tool.description;
          if (finding) {
            right = <SeverityChip severity={finding.severity} />;
            meta = finding.title;
          } else if (tool.kind === "equipment") {
            const count = Object.keys(activeSystem.equipment).length;
            if (count) right = <Chip tone="ok">{count} fields</Chip>;
          } else if (tool.kind === "media" && photoCount) {
            right = <Chip tone="accent">{photoCount}</Chip>;
          } else if (tool.kind === "notes" && (tile.scope === "home" ? job.homeNotes : activeSystem.notes).trim()) {
            right = <Chip tone="accent">Has notes</Chip>;
          }
          return <li key={toolId}><ListLink href={`/job/${id}/${tile.id}/${toolId}`} title={tool.label} meta={meta} right={right} severity={finding?.severity} /></li>;
        })}
      </ul>
    </main>
  );
}
