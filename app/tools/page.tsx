import type { Metadata } from "next";
import Link from "next/link";
import { TOOLS } from "../lib/job/registry";
import { ListLink, PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Tools" };

// Tools that make sense without a job. Equipment scan and photos belong to a system.
const STANDALONE = ["electrical", "charge", "furnace", "static", "airflow", "insulation", "duct", "load", "explain"] as const;

export default function ToolsPage() {
  return (
    <main className="page">
      <PageHead title="Tools" lede="Use a tool on its own. Results are not saved, but you can copy them. To keep readings and build a customer note, start a job instead." />
      <ul className="list">
        {STANDALONE.map((id) => (
          <li key={id}>
            <ListLink href={`/tools/${id}`} title={TOOLS[id].label} meta={TOOLS[id].description} />
          </li>
        ))}
      </ul>
      <p style={{ marginTop: 20 }}>
        <Link className="btn primary" href="/">
          Start a job
        </Link>
      </p>
    </main>
  );
}
