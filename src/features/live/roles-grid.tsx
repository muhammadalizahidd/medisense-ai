"use client";

import { Tag } from "@/components/ui/tag";
import type { RoleDto } from "@/lib/permissions/types";

const CARD =
  "flex h-full min-h-40 w-full cursor-pointer flex-col rounded-card border text-left transition-[border-color,box-shadow,background-color] duration-(--duration-fast)";

/** One role: what it is called, what it is for, and how many people and permissions it has. */
function RoleCard({ role, onOpen }: { role: RoleDto; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${role.name}: open permissions`}
      className={`${CARD} gap-2 border-border bg-surface p-4 hover:border-border-strong hover:shadow-lift`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 text-section font-semibold text-ink-900">{role.name}</span>
        <Tag tone={role.builtIn ? "outline" : "available"}>
          {role.builtIn ? "Built-in" : "Custom"}
        </Tag>
      </span>
      <span className="line-clamp-2 text-small text-ink-700">
        {role.description || "No description."}
      </span>
      <span className="mt-auto pt-2 text-caption text-ink-500 tabular-nums">
        {role.memberCount} {role.memberCount === 1 ? "person" : "people"} ·{" "}
        {role.permissions.length} permissions
      </span>
    </button>
  );
}

const GRID = "grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4";

/** Every role as a card. Selecting one opens its permissions. */
export function RolesGrid({
  roles,
  loading,
  onOpen,
}: {
  roles: RoleDto[];
  loading: boolean;
  onOpen: (slug: string) => void;
}) {
  if (loading && roles.length === 0) {
    return (
      <div className={GRID} aria-busy="true">
        <span className="sr-only">Loading roles…</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-card bg-sunken motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }
  return (
    <ul className={GRID}>
      {roles.map((role) => (
        <li key={role.slug}>
          <RoleCard role={role} onOpen={() => onOpen(role.slug)} />
        </li>
      ))}
    </ul>
  );
}
