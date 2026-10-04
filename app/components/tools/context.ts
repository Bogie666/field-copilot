import type { JobApi } from "../JobProvider";
import type { ToolId } from "../../lib/job/registry";
import type { Finding, FindingScope, JobSystem } from "../../lib/job/types";

/** What every tool receives. `api` is null in standalone mode (no job, nothing saved). */
export type ToolContext = {
  toolId: ToolId;
  api: JobApi | null;
  system: JobSystem | null;
  scope: FindingScope | null;
  /** The finding this tool previously saved in this scope, if any. */
  saved: Finding | undefined;
};

export function isJobMode(ctx: ToolContext): ctx is ToolContext & { api: JobApi; scope: FindingScope } {
  return ctx.api !== null && ctx.scope !== null;
}
