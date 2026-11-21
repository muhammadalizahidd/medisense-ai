"use client";

import {
  Activity,
  ArrowLeft,
  ClipboardCheck,
  ClipboardList,
  FileSignature,
  History,
  ListChecks,
  Lock,
  LogIn,
  LogOut,
  RefreshCcw,
  ShieldAlert,
  Target,
  Users,
  Video,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { AiDraft, RuleMark, Signature } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Stepper } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  activityCatalogue,
  adverseOptions,
  attendanceTone,
  attendeeRoles,
  dispositions,
  followUps,
  recordTone,
  resultTypes,
  responses,
  safetyStates,
  sessionPurposes,
  sessionUnits,
  sources,
  supportLevels,
  verificationStates,
  type InterventionRec,
  type SessionFull,
} from "@/lib/live/sessions";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { dayOnly, ops, textArea, when } from "./ops-bits";

const allTabs = [
  { id: "overview", label: "Overview" },
  { id: "prepare", label: "Prepare" },
  { id: "checkin", label: "Check-in & safety" },
  { id: "activities", label: "Activities" },
  { id: "assessment", label: "Assessment" },
  { id: "notes", label: "Notes" },
  { id: "telehealth", label: "Telehealth" },
  { id: "end", label: "End & handover" },
  { id: "history", label: "History" },
] as const;
type T = (typeof allTabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;
const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);
const flow = ["Booked", "Prepared", "Checked in", "Ended", "Signed"];
const happened = (p: SessionFull) => ["Completed", "Partially Completed"].includes(p.attendance);
const locked = (p: SessionFull) => ["Signed", "Amended"].includes(p.record);

export function SessionWorkspace({
  id,
  base,
}: {
  id: string;
  base: "/therapist/sessions" | "/care/sessions";
}) {
  const url = `/api/care/sessions/${id}`;
  const { data, error, loading, reload } = useResource<{ session: SessionFull }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(allTabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[760px]" />;
  const p = data.session;
  const post: Post = async (body, ok, detail) => {
    const res = await ops(url, body, ok, detail);
    if (res) reload();
    return Boolean(res);
  };
  const clinical = p.view === "edit" || p.view === "lead";
  const prepared = p.checklist.every(
    (c) => c.state === "Confirmed" || c.state === "Not applicable",
  );
  const step = locked(p)
    ? 4
    : happened(p)
      ? 3
      : p.attendance === "In Progress"
        ? 2
        : prepared
          ? 1
          : 0;
  const visible = allTabs.filter((t) => {
    if (!clinical) return t.id === "overview" || t.id === "history";
    if (t.id === "telehealth") return p.mode === "Telehealth";
    return true;
  });
  const current = visible.some((t) => t.id === tab) ? tab : "overview";
  const open = p.checklist.filter((c) => !c.state || c.state === "Unresolved").length;
  // Panels remount after each change so their forms always start from the saved record.
  const k = p.timeline.length;
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />{" "}
            {base === "/therapist/sessions" ? "My sessions" : "Sessions"}
          </ButtonLink>
        }
        title={p.purpose}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">
              {p.ref}
              {p.apt ? ` · ${p.apt}` : ""}
            </span>
            <Tag tone={attendanceTone[p.attendance]}>{p.attendance}</Tag>
            {p.restricted && (
              <Tag tone="outline">
                <Lock className="size-3" aria-hidden="true" /> Restricted
              </Tag>
            )}
          </span>
        }
        actions={<LiveBadge />}
      />
      <section className="grid overflow-hidden rounded-card border border-border bg-surface shadow-lift xl:grid-cols-12">
        <div className="border-b border-border p-6 xl:col-span-4 xl:border-r xl:border-b-0">
          <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
            Participant
          </p>
          <p className="mt-1 type-display text-h2 text-ink-900">{p.participant}</p>
          <p className="font-mono text-caption text-ink-500">{p.participantId}</p>
          <p className="mt-2 text-small text-ink-700">
            {p.discipline} · {p.therapist}
          </p>
          <p className="text-small text-ink-700">
            {when(p.start)} · {p.mode}
            {p.siteDetail ? ` · ${p.siteDetail}` : ""}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 xl:col-span-8">
          <Stepper steps={flow} current={step} />
          <div className="flex flex-wrap gap-2">
            <Tag tone={recordTone[p.record]}>Note {p.record.toLowerCase()}</Tag>
            <Tag
              tone={
                p.safety.status === "Clear"
                  ? "healthy"
                  : p.safety.status === "Not Assessed"
                    ? "outline"
                    : "over"
              }
            >
              Safety: {p.safety.status}
            </Tag>
            <Tag tone="outline">Delivery {p.verification.toLowerCase()}</Tag>
            {p.sync.state !== "Synced" && <Tag tone="over">{p.sync.state}</Tag>}
            {open > 0 && !happened(p) && <Tag tone="watch">{open} checklist items open</Tag>}
          </div>
        </div>
      </section>
      {!clinical && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" />
          {p.view === "finance"
            ? "Finance view: delivery facts for verification. Clinical notes and findings aren't shown."
            : "Status view: attendance, times and next steps. Clinical content isn't shown to your role."}
        </p>
      )}
      <div className="mt-2">
        <Tabs
          label="Session"
          tabs={visible.map((t) => ({
            ...t,
            count:
              t.id === "activities"
                ? p.interventions.length || undefined
                : t.id === "prepare"
                  ? open || undefined
                  : t.id === "notes"
                    ? p.noteGaps.length || undefined
                    : undefined,
          }))}
          value={current}
          onChange={(t: T) => setTab(t)}
        />
      </div>
      <TabPanel id="overview" value={current}>
        <Overview key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="prepare" value={current}>
        <Prepare key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="checkin" value={current}>
        <CheckIn key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="activities" value={current}>
        <Activities key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="assessment" value={current}>
        <Assessment key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="notes" value={current}>
        <Notes key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="telehealth" value={current}>
        <Telehealth p={p} />
      </TabPanel>
      <TabPanel id="end" value={current}>
        <End key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <Timeline p={p} />
      </TabPanel>
    </>
  );
}

function Facts({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
      {rows.map(([k, v]) => (
        <div key={k} className="border-border px-5 py-3 sm:border-b">
          <dt className="text-caption text-ink-500">{k}</dt>
          <dd className="text-body text-ink-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const mins = (n: number | null) => (n === null ? "Not recorded" : `${n} minutes`);

/* ------------------------------------------------------------------ overview */

function Overview({ p, post }: { p: SessionFull; post: Post }) {
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ state: p.verification as string, note: p.verificationNote });
  const facts: [string, string][] = [
    ["Purpose", p.purposeOther ? `${p.purpose}: ${p.purposeOther}` : p.purpose],
    ["Delivery mode", p.mode],
    ["Booked", `${when(p.start)} to ${when(p.end).split(", ").at(-1) ?? ""}`],
    ["Actual start", p.actualStart ? when(p.actualStart) : "Not started"],
    ["Actual end", p.actualEnd ? when(p.actualEnd) : "Not ended"],
    ["Direct care", mins(p.directMinutes)],
    ["Documentation", mins(p.docMinutes)],
    ["Location", p.mode === "Telehealth" ? "Secure video link" : p.address || "On file"],
  ];
  if (p.view === "finance" || p.view === "status")
    return (
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={ClipboardList}
          title="Delivery facts"
          sub="Times and attendance; no clinical narrative"
          className="xl:col-span-7"
          flush
        >
          <Facts
            rows={[
              ...facts,
              ["Attendance", p.attendance],
              ["Note", p.record],
              ["Outcome reason", p.outcomeReason || "None"],
              ["Follow-ups", p.followUps.map((f) => f.type).join(", ") || "None"],
            ]}
          />
        </FCard>
        <FCard
          icon={Wallet}
          title="Delivery verification"
          sub="Independent of the clinical signature; never issues an invoice"
          className="xl:col-span-5"
          action={<RuleMark>Finance</RuleMark>}
          footer={
            p.canVerify && (
              <Button
                variant="primary"
                onClick={() =>
                  post({ type: "verify", ...v }, "Verification saved", "Goes to the billing review")
                }
              >
                Save verification
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-small text-ink-700">
              Current: <strong className="text-ink-900">{p.verification}</strong>
            </p>
            {p.canVerify ? (
              <>
                <Field label="Delivery">
                  <Select
                    aria-label="Delivery verification"
                    value={v.state}
                    onChange={(e) => setV({ ...v, state: e.target.value })}
                  >
                    {opts(verificationStates)}
                  </Select>
                </Field>
                <Field label="Note for billing">
                  <textarea
                    className={textArea}
                    value={v.note}
                    onChange={(e) => setV({ ...v, note: e.target.value })}
                  />
                </Field>
              </>
            ) : (
              <p className="text-small text-ink-500">Finance verifies delivery.</p>
            )}
          </div>
        </FCard>
      </div>
    );
  return (
    <div className="flex flex-col gap-6">
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={ClipboardList}
          title="Session"
          sub="Booking, times and place"
          className="xl:col-span-5"
          flush
        >
          <Facts rows={facts} />
        </FCard>
        {/* The AI surface fills the cell so it ends level with the Session card. */}
        <div className="xl:col-span-7 [&>*]:h-full">
          {busy ? (
            <AiDraft label="Preparing your brief" suggestionsOnly generating />
          ) : (
            <AiDraft
              label="AI pre-session brief"
              suggestionsOnly
              meta={p.brief ? when(p.brief.at) : "From signed notes, goals and documented risks"}
            >
              {p.brief ? (
                <>
                  <p className="text-small whitespace-pre-line text-ink-900">{p.brief.text}</p>
                  <p className="mt-2 text-caption text-ink-500">
                    Sources: {p.brief.sources.join(", ")}
                  </p>
                </>
              ) : (
                <p className="text-small text-ink-700">
                  Summarise earlier signed notes, active goals and documented risks before you go.
                  Verify it against the sources.
                </p>
              )}
              {p.canEdit && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    setBusy(true);
                    await post(
                      { type: "ai-brief" },
                      "Brief prepared",
                      "Check it against the sources",
                    );
                    setBusy(false);
                  }}
                >
                  {p.brief ? "Prepare again" : "Prepare brief"}
                </Button>
              )}
            </AiDraft>
          )}
        </div>
      </div>
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={Target}
          title="Goals in this plan"
          sub={
            p.planId
              ? `Plan ${p.planState.toLowerCase()} · last recorded values`
              : "No treatment plan linked"
          }
          className="xl:col-span-5"
          flush
        >
          <ul className="divide-y divide-border">
            {p.goals.map((g) => (
              <li key={g.id} className="px-5 py-3">
                <p className="text-small font-semibold text-ink-900">{g.title}</p>
                <p className="text-caption text-ink-500">
                  Last recorded: {g.previous || "none"} {g.unit}
                  {g.context ? ` · ${g.context}` : ""}
                </p>
              </li>
            ))}
            {!p.goals.length && (
              <li className="px-5 py-5 text-small text-watch">
                No active plan: link activities to goals once a plan is signed.
              </li>
            )}
          </ul>
        </FCard>
        <FCard icon={ShieldAlert} title="Risks and precautions" className="xl:col-span-3">
          {p.risks.length ? (
            <ul className="flex flex-col gap-2">
              {p.risks.map((r) => (
                <li
                  key={r}
                  className="rounded-control border border-over bg-over-bg p-3 text-small"
                >
                  <strong className="text-over">Precaution:</strong> {r}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-500">No documented precautions.</p>
          )}
          {p.incident && (
            <p className="mt-3 text-small text-over">
              Incident {p.incident.ref}: {p.incident.detail}
            </p>
          )}
        </FCard>
        <FCard
          icon={History}
          title="Earlier notes"
          sub="Most recent signed visits"
          className="xl:col-span-4"
          flush
        >
          <ul className="divide-y divide-border">
            {p.previous.map((n) => (
              <li key={n.date} className="px-5 py-3">
                <p className="text-caption text-ink-500">
                  {dayOnly(n.date)} · {n.by}
                </p>
                <p className="line-clamp-3 text-small text-ink-900">{n.summary}</p>
              </li>
            ))}
            {!p.previous.length && (
              <li className="px-5 py-5 text-small text-ink-500">First visit.</li>
            )}
          </ul>
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ prepare */

function Prepare({ p, post }: { p: SessionFull; post: Post }) {
  const [a, setA] = useState({
    name: "",
    role: "Carer",
    present: true,
    authority: "",
    recordingConsent: "Not asked",
  });
  const [purpose, setPurpose] = useState({
    purpose: p.purpose,
    purposeOther: p.purposeOther,
    siteDetail: p.siteDetail,
  });
  const done = p.checklist.filter(
    (c) => c.state === "Confirmed" || c.state === "Not applicable",
  ).length;
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={ListChecks}
        title="Pre-visit checklist"
        sub={`${p.mode} visit · ${done} of ${p.checklist.length} confirmed`}
        className="xl:col-span-7"
        action={<RuleMark>Checklist</RuleMark>}
        flush
      >
        <ul className="divide-y divide-border">
          {p.checklist.map((c) => (
            <li key={c.item} className="flex flex-wrap items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1 text-small text-ink-900">{c.item}</span>
              {(["Confirmed", "Unresolved", "Not applicable"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!p.canEdit}
                  onClick={() =>
                    post(
                      { type: "checklist", item: c.item, state: s, note: "" },
                      `${c.item}: ${s.toLowerCase()}`,
                    )
                  }
                  className={cn(
                    "h-8 cursor-pointer rounded-tag border px-2.5 text-caption font-semibold transition-colors duration-140 disabled:cursor-default",
                    c.state === s
                      ? s === "Confirmed"
                        ? "border-healthy bg-healthy-bg text-healthy"
                        : s === "Unresolved"
                          ? "border-over bg-over-bg text-over"
                          : "border-border-strong bg-sunken text-ink-700"
                      : "border-border-strong text-ink-500 hover:bg-canvas",
                  )}
                >
                  {s}
                </button>
              ))}
            </li>
          ))}
        </ul>
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={ClipboardList}
          title="Session purpose"
          footer={
            p.canEdit && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => post({ type: "details", ...purpose }, "Session details saved")}
              >
                Save
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <Select
              aria-label="Session purpose"
              disabled={!p.canEdit}
              value={purpose.purpose}
              onChange={(e) => setPurpose({ ...purpose, purpose: e.target.value })}
            >
              {opts(sessionPurposes)}
            </Select>
            {purpose.purpose === "Other" && (
              <input
                aria-label="Explain the purpose"
                placeholder="Explain the purpose"
                className={inputClass}
                value={purpose.purposeOther}
                onChange={(e) => setPurpose({ ...purpose, purposeOther: e.target.value })}
              />
            )}
            <input
              aria-label="Site detail"
              placeholder={p.mode === "Telehealth" ? "Join context" : "Site, room or meeting point"}
              disabled={!p.canEdit}
              className={inputClass}
              value={purpose.siteDetail}
              onChange={(e) => setPurpose({ ...purpose, siteDetail: e.target.value })}
            />
          </div>
        </FCard>
        <FCard icon={Users} title="Attendees" sub="Who is present, their role and authority" flush>
          <ul className="divide-y divide-border">
            {p.attendees.map((x) => (
              <li key={x.name} className="flex items-center gap-3 px-5 py-2.5 text-small">
                <span className="min-w-0 flex-1">
                  <span className="text-ink-900">
                    {x.name === x.role ? x.role : `${x.name} · ${x.role}`}
                  </span>
                  {x.authority && (
                    <span className="block text-caption text-ink-500">{x.authority}</span>
                  )}
                </span>
                <Tag tone="outline">{x.present ? "Present" : "Absent"}</Tag>
              </li>
            ))}
          </ul>
          {p.canEdit && (
            <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
              <input
                aria-label="Attendee name"
                placeholder="Name"
                className={inputClass}
                value={a.name}
                onChange={(e) => setA({ ...a, name: e.target.value })}
              />
              <Select
                aria-label="Attendee role"
                value={a.role}
                onChange={(e) => setA({ ...a, role: e.target.value })}
              >
                {opts(attendeeRoles)}
              </Select>
              <input
                aria-label="Authority"
                placeholder="Authority or relationship"
                className={cn(inputClass, "col-span-2")}
                value={a.authority}
                onChange={(e) => setA({ ...a, authority: e.target.value })}
              />
              <Button
                size="sm"
                className="col-span-2"
                onClick={() => post({ type: "attendee", attendee: a }, "Attendee recorded")}
              >
                Add attendee
              </Button>
            </div>
          )}
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ check-in and safety */

function CheckIn({ p, post }: { p: SessionFull; post: Post }) {
  const [c, setC] = useState({
    identity: false,
    location: false,
    safety: "Clear",
    safetyDetail: "",
    notes: "",
  });
  const [s, setS] = useState({
    status: p.safety.status as string,
    detail: p.safety.detail,
    action: p.safety.action,
  });
  const [reason, setReason] = useState("");
  const booked = ["Scheduled", "Confirmed"].includes(p.attendance);
  const live = p.attendance === "In Progress";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={LogIn}
        title="Start and check in"
        sub="Identity and location are confirmed before any clinical activity"
        className="xl:col-span-7"
        footer={
          p.canEdit &&
          booked && (
            <Button
              variant={c.safety === "Unsafe to Proceed" ? "danger" : "primary"}
              onClick={() =>
                post(
                  { type: "check-in", ...c },
                  c.safety === "Unsafe to Proceed" ? "Session stopped for safety" : "Checked in",
                  c.safety === "Unsafe to Proceed"
                    ? "The Clinical Lead has an urgent task"
                    : "The session is in progress",
                )
              }
            >
              {c.safety === "Unsafe to Proceed" ? "Stop: unsafe to proceed" : "Check in and start"}
            </Button>
          )
        }
      >
        {p.identity ? (
          <div className="flex flex-col gap-3">
            <Signature
              name={p.identity.by}
              when={when(p.identity.at)}
              label="Identity and location confirmed"
            />
            <p className="text-small text-ink-700">
              Started {p.actualStart ? when(p.actualStart) : "—"} · {p.attendance}
            </p>
            <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  Present
                </p>
                <ul className="flex flex-col gap-1 text-small text-ink-900">
                  {p.attendees
                    .filter((x) => x.present)
                    .map((x) => (
                      <li key={x.name}>{x.name === x.role ? x.role : `${x.name} · ${x.role}`}</li>
                    ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  Checklist
                </p>
                <ul className="flex flex-col gap-1 text-small">
                  {p.checklist
                    .filter((c) => c.state !== "Confirmed" && c.state !== "Not applicable")
                    .map((c) => (
                      <li key={c.item} className="text-over">
                        {c.item}: {c.state ? c.state.toLowerCase() : "not checked"}
                      </li>
                    ))}
                  {p.checklist.every(
                    (c) => c.state === "Confirmed" || c.state === "Not applicable",
                  ) && <li className="text-healthy">All items confirmed</li>}
                </ul>
              </div>
            </div>
          </div>
        ) : booked && p.canEdit ? (
          <div className="flex flex-col gap-3">
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={c.identity}
                onChange={(e) => setC({ ...c, identity: e.target.checked })}
              />{" "}
              Participant identity confirmed
            </label>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={c.location}
                onChange={(e) => setC({ ...c, location: e.target.checked })}
              />
              {p.mode === "Telehealth"
                ? " Participant's location confirmed for this call"
                : " Site and address confirmed"}
            </label>
            <Field label="Safe to proceed?">
              <Select
                aria-label="Safe to proceed"
                value={c.safety}
                onChange={(e) => setC({ ...c, safety: e.target.value })}
              >
                {opts(safetyStates)}
              </Select>
            </Field>
            {c.safety !== "Clear" && (
              <Field label="Safety detail">
                <textarea
                  className={textArea}
                  value={c.safetyDetail}
                  onChange={(e) => setC({ ...c, safetyDetail: e.target.value })}
                />
              </Field>
            )}
            <Field label="Arrival notes (optional)">
              <input
                className={inputClass}
                value={c.notes}
                onChange={(e) => setC({ ...c, notes: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <p className="text-small text-ink-500">
            This session wasn&apos;t started: {p.attendance.toLowerCase()}.
          </p>
        )}
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={ShieldAlert}
          title="Safety during the session"
          sub="Escalates to the Clinical Lead; never an automatic clinical decision"
          footer={
            p.canEdit &&
            live && (
              <Button
                size="sm"
                variant={s.status === "Unsafe to Proceed" ? "danger" : "secondary"}
                onClick={() =>
                  post(
                    { type: "safety", ...s },
                    s.status === "Unsafe to Proceed"
                      ? "Session stopped and escalated"
                      : "Safety updated",
                  )
                }
              >
                {s.status === "Unsafe to Proceed" ? "Stop and escalate" : "Update safety"}
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <p className="text-small">
              Now: <strong>{p.safety.status}</strong>
              {p.safety.escalated ? " · escalated" : ""}
            </p>
            {p.safety.detail && <p className="text-caption text-ink-700">{p.safety.detail}</p>}
            {p.canEdit && live && (
              <>
                <Select
                  aria-label="Safety status"
                  value={s.status}
                  onChange={(e) => setS({ ...s, status: e.target.value })}
                >
                  {opts(safetyStates)}
                </Select>
                <textarea
                  aria-label="Safety detail"
                  placeholder="What happened"
                  className={textArea}
                  value={s.detail}
                  onChange={(e) => setS({ ...s, detail: e.target.value })}
                />
              </>
            )}
          </div>
        </FCard>
        <FCard
          icon={LogOut}
          title="Didn't go ahead"
          sub="A reason is always required; no note is created"
        >
          {p.canEdit && booked ? (
            <div className="flex flex-col gap-2">
              <input
                aria-label="Reason"
                placeholder="What happened"
                className={inputClass}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="danger"
                  disabled={reason.length < 3}
                  onClick={() =>
                    post(
                      { type: "no-show", reason },
                      "Recorded as did not attend",
                      "Finance reviews the charge; scheduling follows up",
                    )
                  }
                >
                  Did not attend
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={reason.length < 3}
                  onClick={() => post({ type: "cancel", reason }, "Session cancelled")}
                >
                  Cancel session
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-small text-ink-500">
              {p.outcomeReason || "Not applicable to this session."}
            </p>
          )}
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ activities */

const blankAct = {
  activity: "",
  goalIds: [] as string[],
  minutes: null as number | null,
  dose: { sets: "", reps: "", duration: "", resistance: "" },
  resultType: "Narrative",
  result: "",
  unit: "",
  method: "",
  support: "",
  response: "Tolerated",
  narrative: "",
  source: "Observed",
  adverse: "No",
  adverseDetail: "",
};

function Activities({ p, post }: { p: SessionFull; post: Post }) {
  const [f, setF] = useState<typeof blankAct & { id?: string }>(blankAct);
  const can = p.canEdit && (p.attendance === "In Progress" || happened(p)) && !locked(p);
  const catalogue = activityCatalogue[p.discipline] ?? [];
  const sel = (
    label: string,
    key: "resultType" | "support" | "response" | "source" | "adverse" | "unit",
    list: readonly string[],
  ) => (
    <Field label={label}>
      <Select
        aria-label={label}
        value={f[key]}
        onChange={(e) => setF({ ...f, [key]: e.target.value })}
      >
        {opts(list)}
      </Select>
    </Field>
  );
  const edit = (i: InterventionRec) => setF({ ...blankAct, ...i, id: i.id });
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Activity}
        title="Activities and measurements"
        sub="Observed, patient-reported and third-party reported stay apart"
        className="xl:col-span-7"
        flush
      >
        <ul className="divide-y divide-border">
          {p.interventions.map((i) => (
            <li key={i.id} className="px-5 py-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-small font-semibold text-ink-900">{i.activity}</span>
                <Tag tone="outline">{i.source}</Tag>
                <Tag
                  tone={
                    i.response === "Improved"
                      ? "healthy"
                      : i.response === "Declined" || i.response === "Limited"
                        ? "watch"
                        : "outline"
                  }
                >
                  {i.response}
                </Tag>
                {i.adverse === "Yes" && <Tag tone="over">Adverse event</Tag>}
                {can && (
                  <span className="ml-auto flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(i)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        post({ type: "remove-intervention", id: i.id }, "Activity removed")
                      }
                    >
                      Remove
                    </Button>
                  </span>
                )}
              </div>
              <p className="mt-1 text-small text-ink-700">
                {i.result ? `${i.result} ${i.unit}`.trim() : "No measured result"}
                {i.method ? ` · ${i.method}` : ""}
                {i.support ? ` · ${i.support}` : ""}
              </p>
              {i.narrative && <p className="text-caption text-ink-500">{i.narrative}</p>}
              {i.flags.map((fl) => (
                <p key={fl} className="text-caption font-semibold text-over">
                  Check: {fl}
                </p>
              ))}
            </li>
          ))}
          {!p.interventions.length && (
            <li className="px-5 py-10 text-center text-small text-ink-500">
              {can ? "Record the first activity with the form." : "No activities recorded."}
            </li>
          )}
        </ul>
      </FCard>
      <FCard
        icon={ClipboardCheck}
        title={f.id ? "Edit activity" : "Record an activity"}
        sub={
          can
            ? "Units and methods keep results comparable"
            : "Available once checked in, until the note is signed"
        }
        className="xl:col-span-5"
        footer={
          can && (
            <>
              <Button
                variant="primary"
                onClick={async () => {
                  if (
                    await post(
                      { type: "intervention", intervention: f },
                      f.id ? "Activity updated" : "Activity recorded",
                    )
                  )
                    setF(blankAct);
                }}
              >
                {f.id ? "Save changes" : "Record activity"}
              </Button>
              {f.id && (
                <Button variant="ghost" onClick={() => setF(blankAct)}>
                  New activity
                </Button>
              )}
            </>
          )
        }
      >
        <fieldset disabled={!can} className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Activity">
              <input
                list="activity-catalogue"
                className={inputClass}
                value={f.activity}
                onChange={(e) => setF({ ...f, activity: e.target.value })}
                placeholder="Choose from the catalogue or type"
              />
              <datalist id="activity-catalogue">
                {catalogue.map((x) => (
                  <option key={x} value={x} />
                ))}
              </datalist>
            </Field>
          </div>
          {sel("Result type", "resultType", resultTypes)}
          <Field label="Result">
            <input
              className={inputClass}
              value={f.result}
              onChange={(e) => setF({ ...f, result: e.target.value })}
            />
          </Field>
          {sel("Unit", "unit", sessionUnits)}
          {sel("Source", "source", sources)}
          <div className="col-span-2">
            <Field label="Method and conditions">
              <input
                className={inputClass}
                value={f.method}
                onChange={(e) => setF({ ...f, method: e.target.value })}
              />
            </Field>
          </div>
          {sel("Support level", "support", ["", ...supportLevels])}
          {sel("Response", "response", responses)}
          {p.goals.length > 0 && (
            <fieldset className="col-span-2 flex flex-col gap-1">
              <legend className="mb-1 text-caption font-semibold text-ink-700">Goals served</legend>
              {p.goals.map((g) => (
                <label key={g.id} className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={f.goalIds.includes(g.id)}
                    onChange={(e) =>
                      setF({
                        ...f,
                        goalIds: e.target.checked
                          ? [...f.goalIds, g.id]
                          : f.goalIds.filter((x) => x !== g.id),
                      })
                    }
                  />
                  {g.title}
                  <span className="text-caption text-ink-500">
                    · last {g.previous || "none"} {g.unit}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          <div className="col-span-2">
            <Field label="Observation">
              <textarea
                className={textArea}
                value={f.narrative}
                onChange={(e) => setF({ ...f, narrative: e.target.value })}
              />
            </Field>
          </div>
          {sel("Adverse event", "adverse", adverseOptions)}
          {f.adverse === "Yes" && (
            <Field label="What happened">
              <input
                className={inputClass}
                value={f.adverseDetail}
                onChange={(e) => setF({ ...f, adverseDetail: e.target.value })}
              />
            </Field>
          )}
        </fieldset>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ assessment continuation */

function Assessment({ p, post }: { p: SessionFull; post: Post }) {
  const [picked, setPicked] = useState<Record<string, string[]>>(
    Object.fromEntries(p.assessments.map((a) => [a.id, a.performed])),
  );
  if (!p.assessments.length)
    return (
      <p className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center text-small text-ink-700">
        No assessment is open for this service. Sessions and assessments stay independent.
      </p>
    );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-2">
      {p.assessments.map((a) => (
        <FCard
          key={a.id}
          icon={ClipboardList}
          title={a.title}
          sub={`${a.ref} · ${a.status} · ${a.sections.filter((s) => s.done).length} of ${a.sections.length} sections have findings`}
          footer={
            p.canEdit && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() =>
                    post(
                      {
                        type: "assessment-sections",
                        assessmentId: a.id,
                        sections: picked[a.id] ?? [],
                      },
                      "Sections saved",
                      "Completed sections persist across visits",
                    )
                  }
                >
                  Save sections for this visit
                </Button>
                <ButtonLink size="sm" variant="ghost" href={`/therapist/assessments/${a.id}`}>
                  Open assessment
                </ButtonLink>
              </>
            )
          }
          flush
        >
          <ul className="divide-y divide-border">
            {a.sections.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-5 py-2.5 text-small">
                <input
                  type="checkbox"
                  aria-label={`Perform ${s.title} in this visit`}
                  disabled={!p.canEdit}
                  checked={(picked[a.id] ?? []).includes(s.id)}
                  onChange={(e) =>
                    setPicked({
                      ...picked,
                      [a.id]: e.target.checked
                        ? [...(picked[a.id] ?? []), s.id]
                        : (picked[a.id] ?? []).filter((x) => x !== s.id),
                    })
                  }
                />
                <span className="min-w-0 flex-1 text-ink-900">{s.title}</span>
                <Tag tone={s.done ? "healthy" : "outline"}>
                  {s.done ? "Has findings" : "Not started"}
                </Tag>
              </li>
            ))}
          </ul>
        </FCard>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ notes */

function Notes({ p, post }: { p: SessionFull; post: Post }) {
  const n = p.note;
  const [v, setV] = useState({
    subjective: n.subjective,
    objective: n.objective,
    assessment: n.assessment,
    plan: n.plan,
    forPatient: n.forPatient,
  });
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState({ reason: "", text: "" });
  const can = p.canEdit && happened(p) && !locked(p);
  const area = (key: keyof typeof v, label: string, rows = "min-h-24") => (
    <Field label={label}>
      <textarea
        className={cn(textArea, rows)}
        disabled={!can}
        value={v[key]}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      />
    </Field>
  );
  return (
    <div className="flex flex-col gap-6">
      {p.sync.conflict && p.canEdit && (
        <FCard
          icon={RefreshCcw}
          title="Edit conflict between devices"
          sub="The same field changed on the phone and on the web. Choose one; both are kept in the audit."
          action={<RuleMark>Sync</RuleMark>}
        >
          <div className="grid items-stretch gap-4 md:grid-cols-2">
            {(["mobile", "web"] as const).map((side) => (
              <div
                key={side}
                className="flex flex-col gap-3 rounded-control border border-border-strong p-4"
              >
                <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                  {side === "mobile" ? "Phone (offline draft)" : "Web"} · {p.sync.conflict?.field}
                </p>
                <p className="flex-1 text-small text-ink-900">
                  {side === "mobile" ? p.sync.conflict?.mobile : p.sync.conflict?.web}
                </p>
                <Button
                  size="sm"
                  onClick={() =>
                    post({ type: "resolve-conflict", keep: side }, "Conflict resolved")
                  }
                >
                  Keep this version
                </Button>
              </div>
            ))}
          </div>
        </FCard>
      )}
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={FileSignature}
          title="Session note"
          sub={
            locked(p)
              ? "Signed: changes are made by addendum"
              : "SOAP: write it yourself, or start from an AI draft"
          }
          className="xl:col-span-8"
          action={
            n.aiDrafted && !n.verified ? <Tag tone="watch">AI draft · unverified</Tag> : undefined
          }
          footer={
            can && (
              <>
                <Button
                  variant="primary"
                  onClick={() =>
                    post(
                      { type: "note", ...v, sign: true },
                      "Note signed",
                      "Finance gets a verification task",
                    )
                  }
                >
                  Sign note
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => post({ type: "note", ...v, sign: false }, "Draft saved")}
                >
                  Save draft
                </Button>
                {n.aiDrafted && !n.verified && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      post(
                        { type: "verify-ai" },
                        "AI draft verified",
                        "You reviewed it against the session",
                      )
                    }
                  >
                    I&apos;ve reviewed the AI draft
                  </Button>
                )}
              </>
            )
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            {area("subjective", "Subjective")}
            {area("objective", "Objective")}
            {area("assessment", "Assessment")}
            {area("plan", "Plan")}
            <div className="md:col-span-2">
              {area("forPatient", "Summary the participant sees", "min-h-16")}
            </div>
          </div>
          {locked(p) && (
            <div className="mt-4">
              <Signature name={n.by} when={n.signedAt ? when(n.signedAt) : ""} label="Signed" />
            </div>
          )}
        </FCard>
        <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
          <FCard icon={ShieldAlert} title="Before signing" action={<RuleMark>Check</RuleMark>}>
            {p.noteGaps.length ? (
              <ul className="flex flex-col gap-2">
                {p.noteGaps.map((g) => (
                  <li
                    key={g}
                    className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small"
                  >
                    {g}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-small text-healthy">
                {locked(p) ? "Signed and locked." : "Nothing missing."}
              </p>
            )}
          </FCard>
          {locked(p) ? (
            <FCard
              icon={FileSignature}
              title="Addenda"
              sub="The signed note is preserved; each addendum keeps its author and reason"
              footer={
                p.canEdit && (
                  <Button
                    size="sm"
                    disabled={add.reason.length < 5 || add.text.length < 5}
                    onClick={() => post({ type: "addendum", ...add }, "Addendum added")}
                  >
                    Add addendum
                  </Button>
                )
              }
            >
              <ul className="flex flex-col gap-2">
                {n.amendments.map((m) => (
                  <li key={m.at} className="rounded-control border border-border p-3 text-small">
                    <p className="text-ink-900">{m.text}</p>
                    <p className="text-caption text-ink-500">
                      {m.by} · {when(m.at)} · {m.reason}
                    </p>
                  </li>
                ))}
              </ul>
              {p.canEdit && (
                <div className="mt-3 flex flex-col gap-2">
                  <input
                    aria-label="Reason"
                    placeholder="Reason"
                    className={inputClass}
                    value={add.reason}
                    onChange={(e) => setAdd({ ...add, reason: e.target.value })}
                  />
                  <textarea
                    aria-label="Addendum"
                    placeholder="Addendum"
                    className={textArea}
                    value={add.text}
                    onChange={(e) => setAdd({ ...add, text: e.target.value })}
                  />
                </div>
              )}
            </FCard>
          ) : busy ? (
            <AiDraft label="Drafting from your activities" suggestionsOnly generating />
          ) : (
            <AiDraft
              label="AI note draft"
              suggestionsOnly
              meta="From recorded activities only; unverified until you review it"
            >
              <p className="text-small text-ink-700">
                {happened(p)
                  ? "Draft S, O, A and P from the activities you recorded. Nothing is invented; you review, correct and sign."
                  : "Available after the session ends."}
              </p>
              {p.canEdit && happened(p) && (
                <Button
                  className="mt-3"
                  size="sm"
                  variant="soft"
                  onClick={async () => {
                    setBusy(true);
                    await post({ type: "ai-note" }, "Note drafted", "Review it before signing");
                    setBusy(false);
                  }}
                >
                  Draft note with AI
                </Button>
              )}
            </AiDraft>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ telehealth */

const recSteps = [
  "Off",
  "Consent Pending",
  "Ready",
  "Recording",
  "Paused",
  "Processing",
  "Available",
];

function Telehealth({ p }: { p: SessionFull }) {
  const t = p.telehealth;
  if (!t) return null;
  const idx = Math.max(0, recSteps.indexOf(t.recording));
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Video}
        title="Video visit"
        sub="Secure link with identity checks; the participant needs no account"
        className="xl:col-span-5"
        footer={
          p.canEdit &&
          t.id &&
          t.state !== "Ended" && (
            <ButtonLink size="sm" variant="primary" href={`/telehealth/room/${p.id}`}>
              Open video room
            </ButtonLink>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <p className="text-small">
            Call: <strong>{t.state}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            <Tag tone={t.consent.video ? "healthy" : "outline"}>
              Video consent {t.consent.video ? "given" : "not given"}
            </Tag>
            <Tag tone={t.consent.recording ? "healthy" : "outline"}>
              Recording consent {t.consent.recording ? "given" : "not given"}
            </Tag>
            <Tag tone={t.consent.transcription ? "healthy" : "outline"}>
              AI transcription {t.consent.transcription ? "allowed" : "not allowed"}
            </Tag>
          </div>
          <p className="text-caption text-ink-500">
            Recording is off by default and needs consent from everyone present. Playback is
            restricted and logged; download is off.
          </p>
          <div className="border-t border-border pt-3">
            <p className="mb-2 text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
              Attendees and recording consent
            </p>
            <ul className="flex flex-col divide-y divide-border">
              {p.attendees.map((x) => (
                <li
                  key={x.name}
                  className="flex items-center justify-between gap-3 py-2 text-small"
                >
                  <span className="text-ink-900">
                    {x.name === x.role ? x.role : `${x.name} · ${x.role}`}
                  </span>
                  <Tag
                    tone={
                      x.recordingConsent === "Given"
                        ? "healthy"
                        : x.recordingConsent === "Refused"
                          ? "over"
                          : "outline"
                    }
                  >
                    {x.recordingConsent}
                  </Tag>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </FCard>
      <FCard
        icon={Video}
        title="Recording"
        sub={`Now: ${t.recording}`}
        className="xl:col-span-7"
        action={<RuleMark>Policy</RuleMark>}
      >
        <div className="flex flex-col gap-5">
          <Stepper steps={recSteps} current={t.recording === "Off" ? 0 : idx} />
          <ol className="flex flex-col divide-y divide-border">
            {t.events.map((e) => (
              <li key={e.at + e.text} className="flex justify-between gap-3 py-2 text-small">
                <span className="text-ink-900">{e.text}</span>
                <span className="text-caption whitespace-nowrap text-ink-500">{when(e.at)}</span>
              </li>
            ))}
            {!t.events.length && (
              <li className="py-2 text-small text-ink-500">No call events yet.</li>
            )}
          </ol>
        </div>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ end and handover */

function End({ p, post }: { p: SessionFull; post: Post }) {
  const [e, setE] = useState({
    disposition: "Continue",
    note: "",
    partial: false,
    remaining: "",
    docMinutes: 15,
    followUps: [] as { type: string; note: string }[],
  });
  const [t, setT] = useState({
    actualStart: (p.actualStart ?? "").slice(0, 16),
    actualEnd: (p.actualEnd ?? "").slice(0, 16),
    reason: "",
  });
  const live = p.attendance === "In Progress";
  const toggle = (type: string, on: boolean) =>
    setE({
      ...e,
      followUps: on
        ? [...e.followUps, { type, note: "" }]
        : e.followUps.filter((f) => f.type !== type),
    });
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={LogOut}
        title={live ? "End the session" : "Handover"}
        sub="Disposition, follow-ups and tasks for scheduling, clinical and finance"
        className="xl:col-span-7"
        footer={
          p.canEdit &&
          live && (
            <Button
              variant="primary"
              onClick={() =>
                post(
                  { type: "end", ...e },
                  "Session ended",
                  "Follow-up tasks created; the note is due next",
                )
              }
            >
              End session
            </Button>
          )
        }
      >
        {live && p.canEdit ? (
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Next disposition">
              <Select
                aria-label="Next disposition"
                value={e.disposition}
                onChange={(x) => setE({ ...e, disposition: x.target.value })}
              >
                {opts(dispositions)}
              </Select>
            </Field>
            <Field label="Documentation minutes">
              <input
                type="number"
                className={inputClass}
                value={e.docMinutes}
                onChange={(x) => setE({ ...e, docMinutes: Number(x.target.value) })}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Disposition note">
                <input
                  className={inputClass}
                  value={e.note}
                  onChange={(x) => setE({ ...e, note: x.target.value })}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-small md:col-span-2">
              <input
                type="checkbox"
                checked={e.partial}
                onChange={(x) => setE({ ...e, partial: x.target.checked })}
              />{" "}
              Partially completed: some planned work remains
            </label>
            {e.partial && (
              <div className="md:col-span-2">
                <Field label="What remains">
                  <input
                    className={inputClass}
                    value={e.remaining}
                    onChange={(x) => setE({ ...e, remaining: x.target.value })}
                  />
                </Field>
              </div>
            )}
            <fieldset className="flex flex-col gap-1.5 md:col-span-2">
              <legend className="mb-1 text-caption font-semibold text-ink-700">Follow-up</legend>
              {followUps
                .filter((f) => f !== "None")
                .map((f) => (
                  <label key={f} className="flex items-center gap-2 text-small">
                    <input
                      type="checkbox"
                      checked={e.followUps.some((x) => x.type === f)}
                      onChange={(x) => toggle(f, x.target.checked)}
                    />
                    {f}
                  </label>
                ))}
            </fieldset>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-small">
            <p>
              Disposition: <strong>{p.disposition || "Not recorded"}</strong>
              {p.dispositionNote ? ` · ${p.dispositionNote}` : ""}
            </p>
            <ul className="flex flex-col gap-2">
              {p.followUps.map((f, i) => (
                <li
                  key={i}
                  className="flex items-center gap-2 rounded-control border border-border px-3 py-2"
                >
                  <span className="flex-1 text-ink-900">{f.type}</span>
                  <Tag tone={f.taskId ? "healthy" : "outline"}>
                    {f.taskId ? "Task created" : "Recorded"}
                  </Tag>
                </li>
              ))}
              {!p.followUps.length && <li className="text-ink-500">No follow-up recorded.</li>}
            </ul>
          </div>
        )}
      </FCard>
      <FCard
        icon={History}
        title="Recorded times"
        sub="Direct care and documentation are kept apart; changes need a reason"
        className="xl:col-span-5"
        footer={
          p.canEdit &&
          happened(p) && (
            <Button
              size="sm"
              disabled={t.reason.length < 5}
              onClick={() =>
                post(
                  {
                    type: "times",
                    actualStart: new Date(t.actualStart).toISOString(),
                    actualEnd: new Date(t.actualEnd).toISOString(),
                    reason: t.reason,
                  },
                  "Times corrected",
                  "The change is in the audit",
                )
              }
            >
              Correct times
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <div className="-mx-5 -mt-5 border-b border-border">
            <Facts
              rows={[
                ["Booked", `${when(p.start)}`],
                ["Booked end", when(p.end).split(", ").at(-1) ?? ""],
                ["Actual start", p.actualStart ? when(p.actualStart) : "Not started"],
                ["Actual end", p.actualEnd ? when(p.actualEnd) : "Not ended"],
                ["Direct care", mins(p.directMinutes)],
                ["Documentation", mins(p.docMinutes)],
              ]}
            />
          </div>
          {p.canEdit && happened(p) && (
            <>
              <Field label="Actual start">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={t.actualStart}
                  onChange={(x) => setT({ ...t, actualStart: x.target.value })}
                />
              </Field>
              <Field label="Actual end">
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={t.actualEnd}
                  onChange={(x) => setT({ ...t, actualEnd: x.target.value })}
                />
              </Field>
              <Field label="Reason for the change">
                <input
                  className={inputClass}
                  value={t.reason}
                  onChange={(x) => setT({ ...t, reason: x.target.value })}
                />
              </Field>
            </>
          )}
        </div>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ history */

function Timeline({ p }: { p: SessionFull }) {
  return (
    <FCard icon={History} title="Session history" sub="Every change with who, when and why" flush>
      <ol className="max-h-[620px] divide-y divide-border overflow-y-auto">
        {p.timeline.map((h, i) => (
          <li key={i} className="flex flex-wrap items-baseline gap-x-4 px-5 py-3">
            <span className="min-w-0 flex-1 text-small text-ink-900">{h.action}</span>
            <span className="text-caption text-ink-500">
              {h.by} · {when(h.at)}
              {h.reason ? ` · ${h.reason}` : ""}
            </span>
          </li>
        ))}
      </ol>
    </FCard>
  );
}
