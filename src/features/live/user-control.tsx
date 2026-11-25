"use client";

import {
  ArrowRightLeft,
  ArrowUpRight,
  Briefcase,
  Check,
  ChevronRight,
  Copy,
  KeyRound,
  type LucideIcon,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  UserCog,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Field, inputClass, Sheet } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useNow, useResource } from "@/lib/live/client";
import { enforcedPermissions, permissionGroups, permissions } from "@/lib/permissions/catalogue";
import type { RoleDto, RolesDto } from "@/lib/permissions/types";
import { pageAccessFor } from "@/lib/permissions/pages";
import { relativeTime, shortDate } from "@/lib/live/time";
import type { UserAccountDto, UserControlDto, UserKind, UserStatus } from "@/lib/live/types";
import { navigationFor } from "@/lib/navigation";
import { AddTherapist } from "./add-therapist";
import { RolesPermissions } from "./roles-permissions";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

/** The roles an account can hold, for chips, pickers and the effective-permissions list. */
const RolesContext = createContext<RoleDto[]>([]);
const useRoles = () => useContext(RolesContext);

const STATUS_TONE: Record<UserStatus, TagTone> = {
  Active: "healthy",
  "Must set password": "watch",
  "Never signed in": "neutral",
  Deactivated: "over",
};

type TabId = "all" | "staff" | "therapists" | "roles";
const IN_TAB: Record<TabId, (k: UserKind) => boolean> = {
  all: () => true,
  staff: (k) => k === "Office staff",
  therapists: (k) => k === "Therapist",
  roles: () => false,
};

/**
 * User control. The Super Admin sees every account and every role. Someone with "Manage roles"
 * sees the roles only, and switches only the apps they hold themselves.
 */
export function UserControl({
  superAdmin = true,
  heldApps = [],
}: {
  superAdmin?: boolean;
  heldApps?: readonly string[];
}) {
  return superAdmin ? <AccountControl /> : <RoleManager heldApps={heldApps} />;
}

function RoleManager({ heldApps }: { heldApps: readonly string[] }) {
  const rolesResource = useResource<RolesDto>("/api/care/roles", (e) => e.type === "care");
  const roleList = rolesResource.data?.roles ?? [];
  return (
    <RolesContext.Provider value={roleList}>
      <PageHeader
        eyebrow="Administration"
        title="Roles and apps"
        description="Switch the apps you hold on or off for a role. Everything else about a role stays with the Super Admin."
        actions={<LiveBadge />}
      />
      {rolesResource.error && !rolesResource.data ? (
        <ErrorNote message={rolesResource.error} onRetry={rolesResource.reload} />
      ) : (
        <RolesPermissions
          roles={roleList}
          loading={rolesResource.loading && !rolesResource.data}
          onChanged={rolesResource.reload}
          creating={false}
          onCreatingChange={() => undefined}
          superAdmin={false}
          heldApps={heldApps}
        />
      )}
    </RolesContext.Provider>
  );
}

/** Super Admin: every account in Medisense, who can get in, and what each person may do. */
function AccountControl() {
  const { data, error, loading, reload } = useResource<UserControlDto>(
    "/api/care/users",
    (e) => e.type === "care",
  );
  const rolesResource = useResource<RolesDto>("/api/care/roles", (e) => e.type === "care");
  const roleList = rolesResource.data?.roles ?? [];
  const users = data?.users ?? [];
  const count = (f: (u: UserAccountDto) => boolean) => users.filter(f).length;
  const tabs = [
    { id: "all" as const, label: "All staff", count: users.length },
    { id: "staff" as const, label: "Office staff", count: count((u) => IN_TAB.staff(u.kind)) },
    {
      id: "therapists" as const,
      label: "Therapists",
      count: count((u) => IN_TAB.therapists(u.kind)),
    },
    { id: "roles" as const, label: "Roles & permissions", count: roleList.length || undefined },
  ];
  const [tab, setTab] = useTab(tabs, "staff");
  const [creating, setCreating] = useState(false);
  const [creatingRole, setCreatingRole] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const waiting = count((u) => u.status === "Must set password" || u.status === "Never signed in");

  return (
    <RolesContext.Provider value={roleList}>
      <PageHeader
        eyebrow="Administration"
        title="User control"
        description="Staff logins: who can sign in, and what each person is responsible for."
        actions={
          <div className="flex items-center gap-3">
            <LiveBadge />
            <AddTherapist secondary onAdded={reload} />
            <Button onClick={() => setTransferring(true)}>
              <ArrowRightLeft className="size-4" aria-hidden="true" />
              Transfer Super Admin
            </Button>
            {/* One primary action per area: on the roles tab that is the new role. */}
            {tab === "roles" && (
              <Button variant="primary" onClick={() => setCreatingRole(true)}>
                <Plus className="size-4" aria-hidden="true" />
                New role
              </Button>
            )}
            <Button
              variant={tab === "roles" ? undefined : "primary"}
              onClick={() => setCreating(true)}
            >
              <UserPlus className="size-4" aria-hidden="true" />
              Create user
            </Button>
          </div>
        }
      />
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <MetricBand
            size="stat-sm"
            label="Account figures"
            metrics={[
              { label: "Staff logins", value: users.length },
              { label: "Office staff", value: count((u) => u.kind === "Office staff") },
              { label: "Therapists", value: count((u) => u.kind === "Therapist") },
              { label: "Deactivated", value: count((u) => u.status === "Deactivated") },
              {
                label: "Still to sign in",
                value: waiting,
                caption: "Never signed in or must set a password",
                tone: "watch",
                flagged: waiting > 0,
              },
              {
                label: "Super Admin",
                value: data?.superAdmins ?? 0,
                caption: "One for the whole platform",
              },
            ]}
          />
          <div>
            <Tabs label="Accounts" tabs={tabs} value={tab} onChange={setTab} />
            {tabs.map((t) => (
              <TabPanel key={t.id} id={t.id} value={tab}>
                {t.id === "roles" ? (
                  rolesResource.error && !rolesResource.data ? (
                    <ErrorNote message={rolesResource.error} onRetry={rolesResource.reload} />
                  ) : (
                    <RolesPermissions
                      roles={roleList}
                      loading={rolesResource.loading && !rolesResource.data}
                      creating={creatingRole}
                      onCreatingChange={setCreatingRole}
                      onChanged={() => {
                        rolesResource.reload();
                        reload();
                      }}
                    />
                  )
                ) : (
                  <AccountTable
                    rows={users.filter((u) => IN_TAB[t.id](u.kind))}
                    onChanged={reload}
                    onCreate={() => setCreating(true)}
                  />
                )}
              </TabPanel>
            ))}
          </div>
        </div>
      )}
      {creating && <CreateUserSheet onClose={() => setCreating(false)} onCreated={reload} />}
      {transferring && <TransferSheet users={users} onClose={() => setTransferring(false)} />}
    </RolesContext.Provider>
  );
}

type Action = {
  kind: "view" | "access" | "reset" | "deactivate" | "reactivate";
  user: UserAccountDto;
};

/** Each kind of account keeps one colour and icon, in the table and on its profile. */
const KIND_STYLE: Record<UserKind, { icon: LucideIcon; chip: string }> = {
  "Office staff": { icon: Briefcase, chip: "bg-series-1/10 text-series-1" },
  Therapist: { icon: Stethoscope, chip: "bg-series-3/10 text-series-3" },
};

const ROLE_CHIP: Record<string, string> = {
  "Super Admin": "bg-accent-fill text-on-accent",
  "Intake Officer": "bg-series-1/10 text-series-1",
  Scheduler: "bg-series-4/10 text-series-4",
  Finance: "bg-series-3/10 text-series-3",
  "Finance Manager": "bg-series-3/15 text-series-3",
  "Operations Manager": "bg-series-2/10 text-series-2",
  "Clinical Lead": "bg-healthy-bg text-healthy",
};

const HOUR = 3_600_000;

function KindChip({ kind }: { kind: UserKind }) {
  const { icon: Icon, chip } = KIND_STYLE[kind];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-caption font-semibold whitespace-nowrap",
        chip,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {kind}
    </span>
  );
}

function RoleChip({ role }: { role: string }) {
  const name = useRoles().find((r) => r.key === role)?.name ?? role;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-caption font-semibold whitespace-nowrap",
        ROLE_CHIP[role] ?? "bg-sunken text-ink-700",
      )}
    >
      {role === "Super Admin" && <ShieldCheck className="size-3.5" aria-hidden="true" />}
      {name}
    </span>
  );
}

function LastSignIn({ user: u, now }: { user: UserAccountDto; now: number }) {
  if (!u.lastSignInAt) return <span className="text-ink-500">Never</span>;
  const recent = now - new Date(u.lastSignInAt).getTime() < HOUR;
  return (
    <span className="flex items-center gap-1.5" title={shortDate(u.lastSignInAt)}>
      {recent && (
        <span className="size-2 flex-none rounded-full bg-healthy-dot" aria-hidden="true" />
      )}
      {relativeTime(u.lastSignInAt, now)}
    </span>
  );
}

function AccountTable({
  rows: all,
  onChanged,
  onCreate,
}: {
  rows: UserAccountDto[];
  onChanged: () => void;
  onCreate: () => void;
}) {
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const now = useNow() ?? 0;
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((u) => !status || u.status === status)
    .filter(
      (u) =>
        !q ||
        `${u.name} ${u.email} ${u.phone ?? ""} ${u.staffRoles.join(" ")}`.toLowerCase().includes(q),
    );
  const close = () => setAction(null);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <span className="mr-1 text-caption font-semibold tracking-wide text-ink-500 uppercase">
          Filter
        </span>
        <div className="w-52 flex-none">
          <Select
            aria-label="Status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {(Object.keys(STATUS_TONE) as UserStatus[]).map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        {status && (
          <button
            type="button"
            onClick={() => setStatus("")}
            className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
          >
            Clear filter
          </button>
        )}
        <span className="ml-auto text-caption text-ink-500">
          {rows.length} of {all.length}
        </span>
        <label className="flex h-9 w-80 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search accounts"
            placeholder="Name, email, phone or responsibility"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <EmptyNote
            title={all.length ? "No accounts match." : "No accounts here yet."}
            action={
              all.length ? undefined : (
                <Button variant="primary" onClick={onCreate}>
                  Create user
                </Button>
              )
            }
          >
            {all.length ? "Try another filter or search." : "Create the first one to get started."}
          </EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Responsibilities</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Last sign-in</th>
                <th className="px-5 py-3 text-right font-medium">
                  <span className="sr-only">Manage</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setAction({ kind: "view", user: u })}
                  className={cn(
                    "cursor-pointer transition-colors duration-140 hover:bg-sunken",
                    u.status === "Deactivated" && "opacity-65",
                  )}
                >
                  <td className="px-5 py-3.5">
                    <span className="flex items-center gap-3">
                      <span className="relative flex-none">
                        <Avatar name={u.name} size={42} kind="staff" />
                        {u.staffRoles.includes("Super Admin") && (
                          <span
                            title="Super Admin"
                            className="absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-accent-fill text-on-accent"
                          >
                            <ShieldCheck className="size-3" aria-hidden="true" />
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-semibold text-ink-900">
                          {u.name}
                          {u.isSelf && <Tag tone="outline">You</Tag>}
                        </span>
                        <span className="block truncate text-caption text-ink-500">{u.email}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <KindChip kind={u.kind} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Responsibilities user={u} />
                  </td>
                  <td className="px-4 py-3.5">
                    <Tag tone={STATUS_TONE[u.status]}>{u.status}</Tag>
                  </td>
                  <td className="px-4 py-3.5 whitespace-nowrap text-ink-700">
                    <LastSignIn user={u} now={now} />
                    <span className="block text-caption text-ink-500">
                      Created {shortDate(u.createdAt)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <Button
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAction({ kind: "view", user: u });
                      }}
                      aria-label={`Manage ${u.name}`}
                    >
                      Manage
                      <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {action?.kind === "view" && (
        <UserSheet user={action.user} now={now} onClose={close} onAction={setAction} />
      )}
      {action?.kind === "access" && (
        <AccessSheet user={action.user} onClose={close} onSaved={onChanged} />
      )}
      {action?.kind === "reset" && (
        <ResetSheet user={action.user} onClose={close} onDone={onChanged} />
      )}
      {(action?.kind === "deactivate" || action?.kind === "reactivate") && (
        <ActiveSheet
          user={action.user}
          active={action.kind === "reactivate"}
          onClose={close}
          onDone={onChanged}
        />
      )}
    </>
  );
}

function Responsibilities({ user: u }: { user: UserAccountDto }) {
  if (u.kind === "Office staff") {
    return u.staffRoles.length ? (
      <span className="flex flex-wrap gap-1.5">
        {u.staffRoles.map((r) => (
          <RoleChip key={r} role={r} />
        ))}
      </span>
    ) : (
      <span className="text-ink-500">None yet</span>
    );
  }
  return <span className="text-ink-700">Their own patients, visits and notes</span>;
}

/** One person's account: who they are, how they sign in, what they can open, and every action. */
function UserSheet({
  user: u,
  now,
  onClose,
  onAction,
}: {
  user: UserAccountDto;
  now: number;
  onClose: () => void;
  onAction: (a: Action) => void;
}) {
  const staff = u.kind === "Office staff" || u.kind === "Therapist";
  const facts: [string, ReactNode][] = [
    ["Email", u.email],
    ["Phone", u.phone ?? "Not added"],
    ["Signs in with", "Email and password"],
    ["Last sign-in", <LastSignIn key="last" user={u} now={now} />],
    ["Created", `${shortDate(u.createdAt)}${u.createdBy ? ` by ${u.createdBy}` : ""}`],
  ];
  const actions: {
    label: string;
    detail: string;
    icon: LucideIcon;
    go: () => void;
    danger?: boolean;
  }[] = [
    ...(u.kind === "Office staff"
      ? [
          {
            label: "Edit responsibilities",
            detail: "Choose what they're responsible for and see their menu.",
            icon: UserCog,
            go: () => onAction({ kind: "access", user: u }),
          },
        ]
      : []),
    ...(staff && !u.isSelf
      ? [
          {
            label: "Reset password",
            detail: "A new temporary password; they choose their own at sign-in.",
            icon: KeyRound,
            go: () => onAction({ kind: "reset", user: u }),
          },
          u.status === "Deactivated"
            ? {
                label: "Reactivate account",
                detail: "They can sign in again with their existing password.",
                icon: UserCheck,
                go: () => onAction({ kind: "reactivate", user: u }),
              }
            : {
                label: "Deactivate account",
                detail: "For someone who has left. They're signed out everywhere.",
                icon: UserX,
                go: () => onAction({ kind: "deactivate", user: u }),
                danger: true,
              },
        ]
      : []),
  ];

  return (
    <Sheet title={u.name} description="Account details and access." onClose={onClose}>
      <div className="flex flex-col gap-4">
        <section className="flex items-center gap-4 rounded-card bg-ink-900 p-5 text-page">
          <Avatar name={u.name} size={64} kind="staff" className="ring-4 ring-page/20" />
          <div className="min-w-0 flex-1">
            <p className="truncate type-display text-h2 leading-tight">{u.name}</p>
            <p className="truncate text-small opacity-75">{u.email}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Tag tone={STATUS_TONE[u.status]}>{u.status}</Tag>
              <span className="rounded-full bg-page/12 px-2.5 py-0.5 text-caption font-semibold">
                {u.kind}
              </span>
            </div>
          </div>
        </section>

        <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-2.5 rounded-card border border-border bg-surface p-4 text-small">
          {facts.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-ink-500">{k}</dt>
              <dd className="min-w-0 break-words text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>

        {u.kind === "Office staff" && (
          <section className="flex flex-col gap-3">
            <p className="label-caps text-ink-500">Responsibilities</p>
            <Responsibilities user={u} />
            <MenuPreview roles={u.staffRoles} title="What they can open" />
            <EffectivePermissions user={u} />
          </section>
        )}

        {u.isSelf && (
          <p className="rounded-control bg-accent-tint px-3 py-2 text-small text-ink-700">
            This is your own account. Change your password in My profile.
          </p>
        )}

        {(actions.length > 0 || u.href) && (
          <section className="flex flex-col gap-2">
            <p className="label-caps text-ink-500">Actions</p>
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.go}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-card border bg-surface p-3 text-left transition-colors duration-140",
                  a.danger
                    ? "border-border hover:border-over hover:bg-over-bg"
                    : "border-border hover:border-accent hover:bg-accent-tint",
                )}
              >
                <span
                  className={cn(
                    "flex size-9 flex-none items-center justify-center rounded-control",
                    a.danger ? "bg-over-bg text-over" : "bg-accent-tint text-accent",
                  )}
                >
                  <a.icon className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block text-small font-semibold",
                      a.danger ? "text-over" : "text-ink-900",
                    )}
                  >
                    {a.label}
                  </span>
                  <span className="block text-caption text-ink-500">{a.detail}</span>
                </span>
                <ChevronRight className="size-4 flex-none text-ink-500" aria-hidden="true" />
              </button>
            ))}
            {u.href && (
              <Link
                href={u.href}
                className="flex items-center gap-3 rounded-card border border-border bg-surface p-3 text-left text-ink-900 transition-colors duration-140 hover:border-accent hover:bg-accent-tint hover:no-underline"
              >
                <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
                  <ArrowUpRight className="size-4.5" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold">Open their record</span>
                  <span className="block text-caption text-ink-500">
                    Their staff record, caseload and credentials
                  </span>
                </span>
                <ChevronRight className="size-4 flex-none text-ink-500" aria-hidden="true" />
              </Link>
            )}
          </section>
        )}
      </div>
    </Sheet>
  );
}

/** The menu a set of responsibilities opens, worked out exactly as the real sidebar does. */
function MenuPreview({ roles, title }: { roles: string[]; title: string }) {
  const known = useRoles();
  // The menu follows the permissions the chosen roles grant, as the real sidebar does.
  const permissions = [
    ...new Set(known.filter((r) => roles.includes(r.key)).flatMap((r) => r.permissions)),
  ];
  const staffRoles = roles.includes("Super Admin") ? ["Super Admin"] : [];
  const menu = roles.length
    ? navigationFor("Admin", pageAccessFor({ permissions, staffRoles }), { liveOnly: true })
    : [];
  return (
    <section aria-label={title} className="rounded-card border border-border bg-sunken p-4">
      <p className="label-caps text-ink-500">{title}</p>
      {menu.length === 0 ? (
        <p className="mt-2 text-small text-ink-500">
          Choose a responsibility to preview their menu.
        </p>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          {menu.map((g) => (
            <div key={g.group} className="min-w-0">
              <p className="text-caption font-semibold text-ink-900">{g.group}</p>
              <ul className="mt-1 flex flex-col gap-0.5">
                {g.items.map((i) => (
                  <li key={i.href} className="flex items-center gap-1.5 text-caption text-ink-700">
                    <i.icon className="size-3.5 flex-none text-ink-500" aria-hidden="true" />
                    <span className="truncate">{i.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Tick cards for responsibilities, beside a live preview of the menu they open. */
function RolePicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const roles = useRoles();
  const toggle = (r: string) =>
    onChange(value.includes(r) ? value.filter((x) => x !== r) : [...value, r]);
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-caption font-semibold text-ink-700">Responsibilities</legend>
        {roles.map((role) => {
          const r = role.key;
          const on = value.includes(r);
          return (
            <label
              key={role.slug}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 transition-colors duration-140",
                on ? "border-accent bg-accent-tint" : "border-border hover:border-border-strong",
              )}
            >
              <input
                type="checkbox"
                checked={on}
                onChange={() => toggle(r)}
                className="mt-0.5 size-4 flex-none accent-accent-fill"
              />
              <span className="min-w-0">
                <span className="block text-small font-semibold text-ink-900">{role.name}</span>
                <span className="block text-caption text-ink-500">{role.description}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      <MenuPreview roles={value} title="What they'll see" />
    </div>
  );
}

function PasswordReveal({
  email,
  password,
  name,
}: {
  email?: string;
  password: string;
  name: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-4 text-small">
      <p className="text-ink-700">
        Give {name.split(" ")[0]} these details in person or by phone. The temporary password is
        shown only once, and they choose their own password the first time they sign in.
      </p>
      <dl className="grid grid-cols-[110px_1fr] items-center gap-y-3 rounded-card border border-border bg-sunken p-4">
        {email && (
          <>
            <dt className="text-ink-500">Email</dt>
            <dd className="font-semibold text-ink-900">{email}</dd>
          </>
        )}
        <dt className="text-ink-500">Password</dt>
        <dd className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-body font-semibold tracking-wider text-ink-900">
            {password}
          </span>
          <Button
            size="sm"
            onClick={() => {
              void navigator.clipboard?.writeText(password);
              setCopied(true);
            }}
          >
            {copied ? (
              <Check className="size-3.5" aria-hidden="true" />
            ) : (
              <Copy className="size-3.5" aria-hidden="true" />
            )}
            {copied ? "Copied" : "Copy"}
          </Button>
        </dd>
      </dl>
    </div>
  );
}

function CreateUserSheet({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; temporaryPassword: string } | null>(null);

  async function submit() {
    setError(null);
    if (name.trim().length < 3) return setError("Enter their full name.");
    if (!email.includes("@")) return setError("Enter their work email.");
    if (!roles.length) return setError("Choose at least one responsibility.");
    setBusy(true);
    try {
      const result = await api<{ email: string; temporaryPassword: string }>("/api/care/users", {
        body: { name, email, phone, staffRoles: roles },
      });
      setCreated(result);
      onCreated();
      toast(`${name} can now sign in`, { detail: "Pass on the temporary password." });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the user.");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <Sheet
        title={`${name} has been created`}
        description="Their account is ready."
        onClose={onClose}
        footer={
          <>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
            <Button
              onClick={() => {
                setCreated(null);
                setName("");
                setEmail("");
                setPhone("");
                setRoles([]);
              }}
            >
              Create another
            </Button>
          </>
        }
      >
        <PasswordReveal email={created.email} password={created.temporaryPassword} name={name} />
      </Sheet>
    );
  }

  return (
    <Sheet
      title="Create user"
      description="An office staff account. Therapists are added with Add therapist, which also takes their credentials."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy} onClick={submit}>
            {busy ? "Creating…" : "Create user"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Full name">
          <input
            className={inputClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Priya Raman"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Work email" hint="They sign in with this.">
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@medisense.com.au"
            />
          </Field>
          <Field label="Phone (optional)">
            <input
              className={inputClass}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="04xx xxx xxx"
            />
          </Field>
        </div>
        <RolePicker value={roles} onChange={setRoles} />
        {error && (
          <p role="alert" className="text-small font-medium text-over">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function AccessSheet({
  user,
  onClose,
  onSaved,
}: {
  user: UserAccountDto;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [roles, setRoles] = useState<string[]>(user.staffRoles.filter((r) => r !== "Super Admin"));
  const isOwner = user.staffRoles.includes("Super Admin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/users/${user.id}`, { method: "PATCH", body: { staffRoles: roles } });
      toast(`${user.name}'s responsibilities saved`, {
        detail: "Their menu changes on their next page.",
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`${user.name}'s responsibilities`}
      description={
        isOwner
          ? "Super Admin is always kept. These are their other responsibilities."
          : "These decide which menus and pages they get."
      }
      onClose={onClose}
      footer={
        <>
          <Button
            variant="primary"
            disabled={busy || (!isOwner && roles.length === 0)}
            onClick={save}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <RolePicker value={roles} onChange={setRoles} />
      {error && (
        <p role="alert" className="mt-3 text-small font-medium text-over">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function ResetSheet({
  user,
  onClose,
  onDone,
}: {
  user: UserAccountDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [temporary, setTemporary] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = user.name.split(" ")[0];

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ temporaryPassword: string }>(
        `/api/care/users/${user.id}/reset-password`,
        {
          method: "POST",
        },
      );
      setTemporary(r.temporaryPassword);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reset the password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={`Reset ${first}'s password`}
      description="For when someone can't sign in."
      onClose={onClose}
      footer={
        temporary ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="primary" disabled={busy} onClick={reset}>
              {busy ? "Resetting…" : "Reset password"}
            </Button>
            <Button onClick={onClose}>Cancel</Button>
          </>
        )
      }
    >
      {temporary ? (
        <PasswordReveal email={user.email} password={temporary} name={user.name} />
      ) : (
        <ul className="list-disc pl-5 text-small text-ink-700">
          <li>{first}&apos;s current password stops working straight away.</li>
          <li>They&apos;re signed out on every device.</li>
          <li>You&apos;ll see a temporary password once; they set their own when they sign in.</li>
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-3 text-small font-medium text-over">
          {error}
        </p>
      )}
    </Sheet>
  );
}

function ActiveSheet({
  user,
  active,
  onClose,
  onDone,
}: {
  user: UserAccountDto;
  active: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sure, setSure] = useState(active);
  const first = user.name.split(" ")[0];

  async function apply() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/care/users/${user.id}`, { method: "PATCH", body: { active } });
      toast(active ? `${user.name} can sign in again` : `${user.name} has been deactivated`, {
        tone: active ? "success" : "info",
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update the account.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={active ? `Reactivate ${first}` : `Deactivate ${first}`}
      description={
        active
          ? "They can sign in again with their existing password."
          : "For someone who has left."
      }
      onClose={onClose}
      footer={
        <>
          <Button variant={active ? "primary" : "danger"} disabled={busy || !sure} onClick={apply}>
            {busy ? "Saving…" : active ? "Reactivate" : "Deactivate"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      {active ? (
        <p className="text-small text-ink-700">
          {first} gets back the access their responsibilities give
          {user.kind === "Therapist" ? ", and is offered for new patients again" : ""}.
        </p>
      ) : (
        <div className="flex flex-col gap-4 text-small text-ink-700">
          <ul className="list-disc pl-5">
            <li>{first} is signed out on every device and can&apos;t sign in.</li>
            {user.kind === "Therapist" && (
              <li>They&apos;re no longer offered for new patients or bookings.</li>
            )}
            <li>Their records and history stay, and you can reactivate them at any time.</li>
          </ul>
          <label className="flex cursor-pointer items-start gap-3 rounded-control border border-border px-3 py-2.5">
            <input
              type="checkbox"
              checked={sure}
              onChange={(e) => setSure(e.target.checked)}
              className="mt-0.5 size-4 flex-none accent-accent-fill"
            />
            <span>I want to deactivate {user.name}&apos;s account.</span>
          </label>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-small font-medium text-over">
          {error}
        </p>
      )}
    </Sheet>
  );
}

/** Hands the single Super Admin role to another active office-staff account. */
function TransferSheet({ users, onClose }: { users: UserAccountDto[]; onClose: () => void }) {
  const eligible = users.filter(
    (u) => u.kind === "Office staff" && u.status === "Active" && !u.isSelf,
  );
  const me = users.find((u) => u.isSelf);
  const keeps = (me?.staffRoles ?? []).filter((r) => r !== "Super Admin");
  const [targetId, setTargetId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = eligible.find((u) => u.id === targetId);

  async function submit() {
    setError(null);
    if (!target) return setError("Choose who becomes the Super Admin.");
    if (!password) return setError("Enter your password.");
    if (confirmName.trim().toLowerCase() !== target.name.toLowerCase()) {
      return setError(`Type ${target.name} to confirm.`);
    }
    setBusy(true);
    try {
      await api("/api/care/super-admin/transfer", {
        method: "POST",
        body: { targetId, password, confirmName },
      });
      toast(`${target.name} is now the Super Admin`, {
        detail: "Your own access now follows your other responsibilities.",
      });
      // Your access just changed. Reloading refreshes the menu and sends you to your own home.
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't transfer.");
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Transfer Super Admin"
      description="There is one Super Admin for the whole platform. This hands it to someone else."
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" disabled={busy || !target} onClick={submit}>
            {busy ? "Transferring…" : "Transfer Super Admin"}
          </Button>
          <Button onClick={onClose}>Cancel</Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-control border border-border bg-sunken p-3 text-small text-ink-700">
          You lose Super Admin straight away.{" "}
          {keeps.length
            ? `You keep: ${keeps.join(", ")}.`
            : "You keep no other responsibilities, so you will have no permissions until the new Super Admin gives you some."}
        </p>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-caption font-semibold text-ink-700">New Super Admin</legend>
          {eligible.length === 0 ? (
            <p className="text-small text-ink-500">
              No one can take it yet. They must be an active office-staff account that has signed in
              and set their own password.
            </p>
          ) : (
            <div role="radiogroup" className="flex max-h-64 flex-col gap-2 overflow-y-auto">
              {eligible.map((u) => (
                <label
                  key={u.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-control border px-3 py-2.5 transition-colors duration-140",
                    targetId === u.id
                      ? "border-accent bg-accent-tint"
                      : "border-border hover:border-border-strong",
                  )}
                >
                  <input
                    type="radio"
                    name="new-super-admin"
                    checked={targetId === u.id}
                    onChange={() => setTargetId(u.id)}
                    className="mt-0.5 size-4 flex-none accent-accent-fill"
                  />
                  <span className="min-w-0">
                    <span className="block text-small font-semibold text-ink-900">{u.name}</span>
                    <span className="block text-caption text-ink-500">
                      {u.staffRoles.length ? u.staffRoles.join(", ") : "No responsibilities yet"}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </fieldset>
        <Field label="Your password" hint="To confirm it is you.">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field
          label={target ? `Type "${target.name}" to confirm` : "Type the new Super Admin's name"}
        >
          <input
            className={inputClass}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            autoComplete="off"
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

/** Every permission a person holds and which role grants it, so access is never a guess. */
function EffectivePermissions({ user: u }: { user: UserAccountDto }) {
  const roles = useRoles();
  const owner = u.staffRoles.includes("Super Admin");
  const held = roles.filter((r) => u.staffRoles.includes(r.key) || u.staffRoles.includes(r.slug));
  const grantedBy = (id: string) =>
    held.filter((r) => r.permissions.includes(id)).map((r) => r.name);
  const total = owner
    ? permissions.length
    : permissions.filter((p) => grantedBy(p.id).length).length;
  return (
    <details className="rounded-card border border-border bg-surface">
      <summary className="cursor-pointer px-4 py-3 text-small font-semibold text-ink-900">
        What they can do ({total} of {permissions.length})
      </summary>
      <div className="flex flex-col gap-4 px-4 pb-4">
        <p className="text-caption text-ink-500">
          {owner
            ? "The Super Admin holds every permission."
            : "The union of everything their roles allow. A change to a role applies on their next request."}
        </p>
        {permissionGroups.map((group) => {
          const rows = permissions.filter(
            (p) => p.group === group && (owner || grantedBy(p.id).length),
          );
          if (rows.length === 0) return null;
          return (
            <section key={group}>
              <p className="label-caps text-ink-500">{group}</p>
              <ul className="mt-1 flex flex-col gap-1">
                {rows.map((p) => (
                  <li key={p.id} className="flex items-baseline justify-between gap-3 text-caption">
                    <span className="text-ink-900">
                      {p.label}
                      {!enforcedPermissions.includes(p.id) && (
                        <span className="ml-1.5 text-ink-500">· not enforced yet</span>
                      )}
                    </span>
                    <span className="flex-none text-ink-500">
                      {owner ? "Super Admin" : grantedBy(p.id).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </details>
  );
}
