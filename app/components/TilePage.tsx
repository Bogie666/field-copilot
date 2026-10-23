"use client";

import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { notesForScope, photoMatchesScope, scopeKey } from "../lib/job/types";
import { TOOLS, tileById, tileStatus, tileStatusLabel } from "../lib/job/registry";
import { jobHref, resolveRouteScope } from "../lib/job/routes";
import { useJob } from "./JobProvider";
import { Callout, Chip, Crumbs, EmptyState, ListLink, PageHead, SeverityChip } from "./ui";
import SaveIndicator from "./SaveIndicator";

export default function TilePage() {
  const { id, tile: tileId } = useParams<{ id: string; tile: string }>();
  const params = useSearchParams();
  const { job } = useJob();
  const tile = tileById(tileId);
  if (!tile) notFound();
  if (!job) return null;
  const target = resolveRouteScope(job, tile, params.get("system"), params.get("component"));
  if (!target.ok) return <main className="page"><EmptyState title="Choose the equipment" body={target.error}><Link className="btn primary" href={jobHref(id)}>Job overview</Link></EmptyState></main>;
  const { system, component, scope } = target;
  const status = tileStatus(job, tile, system, component);
  const photoCount = job.photos.filter(p => photoMatchesScope(p, scope)).length;

  return (
    <main className="page" data-page-status={status}>
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: jobHref(id, undefined, undefined, scope), label: job.label || "Job" }, { label: tile.label }]} />
      <PageHead title={tile.label} lede={system ? `${system.name}. ${tileStatusLabel(status, tile, job, system, component)}.` : "Applies to the whole home."}><SaveIndicator /></PageHead>
      {component?.kind === "legacy" && <Callout title="Unassigned legacy evidence">These fields and records have been preserved without guessing which physical component they describe. Check the actual unit before recording or confirming data under a condenser, furnace or attic component.</Callout>}
      <ul className="list">
        {tile.tools.map(toolId => {
          const tool = TOOLS[toolId];
          const finding = tool.findingKey ? job.findings.find(f => f.key === tool.findingKey && scopeKey(f.scope) === scopeKey(scope)) : undefined;
          let right: React.ReactNode;
          let meta = tool.description;
          if (finding) {
            right = finding.staleAt ? <><Chip tone="concern">Needs review</Chip>{finding.severity === "safety" && <SeverityChip severity="safety" />}</> : <SeverityChip severity={finding.severity} />;
            meta = finding.staleAt ? `${finding.title} · Reconfirmation required` : finding.title;
          } else if (tool.kind === "equipment") {
            const count = Object.keys(component?.equipment ?? {}).length;
            if (count) right = <Chip tone="ok">{count} fields</Chip>;
          } else if (tool.kind === "media" && photoCount) {
            right = <Chip tone="accent">{photoCount}</Chip>;
          } else if (tool.kind === "notes" && (scope.kind === "home" ? job.homeNotes : notesForScope(system, scope)).trim()) {
            right = <Chip tone="accent">Has notes</Chip>;
          }
          return <li key={toolId}><ListLink href={jobHref(id, tile.id, toolId, scope)} title={tool.label} meta={meta} right={right} severity={finding?.staleAt && finding.severity !== "safety" ? "concern" : finding?.severity} /></li>;
        })}
      </ul>
    </main>
  );
}
