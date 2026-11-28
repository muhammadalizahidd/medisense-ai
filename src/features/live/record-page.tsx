"use client";

import { AiOnly } from "@/components/ai/ai-switch";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  ClipboardCheck,
  History,
  KeyRound,
  Lock,
  ShieldAlert,
  Stethoscope,
  Target,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AiChip, AiDraft, RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useNow, useResource } from "@/lib/live/client";
import {
  accessPurposes,
  completenessTone,
  type RecordDto,
  type TimelineEvent,
} from "@/lib/live/records";
import { cn } from "@/lib/cn";
import { EmptyNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { dayOnly, ops, tableBox, tableHead, when } from "./ops-bits";
import { th, td } from "./funding-bits";
import { ConditionsTab, DocumentsTab, EntriesTab, HistoryTab, RisksTab } from "./record-clinical";

const allTabs = [
  { id: "summary", label: "Summary" },
  { id: "history", label: "History" },
  { id: "conditions", label: "Conditions & medicines" },
  { id: "risks", label: "Risks & safety" },
  { id: "entries", label: "Clinical entries" },
  { id: "timeline", label: "Timeline" },
  { id: "documents", label: "Documents" },
  { id: "consent", label: "Consent" },
  { id: "team", label: "Care team" },
  { id: "reconcile", label: "Reconciliation" },
  { id: "access", label: "Access log" },
] as const;
export type RecordTab = (typeof allTabs)[number]["id"];

export function RecordPage({
  clientId,
  base,
}: {
  clientId: string;
  base: "/therapist/records" | "/care/records";
}) {
  const url = `/api/care/records/${clientId}`;
  const { data, error, loading, reload } = useResource<{ record: RecordDto }>(
    url,
    (e) => e.type === "care" && (!e.payload.clientId || e.payload.clientId === clientId),
  );
  const [tab, setTab] = useTab(allTabs);
  if (error && !data) {
    return (
      <div className="mx-auto mt-16 max-w-lg rounded-card border border-border bg-surface p-8 text-center shadow-lift">
        <Lock className="mx-auto size-8 text-ink-500" aria-hidden="true" />
        <h1 className="mt-3 type-display text-h2 text-ink-900">No access to this record</h1>
        <p className="mt-2 text-small text-ink-700">{error}</p>
        <ButtonLink className="mt-5" href={base}>
          Back to clinical records
        </ButtonLink>
      </div>
    );
  }
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  const r = data.record;
  const post = async (body: unknown, ok: string, detail?: string) => {
    const res = await ops(url, body, ok, detail);
    if (res) reload();
    return Boolean(res);
  };
  const clinical = r.canWrite;
  const visible = allTabs.filter((t) => {
    if (r.access === "finance") return t.id === "summary";
    if (r.access === "scheduler") return ["summary", "risks", "team"].includes(t.id);
    if (r.access === "intake" || r.needsPurpose)
      return ["summary", "timeline", "documents", "consent", "team", "reconcile"].includes(t.id);
    return true;
  });
  const openExceptions = r.exceptions.filter((x) => !x.resolved).length;
  const tabs = visible.map((t) => ({
    ...t,
    count:
      t.id === "risks"
        ? r.risks.filter((x) => x.review !== "Retired").length || undefined
        : t.id === "entries"
          ? r.entries.filter((e) => e.status === "Draft").length || undefined
          : t.id === "reconcile"
            ? openExceptions || undefined
            : t.id === "documents"
              ? r.documents.length || undefined
              : undefined,
    alert: t.id === "reconcile" || t.id === "entries",
  }));
  const current = visible.some((t) => t.id === tab) ? tab : "summary";

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Records
          </ButtonLink>
        }
        title="Clinical record"
        actions={<LiveBadge />}
      />
      <Identity r={r} />
      {r.needsPurpose && (
        <PurposeGate
          onOpen={(purpose) =>
            post(
              { type: "open", purpose },
              "Record opened",
              "Your purpose is logged with every view",
            )
          }
        />
      )}
      {!clinical && !r.needsPurpose && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <KeyRound className="size-4 text-ink-500" aria-hidden="true" />
          {r.accessNote}. Clinical history, notes and sensitive documents aren&apos;t shown to your
          role.
        </p>
      )}
      <div className="mt-2">
        <Tabs
          label="Clinical record"
          tabs={tabs}
          value={current}
          onChange={(t: RecordTab) => setTab(t)}
        />
      </div>
      <TabPanel id="summary" value={current}>
        <Summary r={r} post={post} go={setTab} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <HistoryTab r={r} post={post} />
      </TabPanel>
      <TabPanel id="conditions" value={current}>
        <ConditionsTab r={r} post={post} />
      </TabPanel>
      <TabPanel id="risks" value={current}>
        <RisksTab r={r} post={post} />
      </TabPanel>
      <TabPanel id="entries" value={current}>
        <EntriesTab r={r} post={post} />
      </TabPanel>
      <TabPanel id="timeline" value={current}>
        <Timeline r={r} />
      </TabPanel>
      <TabPanel id="documents" value={current}>
        <DocumentsTab r={r} post={post} />
      </TabPanel>
      <TabPanel id="consent" value={current}>
        <Consent r={r} />
      </TabPanel>
      <TabPanel id="team" value={current}>
        <CareTeam r={r} />
      </TabPanel>
      <TabPanel id="reconcile" value={current}>
        <Reconcile r={r} post={post} />
      </TabPanel>
      <TabPanel id="access" value={current}>
        <AccessTab r={r} post={post} />
      </TabPanel>
    </>
  );
}

export type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;

/* ------------------------------------------------------------------ header (section 4) */

function Identity({ r }: { r: RecordDto }) {
  const now = useNow();
  const age = r.dateOfBirth
    ? Math.floor(
        ((now ?? Date.parse(r.lastUpdated.at)) - Date.parse(r.dateOfBirth)) / (365.25 * 86_400_000),
      )
    : null;
  return (
    <section
      aria-label="Participant"
      className="overflow-hidden rounded-card border border-border bg-surface shadow-lift"
    >
      <div className="grid gap-px bg-border xl:grid-cols-12">
        <div className="flex items-center gap-5 bg-surface p-6 xl:col-span-5">
          <Avatar name={r.name} size={72} className="bg-accent-tint text-accent" />
          <div className="min-w-0">
            <h2 className="type-display text-h1 leading-tight text-ink-900">{r.name}</h2>
            <p className="mt-1 text-small text-ink-700">
              <span className="font-mono">{r.participantId}</span>
              {age !== null && ` · ${age} years`}
              {r.pronouns && ` · ${r.pronouns}`}
              {r.preferredName && ` · prefers “${r.preferredName}”`}
            </p>
            <p className="text-small text-ink-500">
              {r.suburb}, {r.region} · {r.funding}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <Tag tone={completenessTone[r.completeness]}>
                History {r.completeness.toLowerCase()}
              </Tag>
              {r.discharged && <Tag tone="neutral">Discharged {dayOnly(r.discharged.at)}</Tag>}
              <Tag tone="outline">
                {r.access === "treating"
                  ? "Treating clinician"
                  : r.access === "clinical-lead"
                    ? "Clinical Lead"
                    : "Limited view"}
              </Tag>
            </div>
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4 xl:col-span-7">
          {[
            [
              "Referral",
              r.referral ? `${r.referral.reference}` : "Not linked",
              r.referral
                ? `from ${r.referral.source.toLowerCase()} · ${dayOnly(r.referral.submittedAt)}`
                : "",
            ],
            [
              "Next appointment",
              r.nextAppointment ? when(r.nextAppointment.at) : "None booked",
              r.nextAppointment
                ? `${r.nextAppointment.location} · ${r.nextAppointment.status}`
                : "",
            ],
            [
              "Last visit",
              r.lastVisit ? dayOnly(r.lastVisit.at) : "No visits yet",
              r.lastVisit
                ? `${r.lastVisit.clinician} · note ${r.lastVisit.signed ? "signed" : "unsigned"}`
                : "",
            ],
            [
              "Primary contact",
              r.primaryContact?.name ?? "Self",
              r.primaryContact
                ? `${r.primaryContact.relationship} · ${r.primaryContact.verified ? "authority verified" : "not verified"}`
                : "Participant",
            ],
          ].map(([k, v, sub]) => (
            <div key={k} className="bg-surface px-5 py-4">
              <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {k}
              </dt>
              <dd className="mt-1 truncate text-small font-semibold text-ink-900">{v}</dd>
              {sub && <dd className="truncate text-caption text-ink-500">{sub}</dd>}
            </div>
          ))}
        </dl>
      </div>
      {(r.alerts.length > 0 || r.precautions) && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-canvas px-6 py-3">
          <AlertTriangle className="size-4 text-over" aria-hidden="true" />
          {r.precautions && <Tag tone="over">Precaution: {r.precautions.slice(0, 80)}</Tag>}
          {r.alerts.map((a, i) => (
            <Tag key={i} tone={a.tone}>
              {a.text}
            </Tag>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-3">
        <span className="mr-1 text-caption font-semibold text-ink-500">Courses of care</span>
        {r.episodes.map((e) => (
          <span
            key={e.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-tag border px-2.5 py-1 text-caption",
              e.mine
                ? "border-accent bg-accent-tint text-accent"
                : "border-border-strong text-ink-700",
            )}
          >
            {e.restricted && <Lock className="size-3" aria-label="Restricted discipline" />}
            <strong className="font-semibold">{e.support}</strong> · {e.status} ·{" "}
            {e.clinician ?? "unassigned"}
          </span>
        ))}
        <span className="ml-auto text-caption text-ink-500">
          Updated {when(r.lastUpdated.at)} by {r.lastUpdated.by}
        </span>
      </div>
    </section>
  );
}

function PurposeGate({ onOpen }: { onOpen: (p: string) => void }) {
  const [purpose, setPurpose] = useState<string>(accessPurposes[0]);
  return (
    <section className="flex flex-wrap items-center gap-4 rounded-card border border-watch bg-watch-bg px-5 py-4">
      <KeyRound className="size-5 text-watch" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-small font-semibold text-ink-900">
          Record your purpose to open the full clinical record
        </p>
        <p className="text-caption text-ink-700">
          Clinical Lead access is authorised, not blanket. Your purpose is stored with every view
          for 12 hours.
        </p>
      </div>
      <div className="w-72">
        <Select
          aria-label="Purpose"
          className="h-9"
          value={purpose}
          onChange={(e) => setPurpose(e.target.value)}
        >
          {accessPurposes.map((p) => (
            <option key={p}>{p}</option>
          ))}
        </Select>
      </div>
      <Button variant="primary" size="sm" onClick={() => onOpen(purpose)}>
        Open record
      </Button>
    </section>
  );
}

/* ------------------------------------------------------------------ CR-02 summary */

function Summary({ r, post, go }: { r: RecordDto; post: Post; go: (t: RecordTab) => void }) {
  const openRisks = r.risks.filter((x) => x.review !== "Retired");
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
        <FCard
          icon={Stethoscope}
          title="Courses of care"
          sub="Each discipline keeps its own course of care, clinician, goals and notes"
          flush
        >
          <ul className="divide-y divide-border">
            {r.episodes.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-small font-semibold text-ink-900">
                    {e.support}
                    {e.restricted && (
                      <span className="inline-flex items-center gap-1 rounded-tag border border-border-strong px-1.5 text-label font-semibold text-ink-700">
                        <Lock className="size-3" aria-hidden="true" /> Restricted notes
                      </span>
                    )}
                  </span>
                  <span className="text-caption text-ink-500">
                    {e.discipline} · {e.location} · {e.clinician ?? "awaiting a clinician"}
                  </span>
                </span>
                <Tag
                  tone={
                    e.status === "Active"
                      ? "healthy"
                      : e.status === "Awaiting assessment"
                        ? "available"
                        : "neutral"
                  }
                >
                  {e.status}
                </Tag>
                {e.assessment && (
                  <ButtonLink size="sm" variant="ghost" href={e.assessment.href}>
                    Assessment · {e.assessment.status}
                  </ButtonLink>
                )}
                {e.plan && (
                  <ButtonLink size="sm" variant="ghost" href={e.plan.href}>
                    Plan · {e.plan.status}
                  </ButtonLink>
                )}
              </li>
            ))}
            {!r.episodes.length && (
              <li className="px-5 py-6 text-small text-ink-500">
                No active course of care. Nothing clinical is shown until a service starts.
              </li>
            )}
          </ul>
        </FCard>
        {r.canWrite && (
          <AiOnly>
            <AiPanel r={r} post={post} />
          </AiOnly>
        )}
        {r.goals.length > 0 && (
          <FCard icon={Target} title="Care goals" sub="From approved treatment plans" flush>
            <ul className="divide-y divide-border">
              {r.goals.map((g, i) => (
                <li key={i} className="flex items-center gap-3 px-5 py-3 text-small">
                  <span className="min-w-0 flex-1 text-ink-900">{g.description}</span>
                  <span className="text-caption text-ink-500">
                    now {g.current || "—"} · target {g.target}
                  </span>
                  <Tag tone={g.status === "Achieved" ? "healthy" : "available"}>{g.status}</Tag>
                </li>
              ))}
            </ul>
          </FCard>
        )}
      </div>
      <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
        <FCard
          icon={ShieldAlert}
          title="Safety for visits"
          sub={
            r.access === "scheduler"
              ? "Only what's needed to plan a visit"
              : "Precautions and open risks"
          }
        >
          {r.safetySummary.length ? (
            <ul className="flex flex-col gap-2">
              {r.safetySummary.map((s, i) => (
                <li
                  key={i}
                  className="rounded-control border border-over-bg bg-over-bg px-3 py-2 text-small text-ink-900"
                >
                  {s}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-500">No visit precautions recorded.</p>
          )}
          {openRisks.length > 0 && r.canWrite && (
            <Button className="mt-3" size="sm" variant="ghost" onClick={() => go("risks")}>
              {openRisks.length} open risk{openRisks.length === 1 ? "" : "s"}{" "}
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            </Button>
          )}
        </FCard>
        {r.canWrite && (
          <FCard icon={ClipboardCheck} title="Clinical snapshot">
            <dl className="grid grid-cols-2 gap-4 text-small">
              <div>
                <dt className="text-caption text-ink-500">Conditions</dt>
                <dd className="font-semibold text-ink-900">
                  {r.conditions.filter((c) => c.status === "Confirmed by clinician").length}{" "}
                  confirmed ·{" "}
                  {r.conditions.filter((c) => c.status === "Reported by referral").length} reported
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-500">Allergies</dt>
                <dd
                  className={cn("font-semibold", r.allergies.length ? "text-over" : "text-ink-900")}
                >
                  {r.allergies.length
                    ? r.allergies.map((a) => a.substance).join(", ")
                    : r.allergyState}
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-500">Medicines</dt>
                <dd className="font-semibold text-ink-900">
                  {r.medications.filter((m) => m.status === "Current").length} current
                </dd>
              </div>
              <div>
                <dt className="text-caption text-ink-500">History review</dt>
                <dd className="font-semibold text-ink-900">
                  {r.historyReview
                    ? `${r.historyReview.by}, ${dayOnly(r.historyReview.at)}`
                    : "Not yet reviewed"}
                </dd>
              </div>
            </dl>
          </FCard>
        )}
        <FCard icon={CalendarClock} title="Recent activity" flush>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {r.timeline.slice(0, 8).map((t) => (
              <li key={t.id} className="px-5 py-2.5">
                <span className="block truncate text-small text-ink-900">{t.title}</span>
                <span className="text-caption text-ink-500">
                  {t.kind} · {dayOnly(t.at)}
                  {t.by ? ` · ${t.by}` : ""}
                </span>
              </li>
            ))}
            {!r.timeline.length && (
              <li className="px-5 py-6 text-small text-ink-500">No events you can see yet.</li>
            )}
          </ul>
        </FCard>
      </div>
    </div>
  );
}

const aiKinds = [
  {
    kind: "summary" as const,
    label: "Case summary",
    help: "A source-linked summary of the verified record",
  },
  {
    kind: "gaps" as const,
    label: "History gaps",
    help: "What's missing or unclear; Unknown is a valid answer",
  },
  {
    kind: "handover" as const,
    label: "Handover draft",
    help: "For the care team, from permissioned records only",
  },
];

function AiPanel({ r, post }: { r: RecordDto; post: Post }) {
  const [kind, setKind] = useState<(typeof aiKinds)[number]["kind"]>("summary");
  const [busy, setBusy] = useState(false);
  const cur = r.ai.find((a) => a.kind === kind);
  return (
    <section className="overflow-hidden rounded-card border border-border bg-surface shadow-lift">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3.5">
        <AiChip>Ask Medisense</AiChip>
        <h3 className="text-section font-semibold text-ink-900">Record assistant</h3>
        <div
          className="ml-auto flex rounded-control border border-border-strong p-0.5"
          role="group"
          aria-label="What to draft"
        >
          {aiKinds.map((k) => (
            <button
              key={k.kind}
              type="button"
              aria-pressed={kind === k.kind}
              onClick={() => setKind(k.kind)}
              className={cn(
                "h-8 cursor-pointer rounded-control px-3 text-caption font-semibold",
                kind === k.kind ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
      </header>
      <div className="p-5">
        <p className="mb-3 text-caption text-ink-500">
          {aiKinds.find((k) => k.kind === kind)?.help}. Every point cites its source; uncertain
          points are marked. Nothing is saved to the record until you approve it.
        </p>
        {busy ? (
          <AiDraft label="Drafting" suggestionsOnly generating />
        ) : cur ? (
          <AiDraft
            label={
              cur.approved ? `Approved by ${cur.approved.by}` : "AI draft · needs your approval"
            }
            suggestionsOnly={!cur.approved}
            meta={when(cur.at)}
          >
            <p className="text-small text-ink-900">{cur.text}</p>
            <ul className="mt-3 flex flex-col gap-1.5">
              {cur.points.map((p, i) => (
                <li key={i} className="flex items-start gap-2 text-small text-ink-900">
                  <span
                    className={cn(
                      "mt-0.5 flex-none rounded-tag px-1.5 font-mono text-label",
                      p.uncertain ? "bg-watch-bg text-watch" : "bg-accent-tint text-accent",
                    )}
                  >
                    {p.source || "no source"}
                  </span>
                  <span>
                    {p.text}
                    {p.uncertain && (
                      <span className="ml-1 text-caption font-semibold text-watch">
                        · uncertain
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {!cur.approved && (
              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    post(
                      { type: "ai-approve", kind },
                      "Approved",
                      "Saved with your name and the time",
                    )
                  }
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    setBusy(true);
                    await post({ type: "ai", kind }, "Redrafted");
                    setBusy(false);
                  }}
                >
                  Regenerate
                </Button>
              </div>
            )}
          </AiDraft>
        ) : (
          <div className="rounded-card border border-dashed border-border-strong px-6 py-8 text-center">
            <p className="text-small text-ink-700">
              No {aiKinds.find((k) => k.kind === kind)?.label.toLowerCase()} yet.
            </p>
            <Button
              className="mt-3"
              size="sm"
              variant="soft"
              onClick={async () => {
                setBusy(true);
                await post(
                  { type: "ai", kind },
                  "Draft ready",
                  "Check every point against its source",
                );
                setBusy(false);
              }}
            >
              Draft with AI
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ CR-08 timeline */

const kinds: TimelineEvent["kind"][] = [
  "Referral",
  "Assessment",
  "Treatment plan",
  "Visit",
  "Outcome",
  "Entry",
  "Amendment",
  "Risk",
  "Consent",
  "Recording",
  "Report",
  "Discharge",
];

function Timeline({ r }: { r: RecordDto }) {
  const [kind, setKind] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [order, setOrder] = useState<"new" | "old">("new");
  const disciplines = [
    ...new Set(r.timeline.map((t) => t.discipline).filter((d): d is string => Boolean(d))),
  ];
  const rows = r.timeline.filter(
    (t) => (!kind || t.kind === kind) && (!discipline || t.discipline === discipline),
  );
  const list = order === "new" ? rows : [...rows].reverse();
  const months = new Map<string, TimelineEvent[]>();
  for (const t of list) {
    const k = new Intl.DateTimeFormat("en-AU", {
      month: "long",
      year: "numeric",
      timeZone: "Australia/Brisbane",
    }).format(new Date(t.at));
    months.set(k, [...(months.get(k) ?? []), t]);
  }
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-48">
          <Select
            aria-label="Event type"
            className="h-9"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All events</option>
            {kinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        <div className="w-52">
          <Select
            aria-label="Discipline"
            className="h-9"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
          >
            <option value="">All disciplines</option>
            {disciplines.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </Select>
        </div>
        <div className="flex rounded-control border border-border-strong p-0.5">
          {(["new", "old"] as const).map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={order === o}
              onClick={() => setOrder(o)}
              className={cn(
                "h-8 cursor-pointer rounded-control px-3 text-caption font-semibold",
                order === o ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
              )}
            >
              {o === "new" ? "Newest first" : "Oldest first"}
            </button>
          ))}
        </div>
        <span className="ml-auto text-caption text-ink-500">
          {rows.length} events · restricted events show only that they happened
        </span>
      </div>
      {!rows.length ? (
        <EmptyNote title="No events match." />
      ) : (
        <div className="h-[640px] overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-lift">
          {[...months.entries()].map(([m, evs]) => (
            <section key={m} className="mb-6">
              <h3 className="sticky top-0 z-10 mb-3 bg-surface py-1 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {m}
              </h3>
              <ol className="relative ml-3 border-l border-border-strong">
                {evs.map((t) => (
                  <li key={t.id} className="relative mb-4 pl-6">
                    <span
                      className={cn(
                        "absolute top-1.5 -left-[5px] size-2.5 rounded-full",
                        t.restricted
                          ? "bg-ink-400"
                          : t.kind === "Risk"
                            ? "bg-over-dot"
                            : t.kind === "Amendment"
                              ? "bg-watch-dot"
                              : "bg-accent-fill",
                      )}
                      aria-hidden="true"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Tag tone="outline">{t.kind}</Tag>
                      <span className="text-small font-semibold text-ink-900">{t.title}</span>
                      {t.restricted && (
                        <Lock className="size-3.5 text-ink-500" aria-label="Restricted" />
                      )}
                    </div>
                    {t.detail && <p className="mt-1 text-small text-ink-700">{t.detail}</p>}
                    <p className="mt-0.5 text-caption text-ink-500">
                      {when(t.at)}
                      {t.by ? ` · ${t.by}` : ""}
                      {t.discipline ? ` · ${t.discipline}` : ""}
                      {t.href && (
                        <a className="ml-2 font-semibold text-accent" href={t.href}>
                          Open
                        </a>
                      )}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ CR-10, CR-07 */

function Consent({ r }: { r: RecordDto }) {
  const tone = (s: string) =>
    (s === "Given" ? "healthy" : s === "Refused" || s === "Withdrawn" ? "over" : "neutral") as
      "healthy" | "over" | "neutral";
  return (
    <>
      <p className="flex items-center gap-2 text-small text-ink-700">
        <RuleMark>Rule</RuleMark> Telehealth, recording and AI-scribe consent are separate.
        Withdrawn sharing stops new disclosure; history already shared stays labelled.
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {r.consents.map((c) => (
          <article
            key={c.key}
            className="rounded-card border border-border bg-surface p-5 shadow-lift"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-small font-semibold text-ink-900">{c.label}</h3>
              <Tag tone={tone(c.state)}>{c.state}</Tag>
            </div>
            <p className="mt-1 text-caption text-ink-500">
              {c.at
                ? `${c.respondent} · recorded by ${c.recordedBy}, ${dayOnly(c.at)}`
                : "Not asked yet"}
            </p>
            {c.note && <p className="mt-2 text-small text-ink-700">{c.note}</p>}
            {c.scope.length > 0 && (
              <p className="mt-1 text-caption text-ink-500">Scope: {c.scope.join(", ")}</p>
            )}
            {c.key === "recording" && c.state !== "Given" && (
              <p className="mt-2 text-caption font-semibold text-watch">
                Recording stays off. Care continues without recording.
              </p>
            )}
            {c.history.length > 1 && (
              <details className="mt-2 text-caption text-ink-500">
                <summary className="cursor-pointer">History ({c.history.length})</summary>
                <ul className="mt-1">
                  {c.history.map((h, i) => (
                    <li key={i}>
                      {dayOnly(h.at)} · {h.state} · {h.by}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
      </div>
    </>
  );
}

function CareTeam({ r }: { r: RecordDto }) {
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-2">
      <FCard icon={Stethoscope} title="Clinicians" sub="One per course of care" flush>
        <ul className="divide-y divide-border">
          {r.careTeam.clinicians.map((c, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={c.name} />
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">{c.name}</span>
                <span className="text-caption text-ink-500">
                  {c.discipline} · {c.episode}
                </span>
              </span>
              <Tag tone={c.status === "Active" ? "healthy" : "available"}>{c.status}</Tag>
            </li>
          ))}
          {!r.careTeam.clinicians.length && (
            <li className="px-5 py-6 text-small text-ink-500">No clinician assigned yet.</li>
          )}
        </ul>
      </FCard>
      <FCard
        icon={Users}
        title="Contacts and representatives"
        sub="Authority is verified, never self-declared"
        flush
      >
        <ul className="divide-y divide-border">
          {r.careTeam.contacts.map((c, i) => (
            <li key={i} className="px-5 py-3">
              <span className="flex items-center gap-2">
                <span className="text-small font-semibold text-ink-900">{c.name}</span>
                <Tag tone={c.verified ? "healthy" : "watch"}>
                  {c.verified ? "Verified" : "Unverified"}
                </Tag>
              </span>
              <span className="block text-caption text-ink-500">
                {c.role}
                {c.relationship ? ` · ${c.relationship}` : ""} · authority {c.authority} · may
                receive {c.sharing}
                {!c.contactAllowed && " · contact not allowed"}
              </span>
            </li>
          ))}
          {!r.careTeam.contacts.length && (
            <li className="px-5 py-6 text-small text-ink-500">
              The participant manages their own care. No representatives recorded.
            </li>
          )}
        </ul>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ CR-12, access */

function Reconcile({ r, post }: { r: RecordDto; post: Post }) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  if (!r.exceptions.length)
    return (
      <EmptyNote title="Nothing to reconcile.">
        Conflicts, missing history, duplicates and unsynchronised drafts appear here.
      </EmptyNote>
    );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {r.exceptions.map((x) => (
        <article
          key={x.id}
          className={cn(
            "rounded-card border bg-surface p-5 shadow-lift",
            x.resolved
              ? "border-border"
              : x.kind === "Conflict"
                ? "border-over"
                : "border-border-strong",
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <Tag
                tone={
                  x.resolved
                    ? "healthy"
                    : x.kind === "Conflict" || x.kind === "Possible duplicate"
                      ? "over"
                      : "watch"
                }
              >
                {x.resolved ? "Resolved" : x.kind}
              </Tag>
              <h3 className="mt-2 text-small font-semibold text-ink-900">{x.title}</h3>
            </div>
            <RuleMark>Check</RuleMark>
          </div>
          <p className="mt-1 text-small text-ink-700">{x.detail}</p>
          {x.sources.length > 0 && (
            <p className="mt-2 text-caption text-ink-500">Sources kept: {x.sources.join(" · ")}</p>
          )}
          {x.resolved ? (
            <p className="mt-3 flex items-center gap-1.5 text-caption text-ink-700">
              <Lock className="size-3.5" aria-hidden="true" /> {x.resolved.by},{" "}
              {when(x.resolved.at)}: {x.resolved.note}
            </p>
          ) : (
            r.canWrite && (
              <div className="mt-3 flex gap-2">
                <input
                  value={notes[x.id] ?? ""}
                  onChange={(e) => setNotes({ ...notes, [x.id]: e.target.value })}
                  placeholder="How was it resolved?"
                  aria-label="Resolution"
                  className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
                />
                <Button
                  size="sm"
                  disabled={(notes[x.id] ?? "").length < 3}
                  onClick={() =>
                    post({ type: "resolve", id: x.id, note: notes[x.id] }, "Marked resolved")
                  }
                >
                  Resolve
                </Button>
              </div>
            )
          )}
        </article>
      ))}
    </div>
  );
}

function AccessTab({ r, post }: { r: RecordDto; post: Post }) {
  const [note, setNote] = useState("");
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="xl:col-span-8">
        <div className={tableBox}>
          <table className="w-full text-left text-small">
            <thead className={tableHead}>
              <tr>
                <th className={th}>When</th>
                <th className={th}>Who</th>
                <th className={th}>Action</th>
                <th className={th}>Purpose</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {r.accessLog.map((l, i) => (
                <tr key={i} className="hover:bg-canvas">
                  <td className={cn(td, "whitespace-nowrap")}>{when(l.at)}</td>
                  <td className={td}>
                    <span className="block font-semibold text-ink-900">{l.by}</span>
                    <span className="text-caption text-ink-500">{l.role}</span>
                  </td>
                  <td className={td}>{l.action}</td>
                  <td className={cn(td, "text-ink-700")}>{l.purpose}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <FCard
        icon={History}
        title="Access requests"
        sub="Consultation access is time-limited"
        className="xl:col-span-4"
        flush
      >
        <ul className="divide-y divide-border">
          {r.accessRequests.map((q) => (
            <li key={q.id} className="px-5 py-3">
              <span className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink-900">{q.name}</span>
                <Tag
                  tone={
                    q.status === "Granted"
                      ? "healthy"
                      : q.status === "Declined"
                        ? "neutral"
                        : "watch"
                  }
                >
                  {q.status}
                </Tag>
              </span>
              <span className="block text-caption text-ink-500">
                {q.reason} · {dayOnly(q.at)}
                {q.until ? ` · until ${dayOnly(q.until)}` : ""}
              </span>
              {q.status === "Pending" && r.canGrant && (
                <span className="mt-2 flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Note"
                    aria-label="Decision note"
                    className="h-8 flex-1 rounded-control border border-border-strong px-2 text-caption"
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() =>
                      post(
                        { type: "grant", requestId: q.id, approve: true, note },
                        "Access granted for 7 days",
                      )
                    }
                  >
                    Grant
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      post({ type: "grant", requestId: q.id, approve: false, note }, "Declined")
                    }
                  >
                    Decline
                  </Button>
                </span>
              )}
            </li>
          ))}
          {!r.accessRequests.length && (
            <li className="px-5 py-6 text-small text-ink-500">No requests.</li>
          )}
        </ul>
      </FCard>
    </div>
  );
}
