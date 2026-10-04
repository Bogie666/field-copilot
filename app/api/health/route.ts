import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "field-copilot",
      commitSha: process.env.VERCEL_GIT_COMMIT_SHA || "local",
      deploymentId: process.env.VERCEL_DEPLOYMENT_ID || "local",
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
