"use client";

import {
  BadgeCheck,
  Briefcase,
  CalendarDays,
  Car,
  Check,
  CircleAlert,
  Clock,
  Copy,
  FileCheck2,
  FileText,
  GraduationCap,
  Languages,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Field, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { disciplines } from "@/lib/live/catalogue";
import { api, useResource } from "@/lib/live/client";
import {
  competencyStatuses,
  credentialKinds,
  employmentTypes,
  engagementStatuses,
  primaryLocations,
  travelModes,
  travelWillingness,
  workSettings,
  type CompetencyStatus,
  type CoverageInput,
  type CredentialInput,
  type StaffCompetencyDto,
  type StaffCredentialDto,
  type StaffProfileInput,
  type StaffRecordDto,
} from "@/lib/live/staff";
import { relativeTime, shortDate } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { Choice, TextArea, TextField, Tick } from "./form-bits";

export type StaffAct = (body: Record<string, unknown>) => Promise<boolean>;

export const engagementTone = {
  Invited: "monitor",
  "Pending Verification": "watch",
  Active: "healthy",
  "On Leave": "watch",
  Suspended: "over",
  Inactive: "neutral",
  Archived: "neutral",
} as const;

const credentialTone = {
  "Not Submitted": "neutral",
  "Awaiting Review": "watch",
  "Under Review": "monitor",
  Verified: "healthy",
  Rejected: "over",
  Expired: "over",
} as const;

const competencyTone = {
  Approved: "healthy",
  Pending: "watch",
  Suspended: "over",
  "Not approved": "neutral",
} as const;

const date = (iso: string) => (iso ? shortDate(`${iso}T00:00:00Z`) : "No expiry");

export function useStaff(id: string, onChanged?: () => void) {
  const resource = useResource<{ staff: StaffRecordDto }>(
    `/api/care/therapists/${id}/staff`,
    (e) => e.type === "care",
  );
  const [busy, setBusy] = useState(false);
  const act: StaffAct = async (body) => {
    setBusy(true);
    try {
      const r = await api<{ warning?: string }>(`/api/care/therapists/${id}/staff`, { body });
      toast(r.warning ? "Saved, with a follow-up" : "Saved", {
        tone: r.warning ? "warning" : "success",
        detail: r.warning,
      });
      resource.reload();
      onChanged?.();
      return true;
    } catch (e) {
      toast("Couldn't save", {
        tone: "error",
        detail: e instanceof Error ? e.message : "Try again.",
      });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { ...resource, busy, act };
}

/* ------------------------------------------------------------- identity */

function CopyId({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title="Copy staff ID"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      className="group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5 font-mono text-caption font-semibold text-ink-900 transition-all duration-(--duration-fast) hover:border-accent hover:text-accent active:scale-95"
    >
      {value}
      {copied ? (
        <Check className="size-3.5 text-healthy" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 text-ink-500 group-hover:text-accent" aria-hidden="true" />
      )}
    </button>
  );
}

const linkButton =
  "inline-flex h-9 items-center gap-1.5 rounded-control border border-border-strong px-3 text-caption font-semibold text-ink-900 transition-all duration-(--duration-fast) hover:-translate-y-px hover:border-accent hover:text-accent hover:no-underline active:scale-95";

/** Who the staff member is, whether they can take new patients, and the four key figures. */
export function StaffIdentity({
  s,
  busy,
  act,
}: {
  s: StaffRecordDto;
  busy: boolean;
  act: StaffAct;
}) {
  const [changing, setChanging] = useState(false);
  const verified = s.credentials.filter((c) => c.status === "Verified").length;
  const approved = s.competencies.filter((c) => c.status === "Approved").length;
  const tiles: { label: string; value: string; sub: string; icon: LucideIcon; tone?: "over" }[] = [
    {
      label: "Approved services",
      value: `${approved} of ${s.competencies.length}`,
      sub:
        s.competencies
          .filter((c) => c.status === "Approved")
          .map((c) => c.support)
          .slice(0, 2)
          .join(", ") || "None yet",
      icon: Stethoscope,
    },
    {
      label: "Credentials",
      value: `${verified} of ${s.credentials.length} verified`,
      sub: s.credentials.some((c) => c.status === "Expired")
        ? "One or more expired"
        : "Register up to date",
      icon: FileCheck2,
      tone: s.credentials.some(
        (c) => c.status === "Expired" || (c.required && c.status !== "Verified"),
      )
        ? "over"
        : undefined,
    },
    {
      label: "Available this week",
      value: `${s.capacity.available} h`,
      sub: `${s.capacity.utilisation}% committed of ${s.capacity.contracted} h`,
      icon: Clock,
      tone: s.capacity.over ? "over" : undefined,
    },
    {
      label: "Caseload",
      value: `${s.capacity.activePatients} patients`,
      sub: `${s.capacity.pendingNotes} notes to finish`,
      icon: UserCheck,
    },
  ];
  return (
    <section className="mb-6 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <div className="flex flex-wrap items-start gap-5 p-6">
        <div className="relative flex-none">
          <Avatar name={s.name} size={72} className="ring-4 ring-accent-tint" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-[3px] border-surface",
              s.status === "Active"
                ? "bg-healthy-dot"
                : s.status === "On Leave"
                  ? "bg-watch-dot"
                  : "bg-over-dot",
            )}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="type-display text-h1 leading-tight text-ink-900">
              {s.profile.displayName || s.name}
            </h2>
            <Tag tone={engagementTone[s.status]}>{s.status}</Tag>
            <Tag tone="outline">{s.seniority}</Tag>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-700">
            <CopyId value={s.staffId} />
            <span className="inline-flex items-center gap-1.5">
              <Briefcase className="size-4 text-ink-500" aria-hidden="true" />
              {s.profile.jobTitle} · {s.profile.employmentType}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4 text-ink-500" aria-hidden="true" />
              {s.region}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-ink-500" aria-hidden="true" />
              {s.profile.supervisorName
                ? `Supervised by ${s.profile.supervisorName}`
                : "No supervisor set"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {s.phone && (
            <a href={`tel:${s.phone.replace(/\s/g, "")}`} className={linkButton}>
              <Phone className="size-3.5" aria-hidden="true" /> Call
            </a>
          )}
          {s.email && (
            <a href={`mailto:${s.email}`} className={linkButton}>
              <Mail className="size-3.5" aria-hidden="true" /> Email
            </a>
          )}
          <Button size="sm" variant="soft" className="h-9" onClick={() => setChanging(true)}>
            Change status
          </Button>
        </div>
      </div>
      {(s.blocks.length > 0 || s.warnings.length > 0) && (
        <div className="flex flex-col gap-2 border-t border-border px-6 py-3">
          {s.blocks.length > 0 && (
            <p className="flex items-start gap-2 rounded-control bg-over-bg px-3 py-2 text-small text-ink-900">
              <Lock className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
              <span>
                <strong className="text-over">Can&apos;t be offered new patients.</strong>{" "}
                {s.blocks.join(" · ")}
              </span>
            </p>
          )}
          {s.warnings.map((w) => (
            <p
              key={w}
              className="flex items-center gap-2 rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900"
            >
              <CircleAlert className="size-4 flex-none text-watch" aria-hidden="true" />
              {w}
            </p>
          ))}
        </div>
      )}
      <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map((k) => (
          <div
            key={k.label}
            className="group flex gap-3 bg-surface px-6 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
          >
            <span
              className={cn(
                "flex size-9 flex-none items-center justify-center rounded-control transition-transform duration-(--duration-fast) group-hover:scale-105",
                k.tone === "over" ? "bg-over-bg text-over" : "bg-accent-tint text-accent",
              )}
            >
              <k.icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {k.label}
              </dt>
              <dd className="mt-0.5 text-small font-semibold text-ink-900">{k.value}</dd>
              <dd className="truncate text-caption text-ink-500">{k.sub}</dd>
            </div>
          </div>
        ))}
      </dl>
      {changing && (
        <StatusSheet
          s={s}
          busy={busy}
          onClose={() => setChanging(false)}
          onSave={async (to, reason) => {
            if (await act({ type: "status", to, reason })) setChanging(false);
          }}
        />
      )}
    </section>
  );
}

function StatusSheet({
  s,
  busy,
  onClose,
  onSave,
}: {
  s: StaffRecordDto;
  busy: boolean;
  onClose: () => void;
  onSave: (to: string, reason: string) => void;
}) {
  const options = engagementStatuses.filter((x) => x !== s.status);
  const [to, setTo] = useState<string>(options.includes("Active") ? "Active" : options[0]!);
  const [reason, setReason] = useState("");
  const stops = ["Suspended", "Inactive", "Archived", "On Leave"].includes(to);
  return (
    <Sheet
      title={`Change ${s.name.split(" ")[0]}'s status`}
      description="Only Active staff are offered new patients. Every change is recorded."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={stops ? "soft-danger" : "primary"}
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => onSave(to, reason)}
          >
            Set {to.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="New status">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            {options.map((o) => (
              <option key={o}>{o}</option>
            ))}
          </Select>
        </Field>
        {stops && (
          <p className="flex gap-2 rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900">
            <ShieldAlert className="mt-0.5 size-4 flex-none text-watch" aria-hidden="true" />
            No new patients from now on.{" "}
            {["Inactive", "Archived"].includes(to) ? "They're signed out and can't sign in. " : ""}
            {s.capacity.activePatients > 0 &&
              `Review their ${s.capacity.activePatients} current patients for handover.`}
          </p>
        )}
        <TextArea label="Reason" required rows={3} value={reason} onChange={setReason} />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- credentials */

const kindIcon: Record<string, LucideIcon> = {
  Registration: BadgeCheck,
  Qualification: GraduationCap,
  Check: ShieldCheck,
  Training: FileText,
  Indemnity: FileCheck2,
};

export function CredentialsTab({
  s,
  busy,
  act,
}: {
  s: StaffRecordDto;
  busy: boolean;
  act: StaffAct;
}) {
  const [adding, setAdding] = useState(false);
  const [reviewing, setReviewing] = useState<StaffCredentialDto | null>(null);
  return (
    <section className="rounded-card border border-border bg-surface shadow-lift">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <div>
          <h3 className="text-section font-semibold">Credential register</h3>
          <p className="text-caption text-ink-500">
            Verification is a person&apos;s decision, recorded here. Nothing is checked against a
            live register.
          </p>
        </div>
        <Button size="sm" variant="primary" onClick={() => setAdding(true)}>
          <Plus className="size-3.5" aria-hidden="true" /> Add credential
        </Button>
      </header>
      <ul className="divide-y divide-border">
        {s.credentials.map((c) => {
          const Icon = kindIcon[c.kind] ?? FileText;
          const soon = c.status === "Verified" && c.daysLeft !== null && c.daysLeft <= 30;
          return (
            <li
              key={c.id}
              className="group flex flex-wrap items-center gap-4 px-5 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
            >
              <span className="flex size-10 flex-none items-center justify-center rounded-control bg-accent-tint text-accent transition-transform duration-(--duration-fast) group-hover:scale-105">
                <Icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink-900">
                  {c.name}
                  {c.required && <Tag tone="outline">Required for bookings</Tag>}
                </p>
                <p className="text-caption text-ink-500">
                  {c.kind}
                  {c.body && ` · ${c.body}`}
                  {c.number && ` · ${c.number}`} ·{" "}
                  {c.expiry ? `Expires ${date(c.expiry)}` : "No expiry"}
                  {c.evidence ? ` · ${c.evidence}` : " · No evidence"}
                </p>
                {c.reviewedBy && (
                  <p className="text-caption text-ink-500">
                    {c.status} by {c.reviewedBy}
                    {c.reviewedAt && `, ${relativeTime(c.reviewedAt)}`}
                    {c.note && ` · ${c.note}`}
                  </p>
                )}
              </div>
              {soon && <Tag tone="watch">{c.daysLeft} days left</Tag>}
              <Tag tone={credentialTone[c.status]}>{c.status}</Tag>
              {s.canVerify ? (
                <Button size="sm" variant="soft" onClick={() => setReviewing(c)}>
                  Review
                </Button>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-caption text-ink-500"
                  title="Only a Clinical Lead can verify credentials"
                >
                  <Lock className="size-3.5" aria-hidden="true" /> Clinical Lead
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {adding && (
        <CredentialSheet
          busy={busy}
          onClose={() => setAdding(false)}
          onSave={async (credential) => {
            if (await act({ type: "credential-add", credential })) setAdding(false);
          }}
        />
      )}
      {reviewing && (
        <ReviewSheet
          c={reviewing}
          busy={busy}
          onClose={() => setReviewing(null)}
          onSave={async (decision, note) => {
            if (await act({ type: "credential-review", id: reviewing.id, decision, note }))
              setReviewing(null);
          }}
        />
      )}
    </section>
  );
}

function CredentialSheet({
  busy,
  onClose,
  onSave,
}: {
  busy: boolean;
  onClose: () => void;
  onSave: (c: CredentialInput) => void;
}) {
  const [c, setC] = useState<CredentialInput>({
    kind: "Training",
    name: "",
    body: "",
    number: "",
    start: "",
    expiry: "",
    evidence: "",
    required: false,
  });
  const set = <K extends keyof CredentialInput>(k: K, v: CredentialInput[K]) =>
    setC((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title="Add a credential"
      description="It's recorded as awaiting review until a Clinical Lead verifies it."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={c.name.trim().length < 2}
            onClick={() => onSave(c)}
          >
            Add credential
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice
          label="Type"
          options={credentialKinds}
          value={c.kind}
          onChange={(v) => set("kind", v)}
        />
        <TextField
          label="Name"
          required
          value={c.name}
          onChange={(v) => set("name", v)}
          placeholder="For example, Working with Children Check"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Issued by" value={c.body} onChange={(v) => set("body", v)} />
          <TextField label="Number" value={c.number} onChange={(v) => set("number", v)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Start" type="date" value={c.start} onChange={(v) => set("start", v)} />
          <TextField
            label="Expires"
            type="date"
            value={c.expiry}
            onChange={(v) => set("expiry", v)}
          />
        </div>
        <TextField
          label="Evidence file"
          value={c.evidence}
          onChange={(v) => set("evidence", v)}
          placeholder="certificate.pdf"
          hint="In the demo, name the file; nothing is uploaded."
        />
        <Tick checked={c.required} onChange={(v) => set("required", v)}>
          Required for bookings: missing, unverified or expired blocks new patients
        </Tick>
      </div>
    </Sheet>
  );
}

function ReviewSheet({
  c,
  busy,
  onClose,
  onSave,
}: {
  c: StaffCredentialDto;
  busy: boolean;
  onClose: () => void;
  onSave: (decision: "Verified" | "Rejected" | "Under Review", note: string) => void;
}) {
  const [decision, setDecision] = useState<"Verified" | "Rejected" | "Under Review">("Verified");
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={`Review ${c.name}`}
      description={`${c.kind}${c.body ? ` · ${c.body}` : ""}${c.expiry ? ` · expires ${date(c.expiry)}` : ""}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === "Rejected" ? "soft-danger" : "primary"}
            loading={busy}
            disabled={decision === "Rejected" && note.trim().length < 3}
            onClick={() => onSave(decision, note)}
          >
            Record {decision.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-control bg-canvas px-3 py-2 text-small text-ink-700">
          Evidence on file: <strong>{c.evidence || "none"}</strong>
        </p>
        <Choice
          label="Decision"
          options={["Verified", "Under Review", "Rejected"] as const}
          value={decision}
          onChange={setDecision}
        />
        <TextArea
          label="Note"
          rows={2}
          value={note}
          onChange={setNote}
          required={decision === "Rejected"}
        />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- eligibility */

export function EligibilityTab({
  s,
  busy,
  act,
}: {
  s: StaffRecordDto;
  busy: boolean;
  act: StaffAct;
}) {
  const [editing, setEditing] = useState<StaffCompetencyDto | null>(null);
  const groups: [string, StaffCompetencyDto[]][] = [
    ["Assessments", s.competencies.filter((c) => c.kind === "assessment")],
    ["Therapy and treatment", s.competencies.filter((c) => c.kind === "treatment")],
  ];
  return (
    <section className="rounded-card border border-border bg-surface shadow-lift">
      <header className="border-b border-border px-5 py-3.5">
        <h3 className="text-section font-semibold">Service eligibility</h3>
        <p className="text-caption text-ink-500">
          A hard gate in matching: only approved services are offered, whatever the ranking.
        </p>
      </header>
      {groups.map(([title, list]) =>
        list.length === 0 ? null : (
          <div key={title} className="border-b border-border last:border-0">
            <p className="px-5 pt-4 pb-2 text-label font-semibold tracking-[0.1em] text-ink-500 uppercase">
              {title}
            </p>
            <ul className="grid gap-3 px-5 pb-5 md:grid-cols-2 xl:grid-cols-3">
              {list.map((c) => (
                <li
                  key={c.support}
                  className={cn(
                    "group flex flex-col gap-2 rounded-card border p-4 transition-all duration-(--duration-fast) hover:-translate-y-0.5 hover:shadow-lift",
                    c.status === "Approved"
                      ? "border-healthy-bg bg-surface"
                      : "border-border bg-canvas",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-small font-semibold text-ink-900">{c.support}</p>
                    <Tag tone={competencyTone[c.status]}>{c.status}</Tag>
                  </div>
                  <p className="text-caption text-ink-500">
                    {c.reviewedBy
                      ? `By ${c.reviewedBy}${c.reviewedAt ? `, ${relativeTime(c.reviewedAt)}` : ""}`
                      : "Not reviewed yet"}
                    {c.supervisionRequired && " · supervision required"}
                  </p>
                  {c.note && <p className="text-caption text-ink-700">{c.note}</p>}
                  {s.canVerify && (
                    <button
                      type="button"
                      onClick={() => setEditing(c)}
                      className="mt-auto inline-flex h-8 w-fit cursor-pointer items-center gap-1.5 rounded-control px-2.5 text-caption font-semibold text-accent transition-colors hover:bg-accent-tint"
                    >
                      <Pencil className="size-3.5" aria-hidden="true" /> Change
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ),
      )}
      {editing && (
        <CompetencySheet
          c={editing}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={async (status, note, supervisionRequired) => {
            if (
              await act({
                type: "competency",
                support: editing.support,
                status,
                note,
                supervisionRequired,
              })
            )
              setEditing(null);
          }}
        />
      )}
    </section>
  );
}

function CompetencySheet({
  c,
  busy,
  onClose,
  onSave,
}: {
  c: StaffCompetencyDto;
  busy: boolean;
  onClose: () => void;
  onSave: (status: CompetencyStatus, note: string, supervisionRequired: boolean) => void;
}) {
  const [status, setStatus] = useState<CompetencyStatus>(c.status);
  const [note, setNote] = useState(c.note);
  const [supervised, setSupervised] = useState(c.supervisionRequired);
  return (
    <Sheet
      title={c.support}
      description="Approving means they've shown the competency. Suspending one service keeps their other approvals."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(status, note, supervised)}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice label="Status" options={competencyStatuses} value={status} onChange={setStatus} />
        <TextArea
          label="How it was shown"
          rows={2}
          value={note}
          onChange={setNote}
          placeholder="For example, observed FCA with senior OT, report reviewed"
        />
        <Tick checked={supervised} onChange={setSupervised}>
          Supervision required for this service
        </Tick>
      </div>
    </Sheet>
  );
}

/* --------------------------------------------------- coverage & capacity */

export function CapacityTab({ s, busy, act }: { s: StaffRecordDto; busy: boolean; act: StaffAct }) {
  const [editing, setEditing] = useState(false);
  const cap = s.capacity;
  const cov = s.coverage;
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      {s.affected.length > 0 && (
        <section className="rounded-card border border-over/30 bg-surface shadow-lift xl:col-span-2">
          <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h3 className="text-section font-semibold text-over">
                Visits that need reassignment
              </h3>
              <p className="text-caption text-ink-500">
                Booked on leave days or while they can&apos;t take patients. Nothing moves until
                scheduling acts.
              </p>
            </div>
            <Tag tone="over">{s.affected.length}</Tag>
          </header>
          <ul className="divide-y divide-border">
            {s.affected.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-canvas"
              >
                <span className="font-mono text-caption font-semibold text-ink-700">{v.ref}</span>
                <span className="min-w-0 flex-1 text-small text-ink-900">
                  {v.patient} ·{" "}
                  {new Intl.DateTimeFormat("en-AU", {
                    timeZone: "Australia/Brisbane",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(v.start))}
                </span>
                <span className="text-caption text-over">{v.reason}</span>
                <Link href="/care/schedule" className="text-caption font-semibold text-accent">
                  Open scheduling →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="rounded-card border border-border bg-surface shadow-lift">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <div>
            <h3 className="text-section font-semibold">Capacity this week</h3>
            <p className="text-caption text-ink-500">
              {cap.period} · every figure shows how it&apos;s worked out
            </p>
          </div>
          <Tag tone={cap.over ? "over" : cap.utilisation > 85 ? "watch" : "healthy"}>
            {cap.utilisation}% committed
          </Tag>
        </header>
        <div className="px-5 pt-4">
          <div className="h-3 overflow-hidden rounded-full bg-sunken">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                cap.over ? "bg-over-dot" : "bg-accent-fill",
              )}
              style={{ width: `${Math.min(100, cap.utilisation)}%` }}
            />
          </div>
        </div>
        <table className="mt-3 w-full text-left text-small">
          <tbody className="divide-y divide-border">
            {cap.lines.map((l) => (
              <tr
                key={l.label}
                className="transition-colors duration-(--duration-fast) hover:bg-canvas"
              >
                <td className="px-5 py-2.5">
                  <span className="block font-medium text-ink-900">{l.label}</span>
                  <span className="block text-caption text-ink-500">{l.source}</span>
                </td>
                <td
                  className={cn(
                    "px-5 py-2.5 text-right font-semibold num",
                    l.hours < 0 ? "text-ink-700" : "text-ink-900",
                  )}
                >
                  {l.hours > 0 ? "" : "−"}
                  {Math.abs(l.hours)} h
                </td>
              </tr>
            ))}
            <tr className="bg-accent-tint">
              <td className="px-5 py-3 font-semibold text-ink-900">Available for new visits</td>
              <td className="px-5 py-3 text-right type-display text-h2 text-accent num">
                {cap.available} h
              </td>
            </tr>
          </tbody>
        </table>
        <p className="px-5 py-3 text-caption text-ink-500">
          Committed {cap.committed} h ÷ workable{" "}
          {Math.round((cap.contracted + (cap.lines[1]?.hours ?? 0)) * 10) / 10} h ={" "}
          {cap.utilisation}%. Workload is not a measure of clinical risk.
        </p>
      </section>
      <section className="rounded-card border border-border bg-surface shadow-lift">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h3 className="text-section font-semibold">Coverage and travel</h3>
          <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" aria-hidden="true" /> Edit
          </Button>
        </header>
        <dl className="grid gap-1 p-2">
          {(
            [
              ["Region", cov.region, MapPin],
              [
                "Postcodes",
                cov.postcodes.length ? cov.postcodes.join(", ") : "Whole region",
                MapPin,
              ],
              ["Travel", cov.travelWillingness, Car],
              ["Travel mode", cov.travelMode, Car],
              ["Buffer per visit", `${cov.bufferMinutes} min before and after`, Clock],
              ["Visits a day", `Up to ${cov.maxPerDay}`, CalendarDays],
              ["Client hours a week", `Up to ${cov.maxHoursWeek} h`, Clock],
            ] as [string, string, LucideIcon][]
          ).map(([label, value, Icon]) => (
            <div
              key={label}
              className="group flex gap-3 rounded-control px-3 py-2 transition-colors hover:bg-canvas"
            >
              <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-control bg-sunken text-ink-500 transition-colors group-hover:bg-accent-tint group-hover:text-accent">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {label}
                </dt>
                <dd className="text-small font-medium text-ink-900">{value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>
      {editing && (
        <CoverageSheet
          initial={cov}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async (coverage) => {
            if (await act({ type: "coverage", coverage })) setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function CoverageSheet({
  initial,
  busy,
  onClose,
  onSave,
}: {
  initial: CoverageInput;
  busy: boolean;
  onClose: () => void;
  onSave: (c: CoverageInput) => void;
}) {
  const [c, setC] = useState<CoverageInput>({
    postcodes: initial.postcodes,
    travelWillingness: initial.travelWillingness,
    travelMode: initial.travelMode,
    bufferMinutes: initial.bufferMinutes,
    maxPerDay: initial.maxPerDay,
    maxHoursWeek: initial.maxHoursWeek,
  });
  const [codes, setCodes] = useState(initial.postcodes.join(", "));
  const set = <K extends keyof CoverageInput>(k: K, v: CoverageInput[K]) =>
    setC((x) => ({ ...x, [k]: v }));
  return (
    <Sheet
      title="Coverage and travel"
      description="Home visits are only matched inside coverage. Telehealth needs no travel."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              onSave({
                ...c,
                postcodes: codes
                  .split(/[\s,]+/)
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          >
            Save coverage
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextArea
          label="Postcodes covered"
          rows={2}
          value={codes}
          onChange={setCodes}
          placeholder="Leave blank for the whole region, or list: 4152, 4151, 4170"
        />
        <Choice
          label="Travel"
          options={travelWillingness}
          value={c.travelWillingness}
          onChange={(v) => set("travelWillingness", v)}
        />
        <Choice
          label="Travel mode"
          options={travelModes}
          value={c.travelMode}
          onChange={(v) => set("travelMode", v)}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Buffer (min)"
            type="text"
            value={String(c.bufferMinutes)}
            onChange={(v) => set("bufferMinutes", Number(v) || 0)}
          />
          <TextField
            label="Visits a day"
            type="text"
            value={String(c.maxPerDay)}
            onChange={(v) => set("maxPerDay", Number(v) || 1)}
          />
          <TextField
            label="Hours a week"
            type="text"
            value={String(c.maxHoursWeek)}
            onChange={(v) => set("maxHoursWeek", Number(v) || 1)}
          />
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- staff details */

function Fact({ label, value, icon: Icon }: { label: string; value: ReactNode; icon: LucideIcon }) {
  const empty = value === "" || value === null || value === undefined;
  return (
    <div className="group flex min-w-0 gap-3 rounded-control px-3 py-2.5 transition-colors duration-(--duration-fast) hover:bg-canvas">
      <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-control bg-sunken text-ink-500 transition-colors group-hover:bg-accent-tint group-hover:text-accent">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
        <p
          className={cn(
            "mt-0.5 text-small",
            empty ? "text-ink-500 italic" : "font-medium text-ink-900",
          )}
        >
          {empty ? "Not given" : value}
        </p>
      </div>
    </div>
  );
}

export function StaffDetailsTab({
  s,
  busy,
  act,
}: {
  s: StaffRecordDto;
  busy: boolean;
  act: StaffAct;
}) {
  const [editing, setEditing] = useState(false);
  const p = s.profile;
  return (
    <section className="rounded-card border border-border bg-surface shadow-lift">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h3 className="text-section font-semibold">Staff profile</h3>
        <Button size="sm" variant="soft" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" aria-hidden="true" /> Edit
        </Button>
      </header>
      <div className="grid gap-1 p-2 sm:grid-cols-2 xl:grid-cols-3">
        <Fact label="Staff ID" value={s.staffId} icon={BadgeCheck} />
        <Fact label="Display name" value={p.displayName} icon={UserCheck} />
        <Fact label="Job title" value={p.jobTitle} icon={Briefcase} />
        <Fact label="Employment" value={p.employmentType} icon={Briefcase} />
        <Fact label="Primary discipline" value={s.discipline} icon={Stethoscope} />
        <Fact
          label="Other disciplines"
          value={p.secondaryDisciplines.join(", ")}
          icon={Stethoscope}
        />
        <Fact label="Location" value={p.primaryLocation} icon={MapPin} />
        <Fact label="Supervisor" value={p.supervisorName ?? ""} icon={ShieldCheck} />
        <Fact label="Started" value={p.startDate ? date(p.startDate) : ""} icon={CalendarDays} />
        <Fact label="Languages" value={p.languages.join(", ")} icon={Languages} />
        <Fact label="Employee number" value={p.employeeNumber} icon={FileText} />
        <Fact
          label="Works in"
          value={
            <span className="flex flex-wrap gap-1.5">
              {p.workSettings.map((w) => (
                <span
                  key={w}
                  className="rounded-tag bg-accent-tint px-2 py-0.5 text-label font-semibold text-accent"
                >
                  {w}
                </span>
              ))}
            </span>
          }
          icon={MapPin}
        />
      </div>
      {s.supervisees.length > 0 && (
        <div className="border-t border-border px-5 py-4">
          <p className="mb-2 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Supervises ({s.supervisees.length})
          </p>
          <ul className="grid gap-2 md:grid-cols-2">
            {s.supervisees.map((x) => (
              <li key={x.id}>
                <Link
                  href={`/care/therapists/${x.id}`}
                  className="flex items-center gap-3 rounded-control border border-border px-3 py-2 transition-all hover:-translate-y-px hover:border-accent/50 hover:no-underline"
                >
                  <Avatar name={x.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-small font-semibold text-ink-900">{x.name}</span>
                    <span className="block text-caption text-ink-500">
                      {x.discipline} · {x.status}
                    </span>
                  </span>
                  {x.dueSoon > 0 && <Tag tone="watch">{x.dueSoon} credential due</Tag>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      {p.bio && (
        <p className="border-t border-border px-5 py-4 text-small text-ink-700">
          <span className="mb-1 block text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Patient-facing bio
          </span>
          {p.bio}
        </p>
      )}
      {editing && (
        <ProfileSheet
          s={s}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async (profile) => {
            if (await act({ type: "profile", profile })) setEditing(false);
          }}
        />
      )}
    </section>
  );
}

function ProfileSheet({
  s,
  busy,
  onClose,
  onSave,
}: {
  s: StaffRecordDto;
  busy: boolean;
  onClose: () => void;
  onSave: (p: StaffProfileInput) => void;
}) {
  const { supervisorName: _ignored, ...start } = s.profile;
  void _ignored;
  const [p, setP] = useState<StaffProfileInput>(start);
  const [langs, setLangs] = useState(start.languages.join(", "));
  const set = <K extends keyof StaffProfileInput>(k: K, v: StaffProfileInput[K]) =>
    setP((x) => ({ ...x, [k]: v }));
  const toggle = <T extends string>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  return (
    <Sheet
      title="Edit staff profile"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            onClick={() =>
              onSave({
                ...p,
                languages: langs
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
          >
            Save profile
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Job title"
            required
            value={p.jobTitle}
            onChange={(v) => set("jobTitle", v)}
          />
          <TextField
            label="Display name"
            value={p.displayName}
            onChange={(v) => set("displayName", v)}
            hint="Shown to patients"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employment type">
            <Select
              value={p.employmentType}
              onChange={(e) =>
                set("employmentType", e.target.value as StaffProfileInput["employmentType"])
              }
            >
              {employmentTypes.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
          <Field label="Primary location">
            <Select
              value={p.primaryLocation}
              onChange={(e) =>
                set("primaryLocation", e.target.value as StaffProfileInput["primaryLocation"])
              }
            >
              {primaryLocations.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Clinical supervisor">
          <Select value={p.supervisorId} onChange={(e) => set("supervisorId", e.target.value)}>
            <option value="">No supervisor</option>
            {s.supervisors.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Start date"
            type="date"
            required
            value={p.startDate}
            onChange={(v) => set("startDate", v)}
          />
          <TextField
            label="End date"
            type="date"
            value={p.endDate}
            onChange={(v) => set("endDate", v)}
          />
        </div>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium">
            Other disciplines (with evidence of scope)
          </legend>
          <div className="flex flex-wrap gap-2">
            {disciplines
              .filter((x) => x !== s.discipline)
              .map((x) => {
                const on = p.secondaryDisciplines.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("secondaryDisciplines", toggle(p.secondaryDisciplines, x))}
                    className={cn(
                      "h-8 cursor-pointer rounded-full border px-3 text-caption font-semibold transition-all active:scale-95",
                      on
                        ? "border-accent-fill bg-accent-tint text-accent"
                        : "border-border-strong text-ink-700 hover:border-accent",
                    )}
                  >
                    {x}
                  </button>
                );
              })}
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium">Works in</legend>
          <div className="flex flex-wrap gap-2">
            {workSettings.map((x) => {
              const on = p.workSettings.includes(x);
              return (
                <button
                  key={x}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("workSettings", toggle(p.workSettings, x))}
                  className={cn(
                    "h-8 cursor-pointer rounded-full border px-3 text-caption font-semibold transition-all active:scale-95",
                    on
                      ? "border-accent-fill bg-accent-tint text-accent"
                      : "border-border-strong text-ink-700 hover:border-accent",
                  )}
                >
                  {x}
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextField
          label="Languages"
          value={langs}
          onChange={setLangs}
          hint="Separate with commas"
        />
        <TextField
          label="Employee number"
          value={p.employeeNumber}
          onChange={(v) => set("employeeNumber", v)}
        />
        <TextArea
          label="Patient-facing bio"
          rows={3}
          value={p.bio}
          onChange={(v) => set("bio", v)}
          hint="Patient-safe: approved before it's shown to patients."
        />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------- activity */

export function StaffActivity({ s }: { s: StaffRecordDto }) {
  return (
    <section className="rounded-card border border-border bg-surface shadow-lift">
      <header className="border-b border-border px-5 py-3.5">
        <h3 className="text-section font-semibold">Staff activity and audit</h3>
      </header>
      {s.activity.length === 0 ? (
        <p className="px-5 py-8 text-center text-small text-ink-500">No changes recorded yet.</p>
      ) : (
        <ol className="relative mx-5 my-4 border-l border-border pl-6">
          {s.activity.map((a) => (
            <li key={a.id} className="bubble-in relative py-2">
              <span
                aria-hidden="true"
                className="absolute top-3.5 -left-[31px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
              />
              <p className="text-small text-ink-900">{a.action}</p>
              <p className="text-caption text-ink-500">
                {a.actor} · {shortDate(a.at)}, {relativeTime(a.at)}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** A therapist's own credentials: they add evidence for review; only a Clinical Lead verifies. */
export function MyCredentials() {
  const resource = useResource<{ staff: StaffRecordDto }>(
    "/api/me/staff",
    (e) => e.type === "care",
  );
  const [busy, setBusy] = useState(false);
  const act: StaffAct = async (body) => {
    setBusy(true);
    try {
      await api("/api/me/staff", {
        body: { credential: (body as { credential: unknown }).credential },
      });
      toast("Submitted for review", { tone: "success", detail: "A Clinical Lead verifies it." });
      resource.reload();
      return true;
    } catch (e) {
      toast("Couldn't submit", { tone: "error", detail: e instanceof Error ? e.message : "" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  const s = resource.data?.staff;
  if (!s) return null;
  return (
    <div className="mb-6">
      <CredentialsTab s={s} busy={busy} act={act} />
    </div>
  );
}
