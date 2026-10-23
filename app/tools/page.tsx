import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "../lib/job/registry";
import { ListLink, PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Tools" };

// Tools that make sense without a job. Equipment scan and photos belong to a system.
const GROUPS = [
  { label: "Equipment diagnostics", tools: ["electrical", "charge", "furnace", "static", "airflow"] },
  { label: "Home and airflow planning", tools: ["insulation", "duct", "load"] },
  { label: "Customer communication", tools: ["explain"] },
] as const;

export default function ToolsPage() {
  return (
    <main className="page">
      <PageHead title="Tools" lede="Use a tool on its own. Results are not saved, but you can copy them. To keep readings and build a customer note, start a job instead." />
      <div className="toolGroups">
        {GROUPS.map(group => <section key={group.label} aria-labelledby={`tools-${group.label.toLowerCase().replaceAll(" ", "-")}`}>
          <h2 className="sectionLabel" id={`tools-${group.label.toLowerCase().replaceAll(" ", "-")}`}>{group.label}</h2>
          <ul className="list">
            {group.tools.map((id) => <li key={id}>
              <ListLink href={`/tools/${id}`} title={TOOLS[id].label} meta={TOOLS[id].description} />
            </li>)}
          </ul>
        </section>)}
      </div>
      <p style={{ marginTop: 20 }}>
        <Link className="btn primary" href="/">
          Start a job
        </Link>
      </p>
    </main>
  );
}
