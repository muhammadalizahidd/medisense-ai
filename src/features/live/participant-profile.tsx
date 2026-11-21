"use client";

import {
  Accessibility,
  BadgeCheck,
  Cake,
  Check,
  ChevronDown,
  CircleAlert,
  Clock,
  Copy,
  Ear,
  FileText,
  History,
  IdCard,
  Languages,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Smile,
  Stethoscope,
  StickyNote,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
  Lock,
  Pencil,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserX,
  Video,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/premium";
import { PhotoEdit } from "@/components/ui/photo-picker";
import { Select } from "@/components/ui/select";
import { Field, Sheet } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { australianStates } from "@/lib/live/catalogue";
import { api, useNow, useResource } from "@/lib/live/client";
import {
  accessibilityNeeds,
  authorityScopes,
  authorityTypes,
  contactModes,
  contactRoles03,
  delegateRoles,
  languages,
  responsibilities,
  shareCategories,
  type ConsentDto,
  type ContactDto,
  type ContactInput,
  type ParticipantDetails,
  type ParticipantProfileDto,
  type ParticipantStatus,
} from "@/lib/live/participant";
import { ageLabel, relativeTime, shortDate } from "@/lib/live/time";
import type { ClientDetailDto, NeedDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, needLabel, needTone, Panel, Skeleton } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";

export type Act = (body: Record<string, unknown>) => Promise<boolean>;

export const statusTone: Record<
  ParticipantStatus,
  "healthy" | "watch" | "neutral" | "over" | "monitor"
> = {
  Prospective: "monitor",
  Active: "healthy",
  "On Hold": "watch",
  Discharged: "neutral",
  Archived: "neutral",
  Deceased: "over",
};

/** The participant's Module 03 record, and one way to change it. */
export function useParticipant(clientId: string, onChanged?: () => void) {
  const resource = useResource<{ profile: ParticipantProfileDto }>(
    `/api/care/clients/${clientId}/profile`,
    (event) =>
      event.type === "care" && (!event.payload.clientId || event.payload.clientId === clientId),
  );
  const [busy, setBusy] = useState(false);
  const act: Act = async (body) => {
    setBusy(true);
    try {
      const result = await api<{ warning?: string }>(`/api/care/clients/${clientId}/profile`, {
        body,
      });
      toast(result.warning ? "Saved, with a follow-up" : "Saved", {
        tone: result.warning ? "warning" : "success",
        detail: result.warning,
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

/* ------------------------------------------------------------------ status */

export function StatusControl({
  profile,
  busy,
  act,
}: {
  profile: ParticipantProfileDto;
  busy: boolean;
  act: Act;
}) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<"On Hold" | "Resume" | "Archived" | "Deceased">("On Hold");
  const [reason, setReason] = useState("");
  const final = profile.status === "Archived" || profile.status === "Deceased";
  const options = (
    profile.status === "On Hold"
      ? (["Resume", "Archived", "Deceased"] as const)
      : (["On Hold", "Archived", "Deceased"] as const)
  ).slice();
  return (
    <>
      <Tag tone={statusTone[profile.status]}>{profile.status}</Tag>
      {!final && (
        <Button
          size="sm"
          variant="soft"
          onClick={() => {
            setTo(options[0]!);
            setReason("");
            setOpen(true);
          }}
        >
          Change status
        </Button>
      )}
      {open && (
        <Sheet
          title="Change participant status"
          description="The participant's status is separate from each service. Every change is recorded with your reason."
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant={to === "Deceased" || to === "Archived" ? "danger" : "primary"}
                loading={busy}
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  if (await act({ type: "status", to, reason })) setOpen(false);
                }}
              >
                {to === "Resume" ? "Resume care" : `Set ${to.toLowerCase()}`}
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Choice label="New status" options={options} value={to} onChange={setTo} />
            {to === "Deceased" && (
              <p className="flex gap-2 rounded-control bg-over-bg px-3 py-2 text-small text-over">
                <ShieldAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                Every future visit is cancelled and access is controlled. Only record this from a
                verified notice.
              </p>
            )}
            {to === "Archived" && (
              <p className="rounded-control bg-canvas px-3 py-2 text-small text-ink-700">
                Archiving keeps the whole record. Nothing is deleted.
              </p>
            )}
            <TextArea label="Reason" required rows={3} value={reason} onChange={setReason} />
          </div>
        </Sheet>
      )}
    </>
  );
}

/* ----------------------------------------------------------------- profile */

function Provenance({ p }: { p?: { source: string; verifiedBy: string | null; at: string } }) {
  if (!p) return null;
  const label = p.verifiedBy
    ? `Verified by ${p.verifiedBy}, ${shortDate(p.at)}`
    : `${p.source}, ${shortDate(p.at)}`;
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex size-5 flex-none items-center justify-center rounded-full",
        p.verifiedBy ? "bg-healthy-bg text-healthy" : "bg-sunken text-ink-500",
      )}
    >
      {p.verifiedBy ? (
        <BadgeCheck className="size-3" aria-hidden="true" />
      ) : (
        <FileText className="size-3" aria-hidden="true" />
      )}
    </span>
  );
}

const addressLine = (a: ParticipantDetails["address"]) =>
  [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", ") || "Not given";

/** One fact in a detail grid: small label above the value, with where the value came from. */
function Fact({
  label,
  value,
  icon: Icon,
  provenance,
  wide,
}: {
  label: string;
  value: ReactNode;
  icon?: LucideIcon;
  provenance?: { source: string; verifiedBy: string | null; at: string };
  wide?: boolean;
}) {
  const empty = value === "" || value === null || value === undefined;
  return (
    <div
      className={cn(
        "group flex min-w-0 gap-3 rounded-control px-3 py-2.5 transition-colors duration-(--duration-fast) hover:bg-canvas",
        wide && "sm:col-span-2",
      )}
    >
      {Icon && (
        <span className="mt-0.5 flex size-8 flex-none items-center justify-center rounded-control bg-sunken text-ink-500 transition-colors duration-(--duration-fast) group-hover:bg-accent-tint group-hover:text-accent">
          <Icon className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">{label}</p>
        <p className="mt-0.5 flex items-center gap-1.5 text-small">
          <span
            className={cn(
              "min-w-0 break-words",
              empty ? "text-ink-500 italic" : "font-medium text-ink-900",
            )}
          >
            {empty ? "Not given" : value}
          </span>
          <Provenance p={provenance} />
        </p>
      </div>
    </div>
  );
}

/** A completeness ring drawn with the theme's colours. */
function Ring({ percent }: { percent: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="size-24 -rotate-90" aria-hidden="true">
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-sunken" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - percent / 100)}
        className={cn(
          "transition-[stroke-dashoffset] duration-700 ease-out",
          percent === 100 ? "stroke-healthy-dot" : "stroke-accent-fill",
        )}
      />
    </svg>
  );
}

function CopyChip({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      title="Copy MRN"
      className="group inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-border-strong bg-surface px-2.5 font-mono text-caption font-semibold text-ink-900 transition-all duration-(--duration-fast) hover:border-accent hover:text-accent active:scale-95"
    >
      {value}
      {copied ? (
        <Check className="size-3.5 text-healthy" aria-hidden="true" />
      ) : (
        <Copy className="size-3.5 text-ink-500 group-hover:text-accent" aria-hidden="true" />
      )}
      <span className="sr-only" role="status">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

const DAY_MS = 86_400_000;

export function ProfileTab({
  profile,
  client,
  busy,
  act,
}: {
  profile: ParticipantProfileDto;
  client: ClientDetailDto;
  busy: boolean;
  act: Act;
}) {
  const [editing, setEditing] = useState(false);
  const now = useNow();
  const d = profile.details;
  const f = profile.funding;
  const c = profile.completeness;
  const age = now && d.dateOfBirth ? ageLabel(d.dateOfBirth, new Date(now)) : null;
  const planDays =
    now && f.planEndDate
      ? Math.round((new Date(`${f.planEndDate}T00:00:00Z`).getTime() - now) / DAY_MS)
      : null;
  const primary = (duty: string) =>
    profile.contacts.find((x) => x.primaryFor.includes(duty as never) && x.state !== "Revoked");
  const booking = primary("Booking");
  const emergency = primary("Emergency");
  const active = client.needs.filter((n) => n.status === "assigned");
  const therapists = [
    ...new Set(client.needs.flatMap((n) => (n.therapistName ? [n.therapistName] : []))),
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Identity card */}
      <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex flex-wrap items-start gap-5 p-6">
          <div className="relative flex-none">
            <PhotoEdit
              owner="client"
              id={client.id}
              name={d.name}
              photoUrl={client.photoUrl}
              kind="patient"
              className="ring-4 ring-accent-tint"
            />
            <span
              aria-hidden="true"
              className={cn(
                "absolute -right-0.5 -bottom-0.5 size-4 rounded-full border-[3px] border-surface",
                profile.status === "Active"
                  ? "bg-healthy-dot"
                  : profile.status === "On Hold"
                    ? "bg-watch-dot"
                    : "bg-border-strong",
              )}
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="type-display text-h1 leading-tight text-ink-900">{d.name}</h2>
              {d.preferredName && (
                <span className="text-body text-ink-500">“{d.preferredName}”</span>
              )}
              {d.pronouns && <Tag tone="outline">{d.pronouns}</Tag>}
              <Tag tone={statusTone[profile.status]}>{profile.status}</Tag>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-small text-ink-700">
              {client.mrn && <CopyChip value={client.mrn} />}
              <span className="inline-flex items-center gap-1.5">
                <Cake className="size-4 text-ink-500" aria-hidden="true" />
                {d.dateOfBirth ? shortDate(`${d.dateOfBirth}T00:00:00Z`) : "No date of birth"}
                {age && <span className="text-ink-500">· {age}</span>}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4 text-ink-500" aria-hidden="true" />
                {d.address.suburb || client.suburb} · {f.region}
              </span>
              {d.language && (
                <span className="inline-flex items-center gap-1.5">
                  <Languages className="size-4 text-ink-500" aria-hidden="true" />
                  {d.language}
                  {d.interpreter && <Tag tone="watch">Interpreter</Tag>}
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {d.phone && (
              <a
                href={`tel:${d.phone.replace(/\s/g, "")}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border-strong px-3 text-caption font-semibold text-ink-900 transition-all duration-(--duration-fast) hover:-translate-y-px hover:border-accent hover:text-accent hover:no-underline active:scale-95"
              >
                <Phone className="size-3.5" aria-hidden="true" />
                Call
              </a>
            )}
            {d.email && (
              <a
                href={`mailto:${d.email}`}
                className="inline-flex h-9 items-center gap-1.5 rounded-control border border-border-strong px-3 text-caption font-semibold text-ink-900 transition-all duration-(--duration-fast) hover:-translate-y-px hover:border-accent hover:text-accent hover:no-underline active:scale-95"
              >
                <Mail className="size-3.5" aria-hidden="true" />
                Email
              </a>
            )}
            <Button size="sm" variant="primary" className="h-9" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" aria-hidden="true" />
              Edit details
            </Button>
          </div>
        </div>
        <dl className="grid gap-px border-t border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Funding",
              value: f.source,
              sub: f.planType || f.payer || "Payer not set",
              icon: Wallet,
            },
            {
              label: "NDIS plan",
              value: f.ndisNumber || "—",
              sub: f.planEndDate
                ? `Ends ${shortDate(`${f.planEndDate}T00:00:00Z`)}`
                : "No end date",
              icon: FileText,
              warn: planDays !== null && planDays < 60,
              warnText: planDays !== null && planDays < 0 ? "Expired" : `${planDays} days left`,
            },
            {
              label: "Services",
              value: `${active.length} active of ${client.needs.length}`,
              sub: therapists.length ? therapists.join(", ") : "No therapist yet",
              icon: Stethoscope,
            },
            {
              label: "Main contacts",
              value: booking ? booking.name : "No booking contact",
              sub: emergency ? `Emergency: ${emergency.name}` : "No emergency contact",
              icon: Users,
            },
          ].map((k) => (
            <div
              key={k.label}
              className="group flex gap-3 bg-surface px-6 py-4 transition-colors duration-(--duration-fast) hover:bg-canvas"
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent transition-transform duration-(--duration-fast) group-hover:scale-105">
                <k.icon className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {k.label}
                </dt>
                <dd className="mt-0.5 flex flex-wrap items-center gap-2 text-small font-semibold text-ink-900">
                  <span className="truncate">{k.value}</span>
                  {"warn" in k && k.warn && <Tag tone="over">{k.warnText}</Tag>}
                </dd>
                <dd className="truncate text-caption text-ink-500">{k.sub}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-card border border-border bg-surface shadow-lift">
        <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <h3 className="text-section font-semibold">Requested therapies and services</h3>
          <span className="text-caption text-ink-500">
            {client.needs.length} service{client.needs.length === 1 ? "" : "s"} · {active.length}{" "}
            active
          </span>
        </header>
        {client.needs.length === 0 ? (
          <p className="px-5 py-6 text-small text-ink-500">No services requested yet.</p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,340px),1fr))] gap-px bg-border">
            {client.needs.map((n) => (
              <li
                key={n.id}
                className="group flex flex-col gap-3 bg-surface p-5 transition-colors duration-(--duration-fast) hover:bg-canvas"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="flex size-10 flex-none items-center justify-center rounded-control bg-accent-tint text-accent transition-transform duration-(--duration-fast) group-hover:scale-105">
                      <Stethoscope className="size-4.5" strokeWidth={1.75} aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-small font-semibold text-ink-900">{n.support}</p>
                      <p className="text-caption text-ink-500">{n.discipline}</p>
                    </div>
                  </div>
                  <Tag tone={needTone[n.status]}>{needLabel[n.status]}</Tag>
                </div>
                <dl className="grid grid-cols-2 gap-2 text-caption">
                  <div className="rounded-control bg-sunken px-2.5 py-1.5">
                    <dt className="text-ink-500">How often</dt>
                    <dd className="font-semibold text-ink-900">{n.frequency}</dd>
                  </div>
                  <div className="rounded-control bg-sunken px-2.5 py-1.5">
                    <dt className="text-ink-500">Where</dt>
                    <dd className="font-semibold text-ink-900">{n.location}</dd>
                  </div>
                </dl>
                <p className="flex items-center gap-2 text-small">
                  {n.therapistName ? (
                    <>
                      <Avatar name={n.therapistName} size={28} kind="staff" />
                      <span className="font-medium text-ink-900">{n.therapistName}</span>
                    </>
                  ) : (
                    <span className="text-ink-500 italic">No therapist yet</span>
                  )}
                </p>
                {n.details && <p className="text-caption text-ink-700">{n.details}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface shadow-lift">
            <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
              <h3 className="text-section font-semibold">Personal details</h3>
              <span className="flex items-center gap-3 text-caption text-ink-500">
                <span className="inline-flex items-center gap-1">
                  <BadgeCheck className="size-3.5 text-healthy" aria-hidden="true" /> Verified
                </span>
                <span className="inline-flex items-center gap-1">
                  <FileText className="size-3.5" aria-hidden="true" /> From referral
                </span>
              </span>
            </header>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              <Fact
                label="Legal name"
                value={d.name}
                icon={IdCard}
                provenance={profile.provenance.name}
              />
              <Fact label="Preferred name" value={d.preferredName} icon={Smile} />
              <Fact
                label="Date of birth"
                value={
                  d.dateOfBirth
                    ? `${shortDate(`${d.dateOfBirth}T00:00:00Z`)}${age ? ` · ${age}` : ""}`
                    : ""
                }
                icon={Cake}
                provenance={profile.provenance.dateOfBirth}
              />
              <Fact label="Pronouns" value={d.pronouns} icon={UserRound} />
              <Fact
                label="Phone"
                value={d.phone}
                icon={Phone}
                provenance={profile.provenance.phone}
              />
              <Fact
                label="Email"
                value={d.email}
                icon={Mail}
                provenance={profile.provenance.email}
              />
              <Fact
                label="Current address"
                value={addressLine(d.address)}
                icon={MapPin}
                provenance={profile.provenance.address}
                wide
              />
            </div>
            {profile.addressHistory.length > 0 && (
              <details className="group/h border-t border-border px-5 py-3">
                <summary className="flex cursor-pointer list-none items-center gap-1.5 text-caption font-semibold text-ink-700 hover:text-ink-900">
                  <ChevronDown
                    className="size-3.5 transition-transform duration-(--duration-fast) group-open/h:rotate-180"
                    aria-hidden="true"
                  />
                  Earlier addresses ({profile.addressHistory.length})
                </summary>
                <ul className="mt-2 flex flex-col gap-1 text-caption text-ink-500">
                  {[...profile.addressHistory].reverse().map((h, i) => (
                    <li key={i}>
                      {addressLine(h.address)} · until {shortDate(h.until)}, changed by {h.byName}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
          <section className="rounded-card border border-border bg-surface shadow-lift">
            <header className="border-b border-border px-5 py-3.5">
              <h3 className="text-section font-semibold">Communication and accessibility</h3>
            </header>
            <div className="grid gap-1 p-2 sm:grid-cols-2">
              <Fact
                label="Preferred contact"
                value={d.contactMode}
                icon={MessageCircle}
                provenance={profile.provenance.contactMode}
              />
              <Fact label="Best time to contact" value={d.contactTime} icon={Clock} />
              <Fact label="Preferred language" value={d.language} icon={Languages} />
              <Fact
                label="Interpreter"
                value={d.interpreter ? "Needed" : "Not needed"}
                icon={Ear}
              />
              <Fact
                label="Accessibility needs"
                value={
                  d.accessibility.length ? (
                    <span className="flex flex-wrap gap-1.5">
                      {d.accessibility.map((a) => (
                        <span
                          key={a}
                          className="rounded-tag bg-accent-tint px-2 py-0.5 text-label font-semibold text-accent"
                        >
                          {a}
                        </span>
                      ))}
                    </span>
                  ) : (
                    ""
                  )
                }
                icon={Accessibility}
                wide
              />
              {d.accessibilityNotes && (
                <Fact
                  label="Accessibility notes"
                  value={d.accessibilityNotes}
                  icon={StickyNote}
                  wide
                />
              )}
            </div>
          </section>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5 shadow-lift">
            <h3 className="text-section font-semibold">Profile completeness</h3>
            <div className="mt-3 flex items-center gap-4">
              <div className="relative flex-none">
                <Ring percent={c.percent} />
                <span className="absolute inset-0 flex items-center justify-center type-display text-h2 text-ink-900 num">
                  {c.percent}%
                </span>
              </div>
              <p className="text-small text-ink-700">
                {c.missing.length
                  ? `${c.missing.length} item${c.missing.length === 1 ? "" : "s"} left for a complete record.`
                  : "Everything a full record needs is in place."}
              </p>
            </div>
            {c.missing.length > 0 && (
              <ul className="mt-4 flex flex-col gap-1.5">
                {c.missing.map((m) => (
                  <li
                    key={m}
                    className="flex items-center gap-2 rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900"
                  >
                    <CircleAlert className="size-4 flex-none text-watch" aria-hidden="true" />
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <ClinicalContext profile={profile} />
        </div>
      </div>
      {editing && (
        <DetailsSheet
          initial={d}
          upcoming={profile.upcomingInPerson}
          busy={busy}
          onClose={() => setEditing(false)}
          onSave={async (details) => {
            if (await act({ type: "details", details })) setEditing(false);
          }}
        />
      )}
    </div>
  );
}

function ClinicalContext({ profile }: { profile: ParticipantProfileDto }) {
  const c = profile.clinical;
  return (
    <Panel title="Clinical context">
      <div className="flex flex-col gap-4 text-small">
        <div>
          <p className="mb-1 flex items-center justify-between gap-2 font-semibold">
            Diagnosis (reported)
            <Tag tone="watch">Not clinically verified</Tag>
          </p>
          <p className="text-ink-700">{c.reportedDiagnosis?.text || "None reported"}</p>
          {c.reportedDiagnosis && (
            <p className="mt-0.5 text-caption text-ink-500">Source: {c.reportedDiagnosis.source}</p>
          )}
        </div>
        <div className="border-t border-border pt-3">
          <p className="mb-1 flex items-center justify-between gap-2 font-semibold">
            Clinician-reviewed
            <Tag tone="healthy">From signed records</Tag>
          </p>
          {c.verified.length === 0 ? (
            <p className="text-ink-500">No signed assessment yet. Verification pending.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {c.verified.map((v, i) => (
                <li key={i}>
                  <span className="font-medium">{v.support}</span>
                  <span className="block text-caption text-ink-500">
                    Signed by {v.byName}, {shortDate(v.at)}
                  </span>
                  {v.summary && <span className="block text-ink-700">{v.summary}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-border pt-3">
          <p className="mb-1 font-semibold">Risks</p>
          {c.risks.length === 0 ? (
            <p className="text-ink-500">None reported.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {c.risks.map((r, i) => (
                <li key={i} className="rounded-control border border-border p-2.5">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.kind}</span>
                    {r.reviewed ? (
                      <Tag tone="healthy">Reviewed</Tag>
                    ) : (
                      <Tag tone="over">Not reviewed</Tag>
                    )}
                  </span>
                  <span className="mt-0.5 block text-ink-700">{r.text}</span>
                  <span className="mt-0.5 block text-caption text-ink-500">
                    {r.source}
                    {r.reviewed &&
                      ` · reviewed by ${r.reviewed.byName}, ${shortDate(r.reviewed.at)}${r.reviewed.action ? `: ${r.reviewed.action}` : ""}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="border-t border-border pt-3 text-caption text-ink-500">
          Clinical conclusions belong to the treating clinicians and change only in their records.
        </p>
      </div>
    </Panel>
  );
}

function DetailsSheet({
  initial,
  upcoming,
  busy,
  onClose,
  onSave,
}: {
  initial: ParticipantDetails;
  upcoming: number;
  busy: boolean;
  onClose: () => void;
  onSave: (d: ParticipantDetails) => void;
}) {
  const [d, setD] = useState(initial);
  const set = <K extends keyof ParticipantDetails>(k: K, v: ParticipantDetails[K]) =>
    setD((x) => ({ ...x, [k]: v }));
  const setAddr = (k: keyof ParticipantDetails["address"], v: string) =>
    setD((x) => ({ ...x, address: { ...x.address, [k]: v } }));
  const addressChanged = JSON.stringify(d.address) !== JSON.stringify(initial.address);
  return (
    <Sheet
      title="Edit personal details"
      description="Every change is recorded with the old and new value."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(d)}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Legal name" required value={d.name} onChange={(v) => set("name", v)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Preferred name"
            value={d.preferredName}
            onChange={(v) => set("preferredName", v)}
          />
          <TextField label="Pronouns" value={d.pronouns} onChange={(v) => set("pronouns", v)} />
        </div>
        <TextField
          label="Date of birth"
          type="date"
          required
          value={d.dateOfBirth}
          onChange={(v) => set("dateOfBirth", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" value={d.phone} onChange={(v) => set("phone", v)} />
          <TextField label="Email" type="email" value={d.email} onChange={(v) => set("email", v)} />
        </div>
        <TextField
          label="Street address"
          value={d.address.street}
          onChange={(v) => setAddr("street", v)}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_110px_110px]">
          <TextField
            label="Suburb"
            value={d.address.suburb}
            onChange={(v) => setAddr("suburb", v)}
          />
          <Field label="State">
            <Select value={d.address.state} onChange={(e) => setAddr("state", e.target.value)}>
              {australianStates.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <TextField
            label="Postcode"
            value={d.address.postcode}
            onChange={(v) => setAddr("postcode", v)}
          />
        </div>
        {addressChanged && upcoming > 0 && (
          <p className="flex gap-2 rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
            <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            {upcoming} upcoming in-person visit{upcoming === 1 ? "" : "s"} will be flagged so the
            therapist reconfirms the location.
          </p>
        )}
        <Choice
          label="Preferred contact method"
          options={contactModes}
          value={d.contactMode}
          onChange={(v) => set("contactMode", v)}
        />
        <TextField
          label="Best time to contact"
          value={d.contactTime}
          onChange={(v) => set("contactTime", v)}
          placeholder="For example, weekday mornings"
        />
        <Field label="Preferred language">
          <Select value={d.language} onChange={(e) => set("language", e.target.value)}>
            <option value="">Not given</option>
            {languages.map((l) => (
              <option key={l}>{l}</option>
            ))}
          </Select>
        </Field>
        <Tick checked={d.interpreter} onChange={(v) => set("interpreter", v)}>
          An interpreter is needed
        </Tick>
        <fieldset>
          <legend className="mb-1.5 text-small font-medium">Accessibility needs</legend>
          <div className="flex flex-wrap gap-2">
            {accessibilityNeeds.map((a) => {
              const on = d.accessibility.includes(a);
              return (
                <button
                  key={a}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    set(
                      "accessibility",
                      on ? d.accessibility.filter((x) => x !== a) : [...d.accessibility, a],
                    )
                  }
                  className={cn(
                    "h-8 cursor-pointer rounded-full border px-3 text-caption font-semibold",
                    on
                      ? "border-accent-fill bg-accent-tint text-accent"
                      : "border-border-strong text-ink-700",
                  )}
                >
                  {a}
                </button>
              );
            })}
          </div>
        </fieldset>
        <TextArea
          label="Accessibility notes"
          rows={2}
          value={d.accessibilityNotes}
          onChange={(v) => set("accessibilityNotes", v)}
        />
      </div>
    </Sheet>
  );
}

/* ---------------------------------------------------------------- contacts */

const stateTone = {
  Invited: "monitor",
  Unverified: "watch",
  Verified: "healthy",
  Expired: "over",
  Revoked: "neutral",
} as const;

const blankContact: ContactInput = {
  role: "Parent",
  name: "",
  organisation: "",
  relationship: "",
  phone: "",
  email: "",
  responsibilities: [],
  primaryFor: [],
  authorityType: "Parent/Guardian",
  authorityScope: [],
  authorityExpires: "",
  restrictions: "",
  contactAllowed: true,
};

export function ContactsTab({
  profile,
  clientId,
  busy,
  act,
}: {
  profile: ParticipantProfileDto;
  clientId: string;
  busy: boolean;
  act: Act;
}) {
  const [editing, setEditing] = useState<ContactInput | null>(null);
  const [verifying, setVerifying] = useState<ContactDto | null>(null);
  const [revoking, setRevoking] = useState<ContactDto | null>(null);
  const [shared, setShared] = useState<{ id: string; link: string } | null>(null);
  return (
    <Panel
      title="Contacts and representatives"
      action={
        <Button size="sm" variant="primary" onClick={() => setEditing({ ...blankContact })}>
          <Plus className="size-3.5" aria-hidden="true" />
          Add contact
        </Button>
      }
    >
      {profile.contacts.length === 0 ? (
        <p className="text-small text-ink-500">
          No contacts yet. Add the booking and emergency contacts first.
        </p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {profile.contacts.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex flex-col gap-3 rounded-card border border-border p-4",
                c.state === "Revoked" && "opacity-70",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body font-semibold">{c.name}</p>
                  <p className="text-caption text-ink-500">
                    {c.role}
                    {c.relationship && ` · ${c.relationship}`}
                    {c.organisation && ` · ${c.organisation}`}
                  </p>
                </div>
                <Tag tone={stateTone[c.state]}>{c.state}</Tag>
              </div>
              <p className="text-small text-ink-700">
                {[c.phone, c.email].filter(Boolean).join(" · ") || "No phone or email"}
                {!c.contactAllowed && <span className="ml-2 text-over">Do not contact</span>}
              </p>
              {c.responsibilities.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {c.responsibilities.map((r) => (
                    <span
                      key={r}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-tag px-2 py-0.5 text-label font-semibold",
                        c.primaryFor.includes(r)
                          ? "bg-accent-tint text-accent"
                          : "bg-sunken text-ink-700",
                      )}
                    >
                      {c.primaryFor.includes(r) && (
                        <Star className="size-3 fill-current" aria-hidden="true" />
                      )}
                      {r}
                      {c.primaryFor.includes(r) && <span className="sr-only"> (primary)</span>}
                    </span>
                  ))}
                </div>
              )}
              <div className="rounded-control bg-canvas px-3 py-2 text-caption text-ink-700">
                <span className="font-semibold text-ink-900">Authority:</span> {c.authorityType}
                {c.authorityScope.length > 0 && ` · ${c.authorityScope.join(", ")}`}
                {c.authorityExpires && ` · expires ${shortDate(`${c.authorityExpires}T00:00:00Z`)}`}
                {c.verifiedBy && ` · verified by ${c.verifiedBy}`}
                {delegateRoles.includes(c.role) && (
                  <span
                    className={cn(
                      "mt-1 flex items-center gap-1.5 font-semibold",
                      c.canAct ? "text-healthy" : "text-over",
                    )}
                  >
                    {c.canAct ? (
                      <ShieldCheck className="size-3.5" aria-hidden="true" />
                    ) : (
                      <Lock className="size-3.5" aria-hidden="true" />
                    )}
                    {c.canAct
                      ? "Can act for the participant within this scope"
                      : "Can't act for the participant until authority is verified"}
                  </span>
                )}
                {c.revoked && (
                  <span className="mt-1 block text-over">
                    Revoked by {c.revoked.byName}, {relativeTime(c.revoked.at)}: {c.revoked.reason}
                  </span>
                )}
              </div>
              {shared?.id === c.id && (
                <div className="bubble-in flex items-center gap-2 rounded-control border border-accent/30 bg-accent-tint/40 p-2">
                  <code className="min-w-0 flex-1 truncate px-1 text-caption">{shared.link}</code>
                  <Button
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard?.writeText(shared.link);
                      toast("Link copied", {
                        tone: "success",
                        detail: "Appointments only; it stops if access ends.",
                      });
                    }}
                  >
                    Copy
                  </Button>
                </div>
              )}
              {c.state !== "Revoked" && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="soft" onClick={() => setEditing({ ...c })}>
                    Edit
                  </Button>
                  {c.state !== "Verified" && (
                    <Button size="sm" variant="primary" onClick={() => setVerifying(c)}>
                      <BadgeCheck className="size-3.5" aria-hidden="true" />
                      Verify authority
                    </Button>
                  )}
                  {c.role !== "Participant" && (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={async () => {
                        try {
                          const r = await api<{ link?: string }>(
                            `/api/care/clients/${clientId}/profile`,
                            {
                              body: { type: "contact-link", id: c.id },
                            },
                          );
                          if (r.link)
                            setShared({ id: c.id, link: `${window.location.origin}${r.link}` });
                        } catch (e) {
                          toast("Can't share appointments yet", {
                            tone: "warning",
                            detail: e instanceof Error ? e.message : "",
                          });
                        }
                      }}
                    >
                      Appointments link
                    </Button>
                  )}
                  <Button size="sm" variant="soft-danger" onClick={() => setRevoking(c)}>
                    <UserX className="size-3.5" aria-hidden="true" />
                    Revoke
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <ContactSheet
          initial={editing}
          busy={busy}
          others={profile.contacts}
          onClose={() => setEditing(null)}
          onSave={async (contact) => {
            if (await act({ type: "contact-save", contact })) setEditing(null);
          }}
        />
      )}
      {verifying && (
        <VerifySheet
          contact={verifying}
          busy={busy}
          onClose={() => setVerifying(null)}
          onSave={async (evidence, expires) => {
            if (await act({ type: "contact-verify", id: verifying.id, evidence, expires }))
              setVerifying(null);
          }}
        />
      )}
      {revoking && (
        <ReasonOnly
          title={`Revoke ${revoking.name}'s access`}
          description="Their delegated access stops straight away. The history stays on record."
          button="Revoke access"
          busy={busy}
          onClose={() => setRevoking(null)}
          onSave={async (reason) => {
            if (await act({ type: "contact-revoke", id: revoking.id, reason })) setRevoking(null);
          }}
        />
      )}
    </Panel>
  );
}

function Chips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-small font-medium">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])}
              className={cn(
                "h-8 cursor-pointer rounded-full border px-3 text-caption font-semibold",
                on
                  ? "border-accent-fill bg-accent-tint text-accent"
                  : "border-border-strong text-ink-700",
              )}
            >
              {o}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function ContactSheet({
  initial,
  others,
  busy,
  onClose,
  onSave,
}: {
  initial: ContactInput;
  others: ContactDto[];
  busy: boolean;
  onClose: () => void;
  onSave: (c: ContactInput) => void;
}) {
  const [c, setC] = useState<ContactInput>(initial);
  const set = <K extends keyof ContactInput>(k: K, v: ContactInput[K]) =>
    setC((x) => ({ ...x, [k]: v }));
  const replacing = c.primaryFor.flatMap((r) =>
    others.filter((o) => o.id !== c.id && o.primaryFor.includes(r)).map((o) => `${o.name} (${r})`),
  );
  return (
    <Sheet
      title={c.id ? `Edit ${initial.name}` : "Add a contact"}
      description="Responsibilities say what this person does; authority says what they may do for the participant."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={busy} onClick={() => onSave(c)}>
            Save contact
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role">
            <Select
              value={c.role}
              onChange={(e) => set("role", e.target.value as ContactInput["role"])}
            >
              {contactRoles03.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </Select>
          </Field>
          <TextField
            label="Relationship"
            value={c.relationship}
            onChange={(v) => set("relationship", v)}
          />
        </div>
        <TextField label="Name" required value={c.name} onChange={(v) => set("name", v)} />
        <TextField
          label="Organisation"
          value={c.organisation}
          onChange={(v) => set("organisation", v)}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Phone" value={c.phone} onChange={(v) => set("phone", v)} />
          <TextField label="Email" type="email" value={c.email} onChange={(v) => set("email", v)} />
        </div>
        <Chips
          label="Responsibilities"
          options={responsibilities}
          value={c.responsibilities}
          onChange={(v) =>
            setC((x) => ({
              ...x,
              responsibilities: v,
              primaryFor: x.primaryFor.filter((p) => v.includes(p)),
            }))
          }
        />
        {c.responsibilities.length > 0 && (
          <Chips
            label="Primary contact for"
            options={c.responsibilities}
            value={c.primaryFor}
            onChange={(v) => set("primaryFor", v)}
          />
        )}
        {replacing.length > 0 && (
          <p className="flex gap-2 rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
            <CircleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
            This replaces {replacing.join(", ")} as primary. The change is kept in the history.
          </p>
        )}
        <Field label="Authority type">
          <Select
            value={c.authorityType}
            onChange={(e) => set("authorityType", e.target.value as ContactInput["authorityType"])}
          >
            {authorityTypes.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </Field>
        <Chips
          label="Authority scope"
          options={authorityScopes}
          value={c.authorityScope}
          onChange={(v) => set("authorityScope", v)}
        />
        <TextField
          label="Authority expires"
          type="date"
          value={c.authorityExpires}
          onChange={(v) => set("authorityExpires", v)}
        />
        <TextArea
          label="Restrictions"
          rows={2}
          value={c.restrictions}
          onChange={(v) => set("restrictions", v)}
        />
        <Tick checked={c.contactAllowed} onChange={(v) => set("contactAllowed", v)}>
          Medisense may contact this person
        </Tick>
      </div>
    </Sheet>
  );
}

function VerifySheet({
  contact,
  busy,
  onClose,
  onSave,
}: {
  contact: ContactDto;
  busy: boolean;
  onClose: () => void;
  onSave: (evidence: string, expires: string) => void;
}) {
  const [evidence, setEvidence] = useState("");
  const [expires, setExpires] = useState(contact.authorityExpires);
  return (
    <Sheet
      title={`Verify ${contact.name}`}
      description={`${contact.role} with ${contact.authorityType} authority. Record what you checked; this is a simulated check in the demo.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={evidence.trim().length < 3}
            onClick={() => onSave(evidence, expires)}
          >
            Mark verified
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextArea
          label="Evidence checked"
          required
          rows={3}
          value={evidence}
          onChange={setEvidence}
          placeholder="For example, guardianship order sighted; ID matched by phone call"
        />
        <TextField
          label="Authority expires"
          type="date"
          value={expires}
          onChange={setExpires}
          hint="Delegated access stops on this date until it's verified again."
        />
      </div>
    </Sheet>
  );
}

function ReasonOnly({
  title,
  description,
  button,
  busy,
  onClose,
  onSave,
}: {
  title: string;
  description: string;
  button: string;
  busy: boolean;
  onClose: () => void;
  onSave: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Sheet
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={reason.trim().length < 3}
            onClick={() => onSave(reason)}
          >
            {button}
          </Button>
        </>
      }
    >
      <TextArea label="Reason" required rows={3} value={reason} onChange={setReason} />
    </Sheet>
  );
}

/* ----------------------------------------------------------------- consent */

const consentTone = {
  "Not asked": "neutral",
  Given: "healthy",
  Refused: "over",
  Withdrawn: "watch",
} as const;

export function ConsentTab({
  profile,
  busy,
  act,
}: {
  profile: ParticipantProfileDto;
  busy: boolean;
  act: Act;
}) {
  const [recording, setRecording] = useState<ConsentDto | null>(null);
  const rec = profile.consents.find((c) => c.key === "recording");
  return (
    <div className="flex flex-col gap-6">
      <div
        className={cn(
          "flex items-center gap-3 rounded-card border px-4 py-3 text-small",
          rec?.state === "Given" ? "border-border bg-surface" : "border-border bg-canvas",
        )}
      >
        <Video className="size-4.5 flex-none text-ink-500" aria-hidden="true" />
        <span className="flex-1">
          <strong>Telehealth recording is {rec?.state === "Given" ? "allowed" : "off"}.</strong>{" "}
          {rec?.state === "Given"
            ? "Each session still needs the clinician to start recording."
            : "Sessions can't be recorded until this consent is given."}
        </span>
      </div>
      <Panel title="Consent and privacy">
        <ul className="flex flex-col divide-y divide-border">
          {profile.consents.map((c) => (
            <li
              key={c.key}
              className="flex flex-wrap items-start gap-3 py-3.5 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-small font-semibold">{c.label}</p>
                <p className="text-caption text-ink-500">{c.help}</p>
                {c.at && (
                  <p className="mt-1 text-caption text-ink-700">
                    {c.state} by {c.respondent}, recorded by {c.recordedBy}, {shortDate(c.at)}
                    {c.version && ` · version ${c.version}`}
                  </p>
                )}
                {c.scope.length > 0 && (
                  <p className="mt-1 flex flex-wrap gap-1.5">
                    {c.scope.map((s) => (
                      <span
                        key={s}
                        className="rounded-tag bg-accent-tint px-2 py-0.5 text-label font-semibold text-accent"
                      >
                        {s}
                      </span>
                    ))}
                    <span className="rounded-tag bg-sunken px-2 py-0.5 text-label text-ink-500">
                      Never: therapy notes, recordings
                    </span>
                  </p>
                )}
                {c.history.length > 1 && (
                  <details className="mt-1.5">
                    <summary className="flex cursor-pointer items-center gap-1 text-caption font-semibold text-ink-700">
                      <History className="size-3.5" aria-hidden="true" /> History (
                      {c.history.length})
                    </summary>
                    <ul className="mt-1 flex flex-col gap-0.5 text-caption text-ink-500">
                      {[...c.history].reverse().map((h, i) => (
                        <li key={i}>
                          {h.state} by {h.respondent} · {h.recordedBy}, {shortDate(h.at)}
                          {h.note && ` · ${h.note}`}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <Tag tone={consentTone[c.state]}>{c.state}</Tag>
              <Button size="sm" variant="soft" onClick={() => setRecording(c)}>
                Record answer
              </Button>
            </li>
          ))}
        </ul>
      </Panel>
      {recording && (
        <ConsentSheet
          consent={recording}
          busy={busy}
          onClose={() => setRecording(null)}
          onSave={async (body) => {
            if (await act({ type: "consent", key: recording.key, ...body })) setRecording(null);
          }}
        />
      )}
    </div>
  );
}

function ConsentSheet({
  consent,
  busy,
  onClose,
  onSave,
}: {
  consent: ConsentDto;
  busy: boolean;
  onClose: () => void;
  onSave: (b: { state: string; respondent: string; scope: string[]; note: string }) => void;
}) {
  const options =
    consent.state === "Given" ? (["Given", "Withdrawn"] as const) : (["Given", "Refused"] as const);
  const [state, setState] = useState<"Given" | "Refused" | "Withdrawn">(options[0]);
  const [respondent, setRespondent] = useState(consent.respondent);
  const [scope, setScope] = useState<(typeof shareCategories)[number][]>(
    consent.scope as (typeof shareCategories)[number][],
  );
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={consent.label}
      description={consent.help}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={state === "Given" ? "primary" : "danger"}
            loading={busy}
            disabled={respondent.trim().length < 2}
            onClick={() => onSave({ state, respondent, scope, note })}
          >
            Record {state.toLowerCase()}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice label="Answer" options={options} value={state} onChange={setState} />
        <TextField
          label="Given by"
          required
          value={respondent}
          onChange={setRespondent}
          hint="The participant or their verified representative."
        />
        {consent.key === "share-coordinator" && state === "Given" && (
          <Chips
            label="The coordinator may receive"
            options={shareCategories}
            value={scope}
            onChange={setScope}
          />
        )}
        {state === "Withdrawn" && (
          <p className="rounded-control bg-watch-bg px-3 py-2 text-small text-watch">
            Future sharing in this scope stops now. Records already made stay on file, as the law
            requires.
          </p>
        )}
        <TextArea label="Note" rows={2} value={note} onChange={setNote} />
      </div>
    </Sheet>
  );
}

/* ----------------------------------------------------------- close service */

export function CloseService({ need, busy, act }: { need: NeedDto; busy: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  if (need.status === "completed") return null;
  return (
    <>
      <Button size="sm" variant="soft-danger" onClick={() => setOpen(true)}>
        Close this service
      </Button>
      {open && (
        <ReasonOnly
          title={`Close ${need.support}`}
          description="Only this service ends: its future visits are cancelled without charge. Other services and the participant stay active."
          button="Close service"
          busy={busy}
          onClose={() => setOpen(false)}
          onSave={async (reason) => {
            if (await act({ type: "close-service", needId: need.id, reason })) setOpen(false);
          }}
        />
      )}
    </>
  );
}

/** Loads the Module 03 record for a tab, with loading and error states. */
export function WithProfile({
  clientId,
  onChanged,
  children,
}: {
  clientId: string;
  onChanged?: () => void;
  children: (p: ParticipantProfileDto, busy: boolean, act: Act) => React.ReactNode;
}) {
  const { data, error, reload, busy, act } = useParticipant(clientId, onChanged);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  return <>{children(data.profile, busy, act)}</>;
}
