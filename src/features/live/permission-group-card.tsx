"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import { enforcedPermissions, type PermissionDef } from "@/lib/permissions/catalogue";
import type { GroupView, ReportRow } from "@/lib/permissions/role-view";

/** One permission: its switch, name and description. A row that differs from what is saved is tinted. */
function PermissionRow({
  p,
  on,
  pending,
  changedFromDefault,
  onToggle,
}: {
  p: PermissionDef;
  on: boolean;
  pending: boolean;
  changedFromDefault: boolean;
  onToggle: () => void;
}) {
  return (
    <li
      className={cn(
        "flex items-start gap-3 border-b border-border px-4 py-3 transition-colors duration-(--duration-fast)",
        pending && "bg-accent-tint",
      )}
    >
      <span className="mt-0.5 flex-none">
        <Switch on={on} label={p.label} onToggle={onToggle} />
      </span>
      {/* The words toggle it too, so the target is the whole row, not just the switch. */}
      <div
        className="min-w-0 flex-1 cursor-pointer"
        onClick={(event) => {
          if (!(event.target as HTMLElement).closest("button")) onToggle();
        }}
      >
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small font-semibold text-ink-900">
          {p.label}
          {p.kind === "scope" && <Tag tone="outline">Visibility</Tag>}
          {changedFromDefault && <Tag tone="watch">Changed from default</Tag>}
          {!enforcedPermissions.includes(p.id) && <Tag tone="neutral">Not enforced yet</Tag>}
        </p>
        <p className="mt-0.5 line-clamp-2 text-caption text-ink-500" title={p.description}>
          {p.description}
        </p>
      </div>
    </li>
  );
}

function CardHeader({
  title,
  allowed,
  total,
  onAllowAll,
  onClear,
}: {
  title: string;
  allowed: number;
  total: number;
  onAllowAll: () => void;
  onClear: () => void;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
      <div className="min-w-0">
        <h3 className="text-section font-semibold text-ink-900">{title}</h3>
        <p className="text-caption text-ink-500 tabular-nums">
          {allowed} of {total} allowed
        </p>
      </div>
      <div className="flex flex-none items-center gap-1">
        <Button size="sm" variant="ghost" disabled={allowed === total} onClick={onAllowAll}>
          Allow all
        </Button>
        <Button size="sm" variant="ghost" disabled={allowed === 0} onClick={onClear}>
          Clear
        </Button>
      </div>
    </header>
  );
}

/** A group of permissions as a bordered card, with its count and group-wide switches. */
export function PermissionGroupCard({
  view,
  grow = false,
  saved,
  defaults,
  draft,
  onToggle,
  onSetMany,
}: {
  view: GroupView;
  /** The last card in a column stretches, so every column ends level. */
  grow?: boolean;
  saved: ReadonlySet<string>;
  /** The built-in role's defaults, or null for a custom role. */
  defaults: ReadonlySet<string> | null;
  draft: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], on: boolean) => void;
}) {
  const ids = view.items.map((p) => p.id);
  return (
    <section
      aria-label={view.group}
      className={cn(
        "min-w-0 overflow-hidden rounded-card border border-border bg-surface",
        grow && "flex-1",
      )}
    >
      <CardHeader
        title={view.group}
        allowed={view.allowed}
        total={view.total}
        onAllowAll={() => onSetMany(ids, true)}
        onClear={() => onSetMany(ids, false)}
      />
      <ul className="-mb-px">
        {view.items.map((p) => (
          <PermissionRow
            key={p.id}
            p={p}
            on={draft.has(p.id)}
            pending={draft.has(p.id) !== saved.has(p.id)}
            changedFromDefault={defaults ? draft.has(p.id) !== defaults.has(p.id) : false}
            onToggle={() => onToggle(p.id)}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Reports, as a matrix: one row per domain with Read and Detail switches, and the report-wide
 * permissions beside it. Twenty-two stacked toggles become nine rows.
 */
export function ReportsCard({
  rows,
  extras,
  allowed,
  total,
  saved,
  defaults,
  draft,
  onToggle,
  onSetMany,
}: {
  rows: ReportRow[];
  extras: PermissionDef[];
  allowed: number;
  total: number;
  saved: ReadonlySet<string>;
  defaults: ReadonlySet<string> | null;
  draft: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], on: boolean) => void;
}) {
  const ids = [...rows.flatMap((r) => [r.readId, r.detailId]), ...extras.map((p) => p.id)];
  const cell = (id: string, label: string): ReactNode => (
    <td className="w-24 px-2 py-2 text-center">
      <span
        className={cn(
          "inline-flex rounded-full p-0.5",
          draft.has(id) !== saved.has(id) && "bg-accent-tint",
        )}
      >
        <Switch on={draft.has(id)} label={label} onToggle={() => onToggle(id)} />
      </span>
    </td>
  );
  return (
    <section
      aria-label="Reports"
      className="min-w-0 overflow-hidden rounded-card border border-border bg-surface"
    >
      <CardHeader
        title="Reports"
        allowed={allowed}
        total={total}
        onAllowAll={() => onSetMany(ids, true)}
        onClear={() => onSetMany(ids, false)}
      />
      <div className="grid lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {rows.length > 0 && (
          <table className="w-full text-small">
            <thead>
              <tr className="border-b border-border text-caption text-ink-500">
                <th scope="col" className="px-4 py-2 text-left font-medium">
                  Data area
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Read
                </th>
                <th scope="col" className="px-2 py-2 text-center font-medium">
                  Row detail
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.domain} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-2 text-left font-medium text-ink-900">
                    {r.domain}
                  </th>
                  {cell(r.readId, `Read ${r.domain} reports`)}
                  {cell(r.detailId, `See ${r.domain} row-level detail`)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {extras.length > 0 && (
          <ul
            className={cn(
              "-mb-px",
              rows.length > 0 && "border-t border-border lg:border-t-0 lg:border-l",
            )}
          >
            {extras.map((p) => (
              <PermissionRow
                key={p.id}
                p={p}
                on={draft.has(p.id)}
                pending={draft.has(p.id) !== saved.has(p.id)}
                changedFromDefault={defaults ? draft.has(p.id) !== defaults.has(p.id) : false}
                onToggle={() => onToggle(p.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
