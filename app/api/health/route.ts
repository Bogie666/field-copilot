import { NextResponse } from "next/server";
import { getAiProviderReadiness } from "../../lib/aiProvider";

export const dynamic = "force-dynamic";

export function GET() {
  const ai = getAiProviderReadiness();
  return NextResponse.json(
    {
      ok: ai.ready,
      ai,
      service: "field-copilot",
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || "local",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "local",
    },
    { status: ai.ready ? 200 : 503, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
