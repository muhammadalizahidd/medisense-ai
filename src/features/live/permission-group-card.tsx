"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tag } from "@/components/ui/tag";
import { cn } from "@/lib/cn";
import {
  enforcedPermissions,
  permissionById,
  type PermissionDef,
} from "@/lib/permissions/catalogue";
import type { GroupView, ReportRow } from "@/lib/permissions/role-view";

/** One permission: its switch, name and description. A row that differs from what is saved is tinted. */
function PermissionRow({
  p,
  on,
  pending,
  changedFromDefault,
  disabled = false,
  onToggle,
}: {
  p: PermissionDef;
  on: boolean;
  pending: boolean;
  changedFromDefault: boolean;
  disabled?: boolean;
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
        <Switch on={on} label={p.label} onToggle={onToggle} disabled={disabled} />
      </span>
      {/* The words toggle it too, so the target is the whole row, not just the switch. */}
      <div
        className={cn("min-w-0 flex-1", !disabled && "cursor-pointer")}
        onClick={(event) => {
          if (!disabled && !(event.target as HTMLElement).closest("button")) onToggle();
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
  locked = false,
  onAllowAll,
  onClear,
}: {
  title: string;
  allowed: number;
  total: number;
  /** Nothing in this card can be changed by the person looking at it. */
  locked?: boolean;
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
        <Button
          size="sm"
          variant="ghost"
          disabled={locked || allowed === total}
          onClick={onAllowAll}
        >
          Allow all
        </Button>
        <Button size="sm" variant="ghost" disabled={locked || allowed === 0} onClick={onClear}>
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
  editable = () => true,
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
  /** Whether the person looking can change a permission; the rest show but don't switch. */
  editable?: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], on: boolean) => void;
}) {
  const ids = view.items.map((p) => p.id);
  const open = ids.filter(editable);
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
        locked={open.length === 0}
        onAllowAll={() => onSetMany(open, true)}
        onClear={() => onSetMany(open, false)}
      />
      <ul className="-mb-px">
        {view.items.map((p) => (
          <PermissionRow
            key={p.id}
            p={p}
            disabled={!editable(p.id)}
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
  editable = () => true,
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
  editable?: (id: string) => boolean;
  onToggle: (id: string) => void;
  onSetMany: (ids: string[], on: boolean) => void;
}) {
  const ids = [...rows.flatMap((r) => [r.readId, r.detailId]), ...extras.map((p) => p.id)];
  const open = ids.filter(editable);
  const cell = (id: string, label: string): ReactNode => (
    <td className="w-24 px-2 py-2 text-center">
      <span
        className={cn(
          "inline-flex rounded-full p-0.5",
          draft.has(id) !== saved.has(id) && "bg-accent-tint",
        )}
      >
        <Switch
          on={draft.has(id)}
          label={label}
          disabled={!editable(id)}
          onToggle={() => onToggle(id)}
        />
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
        locked={open.length === 0}
        onAllowAll={() => onSetMany(open, true)}
        onClear={() => onSetMany(open, false)}
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
                disabled={!editable(p.id)}
                onToggle={() => onToggle(p.id)}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const APP_ROWS: { title: string; ids: string[] }[] = [
  { title: "Apps", ids: ["app.admin", "app.therapist"] },
  {
    title: "Mobile apps",
    ids: ["app.mobile.family", "app.mobile.patient", "app.mobile.staff", "app.mobile.therapist"],
  },
  { title: "Roles", ids: ["roles.manage"] },
];

/**
 * Which apps this role opens, laid out as rows of switches. An app that is off disappears from the
 * person's menu and its pages and routes refuse them.
 */
export function AppsCard({
  saved,
  defaults,
  draft,
  editable = () => true,
  onToggle,
}: {
  saved: ReadonlySet<string>;
  defaults: ReadonlySet<string> | null;
  draft: ReadonlySet<string>;
  editable?: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const all = APP_ROWS.flatMap((r) => r.ids);
  const on = all.filter((id) => draft.has(id)).length;
  return (
    <section
      aria-label="Apps and roles"
      className="min-w-0 overflow-hidden rounded-card border border-border bg-surface"
    >
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-section font-semibold text-ink-900">Apps and roles</h3>
          <p className="text-caption text-ink-500 tabular-nums">
            {on} of {all.length} on. An app that is off is hidden from the menu and closed to this
            role, including by link.
          </p>
        </div>
      </header>
      <div className="flex flex-col divide-y divide-border">
        {APP_ROWS.map((row) => (
          <div key={row.title} className="px-4 py-3">
            <p className="mb-2 label-caps text-ink-500">{row.title}</p>
            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {row.ids.map((id) => {
                const p = permissionById(id);
                if (!p) return null;
                const pending = draft.has(id) !== saved.has(id);
                return (
                  <li
                    key={id}
                    className={cn(
                      "flex items-start gap-3 rounded-control px-2 py-2",
                      pending && "bg-accent-tint",
                    )}
                  >
                    <span className="mt-0.5 flex-none">
                      <Switch
                        on={draft.has(id)}
                        label={p.label}
                        disabled={!editable(id)}
                        onToggle={() => onToggle(id)}
                      />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small font-semibold text-ink-900">
                        {p.label}
                        {defaults && draft.has(id) !== defaults.has(id) && (
                          <Tag tone="watch">Changed from default</Tag>
                        )}
                      </span>
                      <span className="block text-caption text-ink-500">{p.description}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
