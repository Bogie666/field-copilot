"use client";

import Link from "next/link";
import { notFound, useParams, useSearchParams } from "next/navigation";
import { TOOLS, tileById, toolById, type ToolId } from "../lib/job/registry";
import { jobHref, resolveRouteScope } from "../lib/job/routes";
import { scopeKey } from "../lib/job/types";
import { useJob } from "./JobProvider";
import { Callout, Crumbs, EmptyState, PageHead } from "./ui";
import type { ToolContext } from "./tools/context";
import { ToolHost } from "./tools/ToolHost";

export default function ToolPage() {
  const { id, tile: tileId, tool: toolParam } = useParams<{ id: string; tile: string; tool: string }>();
  const params = useSearchParams();
  const api = useJob();
  const { job } = api;
  const tile = tileById(tileId);
  const tool = toolById(toolParam);
  if (!tile || !tool || !tile.tools.includes(tool.id)) notFound();
  if (!job) return null;
  const target = resolveRouteScope(job, tile, params.get("system"), params.get("component"));
  if (!target.ok) return <main className="page"><EmptyState title="Choose the equipment" body={target.error}><Link className="btn primary" href={jobHref(id)}>Job overview</Link></EmptyState></main>;
  const { system, component, scope } = target;
  const saved = tool.findingKey ? job.findings.find(f => f.key === tool.findingKey && scopeKey(f.scope) === scopeKey(scope)) : undefined;
  const ctx: ToolContext = { toolId: tool.id as ToolId, api, system, component, scope, saved };

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: jobHref(id, undefined, undefined, scope), label: job.label || "Job" }, { href: jobHref(id, tile.id, undefined, scope), label: tile.label }, { label: TOOLS[tool.id].label }]} />
      <PageHead title={tool.label} lede={system ? `${system.name} · ${component!.name}. ${tool.description}` : tool.description} />
      {component?.kind === "legacy" && <Callout title="Component identity not confirmed">This record predates component tracking. Its equipment and evidence remain unassigned. Do not treat these values as an indoor or outdoor nameplate without checking the physical equipment.</Callout>}
      <ToolHost key={`${job.id}:${scopeKey(scope)}:${tool.id}:${saved ? "saved" : "new"}`} ctx={ctx} />
    </main>
  );
}
