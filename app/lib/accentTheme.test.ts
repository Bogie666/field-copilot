import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ACCENT_BOOT_SCRIPT, ACCENTS, isAccent } from "./accentTheme";

describe("accent themes", () => {
  it("has CSS for every non-default accent, and none that look like status colors", () => {
    const css = readFileSync("app/globals.css", "utf8");
    for (const a of ACCENTS.filter((x) => x.id !== "purple")) expect(css, a.id).toContain(`html[data-accent="${a.id}"]`);
    expect(ACCENTS.map((a) => a.id)).not.toContain("orange");
    expect(ACCENTS.map((a) => a.id)).not.toContain("red");
  });

  it("boot script only applies known accents and survives blocked storage", () => {
    const run = (stored: string | null, throws = false) => {
      const doc = { documentElement: { dataset: {} as Record<string, string> } };
      const storage = { getItem: () => { if (throws) throw new Error("blocked"); return stored; } };
      new Function("localStorage", "document", ACCENT_BOOT_SCRIPT)(storage, doc);
      return doc.documentElement.dataset.accent;
    };
    expect(run("teal")).toBe("teal");
    expect(run("purple")).toBeUndefined();
    expect(run("<script>")).toBeUndefined();
    expect(run(null, true)).toBeUndefined();
    expect(isAccent("graphite")).toBe(true);
  });
});
