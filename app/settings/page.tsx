import type { Metadata } from "next";
import AccentPicker from "../components/AccentPicker";
import { Crumbs, ListLink, PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { label: "Settings" }]} />
      <PageHead title="Settings" lede="Preferences are saved on this device." />
      <section aria-labelledby="settings-color">
        <h2 className="sectionLabel" id="settings-color">Theme color</h2>
        <AccentPicker />
        <p className="hint" style={{ marginTop: 10 }}>Changes buttons, highlights and in-range results. Attention and safety colors stay the same in every theme.</p>
      </section>
      <section aria-labelledby="settings-data" style={{ marginTop: 16 }}>
        <h2 className="sectionLabel" id="settings-data">Data</h2>
        <ul className="list">
          <li><ListLink href="/backup" title="Backup and restore" meta="Save jobs, photos and notes to a file, or restore from one." /></li>
        </ul>
      </section>
    </main>
  );
}
