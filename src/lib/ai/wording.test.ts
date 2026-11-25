import { describe, expect, it } from "vitest";
import { navigation, navigationFor, routeMeta } from "@/lib/navigation";
import { guides } from "@/lib/page-guides";
import { mentionsAi, withoutAiWording } from "./wording";

/** Every string inside a value, however deeply nested. */
function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

describe("wording while the AI switch is off", () => {
  it.each([
    ["AI notes", "Notes"],
    ["AI reports", "Reports"],
    ["AI referrals", "Referrals"],
    ["AI forms", "Forms"],
    ["AI briefs", "Supervision briefs"],
    ["AI session note", "Session note"],
    ["AI workspace", "Workspace"],
    ["Operations and AI", "Operations"],
    ["AI and reports", "Reports"],
    ["AI insights", "Insights"],
    ["AI draft, needs your approval", "Draft, needs your approval"],
    ["Prepare an AI draft for review", "Prepare a draft for review"],
    ["an AI-assisted operational layer", "an operational layer"],
    ["Approve AI drafts", "Approve drafts"],
    ["Read referral with AI", "Read referral"],
    ["AI reads it for you to check", "The system reads it for you to check"],
  ])("reads %s as %s", (from, to) => {
    expect(withoutAiWording(from)).toBe(to);
  });

  it("leaves everything else alone", () => {
    for (const text of ["Aisha Khan", "Email", "  padded  text ,", "WAITING"]) {
      expect(withoutAiWording(text)).toBe(text);
    }
  });

  it("removes the word from every menu label, breadcrumb and page guide", () => {
    const all = [
      ...strings(navigation.map((g) => [g.group, g.items.map((i) => i.label)])),
      ...strings(
        (["Leadership", "Admin", "Supervisor", "Clinician"] as const).map((r) =>
          navigationFor(r).map((g) => [g.group, g.items.map((i) => i.label)]),
        ),
      ),
      ...navigation.flatMap((g) => g.items.flatMap((i) => strings(routeMeta(i.href)))),
      ...strings(guides),
    ];
    expect(all.length).toBeGreaterThan(100);
    expect(all.map(withoutAiWording).filter(mentionsAi)).toEqual([]);
  });
});
