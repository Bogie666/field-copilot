import type { Metadata } from "next";
import Link from "next/link";
import ToolDirectory from "../components/ToolShortcuts";
import { PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Tools" };

export default function ToolsPage() {
  return (
    <main className="page">
      <PageHead title="Tools" lede="Use a tool on its own. Results are not saved, but you can copy them. To keep readings and build a customer note, start a job instead." />
      <ToolDirectory />
      <p style={{ marginTop: 20 }}>
        <Link className="btn primary" href="/">
          Start a job
        </Link>
      </p>
    </main>
  );
}
