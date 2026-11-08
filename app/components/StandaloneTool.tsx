"use client";

import { notFound, useParams } from "next/navigation";
import { toolById } from "../lib/job/registry";
import { Crumbs, PageHead } from "./ui";
import type { ToolContext } from "./tools/context";
import { ToolHost } from "./tools/ToolHost";
import { FavoriteButton, RecordToolUse } from "./ToolShortcuts";

/** A tool used on its own: no job, nothing saved. Results can be copied. */
export default function StandaloneTool() {
  const { tool: toolParam } = useParams<{ tool: string }>();
  const tool = toolById(toolParam);
  if (!tool) notFound();
  const ctx: ToolContext = { toolId: tool.id, api: null, system: null, scope: null, saved: undefined };
  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { href: "/tools", label: "Tools" }, { label: tool.label }]} />
      <RecordToolUse id={tool.id} />
      <PageHead title={tool.label} lede={`${tool.description} Not part of a job, so nothing is saved.`}><FavoriteButton id={tool.id} title={tool.label} className="favButton headFav" /></PageHead>
      <ToolHost ctx={ctx} />
    </main>
  );
}
