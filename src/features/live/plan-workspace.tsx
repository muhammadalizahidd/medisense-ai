"use client";

import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  History,
  Lock,
  Plus,
  Share2,
  ShieldAlert,
  Target,
  TrendingUp,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AiDraft, RuleMark, Signature } from "@/components/ai/provenance";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Stepper } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  activityStates,
  barrierTypes,
  closures,
  deliveryModes,
  directions,
  goalCategories,
  goalPriorities,
  goalStates,
  goalTone,
  horizons,
  informedStates,
  measureTypes,
  ownerships,
  planTypes,
  reviewDecisions13,
  reviewFrequencies,
  settings,
  stateTone,
  units,
  type GoalDto,
  type InterventionDto,
  type PlanFullDto,
} from "@/lib/live/tplan";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { dayOnly, ops, textArea, when } from "./ops-bits";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "goals", label: "Goals" },
  { id: "interventions", label: "Interventions" },
  { id: "progress", label: "Progress & review" },
  { id: "sharing", label: "Patient sharing" },
  { id: "timeline", label: "Versions & timeline" },
] as const;
type T = (typeof tabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;
const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);
const flow = ["Draft", "Ready for Approval", "Active", "Under Review", "Completed"];

export function PlanWorkspace({
  id,
  base,
}: {
  id: string;
  base: "/therapist/plans" | "/care/plans";
}) {
  const url = `/api/care/plans/${id}`;
  const { data, error, loading, reload } = useResource<{ plan: PlanFullDto }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const router = useRouter();
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  const p = data.plan;
  const post: Post = async (body, ok, detail) => {
    const res = await ops<{ id?: string }>(url, body, ok, detail);
    if (res?.id && res.id !== id) router.push(`${base}/${res.id}`);
    else if (res) reload();
    return Boolean(res);
  };
  const step = Math.max(
    0,
    flow.indexOf(
      p.state === "Pending Review"
        ? "Draft"
        : p.state === "Paused"
          ? "Under Review"
          : p.state === "Superseded" || p.state === "Discontinued"
            ? "Completed"
            : p.state,
    ),
  );
  const status = p.view === "status";
  const visible = status
    ? tabs.filter((t) => ["overview", "interventions", "timeline"].includes(t.id))
    : tabs;
  const current = visible.some((t) => t.id === tab) ? tab : "overview";
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Treatment plans
          </ButtonLink>
        }
        title={p.support}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">
              {p.ref} · v{p.version}
            </span>
            <Tag tone={stateTone[p.state]}>{p.state}</Tag>
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
            {p.discipline} · {p.clinician}
          </p>
          <p className="text-small text-ink-700">
            {p.planType} · {p.setting} · {p.frequency || "frequency not set"}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 xl:col-span-8">
          <Stepper steps={flow} current={step} />
          <div className="flex flex-wrap gap-2">
            <Tag
              tone={
                p.informed === "Agreed" ? "healthy" : p.informed === "Declined" ? "over" : "watch"
              }
            >
              Participant {p.informed.toLowerCase()}
            </Tag>
            <Tag tone="outline">Review {p.reviewDate ? dayOnly(p.reviewDate) : "not set"}</Tag>
            {p.coSign.required && (
              <Tag tone={p.coSign.by ? "healthy" : "watch"}>
                {p.coSign.by ? `Co-signed by ${p.coSign.by}` : "Clinical Lead review required"}
              </Tag>
            )}
            <Tag tone={p.sharing.shared ? "healthy" : "outline"}>
              {p.sharing.shared ? "Shared with participant" : "Not shared"}
            </Tag>
          </div>
        </div>
      </section>
      {status && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" /> Readiness view: agreed
          frequency, review dates and tasks. Clinical interpretation and dosage aren&apos;t shown to
          your role.
        </p>
      )}
      <div className="mt-2">
        <Tabs
          label="Plan"
          tabs={visible.map((t) => ({
            ...t,
            count:
              t.id === "goals"
                ? p.goals.length || undefined
                : t.id === "interventions"
                  ? p.interventions.length || undefined
                  : undefined,
          }))}
          value={current}
          onChange={(t: T) => setTab(t)}
        />
      </div>
      <TabPanel id="overview" value={current}>
        <Overview p={p} post={post} />
      </TabPanel>
      <TabPanel id="goals" value={current}>
        <Goals p={p} post={post} />
      </TabPanel>
      <TabPanel id="interventions" value={current}>
        <Interventions p={p} post={post} />
      </TabPanel>
      <TabPanel id="progress" value={current}>
        <Progress p={p} post={post} />
      </TabPanel>
      <TabPanel id="sharing" value={current}>
        <Sharing p={p} post={post} />
      </TabPanel>
      <TabPanel id="timeline" value={current}>
        <Timeline p={p} base={base} />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ overview: header + lifecycle */

function Overview({ p, post }: { p: PlanFullDto; post: Post }) {
  const draft = ["Draft", "Pending Review", "Ready for Approval"].includes(p.state);
  const [v, setV] = useState({
    planType: p.planType,
    rationale: p.rationale,
    priorities: p.priorities,
    setting: p.setting,
    startDate: p.startDate,
    reviewDate: p.reviewDate,
    expectedEnd: p.expectedEnd,
    informed: p.informed,
    informedNotes: p.informedNotes,
    riskAcknowledged: p.riskAcknowledged,
    frequency: p.frequency,
    duration: p.duration,
    noAssessmentReason: p.noAssessmentReason,
  });
  const [reason, setReason] = useState("");
  const [decline, setDecline] = useState(false);
  const [declineNote, setDeclineNote] = useState("");
  const edit = p.canEdit && draft;
  const field = (k: "startDate" | "reviewDate" | "expectedEnd", label: string) => (
    <Field label={label}>
      <input
        type="date"
        className={inputClass}
        disabled={!edit}
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
      />
    </Field>
  );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      {p.view === "status" ? (
        <Readiness p={p} />
      ) : (
        <FCard
          icon={ClipboardList}
          title="Plan details"
          sub={edit ? "Draft: editable" : "Signed versions are read-only; revise to change"}
          className="xl:col-span-7"
          footer={
            edit && (
              <Button
                variant="primary"
                onClick={() => post({ type: "header", ...v }, "Plan saved")}
              >
                Save details
              </Button>
            )
          }
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Plan type">
              <Select
                aria-label="Plan type"
                disabled={!edit}
                value={v.planType}
                onChange={(e) => setV({ ...v, planType: e.target.value })}
              >
                {opts(planTypes)}
              </Select>
            </Field>
            <Field label="Care setting">
              <Select
                aria-label="Care setting"
                disabled={!edit}
                value={v.setting}
                onChange={(e) => setV({ ...v, setting: e.target.value })}
              >
                {opts(settings)}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label="Primary concern and clinical rationale (required)">
                <textarea
                  className={cn(textArea, "min-h-28")}
                  disabled={!edit}
                  value={v.rationale}
                  onChange={(e) => setV({ ...v, rationale: e.target.value })}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Participant priorities and preferences">
                <textarea
                  className={textArea}
                  disabled={!edit}
                  value={v.priorities}
                  onChange={(e) => setV({ ...v, priorities: e.target.value })}
                />
              </Field>
            </div>
            {field("startDate", "Start date")}
            {field("reviewDate", "Review date")}
            {field("expectedEnd", "Expected end (optional)")}
            <Field label="Recommended frequency">
              <input
                className={inputClass}
                disabled={!edit}
                value={v.frequency}
                onChange={(e) => setV({ ...v, frequency: e.target.value })}
              />
            </Field>
            <Field label="Informed discussion">
              <Select
                aria-label="Informed discussion"
                disabled={!edit}
                value={v.informed}
                onChange={(e) => setV({ ...v, informed: e.target.value })}
              >
                {opts(informedStates)}
              </Select>
            </Field>
            <Field label="Discussion notes and authority">
              <input
                className={inputClass}
                disabled={!edit}
                value={v.informedNotes}
                onChange={(e) => setV({ ...v, informedNotes: e.target.value })}
              />
            </Field>
            {!p.sources.length && (
              <div className="sm:col-span-2">
                <Field label="No source assessment: why?">
                  <input
                    className={inputClass}
                    disabled={!edit}
                    value={v.noAssessmentReason}
                    onChange={(e) => setV({ ...v, noAssessmentReason: e.target.value })}
                  />
                </Field>
              </div>
            )}
            {p.precautions && (
              <label className="flex items-start gap-2 rounded-control border border-over bg-over-bg p-3 text-small sm:col-span-2">
                <input
                  type="checkbox"
                  disabled={!edit}
                  checked={v.riskAcknowledged}
                  onChange={(e) => setV({ ...v, riskAcknowledged: e.target.checked })}
                />
                <span>
                  <strong className="text-over">Precaution:</strong> {p.precautions}{" "}
                  <span className="block text-caption text-ink-700">
                    Acknowledge before activation.
                  </span>
                </span>
              </label>
            )}
          </div>
        </FCard>
      )}
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={ShieldAlert}
          title="Validate and sign"
          sub="Rules check the plan before it can activate"
          action={<RuleMark>Check</RuleMark>}
        >
          {p.blockers.length ? (
            <ul className="flex flex-col gap-2">
              {p.blockers.map((b) => (
                <li
                  key={b}
                  className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small"
                >
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-small text-healthy">
              <CheckCircle2 className="size-4" aria-hidden="true" />{" "}
              {p.state === "Active" ? "Signed and active." : "Nothing blocking."}
            </p>
          )}
          {p.signed && <Signature name={p.signed.by} when={when(p.signed.at)} />}
          <div className="mt-3 flex flex-wrap gap-2">
            {p.canEdit &&
              p.moves.includes("Pending Review") &&
              p.coSign.required &&
              !p.coSign.by && (
                <Button
                  size="sm"
                  onClick={() =>
                    post(
                      { type: "move", to: "Pending Review", reason: "" },
                      "Sent for Clinical Lead review",
                    )
                  }
                >
                  Send for review
                </Button>
              )}
            {p.canEdit && p.moves.includes("Ready for Approval") && (
              <Button
                size="sm"
                onClick={() =>
                  post(
                    { type: "move", to: "Ready for Approval", reason: "" },
                    "Validated: ready to sign",
                  )
                }
              >
                Validate
              </Button>
            )}
            {p.canEdit && p.state === "Ready for Approval" && (
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  post(
                    { type: "sign" },
                    "Signed and activated",
                    "Scheduling has a task to arrange the agreed appointments",
                  )
                }
              >
                <FileSignature className="size-3.5" aria-hidden="true" /> Sign and activate
              </Button>
            )}
            {p.canCoSign && (
              <Button
                size="sm"
                variant="primary"
                onClick={() => post({ type: "co-sign", note: "Reviewed" }, "Co-signed")}
              >
                Approve and co-sign
              </Button>
            )}
            {p.canEdit && p.state === "Pending Review" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  post(
                    { type: "move", to: "Draft", reason: "Returned for changes" },
                    "Returned to draft",
                  )
                }
              >
                Return to draft
              </Button>
            )}
          </div>
        </FCard>
        {p.canEdit && (
          <FCard icon={Wrench} title="Plan actions">
            <div className="flex flex-col gap-2">
              <input
                aria-label="Reason"
                placeholder="Reason (for pause, revise or discontinue)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9 rounded-control border border-border-strong px-2 text-small"
              />
              <div className="flex flex-wrap gap-2">
                {["Active", "Under Review", "Paused"].includes(p.state) && (
                  <Button
                    size="sm"
                    disabled={reason.length < 5}
                    onClick={() =>
                      post(
                        { type: "revise", reason },
                        "New version drafted",
                        "The signed version stays current until the new one is signed",
                      )
                    }
                  >
                    Revise (new version)
                  </Button>
                )}
                {p.moves.includes("Paused") && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={reason.length < 3}
                    onClick={() => post({ type: "move", to: "Paused", reason }, "Plan paused")}
                  >
                    Pause
                  </Button>
                )}
                {p.state === "Paused" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      post({ type: "move", to: "Active", reason: "Resumed" }, "Plan resumed")
                    }
                  >
                    Resume
                  </Button>
                )}
                {p.moves.includes("Discontinued") && (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={reason.length < 3}
                    onClick={() =>
                      post(
                        { type: "move", to: "Discontinued", reason },
                        p.state === "Draft" ? "Draft abandoned" : "Plan discontinued",
                      )
                    }
                  >
                    {p.state === "Draft" ? "Abandon draft" : "Discontinue"}
                  </Button>
                )}
                {draft && (
                  <Button size="sm" variant="ghost" onClick={() => setDecline(true)}>
                    Participant declined
                  </Button>
                )}
              </div>
            </div>
          </FCard>
        )}
        <FCard icon={ClipboardList} title="Source assessments">
          {p.sources.length ? (
            p.sources.map((s) => (
              <p key={s.id} className="text-small">
                <span className="font-mono text-caption">{s.ref}</span> · {s.support} · {s.status} ·{" "}
                {s.author}, {dayOnly(s.date)}
              </p>
            ))
          ) : (
            <p className="text-small text-ink-500">
              {p.noAssessmentReason || "No source assessment linked."}
            </p>
          )}
        </FCard>
      </div>
      {decline && (
        <Sheet
          title="Participant declined"
          onClose={() => setDecline(false)}
          footer={
            <Button
              variant="primary"
              onClick={async () => {
                if (
                  await post(
                    { type: "decline", notes: declineNote },
                    "Decline recorded",
                    "Closed without treatment",
                  )
                )
                  setDecline(false);
              }}
            >
              Record decline
            </Button>
          }
        >
          <Field label="Discussion, decision and authorised next steps">
            <textarea
              className={cn(textArea, "min-h-32")}
              value={declineNote}
              onChange={(e) => setDeclineNote(e.target.value)}
            />
          </Field>
        </Sheet>
      )}
    </div>
  );
}

/** What intake, scheduling and finance need to act on a plan, without its clinical content. */
function Readiness({ p }: { p: PlanFullDto }) {
  const rows: [string, string][] = [
    ["Plan type", p.planType],
    ["Care setting", p.setting],
    ["Recommended frequency", p.frequency || "Not set"],
    ["Duration", p.duration || "Not set"],
    ["Start date", p.startDate ? dayOnly(p.startDate) : "Not set"],
    ["Review date", p.reviewDate ? dayOnly(p.reviewDate) : "Not set"],
    ["Expected end", p.expectedEnd ? dayOnly(p.expectedEnd) : "Not set"],
    ["Participant", p.informed],
    [
      "Goals",
      `${p.goals.length} (${p.goals.filter((g) => g.state === "Achieved").length} achieved)`,
    ],
    ["Interventions", String(p.interventions.length)],
  ];
  return (
    <FCard
      icon={ClipboardList}
      title="Readiness"
      sub="What scheduling and finance need to act on this plan"
      className="xl:col-span-7"
      flush
    >
      <dl className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
        {rows.map(([k, val]) => (
          <div key={k} className="border-border px-5 py-3 sm:border-b">
            <dt className="text-caption text-ink-500">{k}</dt>
            <dd className="text-body text-ink-900">{val}</dd>
          </div>
        ))}
      </dl>
    </FCard>
  );
}

/* ------------------------------------------------------------------ goals */

function Goals({ p, post }: { p: PlanFullDto; post: Post }) {
  const [editing, setEditing] = useState<GoalDto | "new" | null>(null);
  const [aiNotes, setAiNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = ["Draft", "Pending Review", "Ready for Approval"].includes(p.state);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div
        className={cn(
          "flex flex-col gap-4",
          p.canEdit && draft ? "xl:col-span-8" : "xl:col-span-12",
        )}
      >
        {p.canEdit && draft && (
          <div className="flex justify-end">
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              <Plus className="size-3.5" aria-hidden="true" /> Add goal
            </Button>
          </div>
        )}
        {p.goals.map((g) => (
          <GoalCard key={g.id} g={g} p={p} post={post} onEdit={() => setEditing(g)} />
        ))}
        {!p.goals.length && (
          <p className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center text-small text-ink-700">
            No goals yet. Add a measurable goal, or use AI to word one from your notes.
          </p>
        )}
      </div>
      {p.canEdit && draft && (
        <div className="xl:col-span-4">
          {busy ? (
            <AiDraft label="Drafting goal wording" suggestionsOnly generating />
          ) : (
            <AiDraft
              label="AI goal wording"
              suggestionsOnly
              meta="You set every target and baseline"
            >
              {p.aiGoals && (
                <p className="mb-3 text-small whitespace-pre-line text-ink-900">{p.aiGoals.text}</p>
              )}
              <textarea
                className={textArea}
                value={aiNotes}
                onChange={(e) => setAiNotes(e.target.value)}
                placeholder="Your notes and the participant's priorities"
                aria-label="Notes for AI"
              />
              <Button
                className="mt-2"
                size="sm"
                variant="soft"
                disabled={aiNotes.length < 10}
                onClick={async () => {
                  setBusy(true);
                  await post(
                    { type: "ai-goals", notes: aiNotes },
                    "Goal wording drafted",
                    "Placeholders mark what you decide",
                  );
                  setBusy(false);
                }}
              >
                Draft SMART wording
              </Button>
            </AiDraft>
          )}
        </div>
      )}
      {editing && (
        <GoalSheet
          goal={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          post={post}
        />
      )}
    </div>
  );
}

function GoalCard({
  g,
  p,
  post,
  onEdit,
}: {
  g: GoalDto;
  p: PlanFullDto;
  post: Post;
  onEdit: () => void;
}) {
  const [act, setAct] = useState<"" | "state" | "close" | "barrier" | "measure">("");
  const [state, setState] = useState<string>("On Hold");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [closure, setClosure] = useState<string>("Met");
  const [barrier, setBarrier] = useState<string>("Attendance");
  const [m, setM] = useState({
    value: "",
    source: "Direct observation",
    context: "",
    interpretation: "",
  });
  const draft = ["Draft", "Pending Review", "Ready for Approval"].includes(p.state);
  const live = ["Active", "Under Review", "Paused"].includes(p.state);
  return (
    <article className="rounded-card border border-border bg-surface p-5 shadow-lift">
      <header className="flex flex-wrap items-center gap-2">
        <Target className="size-4 text-accent" aria-hidden="true" />
        <h3 className="text-section font-semibold text-ink-900">{g.title}</h3>
        <Tag tone={goalTone[g.state]}>{g.state}</Tag>
        <Tag tone="outline">{g.category}</Tag>
        <Tag tone="outline">{g.priority} priority</Tag>
        {g.shared && <Tag tone="outline">Shared</Tag>}
      </header>
      <p className="mt-2 text-small text-ink-700">{g.description}</p>
      <dl className="mt-3 grid gap-3 rounded-control bg-sunken p-3 text-small sm:grid-cols-4">
        <div>
          <dt className="text-caption text-ink-500">Measure</dt>
          <dd className="text-ink-900">
            {g.type}
            {g.unit ? ` · ${g.unit}` : ""}
            {g.instrument ? ` · ${g.instrument}` : ""}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-500">Baseline → target</dt>
          <dd className="text-ink-900">
            {g.baseline || "—"} → {g.target || "—"}
          </dd>
        </div>
        <div>
          <dt className="text-caption text-ink-500">Current</dt>
          <dd className="text-ink-900">{g.current || "—"}</dd>
        </div>
        <div>
          <dt className="text-caption text-ink-500">Toward target</dt>
          <dd className="text-ink-900">
            {g.share === null ? (
              <span className="text-ink-500">Not shown for this measure</span>
            ) : (
              `${Math.round(g.share * 100)}% of intended change`
            )}
          </dd>
        </div>
      </dl>
      {g.share !== null && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
          <div
            className="h-full rounded-full bg-accent-fill"
            style={{ width: `${Math.max(0, Math.min(100, g.share * 100))}%` }}
          />
        </div>
      )}
      <p className="mt-2 text-caption text-ink-500">
        {g.direction} · {g.ownership} · {g.horizon} · review {g.reviewFrequency.toLowerCase()}
        {g.targetDate ? ` · target date ${dayOnly(g.targetDate)}` : ""}
        {g.holdReason ? ` · on hold: ${g.holdReason}` : ""}
        {g.achievedBy ? ` · achievement confirmed by ${g.achievedBy}` : ""}
      </p>
      {g.barriers.length > 0 && (
        <p className="mt-1 text-caption text-watch">
          Barriers: {g.barriers.map((b) => `${b.type}${b.note ? ` (${b.note})` : ""}`).join("; ")}
        </p>
      )}
      {g.closure && (
        <p className="mt-1 text-caption text-ink-700">
          Closed: {g.closure.reason} · {g.closure.note} · {g.closure.by}
        </p>
      )}
      {p.canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {draft && (
            <Button size="sm" variant="ghost" onClick={onEdit}>
              Edit goal
            </Button>
          )}
          {live && (
            <>
              <Button size="sm" onClick={() => setAct(act === "measure" ? "" : "measure")}>
                Record measurement
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAct(act === "state" ? "" : "state")}
              >
                Change status
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAct(act === "barrier" ? "" : "barrier")}
              >
                Add barrier
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setAct(act === "close" ? "" : "close")}
              >
                Close goal
              </Button>
            </>
          )}
        </div>
      )}
      {act === "measure" && (
        <div className="mt-3 grid gap-2 rounded-control border border-border p-3 sm:grid-cols-4">
          <input
            aria-label="Value"
            placeholder={`Value${g.unit ? ` (${g.unit})` : ""}`}
            value={m.value}
            onChange={(e) => setM({ ...m, value: e.target.value })}
            className="h-9 rounded-control border border-border-strong px-2 text-small"
          />
          <Select
            aria-label="Source"
            className="h-9"
            value={m.source}
            onChange={(e) => setM({ ...m, source: e.target.value })}
          >
            {opts([
              "Signed session note",
              "Direct observation",
              "Participant report",
              "Carer report",
              "Validated instrument",
            ])}
          </Select>
          <input
            aria-label="Test context"
            placeholder="Test context (same method)"
            value={m.context}
            onChange={(e) => setM({ ...m, context: e.target.value })}
            className="h-9 rounded-control border border-border-strong px-2 text-small sm:col-span-2"
          />
          <input
            aria-label="Interpretation"
            placeholder="Your interpretation (optional)"
            value={m.interpretation}
            onChange={(e) => setM({ ...m, interpretation: e.target.value })}
            className="h-9 rounded-control border border-border-strong px-2 text-small sm:col-span-3"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              if (await post({ type: "measure", goalId: g.id, ...m }, "Measurement recorded"))
                setAct("");
            }}
          >
            Save
          </Button>
        </div>
      )}
      {act === "state" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
          <div className="w-48">
            <Select
              aria-label="Goal status"
              className="h-9"
              value={state}
              onChange={(e) => setState(e.target.value)}
            >
              {opts(goalStates)}
            </Select>
          </div>
          <input
            aria-label="Reason or evidence"
            placeholder={state === "Achieved" ? "Evidence (required)" : "Reason"}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
          />
          {state === "Achieved" && (
            <label className="flex items-center gap-1.5 text-caption">
              <input
                type="checkbox"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />{" "}
              I confirm it&apos;s achieved
            </label>
          )}
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              if (
                await post(
                  { type: "goal-state", goalId: g.id, state, reason, confirm },
                  "Goal status changed",
                )
              )
                setAct("");
            }}
          >
            Save
          </Button>
        </div>
      )}
      {act === "barrier" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
          <div className="w-44">
            <Select
              aria-label="Barrier"
              className="h-9"
              value={barrier}
              onChange={(e) => setBarrier(e.target.value)}
            >
              {opts(barrierTypes)}
            </Select>
          </div>
          <input
            aria-label="Barrier note"
            placeholder="Note"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              if (
                await post(
                  { type: "barrier", goalId: g.id, barrier, note: reason },
                  "Barrier recorded",
                )
              )
                setAct("");
            }}
          >
            Save
          </Button>
        </div>
      )}
      {act === "close" && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-control border border-border p-3">
          <div className="w-48">
            <Select
              aria-label="Closure reason"
              className="h-9"
              value={closure}
              onChange={(e) => setClosure(e.target.value)}
            >
              {opts(closures)}
            </Select>
          </div>
          <input
            aria-label="Closure note"
            placeholder="Why it is closing (required)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
          />
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              if (
                await post(
                  { type: "goal-close", goalId: g.id, reason: closure, note: reason },
                  "Goal closed",
                )
              )
                setAct("");
            }}
          >
            Close goal
          </Button>
        </div>
      )}
    </article>
  );
}

function GoalSheet({
  goal,
  onClose,
  post,
}: {
  goal: GoalDto | null;
  onClose: () => void;
  post: Post;
}) {
  const [v, setV] = useState({
    id: goal?.id,
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    category: goal?.category ?? "Self-care",
    ownership: goal?.ownership ?? "Shared decision",
    priority: goal?.priority ?? "Medium",
    horizon: goal?.horizon ?? "Medium-term",
    horizonReason: goal?.horizonReason ?? "",
    type: goal?.type ?? "Numeric",
    direction: goal?.direction ?? "Increase",
    baseline: goal?.baseline ?? "",
    target: goal?.target ?? "",
    unit: goal?.unit ?? "m",
    instrument: goal?.instrument ?? "",
    context: goal?.context ?? "",
    reviewFrequency: goal?.reviewFrequency ?? "Every 4 sessions",
    targetDate: goal?.targetDate ?? "",
    baselineAlternative: "",
  });
  const numeric = ["Numeric", "Time", "Frequency"].includes(v.type);
  const sel = (label: string, key: keyof typeof v, list: readonly string[]) => (
    <Field label={label}>
      <Select
        aria-label={label}
        value={String(v[key] ?? "")}
        onChange={(e) => setV({ ...v, [key]: e.target.value })}
      >
        {opts(list)}
      </Select>
    </Field>
  );
  return (
    <Sheet
      title={goal ? "Edit goal" : "New goal"}
      description="Specific, measurable, with a baseline you observed"
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={async () => {
            if (await post({ type: "goal", goal: v }, goal ? "Goal updated" : "Goal added"))
              onClose();
          }}
        >
          Save goal
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Short title">
          <input
            className={inputClass}
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
          />
        </Field>
        <Field label="Functional outcome">
          <textarea
            className={textArea}
            value={v.description}
            onChange={(e) => setV({ ...v, description: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {sel("Category", "category", goalCategories)}
          {sel("Ownership", "ownership", ownerships)}
          {sel("Priority", "priority", goalPriorities)}
          {sel("Time horizon", "horizon", horizons)}
          {sel("Measurement type", "type", measureTypes)}
          {sel("Direction", "direction", directions)}
        </div>
        {v.horizon === "Not specified" && (
          <Field label="Why no time horizon?">
            <input
              className={inputClass}
              value={v.horizonReason}
              onChange={(e) => setV({ ...v, horizonReason: e.target.value })}
            />
          </Field>
        )}
        <div className="grid grid-cols-3 gap-3">
          <Field label="Baseline">
            <input
              className={inputClass}
              value={v.baseline}
              onChange={(e) => setV({ ...v, baseline: e.target.value })}
            />
          </Field>
          <Field label="Target">
            <input
              className={inputClass}
              value={v.target}
              onChange={(e) => setV({ ...v, target: e.target.value })}
            />
          </Field>
          {numeric ? sel("Unit", "unit", units) : <span />}
        </div>
        {!v.baseline && (
          <Field label="No baseline: documented alternative">
            <input
              className={inputClass}
              value={v.baselineAlternative}
              onChange={(e) => setV({ ...v, baselineAlternative: e.target.value })}
            />
          </Field>
        )}
        {v.type === "Validated instrument" && (
          <Field label="Instrument and version">
            <input
              className={inputClass}
              value={v.instrument}
              onChange={(e) => setV({ ...v, instrument: e.target.value })}
            />
          </Field>
        )}
        <Field
          label="Testing context"
          hint="Setting, devices, assistance and conditions, so later results compare"
        >
          <input
            className={inputClass}
            value={v.context}
            onChange={(e) => setV({ ...v, context: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          {sel("Review frequency", "reviewFrequency", reviewFrequencies)}
          <Field label="Target date">
            <input
              type="date"
              className={inputClass}
              value={v.targetDate}
              onChange={(e) => setV({ ...v, targetDate: e.target.value })}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ interventions */

function Interventions({ p, post }: { p: PlanFullDto; post: Post }) {
  const [editing, setEditing] = useState<InterventionDto | "new" | null>(null);
  const draft = ["Draft", "Pending Review", "Ready for Approval"].includes(p.state);
  return (
    <>
      {p.canEdit && draft && (
        <div className="flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => setEditing("new")}
            disabled={!p.goals.length}
          >
            <Plus className="size-3.5" aria-hidden="true" /> Add intervention
          </Button>
        </div>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        {p.interventions.map((i) => (
          <article
            key={i.id}
            className="rounded-card border border-border bg-surface p-5 shadow-lift"
          >
            <header className="flex flex-wrap items-center gap-2">
              <Wrench className="size-4 text-accent" aria-hidden="true" />
              <h3 className="text-section font-semibold text-ink-900">{i.name}</h3>
              <Tag tone={i.status === "Active" ? "healthy" : "outline"}>{i.status}</Tag>
              <Tag tone="outline">{i.mode}</Tag>
            </header>
            <p className="mt-2 text-small text-ink-700">
              {i.sessionsPerWeek} per week · {i.minutes} min · {i.weeks} weeks
            </p>
            {[
              i.dosage.sets && `${i.dosage.sets} sets`,
              i.dosage.reps && `${i.dosage.reps} reps`,
              i.dosage.distance,
              i.dosage.time,
              i.dosage.resistance,
              i.dosage.assistance,
              i.dosage.prompts,
            ].filter(Boolean).length > 0 && (
              <p className="text-caption text-ink-500">
                Dosage:{" "}
                {[
                  i.dosage.sets && `${i.dosage.sets} sets`,
                  i.dosage.reps && `${i.dosage.reps} reps`,
                  i.dosage.distance,
                  i.dosage.time,
                  i.dosage.resistance,
                  i.dosage.assistance,
                  i.dosage.prompts,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
            <p className="mt-2 text-caption text-ink-500">
              Serves:{" "}
              {i.goalIds
                .map((gid) => p.goals.find((g) => g.id === gid)?.title ?? "goal")
                .join(", ")}
            </p>
            {i.home && (
              <div className="mt-3 rounded-control bg-sunken p-3 text-small">
                <p className="text-caption font-semibold text-ink-500">Home program</p>
                <p className="text-ink-900">{i.home.instructions}</p>
                <p className="text-caption text-ink-500">{i.home.frequency}</p>
              </div>
            )}
            {(i.precautions || i.stopCriteria) && (
              <p className="mt-2 text-caption text-over">
                {[i.precautions, i.stopCriteria].filter(Boolean).join(" · ")}
              </p>
            )}
            {p.canEdit && draft && (
              <Button className="mt-3" size="sm" variant="ghost" onClick={() => setEditing(i)}>
                Edit
              </Button>
            )}
          </article>
        ))}
      </div>
      {!p.interventions.length && (
        <p className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center text-small text-ink-700">
          No interventions yet. Each one links to the goals it serves.
        </p>
      )}
      {editing && (
        <InterventionSheet
          p={p}
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          post={post}
        />
      )}
    </>
  );
}

function InterventionSheet({
  p,
  item,
  onClose,
  post,
}: {
  p: PlanFullDto;
  item: InterventionDto | null;
  onClose: () => void;
  post: Post;
}) {
  const [v, setV] = useState<Omit<InterventionDto, "id"> & { id?: string }>(
    item ?? {
      name: "",
      goalIds: p.goals.map((g) => g.id).slice(0, 1),
      rationale: "",
      mode: "In person",
      sessionsPerWeek: 1,
      minutes: 45,
      weeks: 8,
      dosage: {
        sets: "",
        reps: "",
        distance: "",
        time: "",
        resistance: "",
        assistance: "",
        prompts: "",
      },
      home: null,
      precautions: "",
      stopCriteria: "",
      status: "Planned",
    },
  );
  return (
    <Sheet
      title={item ? "Edit intervention" : "New intervention"}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          onClick={async () => {
            if (await post({ type: "intervention", intervention: v }, "Intervention saved"))
              onClose();
          }}
        >
          Save
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Intervention">
          <input
            className={inputClass}
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
          />
        </Field>
        <fieldset className="flex flex-col gap-1">
          <legend className="text-caption font-semibold text-ink-700">Serves goals</legend>
          {p.goals.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={v.goalIds.includes(g.id)}
                onChange={(e) =>
                  setV({
                    ...v,
                    goalIds: e.target.checked
                      ? [...v.goalIds, g.id]
                      : v.goalIds.filter((x) => x !== g.id),
                  })
                }
              />
              {g.title}
            </label>
          ))}
        </fieldset>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Delivery mode">
            <Select
              aria-label="Delivery mode"
              value={v.mode}
              onChange={(e) => setV({ ...v, mode: e.target.value })}
            >
              {opts(deliveryModes)}
            </Select>
          </Field>
          <Field label="Status">
            <Select
              aria-label="Status"
              value={v.status}
              onChange={(e) => setV({ ...v, status: e.target.value })}
            >
              {opts(activityStates)}
            </Select>
          </Field>
          <Field label="Sessions per week">
            <input
              type="number"
              className={inputClass}
              value={v.sessionsPerWeek}
              onChange={(e) => setV({ ...v, sessionsPerWeek: Number(e.target.value) })}
            />
          </Field>
          <Field label="Minutes">
            <input
              type="number"
              className={inputClass}
              value={v.minutes}
              onChange={(e) => setV({ ...v, minutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Weeks">
            <input
              type="number"
              className={inputClass}
              value={v.weeks}
              onChange={(e) => setV({ ...v, weeks: Number(e.target.value) })}
            />
          </Field>
          <Field label="Sets">
            <input
              className={inputClass}
              value={v.dosage.sets}
              onChange={(e) => setV({ ...v, dosage: { ...v.dosage, sets: e.target.value } })}
            />
          </Field>
          <Field label="Repetitions">
            <input
              className={inputClass}
              value={v.dosage.reps}
              onChange={(e) => setV({ ...v, dosage: { ...v.dosage, reps: e.target.value } })}
            />
          </Field>
          <Field label="Assistance / prompts">
            <input
              className={inputClass}
              value={v.dosage.assistance}
              onChange={(e) => setV({ ...v, dosage: { ...v.dosage, assistance: e.target.value } })}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-small">
          <input
            type="checkbox"
            checked={Boolean(v.home)}
            onChange={(e) =>
              setV({
                ...v,
                home: e.target.checked
                  ? { activity: v.name, instructions: "", frequency: "", equipment: "", carer: "" }
                  : null,
              })
            }
          />{" "}
          Includes a home program
        </label>
        {v.home && (
          <Field label="Home program instructions">
            <textarea
              className={textArea}
              value={v.home.instructions}
              onChange={(e) =>
                setV({
                  ...v,
                  home: {
                    ...(v.home ?? { activity: "", frequency: "", equipment: "", carer: "" }),
                    instructions: e.target.value,
                  },
                })
              }
            />
          </Field>
        )}
        <Field label="Precautions">
          <input
            className={inputClass}
            value={v.precautions}
            onChange={(e) => setV({ ...v, precautions: e.target.value })}
          />
        </Field>
        <Field label="Stop criteria">
          <input
            className={inputClass}
            value={v.stopCriteria}
            onChange={(e) => setV({ ...v, stopCriteria: e.target.value })}
          />
        </Field>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ progress and review */

function Progress({ p, post }: { p: PlanFullDto; post: Post }) {
  const [busy, setBusy] = useState(false);
  const [r, setR] = useState({ decision: "Continue", notes: "", nextReviewDate: "" });
  const numeric = p.goals.filter((g) => g.share !== null && g.points.length);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
        {numeric.map((g) => (
          <FCard
            key={g.id}
            icon={TrendingUp}
            title={g.title}
            sub={`${g.type} · ${g.unit} · baseline ${g.baseline}, target ${g.target} · not a recovery score`}
          >
            <TrendChart
              label={`${g.title} measurements`}
              data={[
                { day: "Baseline", value: Number(g.baseline) },
                ...g.points.map((pt) => ({ day: dayOnly(pt.date), value: Number(pt.value) })),
              ]}
              xKey="day"
              height={200}
              references={[{ y: Number(g.target), label: `Target ${g.target} ${g.unit}` }]}
              series={[{ key: "value", label: g.unit, colour: colour.series1, kind: "area" }]}
            />
          </FCard>
        ))}
        {p.goals
          .filter((g) => g.share === null)
          .map((g) => (
            <FCard
              key={g.id}
              icon={Target}
              title={g.title}
              sub={`${g.type}: shown as recorded, never as a percentage`}
            >
              <ol className="flex flex-col gap-1 text-small">
                <li>
                  Baseline: <strong>{g.baseline || "—"}</strong>
                </li>
                {g.points.map((pt, i) => (
                  <li key={i}>
                    {dayOnly(pt.date)}: <strong>{pt.value}</strong>{" "}
                    <span className="text-caption text-ink-500">
                      ({pt.source}
                      {pt.context ? `, ${pt.context}` : ""})
                    </span>
                  </li>
                ))}
                <li>
                  Target: <strong>{g.target || "—"}</strong>
                </li>
              </ol>
            </FCard>
          ))}
      </div>
      <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
        {busy ? (
          <AiDraft label="Summarising progress" suggestionsOnly generating />
        ) : (
          <AiDraft
            label="AI progress summary"
            suggestionsOnly
            meta={p.aiProgress ? when(p.aiProgress.at) : "From signed measurements only"}
          >
            {p.aiProgress ? (
              <>
                <p className="text-small text-ink-900">{p.aiProgress.text}</p>
                {p.aiProgress.cautions.map((c) => (
                  <p key={c} className="mt-2 text-caption text-watch">
                    Caution: {c}
                  </p>
                ))}
              </>
            ) : (
              <p className="text-small text-ink-700">
                Summarise progress with citations to each measurement.
              </p>
            )}
            {p.canEdit && (
              <Button
                className="mt-3"
                size="sm"
                variant="soft"
                onClick={async () => {
                  setBusy(true);
                  await post({ type: "ai-progress" }, "Summary drafted", "You interpret it");
                  setBusy(false);
                }}
              >
                {p.aiProgress ? "Summarise again" : "Summarise progress"}
              </Button>
            )}
          </AiDraft>
        )}
        {p.canEdit && ["Active", "Under Review", "Paused"].includes(p.state) && (
          <FCard
            icon={ClipboardList}
            title="Review decision"
            sub="Continue, revise, pause, complete or discontinue"
          >
            <div className="flex flex-col gap-2">
              <Select
                aria-label="Decision"
                value={r.decision}
                onChange={(e) => setR({ ...r, decision: e.target.value })}
              >
                {opts(reviewDecisions13)}
              </Select>
              <textarea
                className={textArea}
                value={r.notes}
                onChange={(e) => setR({ ...r, notes: e.target.value })}
                placeholder="Outcomes, participant feedback, barriers and your decision"
                aria-label="Review notes"
              />
              {r.decision === "Continue" && (
                <input
                  type="date"
                  aria-label="Next review date"
                  value={r.nextReviewDate}
                  onChange={(e) => setR({ ...r, nextReviewDate: e.target.value })}
                  className="h-9 rounded-control border border-border-strong px-2 text-small"
                />
              )}
              <Button
                size="sm"
                variant="primary"
                onClick={() => post({ type: "review", ...r }, "Review recorded")}
              >
                Record review
              </Button>
            </div>
          </FCard>
        )}
        <FCard icon={History} title="Reviews" flush>
          <ul className="divide-y divide-border">
            {p.reviews.map((x, i) => (
              <li key={i} className="px-5 py-2.5 text-small">
                <strong>{x.decision}</strong> · {x.by}, {dayOnly(x.at)}
                {x.notes && <span className="block text-caption text-ink-500">{x.notes}</span>}
              </li>
            ))}
            {!p.reviews.length && (
              <li className="px-5 py-5 text-small text-ink-500">No reviews yet.</li>
            )}
          </ul>
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ sharing */

function Sharing({ p, post }: { p: PlanFullDto; post: Post }) {
  const [recipients, setRecipients] = useState<string[]>(
    p.sharing.recipients.length ? p.sharing.recipients : ["Participant"],
  );
  const [goalIds, setGoalIds] = useState<string[]>(
    p.sharing.goalIds.length ? p.sharing.goalIds : p.goals.map((g) => g.id),
  );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Share2}
        title="Share an approved subset"
        sub="Verified recipients only; internal notes are never shared"
        className="xl:col-span-7"
        footer={
          p.canEdit && (
            <>
              <Button
                variant="primary"
                onClick={() =>
                  post(
                    { type: "share", recipients, goalIds },
                    "Shared",
                    "Visible in the patient app",
                  )
                }
              >
                Share
              </Button>
              {p.sharing.shared && (
                <Button
                  variant="danger"
                  onClick={() => post({ type: "revoke" }, "Sharing revoked")}
                >
                  Revoke
                </Button>
              )}
            </>
          )
        }
      >
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1 text-caption font-semibold text-ink-700">Recipients</legend>
          {p.contacts.map((c) => (
            <label key={c} className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                disabled={!p.canEdit}
                checked={recipients.includes(c)}
                onChange={(e) =>
                  setRecipients(
                    e.target.checked ? [...recipients, c] : recipients.filter((x) => x !== c),
                  )
                }
              />
              {c}
            </label>
          ))}
        </fieldset>
        <fieldset className="mt-4 flex flex-col gap-1">
          <legend className="mb-1 text-caption font-semibold text-ink-700">
            Goals and home activities to share
          </legend>
          {p.goals.map((g) => (
            <label key={g.id} className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                disabled={!p.canEdit}
                checked={goalIds.includes(g.id)}
                onChange={(e) =>
                  setGoalIds(
                    e.target.checked ? [...goalIds, g.id] : goalIds.filter((x) => x !== g.id),
                  )
                }
              />
              {g.title}
            </label>
          ))}
        </fieldset>
      </FCard>
      <FCard icon={Share2} title="What the participant sees" className="xl:col-span-5">
        {p.sharing.shared ? (
          <>
            <p className="text-small text-ink-900">
              Shared with {p.sharing.recipients.join(", ")} by {p.sharing.by}, {when(p.sharing.at)}.
            </p>
            <p className="mt-1 text-caption text-ink-500">
              {p.sharing.acknowledged
                ? `Acknowledged ${when(p.sharing.acknowledged)}`
                : "Not yet acknowledged"}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {p.goals
                .filter((g) => p.sharing.goalIds.includes(g.id))
                .map((g) => (
                  <li key={g.id} className="rounded-control border border-border p-3 text-small">
                    <strong>{g.title}</strong>
                    <span className="block text-ink-700">{g.description}</span>
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p className="text-small text-ink-500">Nothing shared yet.</p>
        )}
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ versions and timeline */

function Timeline({ p, base }: { p: PlanFullDto; base: string }) {
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={History}
        title="Versions"
        sub="Signed versions are kept read-only"
        className="xl:col-span-4"
        flush
      >
        <ul className="divide-y divide-border">
          {p.versions.map((v) => (
            <li key={v.id}>
              <a
                href={`${base}/${v.id}`}
                className={cn(
                  "flex items-center gap-3 px-5 py-3 hover:bg-canvas hover:no-underline",
                  v.id === p.id && "bg-accent-tint",
                )}
              >
                <span className="font-mono text-small text-ink-900">v{v.version}</span>
                <Tag tone={stateTone[v.state]}>{v.state}</Tag>
                <span className="ml-auto text-caption text-ink-500">
                  {v.signedAt ? `signed ${dayOnly(v.signedAt)}` : "unsigned"}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </FCard>
      <FCard
        icon={History}
        title="Timeline and audit"
        sub="Who did what, when and why"
        className="xl:col-span-8"
        flush
      >
        <ol className="max-h-[620px] divide-y divide-border overflow-y-auto">
          {p.timeline.map((h, i) => (
            <li key={i} className="px-5 py-3">
              <p className="text-small text-ink-900">{h.action}</p>
              <p className="text-caption text-ink-500">
                {h.by} · {when(h.at)}
                {h.reason ? ` · ${h.reason}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </FCard>
    </div>
  );
}
