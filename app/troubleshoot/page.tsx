import type { Metadata } from "next";
import { RecordToolUse } from "../components/ToolShortcuts";
import { Crumbs, ListLink, PageHead } from "../components/ui";
import { FLOW_CATEGORIES, FLOWS } from "../lib/troubleshoot/flows";

export const metadata: Metadata = { title: "Troubleshooting" };

export default function TroubleshootPage() {
  return (
    <main className="page">
      <RecordToolUse id="troubleshoot" />
      <Crumbs items={[{ href: "/tools", label: "Tools" }, { label: "Troubleshooting" }]} />
      <PageHead title="Troubleshooting" lede="Pick the symptom. Each guide walks the usual order of checks and opens the tool for each reading. Always follow the manufacturer's diagnostics and wiring diagram." />
      <div className="toolGroups">
        {FLOW_CATEGORIES.map((category) => (
          <section key={category} aria-labelledby={`ts-${category}`}>
            <h2 className="sectionLabel" id={`ts-${category}`}>{category}</h2>
            <ul className="list">
              {FLOWS.filter((f) => f.category === category).map((f) => (
                <li key={f.id}><ListLink href={`/troubleshoot/${f.id}`} title={f.title} meta={f.summary} /></li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  );
}
