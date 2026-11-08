import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TOOLS } from "../job/registry";
import { FLOWS, flowById } from "./flows";

describe("troubleshooting flows", () => {
  it("have unique ids and valid starts", () => {
    expect(new Set(FLOWS.map((f) => f.id)).size).toBe(FLOWS.length);
    for (const f of FLOWS) expect(f.nodes[f.start], f.id).toBeDefined();
  });

  it("resolve every answer, tool and cross-flow link", () => {
    for (const f of FLOWS) {
      for (const [id, node] of Object.entries(f.nodes)) {
        if (node.kind === "question") {
          expect(node.answers.length, `${f.id}.${id}`).toBeGreaterThan(0);
          if (node.tool) expect(TOOLS[node.tool], `${f.id}.${id}`).toBeDefined();
          for (const a of node.answers) {
            if (a.next.startsWith("flow:")) expect(flowById(a.next.slice(5)), `${f.id}.${id} -> ${a.next}`).toBeDefined();
            else expect(f.nodes[a.next], `${f.id}.${id} -> ${a.next}`).toBeDefined();
          }
        } else {
          expect(node.causes.length, `${f.id}.${id}`).toBeGreaterThan(0);
          for (const t of node.tools ?? []) expect(TOOLS[t], `${f.id}.${id}`).toBeDefined();
        }
      }
    }
  });

  it("reach every node from the start without loops", () => {
    for (const f of FLOWS) {
      const seen = new Set<string>();
      const visit = (id: string, path: string[]) => {
        expect(path.includes(id), `${f.id} loops at ${id}`).toBe(false);
        seen.add(id);
        const node = f.nodes[id];
        if (node.kind === "question") for (const a of node.answers) if (!a.next.startsWith("flow:")) visit(a.next, [...path, id]);
      };
      visit(f.start, []);
      expect([...Object.keys(f.nodes)].filter((id) => !seen.has(id)), f.id).toEqual([]);
    }
  });

  it("are precached by the offline service worker", () => {
    const sw = readFileSync("public/sw.js", "utf8");
    for (const f of FLOWS) expect(sw, f.id).toContain(`"${f.id}"`);
  });
});
