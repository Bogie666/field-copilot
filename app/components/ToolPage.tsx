"use client";

import { notFound, useParams } from "next/navigation";
import { TOOLS, tileById, toolById, type ToolId } from "../lib/job/registry";
import { scopeKey, type FindingScope } from "../lib/job/types";
import { useJob } from "./JobProvider";
import { Crumbs, PageHead } from "./ui";
import type { ToolContext } from "./tools/context";
import { ToolHost } from "./tools/ToolHost";

export default function ToolPage() {
  const { id, tile: tileId, tool: toolParam } = useParams<{ id: string; tile: string; tool: string }>();
  const api = useJob();
  const { job, activeSystem } = api;
  const tile = tileById(tileId);
  const tool = toolById(toolParam);
  if (!tile || !tool || !tile.tools.includes(tool.id)) notFound();
  if (!job || !activeSystem) return null;

  const scope: FindingScope = tile.scope === "home" ? { kind: "home" } : { kind: "system", systemId: activeSystem.id };
  const saved = tool.findingKey ? job.findings.find((f) => f.key === tool.findingKey && scopeKey(f.scope) === scopeKey(scope)) : undefined;
  const ctx: ToolContext = { toolId: tool.id as ToolId, api, system: tile.scope === "home" ? null : activeSystem, scope, saved };

  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: `/job/${id}`, label: job.label || "Job" }, { href: `/job/${id}/${tile.id}`, label: tile.label }, { label: TOOLS[tool.id].label }]} />
      <PageHead title={tool.label} lede={tile.scope === "home" ? tool.description : `${activeSystem.name}. ${tool.description}`} />
      {/* Remount when the system changes or a saved finding appears so form state reseeds. */}
      <ToolHost key={`${activeSystem.id}:${tool.id}:${saved ? "saved" : "new"}`} ctx={ctx} />
    </main>
  );
}
