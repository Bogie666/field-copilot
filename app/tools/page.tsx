import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "../lib/job/registry";
import { ListLink, PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Tools" };

// Tools that make sense without a job. Equipment scan and photos belong to a system.
const GROUPS = [
  { label: "Maintenance", tools: ["maintenance"] },
  { label: "Equipment diagnostics", tools: ["electrical", "charge", "heatpump", "furnace", "gas", "static", "airflow", "airside", "compressor"] },
  { label: "Install and repair", tools: ["evacuation", "refrigerantLog"] },
  { label: "Home and airflow planning", tools: ["insulation", "duct", "load"] },
  { label: "Customer communication", tools: ["explain"] },
] as const;

// Reference material that lives outside the measurement tool registry.
const REFERENCE = [
  { href: "/tools/unit-explorer", title: "3D unit explorer", meta: "Explore a variable-speed outdoor unit in 3D: exploded views, part details, guided teardown and refrigerant flow." },
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
        <section aria-labelledby="tools-training-and-reference">
          <h2 className="sectionLabel" id="tools-training-and-reference">Training and reference</h2>
          <ul className="list">
            {REFERENCE.map(item => <li key={item.href}>
              <ListLink href={item.href} title={item.title} meta={item.meta} />
            </li>)}
          </ul>
        </section>
      </div>
      <p style={{ marginTop: 20 }}>
        <Link className="btn primary" href="/">
          Start a job
        </Link>
      </p>
    </main>
  );
}
