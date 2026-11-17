import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guideFor, guides, redirectOnly } from "./page-guides";

/** Every page route under src/app, as its folder pattern (`/care/plans/[id]`). */
function routes(dir = join(process.cwd(), "src/app"), base = ""): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "api" || name.startsWith("_")) continue;
      // Route groups like (marketing) don't add a URL segment.
      const seg = name.startsWith("(") ? "" : `/${name}`;
      out.push(...routes(full, base + seg));
    } else if (name === "page.tsx") {
      out.push(base || "/");
    }
  }
  return out;
}

describe("page guides", () => {
  const all = routes();

  it("covers every page, so a new page can't ship without its guide", () => {
    const missing = all.filter((r) => !guides[r] && !redirectOnly.includes(r));
    expect(missing).toEqual([]);
  });

  it("has no guides for pages that no longer exist", () => {
    const stale = Object.keys(guides).filter((k) => !all.includes(k));
    expect(stale).toEqual([]);
  });

  it("gives every page its own purpose, actions, steps and outcome", () => {
    const purposes = new Set<string>();
    for (const [route, g] of Object.entries(guides)) {
      expect(g.purpose.length, route).toBeGreaterThan(30);
      expect(g.can.length, route).toBeGreaterThan(0);
      expect(g.steps.length, route).toBeGreaterThan(1);
      expect(g.outcome.length, route).toBeGreaterThan(10);
      expect(purposes.has(g.purpose), `${route} repeats another page's purpose`).toBe(false);
      purposes.add(g.purpose);
    }
  });

  it("matches real URLs to their route pattern", () => {
    expect(guideFor("/care/plans/6af8")?.title).toBe("Treatment plan");
    expect(guideFor("/care/new")?.title).toBe("Enter a referral");
    expect(guideFor("/care/6af8")?.title).toBe("Patient record");
    expect(guideFor("/therapist/sessions/abc?tab=notes")?.title).toBe("Session workspace");
  });
});
