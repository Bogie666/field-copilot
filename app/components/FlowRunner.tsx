"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TOOLS, type ToolId } from "../lib/job/registry";
import { flowById, type Flow, type QuestionNode } from "../lib/troubleshoot/flows";
import { Callout, Crumbs, PageHead } from "./ui";

/** The answered path is kept in the URL (?steps=), so the back button steps back through answers. */
export function validPath(flow: Flow, steps: string[]): string[] {
  const path = [flow.start];
  for (const step of steps) {
    const node = flow.nodes[path[path.length - 1]];
    if (node?.kind !== "question" || !node.answers.some((a) => a.next === step) || !flow.nodes[step]) break;
    path.push(step);
  }
  return path;
}

function ToolLink({ id }: { id: ToolId }) {
  return <Link className="btn" href={`/tools/${id}`}>Open {TOOLS[id].label.toLowerCase()}</Link>;
}

export default function FlowRunner({ flowId }: { flowId: string }) {
  const flow = flowById(flowId)!;
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const path = validPath(flow, (params.get("steps") ?? "").split(".").filter(Boolean));
  const currentId = path[path.length - 1];
  const node = flow.nodes[currentId];
  const go = (steps: string[], replace = false) => {
    const url = steps.length > 1 ? `${pathname}?steps=${steps.slice(1).join(".")}` : pathname;
    if (replace) router.replace(url, { scroll: false }); else router.push(url, { scroll: false });
  };
  const answer = (next: string) => {
    if (next.startsWith("flow:")) router.push(`/troubleshoot/${next.slice(5)}`);
    else go([...path, next]);
  };
  const history = path.slice(0, -1).map((id, index) => {
    const asked = flow.nodes[id] as QuestionNode;
    const chosen = asked.answers.find((a) => a.next === path[index + 1]);
    return { id, index, prompt: asked.prompt, answer: chosen?.label ?? "" };
  });

  return (
    <main className="page">
      <Crumbs items={[{ href: "/tools", label: "Tools" }, { href: "/troubleshoot", label: "Troubleshooting" }, { label: flow.title }]} />
      <PageHead title={flow.title} lede={flow.summary} />
      {history.length > 0 && (
        <ol className="flowHistory" aria-label="Your answers">
          {history.map((h) => (
            <li key={h.id}>
              <button type="button" onClick={() => go(path.slice(0, h.index + 1))} aria-label={`Change answer: ${h.prompt}`}>
                <span>{h.prompt}</span>
                <b>{h.answer}</b>
              </button>
            </li>
          ))}
        </ol>
      )}
      {node.kind === "question" ? (
        <section className="panel flowCard" aria-live="polite">
          <p className="flowStep">Step {path.length}</p>
          <h2>{node.prompt}</h2>
          {node.detail && <p className="hint">{node.detail}</p>}
          {node.safety && <Callout tone="safety"><p>{node.safety}</p></Callout>}
          {node.tool && <div className="btnRow"><ToolLink id={node.tool} /></div>}
          <div className="flowAnswers">
            {node.answers.map((a) => (
              <button key={a.label} type="button" className="btn flowAnswer" onClick={() => answer(a.next)}>
                {a.label}{a.next.startsWith("flow:") ? " ›" : ""}
              </button>
            ))}
          </div>
        </section>
      ) : (
        <section className="panel flowCard" aria-live="polite">
          <p className="flowStep">Result</p>
          <h2>{node.title}</h2>
          {node.safety && <Callout tone="safety"><p>{node.safety}</p></Callout>}
          <h3>Likely causes to verify</h3>
          <ul className="resultLines">{node.causes.map((c) => <li key={c}>{c}</li>)}</ul>
          {node.checks && node.checks.length > 0 && (
            <>
              <h3>Next checks</h3>
              <ul className="resultLines">{node.checks.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          )}
          {node.tools && node.tools.length > 0 && <div className="btnRow">{node.tools.map((t) => <ToolLink key={t} id={t} />)}</div>}
          <p className="hint">These are the usual causes, not a diagnosis. Confirm with measurements and the manufacturer&apos;s literature before replacing parts.</p>
        </section>
      )}
      <div className="btnRow" style={{ marginTop: 16 }}>
        {path.length > 1 && <button className="btn ghost" type="button" onClick={() => go(path.slice(0, -1))}>Back one step</button>}
        {path.length > 1 && <button className="btn ghost" type="button" onClick={() => go([flow.start], true)}>Start over</button>}
      </div>
    </main>
  );
}
