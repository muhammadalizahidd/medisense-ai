"use client";

import { Lock, RotateCcw, SearchX, Trash2, UserCog } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { SearchField } from "@/components/ui/search-field";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import { alwaysEnforced } from "@/lib/permissions/always-enforced";
import {
  defaultPermissionsFor,
  permissions,
  type BuiltInRoleSlug,
} from "@/lib/permissions/catalogue";
import {
  changeSummary,
  groupPermissions,
  distribute,
  reportMatrix,
  sameSet,
  setMany,
  toggled,
  type PermissionMode,
} from "@/lib/permissions/role-view";
import type { RoleDto } from "@/lib/permissions/types";
import { PermissionGroupCard, ReportsCard } from "./permission-group-card";
import { DeleteSheet, DetailsSheet, ReviewSheet, UnsavedPrompt } from "./role-sheets";

const reportPermissions = permissions.filter((p) => p.group === "Reports");

/** Three columns on a wide screen, two on a tablet, one on a phone. */
const WIDE = "(min-width: 1280px)";
const MEDIUM = "(min-width: 768px)";
function subscribeToWidth(onChange: () => void) {
  const lists = [window.matchMedia(WIDE), window.matchMedia(MEDIUM)];
  lists.forEach((l) => l.addEventListener("change", onChange));
  return () => lists.forEach((l) => l.removeEventListener("change", onChange));
}
const columnCount = () =>
  window.matchMedia(WIDE).matches ? 3 : window.matchMedia(MEDIUM).matches ? 2 : 1;
/** The dialog only opens after the page has loaded in the browser, so the width is always known. */
const useColumns = () => useSyncExternalStore(subscribeToWidth, columnCount, () => 1);

async function reset(role: RoleDto, onChanged: () => void) {
  try {
    await api(`/api/care/roles/${role.slug}/reset`, { method: "POST" });
    toast(`${role.name} is back to its defaults`);
    onChanged();
  } catch (e) {
    toast("Couldn't reset the role", { detail: e instanceof Error ? e.message : undefined });
  }
}

/**
 * One role in a large dialog: every permission in grouped cards, a filter, and a draft that only
 * becomes real when it is reviewed and saved. Closing with unsaved changes asks first.
 */
export function RoleDialog({
  role,
  onClose,
  onChanged,
  onDeleted,
}: {
  role: RoleDto;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  // null means "no edits yet": the draft is whatever is saved, so a save or a reload needs no reset.
  const [edits, setEdits] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<PermissionMode>("all");
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [asking, setAsking] = useState(false);

  const saved = new Set(role.permissions);
  const draft = edits ?? saved;
  const defaults = role.builtIn
    ? new Set(defaultPermissionsFor(role.slug as BuiltInRoleSlug))
    : null;
  const { added, removed } = changeSummary(role.permissions, draft);
  const changes = added.length + removed.length;
  const dirty = changes > 0;
  const atDefault = defaults ? sameSet(saved, [...defaults]) : false;

  const apply = (next: Set<string>) => setEdits(sameSet(next, role.permissions) ? null : next);
  const toggle = (id: string) => apply(toggled(draft, id));
  const setGroup = (ids: string[], on: boolean) => apply(setMany(draft, ids, on));

  const groups = groupPermissions(draft, query, mode).filter((g) => g.group !== "Reports");
  const matrix = reportMatrix(draft, query, mode);
  const showReports = matrix.rows.length + matrix.extras.length > 0;
  const reportsAllowed = reportPermissions.filter((p) => draft.has(p.id)).length;
  const shown =
    groups.reduce((n, g) => n + g.items.length, 0) + matrix.extras.length + matrix.rows.length * 2;
  const filtering = query.trim() !== "" || mode !== "all";

  const requestClose = () => (dirty ? setAsking(true) : onClose());

  // Cards pack straight up under each other in their column, and the last one in each column
  // stretches, so the columns end level just above Reports.
  const columns = useColumns();
  const placed = distribute(
    groups.map((g) => g.items.length + 1.5),
    columns,
  );

  return (
    <>
      <Dialog
        title={role.name}
        description={role.description || "No description."}
        onRequestClose={requestClose}
        meta={
          <>
            <Tag tone={role.builtIn ? "outline" : "available"}>
              {role.builtIn ? "Built-in" : "Custom"}
            </Tag>
            <span className="text-caption text-ink-500">
              {role.memberCount} {role.memberCount === 1 ? "person holds" : "people hold"} this role
              {role.updatedBy ? ` · last changed by ${role.updatedBy}` : ""}
            </span>
          </>
        }
        actions={
          <>
            <Button size="sm" onClick={() => setEditing(true)}>
              <UserCog className="size-4" aria-hidden="true" />
              Edit details
            </Button>
            {role.builtIn ? (
              <Button
                size="sm"
                disabled={atDefault || dirty}
                title={dirty ? "Save or discard your changes first" : undefined}
                onClick={() => reset(role, onChanged)}
              >
                <RotateCcw className="size-4" aria-hidden="true" />
                Reset to default
              </Button>
            ) : (
              <Button
                size="sm"
                variant="danger"
                disabled={role.memberCount > 0}
                title={
                  role.memberCount > 0
                    ? `Take this role off the ${role.memberCount} ${role.memberCount === 1 ? "person" : "people"} who hold it first`
                    : undefined
                }
                onClick={() => setDeleting(true)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
                Delete
              </Button>
            )}
          </>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <SearchField
              label="Filter permissions"
              placeholder="Filter permissions"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-72"
            />
            <Segmented
              label="Show"
              value={mode}
              onChange={setMode}
              options={[
                { id: "all", label: "All" },
                { id: "allowed", label: "Allowed" },
                { id: "not-allowed", label: "Not allowed" },
              ]}
            />
            <p className="text-small text-ink-700 tabular-nums sm:ml-auto">
              <span className="font-semibold text-ink-900">{draft.size}</span> of{" "}
              {permissions.length} allowed
            </p>
          </div>
        }
        footer={
          dirty ? (
            <>
              <p className="text-small text-ink-900">
                <span className="font-semibold">
                  {changes} unsaved {changes === 1 ? "change" : "changes"}
                </span>{" "}
                to {role.name}
              </p>
              <div className="flex items-center gap-2">
                <Button onClick={() => setEdits(null)}>Discard</Button>
                <Button variant="primary" onClick={() => setReviewing(true)}>
                  Review and save
                </Button>
              </div>
            </>
          ) : undefined
        }
      >
        <p className="sr-only" aria-live="polite">
          {shown} permissions shown
        </p>
        {shown === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-border-strong bg-surface px-6 py-12 text-center">
            <SearchX className="size-6 text-ink-500" aria-hidden="true" />
            <p className="text-small text-ink-700">No permissions match this filter.</p>
            <Button
              size="sm"
              onClick={() => {
                setQuery("");
                setMode("all");
              }}
            >
              Clear filter
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div
              className="grid items-stretch gap-4"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {placed.map((indexes, column) => (
                <div key={column} className="flex min-w-0 flex-col gap-4">
                  {indexes.map((index, position) => {
                    const view = groups[index]!;
                    return (
                      <PermissionGroupCard
                        key={view.group}
                        view={view}
                        grow={columns > 1 && position === indexes.length - 1}
                        saved={saved}
                        defaults={defaults}
                        draft={draft}
                        onToggle={toggle}
                        onSetMany={setGroup}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
            {showReports && (
              <ReportsCard
                rows={matrix.rows}
                extras={matrix.extras}
                allowed={reportsAllowed}
                total={reportPermissions.length}
                saved={saved}
                defaults={defaults}
                draft={draft}
                onToggle={toggle}
                onSetMany={setGroup}
              />
            )}
          </div>
        )}

        {!filtering && (
          <details className="mt-4 overflow-hidden rounded-card border border-border bg-surface">
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-small font-semibold text-ink-900">
              <Lock className="size-4 text-ink-500" aria-hidden="true" />
              Always enforced ({alwaysEnforced.length})
            </summary>
            <p className="px-4 text-caption text-ink-500">
              These protect patients and the record. They have no switch because no role changes
              them.
            </p>
            <ul className="grid divide-y divide-border px-4 pb-2 lg:grid-cols-2 lg:gap-x-8">
              {alwaysEnforced.map((rule) => (
                <li key={rule.title} className="py-3">
                  <p className="text-small font-semibold text-ink-900">{rule.title}</p>
                  <p className="mt-0.5 text-caption text-ink-500">{rule.detail}</p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Dialog>

      {asking && (
        <UnsavedPrompt
          roleName={role.name}
          count={changes}
          onKeep={() => setAsking(false)}
          onDiscard={() => {
            setEdits(null);
            setAsking(false);
            onClose();
          }}
          onSave={() => {
            setAsking(false);
            setReviewing(true);
          }}
        />
      )}
      {reviewing && (
        <ReviewSheet
          role={role}
          added={added.map((p) => p.label)}
          removed={removed.map((p) => p.label)}
          permissionsToSave={permissions.filter((p) => draft.has(p.id)).map((p) => p.id)}
          onClose={() => setReviewing(false)}
          onSaved={() => {
            setEdits(null);
            setReviewing(false);
            onChanged();
          }}
        />
      )}
      {editing && (
        <DetailsSheet
          role={role}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            onChanged();
          }}
        />
      )}
      {deleting && (
        <DeleteSheet
          role={role}
          onClose={() => setDeleting(false)}
          onDeleted={() => {
            setDeleting(false);
            onDeleted();
          }}
        />
      )}
    </>
  );
}
