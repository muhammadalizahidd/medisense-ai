import { describe, expect, it } from "vitest";
import {
  permissionGroups,
  permissionIds,
  permissions,
  reportDetailId,
  reportDomains,
  reportReadId,
} from "./catalogue";
import {
  changeSummary,
  groupPermissions,
  distribute,
  reportExtras,
  reportMatrix,
  sameSet,
  setMany,
  toggled,
} from "./role-view";

const held = (...ids: string[]) => new Set(ids);

describe("groupPermissions", () => {
  it("returns every group in catalogue order when nothing is filtered", () => {
    const groups = groupPermissions(held());
    expect(groups.map((g) => g.group)).toEqual([...permissionGroups]);
    expect(groups.reduce((n, g) => n + g.items.length, 0)).toBe(permissionIds.length);
  });

  it("counts what the role allows against the whole group", () => {
    const groups = groupPermissions(held("referrals.triage", "referrals.process"));
    const referrals = groups.find((g) => g.group === "Referrals and intake")!;
    expect(referrals.allowed).toBe(2);
    expect(referrals.total).toBe(3);
  });

  it("filters by the words in a label or description, ignoring case", () => {
    const groups = groupPermissions(held(), "  TRIAGE ");
    expect(groups.flatMap((g) => g.items.map((p) => p.id))).toEqual(["referrals.triage"]);
  });

  it("keeps whole-group counts while filtering", () => {
    const groups = groupPermissions(held("referrals.triage"), "triage");
    expect(groups[0]).toMatchObject({ allowed: 1, total: 3 });
    expect(groups[0]!.items).toHaveLength(1);
  });

  it("shows only allowed or only not allowed permissions", () => {
    const set = held("finance.work");
    const allowed = groupPermissions(set, "", "allowed").flatMap((g) => g.items.map((p) => p.id));
    expect(allowed).toEqual(["finance.work"]);
    const rest = groupPermissions(set, "", "not-allowed").flatMap((g) => g.items.map((p) => p.id));
    expect(rest).toHaveLength(permissionIds.length - 1);
    expect(rest).not.toContain("finance.work");
  });

  it("drops groups that end up empty, and returns nothing when nothing matches", () => {
    const groups = groupPermissions(held(), "refund");
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    expect(groupPermissions(held(), "zzzz-nothing")).toEqual([]);
  });
});

describe("changeSummary", () => {
  it("lists what was added and removed, in catalogue order", () => {
    const { added, removed } = changeSummary(
      ["finance.work", "referrals.process"],
      held("finance.work", "funding.edit", "schedule.manage"),
    );
    expect(added.map((p) => p.id)).toEqual(["schedule.manage", "funding.edit"]);
    expect(removed.map((p) => p.id)).toEqual(["referrals.process"]);
  });

  it("reports no change for an identical draft", () => {
    const { added, removed } = changeSummary(["finance.work"], held("finance.work"));
    expect(added.length + removed.length).toBe(0);
    expect(sameSet(held("finance.work"), ["finance.work"])).toBe(true);
    expect(sameSet(held("finance.work"), ["finance.work", "funding.edit"])).toBe(false);
  });
});

describe("distribute", () => {
  const heights = (weights: number[], columns: number) =>
    distribute(weights, columns).map((col) => col.reduce((n, i) => n + weights[i]!, 0));

  it("puts every card in exactly one column", () => {
    const columns = distribute([5, 3, 9, 2, 7], 3);
    expect(columns.flat().sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps the original order within a column", () => {
    for (const col of distribute([5, 3, 9, 2, 7, 4, 6], 3)) {
      expect([...col].sort((a, b) => a - b)).toEqual(col);
    }
  });

  it("balances the real permission groups so the columns end level", () => {
    // Referrals, Scheduling, Clinical, Funding, Finance, Operations: items plus about 1.5 for a header.
    const weights = [3, 9, 16, 3, 2, 12].map((n) => n + 1.5);
    const h = heights(weights, 3);
    expect(Math.max(...h) - Math.min(...h)).toBeLessThanOrEqual(3);
  });

  it("uses one column for a phone and never leaves a column out of range", () => {
    expect(distribute([1, 2, 3], 1)).toEqual([[0, 1, 2]]);
    expect(distribute([1, 2, 3], 0)).toEqual([[0, 1, 2]]);
  });

  it("leaves a column empty when there are fewer cards than columns", () => {
    expect(distribute([4, 2], 3)).toEqual([[0], [1], []]);
  });

  it("returns empty columns for no cards", () => {
    expect(distribute([], 2)).toEqual([[], []]);
  });
});

describe("reportMatrix", () => {
  it("has a row for every domain and the permissions that belong to none", () => {
    const { rows, extras } = reportMatrix(held());
    expect(rows.map((r) => r.domain)).toEqual([...reportDomains]);
    expect(rows[0]).toEqual({
      domain: "Referrals",
      readId: reportReadId("Referrals"),
      detailId: reportDetailId("Referrals"),
    });
    expect(extras.map((p) => p.id)).toEqual(reportExtras.map((p) => p.id));
    expect(extras).toHaveLength(4);
  });

  it("accounts for every permission in the Reports group, so a new domain cannot be missed", () => {
    const { rows, extras } = reportMatrix(held());
    const shown = [...rows.flatMap((r) => [r.readId, r.detailId]), ...extras.map((p) => p.id)];
    const group = permissions.filter((p) => p.group === "Reports").map((p) => p.id);
    expect([...shown].sort()).toEqual([...group].sort());
  });

  it("filters rows by domain name and by the allowed switch", () => {
    expect(reportMatrix(held(), "audit").rows.map((r) => r.domain)).toEqual(["Audit"]);
    const set = held(reportReadId("Finance"));
    expect(reportMatrix(set, "", "allowed").rows.map((r) => r.domain)).toEqual(["Finance"]);
    expect(reportMatrix(set, "", "not-allowed").rows).toHaveLength(reportDomains.length);
    const both = held(reportReadId("Finance"), reportDetailId("Finance"));
    expect(reportMatrix(both, "", "not-allowed").rows.map((r) => r.domain)).not.toContain(
      "Finance",
    );
  });
});

describe("switching permissions", () => {
  it("toggles a permission on and off", () => {
    const on = toggled(held(), "finance.work");
    expect(on.has("finance.work")).toBe(true);
    expect(toggled(on, "finance.work").has("finance.work")).toBe(false);
  });

  it("does not change the set it was given", () => {
    const original = held("finance.work");
    toggled(original, "finance.work");
    setMany(original, ["funding.edit"], true);
    expect([...original]).toEqual(["finance.work"]);
  });

  it("allowing detail also allows read, and removing read also removes detail", () => {
    const detail = toggled(held(), reportDetailId("Audit"));
    expect(detail.has(reportReadId("Audit"))).toBe(true);
    const noRead = toggled(detail, reportReadId("Audit"));
    expect(noRead.has(reportDetailId("Audit"))).toBe(false);
    expect(noRead.has(reportReadId("Audit"))).toBe(false);
  });

  it("removing detail alone keeps read", () => {
    const both = held(reportReadId("Audit"), reportDetailId("Audit"));
    const next = toggled(both, reportDetailId("Audit"));
    expect(next.has(reportReadId("Audit"))).toBe(true);
    expect(next.has(reportDetailId("Audit"))).toBe(false);
  });

  it("allows or clears a whole set, keeping the read-and-detail rule", () => {
    const all = setMany(held(), [reportDetailId("Staff"), "finance.work"], true);
    expect([...all].sort()).toEqual(
      ["finance.work", reportDetailId("Staff"), reportReadId("Staff")].sort(),
    );
    const cleared = setMany(all, [reportReadId("Staff")], false);
    expect(cleared.has(reportDetailId("Staff"))).toBe(false);
    expect(cleared.has("finance.work")).toBe(true);
  });
});
