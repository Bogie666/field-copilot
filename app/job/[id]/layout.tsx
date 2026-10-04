"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { JobProvider, useJob } from "../../components/JobProvider";
import { EmptyState } from "../../components/ui";

function Gate({ children }: { children: ReactNode }) {
  const { status, error } = useJob();
  if (status === "loading")
    return (
      <main className="page">
        <p className="hint" role="status">
          Opening job
        </p>
      </main>
    );
  if (status === "missing")
    return (
      <main className="page">
        <EmptyState title="This job is not on this device" body="Jobs are stored in the browser that created them. Open the app on the same phone or start a new job.">
          <Link className="btn primary" href="/">
            Back to jobs
          </Link>
        </EmptyState>
      </main>
    );
  if (status === "error")
    return (
      <main className="page">
        <EmptyState title="Could not open this job" body={error || "Storage on this device failed to open."}>
          <Link className="btn primary" href="/">
            Back to jobs
          </Link>
        </EmptyState>
      </main>
    );
  return <>{children}</>;
}

export default function JobLayout({ children }: { children: ReactNode }) {
  const params = useParams<{ id: string }>();
  return (
    <JobProvider key={params.id} jobId={params.id}>
      <Gate>{children}</Gate>
    </JobProvider>
  );
}
