import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import FlowRunner from "../../components/FlowRunner";
import { FLOW_IDS, flowById } from "../../lib/troubleshoot/flows";

export const dynamicParams = false;

export function generateStaticParams() {
  return FLOW_IDS.map((flow) => ({ flow }));
}

export async function generateMetadata({ params }: { params: Promise<{ flow: string }> }): Promise<Metadata> {
  const flow = flowById((await params).flow);
  return { title: flow?.title ?? "Troubleshooting" };
}

export default async function Page({ params }: { params: Promise<{ flow: string }> }) {
  const { flow: id } = await params;
  if (!flowById(id)) notFound();
  return (
    <Suspense fallback={<main className="page" />}>
      <FlowRunner flowId={id} />
    </Suspense>
  );
}
