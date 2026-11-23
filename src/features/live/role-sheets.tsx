"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Field, inputClass, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api } from "@/lib/live/client";
import type { RoleDto } from "@/lib/permissions/types";

export function ReviewSheet({
  role,
  added,
  removed,
  permissionsToSave,
  onClose,
  onSaved,
}: {
  role: RoleDto;
  added: string[];
  removed: string[];
  permissionsToSave: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/roles/${role.slug}`, {
        method: "PATCH",
        body: { permissions: permissionsToSave },
      });
      toast(`${role.name} saved`, { detail: "Recorded in the audit trail." });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }

  const people = `${role.memberCount} ${role.memberCount === 1 ? "person holds" : "people hold"} this role`;
  return (
    <Sheet
      above
      title={`Save changes to ${role.name}`}
      description={`${people}. The change applies to them on their next request.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button onClick={onClose}>Back</Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <ChangeList title="Will be allowed" items={added} tone="healthy" />
        <ChangeList title="Will be removed" items={removed} tone="over" />
        {error && (
          <p role="alert" className="text-small font-medium text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function ChangeList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "healthy" | "over";
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-2 text-small font-semibold text-ink-900">
        <Tag tone={tone}>{items.length}</Tag>
        {title}
      </h3>
      <ul className="flex flex-col gap-1.5 text-small text-ink-700">
        {items.map((label) => (
          <li key={label} className="rounded-control border border-border bg-surface px-3 py-2">
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DetailsSheet({
  role,
  onClose,
  onSaved,
}: {
  role: RoleDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/roles/${role.slug}`, { method: "PATCH", body: { name, description } });
      toast("Role details saved");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      above
      title={`Edit ${role.name}`}
      description={
        role.builtIn
          ? "You can rename a built-in role. People who hold it keep it, and nothing about their access changes."
          : "The name and description people see."
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="Up to 200 characters.">
          <textarea
            className={cn(inputClass, "min-h-24 py-2")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        {error && (
          <p role="alert" className="text-small font-medium text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function NewRoleSheet({
  roles,
  onClose,
  onCreated,
}: {
  roles: RoleDto[];
  onClose: () => void;
  onCreated: (slug: string) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [copyFrom, setCopyFrom] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ slug: string }>("/api/care/roles", {
        method: "POST",
        body: { name, description, ...(copyFrom ? { copyFrom } : {}) },
      });
      toast(`${name} created`, { detail: "Choose what it allows, then give it to people." });
      onCreated(result.slug);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the role.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="New role"
      description="A role is a set of permissions you can give to office staff."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy || name.trim().length < 3} onClick={create}>
            {busy ? "Creating…" : "Create role"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name" hint="For example Referral Coordinator.">
          <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description (optional)">
          <textarea
            className={cn(inputClass, "min-h-20 py-2")}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>
        <Field label="Start from" hint="Copy another role's permissions, or begin with none.">
          <Select
            aria-label="Start from"
            value={copyFrom}
            onChange={(e) => setCopyFrom(e.target.value)}
          >
            <option value="">No permissions</option>
            {roles.map((r) => (
              <option key={r.slug} value={r.slug}>
                Copy {r.name}
              </option>
            ))}
          </Select>
        </Field>
        {error && (
          <p role="alert" className="text-small font-medium text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

export function DeleteSheet({
  role,
  onClose,
  onDeleted,
}: {
  role: RoleDto;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/roles/${role.slug}`, { method: "DELETE" });
      toast(`${role.name} deleted`);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't delete the role.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      above
      title={`Delete ${role.name}?`}
      description="Nobody holds this role. Deleting it can't be undone, though it stays in the audit trail."
      onClose={onClose}
      footer={
        <>
          <Button variant="soft-danger" disabled={busy} onClick={remove}>
            {busy ? "Deleting…" : "Delete role"}
          </Button>
          <Button onClick={onClose}>Keep it</Button>
        </>
      }
    >
      {error && (
        <p role="alert" className="text-small font-medium text-over">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** Shown when a dialog with unsaved changes is closed: keep editing, throw them away, or save. */
export function UnsavedPrompt({
  roleName,
  count,
  onKeep,
  onDiscard,
  onSave,
}: {
  roleName: string;
  count: number;
  onKeep: () => void;
  onDiscard: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      title="Unsaved changes"
      description={`You have ${count} unsaved ${count === 1 ? "change" : "changes"} to ${roleName}.`}
      size="sm"
      above
      onRequestClose={onKeep}
      footer={
        <>
          <Button variant="danger" onClick={onDiscard}>
            Discard changes
          </Button>
          <div className="flex items-center gap-2">
            <Button data-autofocus onClick={onKeep}>
              Keep editing
            </Button>
            <Button variant="primary" onClick={onSave}>
              Review and save
            </Button>
          </div>
        </>
      }
    >
      <p className="text-small text-ink-700">
        If you close now, the toggles you changed go back to what is saved.
      </p>
    </Dialog>
  );
}
