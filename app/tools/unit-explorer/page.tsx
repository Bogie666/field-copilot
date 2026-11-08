import type { Metadata } from "next";
import { Crumbs } from "../../components/ui";

export const metadata: Metadata = { title: "3D unit explorer" };

// The explorer is a self-contained three.js trainer served from /public/explorer.
// It is embedded rather than ported so its scene, styles and keyboard shortcuts stay isolated from the app.
const EXPLORER_SRC = "/explorer/index.html";

export default function UnitExplorerPage() {
  return (
    <main className="explorerPage">
      <div className="explorerHead">
        <Crumbs items={[{ href: "/tools", label: "Tools" }, { label: "3D unit explorer" }]} />
        <div className="explorerTitleRow">
          <div>
            <h1>3D unit explorer</h1>
            <p className="lede">Variable-speed outdoor unit: exploded views, part details, guided teardown and refrigerant flow. Representational model, not to OEM layout.</p>
          </div>
          <a className="btn" href={EXPLORER_SRC} target="_blank" rel="noopener">Full screen</a>
        </div>
      </div>
      <iframe className="explorerFrame" src={EXPLORER_SRC} title="3D unit explorer" allow="fullscreen" />
    </main>
  );
}
