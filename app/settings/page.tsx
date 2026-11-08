import type { Metadata } from "next";
import AccentPicker from "../components/AccentPicker";
import { AboutSetting, ProfileSetting, TextSizePicker, WakeLockSetting } from "../components/SettingsPanels";
import { Crumbs, ListLink, PageHead } from "../components/ui";

export const metadata: Metadata = { title: "Settings" };

function Section({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <section className="settingsSection" aria-labelledby={`settings-${id}`}>
      <h2 className="sectionLabel" id={`settings-${id}`}>{label}</h2>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  return (
    <main className="page">
      <Crumbs items={[{ href: "/", label: "Jobs" }, { label: "Settings" }]} />
      <PageHead title="Settings" lede="Preferences are saved on this device." />
      <Section id="text" label="Text size"><TextSizePicker /></Section>
      <Section id="color" label="Theme color">
        <AccentPicker />
        <p className="hint" style={{ marginTop: 10 }}>Changes buttons, highlights and in-range results. Attention and safety colors stay the same in every theme.</p>
      </Section>
      <Section id="screen" label="Screen"><WakeLockSetting /></Section>
      <Section id="profile" label="On reports"><ProfileSetting /></Section>
      <Section id="data" label="Data">
        <ul className="list">
          <li><ListLink href="/backup" title="Backup and restore" meta="Save jobs, photos and notes to a file, or restore from one." /></li>
        </ul>
      </Section>
      <Section id="about" label="About this app"><AboutSetting /></Section>
    </main>
  );
}
