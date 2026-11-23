import {
  permissionGroups,
  permissions,
  reportDetailId,
  reportDomains,
  reportReadId,
  type PermissionDef,
  type PermissionGroup,
  type ReportDomainName,
} from "./catalogue";

/*
 * What the role dialog shows: the permissions in their groups, narrowed by a text filter and an
 * allowed / not allowed switch, with counts that always cover the whole group.
 */

export type PermissionMode = "all" | "allowed" | "not-allowed";

export type GroupView = {
  group: PermissionGroup;
  /** The permissions that pass the filter, in catalogue order. */
  items: PermissionDef[];
  /** How many the role allows, out of every permission in the group (not just the filtered ones). */
  allowed: number;
  total: number;
};

const norm = (v: string) => v.trim().toLowerCase();

/** Whether a permission matches the text and the allowed / not allowed switch. */
export function matches(
  p: PermissionDef,
  held: ReadonlySet<string>,
  query: string,
  mode: PermissionMode,
) {
  if (mode === "allowed" && !held.has(p.id)) return false;
  if (mode === "not-allowed" && held.has(p.id)) return false;
  const q = norm(query);
  return q === "" || `${p.label} ${p.description}`.toLowerCase().includes(q);
}

/** The groups to show. A group with nothing left after filtering is dropped. */
export function groupPermissions(
  held: ReadonlySet<string>,
  query = "",
  mode: PermissionMode = "all",
): GroupView[] {
  return permissionGroups
    .map((group) => {
      const all = permissions.filter((p) => p.group === group);
      return {
        group,
        items: all.filter((p) => matches(p, held, query, mode)),
        allowed: all.filter((p) => held.has(p.id)).length,
        total: all.length,
      };
    })
    .filter((g) => g.items.length > 0);
}

/** What changed between what is saved and the draft, in catalogue order. */
export function changeSummary(saved: readonly string[], draft: ReadonlySet<string>) {
  const had = new Set(saved);
  return {
    added: permissions.filter((p) => draft.has(p.id) && !had.has(p.id)),
    removed: permissions.filter((p) => !draft.has(p.id) && had.has(p.id)),
  };
}

export const sameSet = (a: ReadonlySet<string>, b: readonly string[]) =>
  a.size === b.length && b.every((id) => a.has(id));

/**
 * Splits cards over columns so each column ends at about the same height and no card leaves a gap
 * beneath it. The tallest cards are placed first, each into the shortest column so far; within a
 * column the cards keep their original order. Returns the card indexes for each column.
 */
export function distribute(weights: readonly number[], columns: number): number[][] {
  const cols = Array.from({ length: Math.max(1, columns) }, () => ({
    items: [] as number[],
    height: 0,
  }));
  const order = weights.map((w, i) => ({ w, i })).sort((x, y) => y.w - x.w || x.i - y.i);
  for (const { w, i } of order) {
    const target = cols.reduce((best, c) => (c.height < best.height ? c : best));
    target.items.push(i);
    target.height += w;
  }
  return cols.map((c) => c.items.sort((x, y) => x - y));
}

export type ReportRow = { domain: ReportDomainName; readId: string; detailId: string };

/** The permissions in the Reports group that are not tied to one domain. */
export const reportExtras = permissions.filter(
  (p) =>
    p.group === "Reports" &&
    !p.id.startsWith("reports.read.") &&
    !p.id.startsWith("reports.detail."),
);

/**
 * The Reports group as a matrix: one row per domain with Read and Detail switches, plus the
 * remaining report permissions. A row is kept when the text names the domain (or read, detail) and
 * the switch agrees with at least one of its two permissions.
 */
export function reportMatrix(
  held: ReadonlySet<string>,
  query = "",
  mode: PermissionMode = "all",
): { rows: ReportRow[]; extras: PermissionDef[] } {
  const q = norm(query);
  const rows = reportDomains
    .map((domain) => ({ domain, readId: reportReadId(domain), detailId: reportDetailId(domain) }))
    .filter((r) => {
      const state = [held.has(r.readId), held.has(r.detailId)];
      if (mode === "allowed" && !state.some(Boolean)) return false;
      if (mode === "not-allowed" && state.every(Boolean)) return false;
      if (q === "") return true;
      return `${r.domain} read detail report`.toLowerCase().includes(q);
    });
  const extras = reportExtras.filter((p) => matches(p, held, query, mode));
  return { rows, extras };
}

const READ = "reports.read.";
const DETAIL = "reports.detail.";

/**
 * Switches one permission. Row-level detail only counts for a domain the role can read, so
 * allowing detail also allows read, and removing read also removes detail.
 */
export function toggled(draft: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(draft);
  if (next.has(id)) {
    next.delete(id);
    if (id.startsWith(READ)) next.delete(DETAIL + id.slice(READ.length));
  } else {
    next.add(id);
    if (id.startsWith(DETAIL)) next.add(READ + id.slice(DETAIL.length));
  }
  return next;
}

/** Allows or clears several permissions at once, keeping the read-and-detail rule. */
export function setMany(
  draft: ReadonlySet<string>,
  ids: readonly string[],
  on: boolean,
): Set<string> {
  const next = new Set(draft);
  for (const id of ids) {
    if (on) {
      next.add(id);
      if (id.startsWith(DETAIL)) next.add(READ + id.slice(DETAIL.length));
    } else {
      next.delete(id);
      if (id.startsWith(READ)) next.delete(DETAIL + id.slice(READ.length));
    }
  }
  return next;
}
