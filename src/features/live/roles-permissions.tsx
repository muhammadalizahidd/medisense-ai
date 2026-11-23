"use client";

import { Lock } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { RoleDto } from "@/lib/permissions/types";
import { RoleDialog } from "./role-dialog";
import { RolesGrid } from "./roles-grid";
import { NewRoleSheet } from "./role-sheets";

/**
 * Which role is open, kept in the address (?role=…) so a refresh or a shared link reopens the same
 * dialog. Starts closed, as the server renders it, then reads the address once after mount.
 */
function useOpenRole() {
  const [slug, setSlug] = useState<string | null>(null);
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("role");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read the address once after mount
    if (wanted) setSlug(wanted);
  }, []);
  const set = useCallback((next: string | null) => {
    setSlug(next);
    const url = new URL(window.location.href);
    if (next) url.searchParams.set("role", next);
    else url.searchParams.delete("role");
    window.history.replaceState(window.history.state, "", url);
  }, []);
  return [slug, set] as const;
}

/** The Roles & permissions tab: every role as a card; selecting one opens its permissions. */
export function RolesPermissions({
  roles,
  loading,
  onChanged,
  creating,
  onCreatingChange,
}: {
  roles: RoleDto[];
  loading: boolean;
  onChanged: () => void;
  /** The New role sheet is opened from the page header, so the parent owns this. */
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
}) {
  const [openSlug, setOpenSlug] = useOpenRole();
  const open = roles.find((r) => r.slug === openSlug);

  return (
    <div className="mt-5">
      <RolesGrid roles={roles} loading={loading} onOpen={setOpenSlug} />
      <p className="mt-5 flex items-start gap-2 text-caption text-ink-500">
        <Lock className="mt-0.5 size-3.5 flex-none" aria-hidden="true" />
        The Super Admin is not a role. It holds every permission and moves only through a transfer.
      </p>

      {open && (
        <RoleDialog
          role={open}
          onClose={() => setOpenSlug(null)}
          onChanged={onChanged}
          onDeleted={() => {
            setOpenSlug(null);
            onChanged();
          }}
        />
      )}
      {creating && (
        <NewRoleSheet
          roles={roles}
          onClose={() => onCreatingChange(false)}
          onCreated={(slug) => {
            onCreatingChange(false);
            setOpenSlug(slug);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
