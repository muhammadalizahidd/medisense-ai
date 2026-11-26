"use client";

import {
  Activity,
  ArrowLeft,
  ClipboardCheck,
  FilePlus2,
  FileText,
  History,
  Lock,
  LogOut,
  Target,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { RuleMark, Signature } from "@/components/ai/provenance";
import { colour } from "@/components/charts/chart-kit";
import { TrendChart } from "@/components/charts/trend-chart";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field, inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  conditionsSources,
  domains,
  episodeTone,
  methods,
  notAssessable,
  progressStatuses,
  purposes,
  reportTone,
  reportTypes,
  reviewOutcomes,
  reviewTriggers,
  settings,
  units,
  type EpisodeFull,
  type GoalProgress,
} from "@/lib/live/progress";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, td, th } from "./funding-bits";
import { dayOnly, ops, tableBox, tableHead, textArea, when } from "./ops-bits";

const tabs = [
  { id: "outcomes", label: "Outcomes" },
  { id: "record", label: "Record observation" },
  { id: "review", label: "Reassessment" },
  { id: "reports", label: "Reports" },
  { id: "discharge", label: "Discharge" },
  { id: "history", label: "History" },
] as const;
type T = (typeof tabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<{ id?: string } | null>;
const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);

export function EpisodeWorkspace({
  id,
  base,
}: {
  id: string;
  base: "/therapist/progress" | "/care/progress";
}) {
  const url = `/api/care/progress/${encodeURIComponent(id)}`;
  const { data, error, loading, reload } = useResource<{ episode: EpisodeFull }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[760px]" />;
  const p = data.episode;
  const post: Post = async (body, ok, detail) => {
    const res = await ops<{ id?: string }>(url, body, ok, detail);
    if (res) reload();
    return res;
  };
  const visible =
    p.view === "status"
      ? tabs.filter((t) => ["outcomes", "reports", "discharge", "history"].includes(t.id))
      : tabs;
  const current = visible.some((t) => t.id === tab) ? tab : "outcomes";
  const k = p.timeline.length;
  const openReview = p.reviews.find((r) => !["Finalised", "Abandoned"].includes(r.state));
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Progress and reports
          </ButtonLink>
        }
        title={p.service}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Tag tone={episodeTone[p.state]}>{p.state}</Tag>
            {p.view === "status" && (
              <Tag tone="outline">
                <Lock className="size-3" aria-hidden="true" /> Status view
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
        </div>
        <div className="grid grid-cols-2 gap-px bg-border xl:col-span-8 xl:grid-cols-4">
          {[
            ["Goals", String(p.goals.length)],
            ["Improving", String(p.goals.filter((g) => g.status === "Improving").length)],
            ["Observations", String(p.observations.length || "—")],
            ["Reports", String(p.reports.length)],
          ].map(([l, v]) => (
            <div key={l} className="bg-surface p-6">
              <p className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                {l}
              </p>
              <p className="mt-1 type-display text-h1 text-ink-900">{v}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="mt-2">
        <Tabs
          label="Course of care"
          tabs={visible.map((t) => ({
            ...t,
            count:
              t.id === "review" && openReview
                ? 1
                : t.id === "reports"
                  ? p.reports.length || undefined
                  : undefined,
          }))}
          value={current}
          onChange={(t: T) => setTab(t)}
        />
      </div>
      <TabPanel id="outcomes" value={current}>
        <Outcomes p={p} post={post} go={setTab} />
      </TabPanel>
      <TabPanel id="record" value={current}>
        <Record key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="review" value={current}>
        <Review key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="reports" value={current}>
        <Reports key={k} p={p} post={post} base={base} />
      </TabPanel>
      <TabPanel id="discharge" value={current}>
        <Discharge key={k} p={p} post={post} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <FCard icon={History} title="Course of care history" sub="Who did what, when and why" flush>
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
            {!p.timeline.length && (
              <li className="px-5 py-8 text-center text-small text-ink-500">No changes yet.</li>
            )}
          </ol>
        </FCard>
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ outcomes */

function GoalCard({ g, p, post }: { g: GoalProgress; p: EpisodeFull; post: Post }) {
  const [mode, setMode] = useState<"" | "revise" | "status">("");
  const [target, setTarget] = useState(g.target);
  const [reason, setReason] = useState("");
  const [status, setStatus] = useState(g.status);
  const numeric = g.points.length > 1;
  return (
    <FCard
      icon={Target}
      title={g.title}
      sub={`${g.domain} · ${g.direction}${g.unit ? ` · ${g.unit}` : ""}${g.method ? ` · ${g.method}` : ""}`}
      action={
        <Tag
          tone={
            g.status === "Improving" ? "healthy" : g.status === "Declining" ? "over" : "outline"
          }
        >
          {g.status}
        </Tag>
      }
    >
      <div className="flex h-full flex-col gap-4">
        <dl className="grid grid-cols-4 gap-3 rounded-control bg-sunken p-3 text-small">
          <div>
            <dt className="text-caption text-ink-500">Baseline</dt>
            <dd className="text-ink-900">{g.baseline || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">Current</dt>
            <dd className="text-ink-900">{g.current || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">Target</dt>
            <dd className="text-ink-900">{g.target || "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">Toward target</dt>
            <dd className={cn(g.percent === null ? "text-ink-500" : "text-ink-900")}>
              {g.percent === null ? "Not calculable" : `${g.percent}%`}
            </dd>
          </div>
        </dl>
        {g.percent === null && <p className="-mt-2 text-caption text-ink-500">{g.notCalculable}</p>}
        {numeric ? (
          <TrendChart
            label={`${g.title} measurements`}
            data={g.points.map((pt) => ({ day: dayOnly(pt.date), value: pt.value }))}
            xKey="day"
            height={170}
            references={
              g.target && !Number.isNaN(Number(g.target))
                ? [{ y: Number(g.target), label: `Target ${g.target}` }]
                : []
            }
            series={[
              { key: "value", label: g.unit || "value", colour: colour.series1, kind: "area" },
            ]}
          />
        ) : (
          <p className="rounded-control border border-dashed border-border-strong px-4 py-6 text-center text-small text-ink-500">
            {g.direction === "Categorical"
              ? "Categorical goal: changes are shown as recorded, never as a percentage."
              : "Not enough comparable measurements for a trend yet."}
          </p>
        )}
        {g.warnings.map((w) => (
          <p
            key={w}
            className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small"
          >
            {w}
          </p>
        ))}
        {g.revisions.map((r) => (
          <p key={r.at} className="text-caption text-ink-700">
            Revised {dayOnly(r.at)} by {r.by}: target {r.from || "none"} → {r.to}. {r.reason}
          </p>
        ))}
        {p.canEdit && (
          <div className="mt-auto flex flex-wrap gap-2 border-t border-border pt-3">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode(mode === "status" ? "" : "status")}
            >
              Set progress status
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setMode(mode === "revise" ? "" : "revise")}
            >
              Revise target
            </Button>
          </div>
        )}
        {mode === "status" && (
          <div className="flex flex-wrap gap-2">
            <div className="w-48">
              <Select
                aria-label="Progress status"
                className="h-9"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {opts(progressStatuses)}
              </Select>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                post(
                  { type: "goal-status", goalId: g.id, status, confirm: true },
                  "Progress status saved",
                  "Set by you as the treating clinician",
                )
              }
            >
              Confirm as clinician
            </Button>
          </div>
        )}
        {mode === "revise" && (
          <div className="flex flex-col gap-2">
            <input
              aria-label="New target"
              className={inputClass}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            <input
              aria-label="Reason for revision"
              placeholder="Why the target changes (kept with the old target)"
              className={inputClass}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <Button
              size="sm"
              variant="primary"
              disabled={reason.length < 5}
              onClick={() =>
                post(
                  { type: "revise-goal", goalId: g.id, target, reason },
                  "Goal revised",
                  "The previous target is kept in the history",
                )
              }
            >
              Save revision
            </Button>
          </div>
        )}
      </div>
    </FCard>
  );
}

function Outcomes({ p, post, go }: { p: EpisodeFull; post: Post; go: (t: T) => void }) {
  return (
    <div className="flex flex-col gap-6">
      {p.canEdit && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface p-4 shadow-lift">
          <span className="min-w-0 flex-1 text-small text-ink-900">
            {p.reviews.some((r) => !["Finalised", "Abandoned"].includes(r.state))
              ? "A reassessment is open: continue it where you left off."
              : "Record today's measure, or start a reassessment when a review is due."}
          </span>
          <Button variant="primary" onClick={() => go("record")}>
            <Activity className="size-4" aria-hidden="true" /> Record observation
          </Button>
          <Button variant="secondary" onClick={() => go("review")}>
            <ClipboardCheck className="size-4" aria-hidden="true" /> Reassessment
          </Button>
        </div>
      )}
      <div className="grid items-stretch gap-6 xl:grid-cols-2">
        {p.goals.map((g) => (
          <GoalCard key={g.id} g={g} p={p} post={post} />
        ))}
      </div>
      {!p.goals.length && (
        <p className="rounded-card border border-dashed border-border-strong px-6 py-12 text-center text-small text-ink-700">
          No treatment-plan goals for this course of care. An assessment-only course of care can
          finish with a report and no plan.
        </p>
      )}
      {p.view !== "status" && (
        <>
          <div className={tableBox}>
            <table className="w-full text-left text-small">
              <thead className={tableHead}>
                <tr>
                  <th className={th}>Observation</th>
                  <th className={th}>Goal</th>
                  <th className={th}>Result</th>
                  <th className={th}>Method and context</th>
                  <th className={th}>Source</th>
                  <th className={th}>Date</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {p.observations.map((o) => (
                  <tr key={o.id} className="hover:bg-canvas">
                    <td className={td}>
                      <span className="font-mono text-caption text-ink-500">{o.ref}</span>
                      <span className="block text-ink-900">{o.domain}</span>
                    </td>
                    <td className={cn(td, "text-ink-700")}>{o.goalTitle}</td>
                    <td className={td}>
                      {o.notAssessable ? (
                        <span className="text-ink-500">Not assessed: {o.notAssessable}</span>
                      ) : (
                        `${o.raw} ${o.unit === "none" ? "" : o.unit}`
                      )}
                      {o.flags.map((f) => (
                        <span key={f} className="block text-caption font-semibold text-over">
                          {f}
                        </span>
                      ))}
                    </td>
                    <td className={cn(td, "text-ink-700")}>
                      {o.method}
                      {o.instrument ? ` · ${o.instrument}` : ""}
                      <span className="block text-caption text-ink-500">
                        {o.setting}
                        {o.conditions ? ` · ${o.conditions}` : ""}
                      </span>
                    </td>
                    <td className={td}>
                      {o.source}
                      {o.sourceLink && (
                        <a href={o.sourceLink.href} className="block text-caption">
                          {o.sourceLink.label}
                        </a>
                      )}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>{dayOnly(o.date)}</td>
                    <td className={td}>
                      <Tag
                        tone={
                          o.status === "Verified"
                            ? "healthy"
                            : o.status === "Excluded"
                              ? "outline"
                              : "watch"
                        }
                      >
                        {o.status}
                      </Tag>
                      {p.canEdit && ["Draft", "Pending Review"].includes(o.status) && (
                        <button
                          type="button"
                          className="mt-1 block cursor-pointer text-caption text-accent"
                          onClick={() =>
                            post(
                              {
                                type: "verify-observation",
                                id: o.id,
                                status: "Verified",
                                note: "Author, date and method confirmed",
                              },
                              "Observation verified",
                            )
                          }
                        >
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2! px-1 text-caption text-ink-500">
            {p.observations.length} observations · unverified ones never count toward progress
          </p>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ record observation */

function Record({ p, post }: { p: EpisodeFull; post: Post }) {
  const g0 = p.goals[0];
  const [o, setO] = useState({
    goalId: g0?.id ?? "",
    domain:
      g0?.domain && (domains as readonly string[]).includes(g0.domain) ? g0.domain : "Self-Care",
    method: g0?.method || "Direct Observation",
    instrument: "",
    licensed: false,
    raw: "",
    unit: g0?.unit && (units as readonly string[]).includes(g0.unit) ? g0.unit : "none",
    date: new Date().toISOString(),
    planned: false,
    setting: "Home",
    conditions: "",
    source: "Observed",
    status: "Verified",
    notAssessable: "",
    interpretation: "",
  });
  const goal = p.goals.find((g) => g.id === o.goalId);
  const sel = (label: string, key: keyof typeof o, list: readonly string[]) => (
    <Field label={label}>
      <Select
        aria-label={label}
        value={String(o[key])}
        onChange={(e) => setO({ ...o, [key]: e.target.value })}
      >
        {opts(list)}
      </Select>
    </Field>
  );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Activity}
        title="Record an observation"
        sub="Value, method, unit, date, assessor and source: one observation per measure"
        className="xl:col-span-8"
        footer={
          <Button
            variant="primary"
            onClick={() => post({ type: "observation", observation: o }, "Observation recorded")}
          >
            Save observation
          </Button>
        }
      >
        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-3">
            <Field label="Goal">
              <Select
                aria-label="Goal"
                value={o.goalId}
                onChange={(e) => {
                  const g = p.goals.find((x) => x.id === e.target.value);
                  setO({
                    ...o,
                    goalId: e.target.value,
                    method: g?.method || o.method,
                    unit:
                      g?.unit && (units as readonly string[]).includes(g.unit) ? g.unit : o.unit,
                  });
                }}
              >
                {p.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
                <option value="">Not linked to a goal</option>
              </Select>
            </Field>
          </div>
          {sel("Domain", "domain", domains)}
          {sel("Measurement method", "method", methods)}
          {sel("Source", "source", conditionsSources)}
          <Field label="Result">
            <input
              className={inputClass}
              value={o.raw}
              onChange={(e) => setO({ ...o, raw: e.target.value })}
              placeholder={goal?.current ? `Last: ${goal.current}` : ""}
            />
          </Field>
          {sel("Unit", "unit", units)}
          {sel("Setting", "setting", settings)}
          <div className="md:col-span-2">
            <Field label="Conditions (aid, assistance, test conditions, interpreter, fatigue)">
              <input
                className={inputClass}
                value={o.conditions}
                onChange={(e) => setO({ ...o, conditions: e.target.value })}
              />
            </Field>
          </div>
          {sel("Not assessable", "notAssessable", ["", ...notAssessable])}
          {o.method === "Instrument" && (
            <>
              <Field label="Instrument and version">
                <input
                  className={inputClass}
                  value={o.instrument}
                  onChange={(e) => setO({ ...o, instrument: e.target.value })}
                />
              </Field>
              <label className="flex items-center gap-2 text-small">
                <input
                  type="checkbox"
                  checked={o.licensed}
                  onChange={(e) => setO({ ...o, licensed: e.target.checked })}
                />{" "}
                Licence confirmed for scoring
              </label>
            </>
          )}
          <div className="md:col-span-3">
            <Field label="Clinician interpretation (optional)">
              <textarea
                className={textArea}
                value={o.interpretation}
                onChange={(e) => setO({ ...o, interpretation: e.target.value })}
              />
            </Field>
          </div>
        </div>
      </FCard>
      <FCard
        icon={ClipboardCheck}
        title="Comparability"
        sub="So results line up over time"
        className="xl:col-span-4"
        action={<RuleMark>Rule</RuleMark>}
      >
        {goal ? (
          <div className="flex flex-col gap-3 text-small">
            <p>
              Last measured with <strong>{goal.method || "no method yet"}</strong>
              {goal.unit ? ` in ${goal.unit}` : ""}.
            </p>
            {goal.method && o.method !== goal.method && (
              <p className="rounded-control border border-watch bg-watch-bg px-3 py-2">
                Different method from last time: progress won&apos;t be calculated across the
                change.
              </p>
            )}
            <p className="text-ink-700">
              Baseline {goal.baseline || "—"} · current {goal.current || "—"} · target{" "}
              {goal.target || "—"}
            </p>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={o.status === "Draft"}
                onChange={(e) => setO({ ...o, status: e.target.checked ? "Draft" : "Verified" })}
              />{" "}
              Save as draft (doesn&apos;t count toward progress)
            </label>
          </div>
        ) : (
          <p className="text-small text-ink-500">
            Not linked to a goal: the observation is kept, but no trend is calculated.
          </p>
        )}
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ reassessment */

function Review({ p, post }: { p: EpisodeFull; post: Post }) {
  const open = p.reviews.find((r) => !["Finalised", "Abandoned"].includes(r.state));
  const [start, setStart] = useState({
    trigger: "Scheduled",
    reason: "",
    domains: ["Self-Care", "Mobility"] as string[],
  });
  const [item, setItem] = useState({
    domain:
      open?.domains.find((d) => !open.items.some((x) => x.domain === d)) ?? open?.domains[0] ?? "",
    result: "",
    method: "Direct Observation",
    source: "Observed",
    setting: "Home",
    notAssessed: "",
  });
  const [fin, setFin] = useState({ interpretation: "", outcome: "Continue", safetyChecked: false });
  const past = p.reviews.filter((r) => r.state === "Finalised");
  if (!open)
    return (
      <div className="grid items-stretch gap-6 xl:grid-cols-12">
        <FCard
          icon={ClipboardCheck}
          title="Start a reassessment"
          sub="Choose the reason and only the domains that matter"
          className="xl:col-span-7"
          footer={
            p.canEdit && (
              <Button
                variant="primary"
                onClick={() => post({ type: "start-review", ...start }, "Reassessment started")}
              >
                Start reassessment
              </Button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Review trigger">
              <Select
                aria-label="Review trigger"
                value={start.trigger}
                onChange={(e) => setStart({ ...start, trigger: e.target.value })}
              >
                {opts(reviewTriggers)}
              </Select>
            </Field>
            <Field label="Reason">
              <input
                className={inputClass}
                value={start.reason}
                onChange={(e) => setStart({ ...start, reason: e.target.value })}
              />
            </Field>
            <fieldset className="grid grid-cols-2 gap-1.5">
              <legend className="mb-1 text-caption font-semibold text-ink-700">Domains</legend>
              {domains.map((d) => (
                <label key={d} className="flex items-center gap-2 text-small">
                  <input
                    type="checkbox"
                    checked={start.domains.includes(d)}
                    onChange={(e) =>
                      setStart({
                        ...start,
                        domains: e.target.checked
                          ? [...start.domains, d]
                          : start.domains.filter((x) => x !== d),
                      })
                    }
                  />
                  {d}
                </label>
              ))}
            </fieldset>
          </div>
        </FCard>
        <PastReviews past={past} className="xl:col-span-5" />
      </div>
    );
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={ClipboardCheck}
        title={`Reassessment: ${open.trigger}`}
        sub={`${open.state} · ${open.items.length} of ${open.domains.length} domains · visits: ${open.visits.map((v) => v.setting).join(", ") || "none yet"}`}
        className="xl:col-span-7"
        flush
      >
        <ul className="divide-y divide-border">
          {open.domains.map((d) => {
            const x = open.items.find((i) => i.domain === d);
            return (
              <li key={d} className="flex items-start gap-3 px-5 py-3">
                <span className="min-w-0 flex-1">
                  <span className="text-small font-semibold text-ink-900">{d}</span>
                  {x && (
                    <span className="block text-caption text-ink-700">
                      {x.notAssessed
                        ? `Not assessed: ${x.notAssessed}`
                        : `${x.result} (${x.method}; ${x.source}; ${x.setting})`}
                    </span>
                  )}
                </span>
                <Tag tone={x ? "healthy" : "watch"}>{x ? "Recorded" : "Outstanding"}</Tag>
              </li>
            );
          })}
        </ul>
        {p.canEdit && (
          <div className="grid gap-3 border-t border-border p-5 md:grid-cols-2">
            <Select
              aria-label="Review domain"
              value={item.domain}
              onChange={(e) => setItem({ ...item, domain: e.target.value })}
            >
              {opts(open.domains)}
            </Select>
            <Select
              aria-label="Review setting"
              value={item.setting}
              onChange={(e) => setItem({ ...item, setting: e.target.value })}
            >
              {opts(settings)}
            </Select>
            <div className="md:col-span-2">
              <textarea
                aria-label="Finding"
                placeholder="Current finding"
                className={textArea}
                value={item.result}
                onChange={(e) => setItem({ ...item, result: e.target.value })}
              />
            </div>
            <Select
              aria-label="Review method"
              value={item.method}
              onChange={(e) => setItem({ ...item, method: e.target.value })}
            >
              {opts(methods)}
            </Select>
            <Select
              aria-label="Not assessed reason"
              value={item.notAssessed}
              onChange={(e) => setItem({ ...item, notAssessed: e.target.value })}
            >
              <option value="">Assessed</option>
              {opts(notAssessable)}
            </Select>
            <div className="flex flex-wrap gap-2 md:col-span-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  post({ type: "review-item", reviewId: open.id, ...item }, "Finding saved")
                }
              >
                Save finding
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  post(
                    { type: "review-pause", reviewId: open.id, reason: "Continue next visit" },
                    "Saved part-way",
                    "A continuation booking task was created",
                  )
                }
              >
                Save and continue next visit
              </Button>
            </div>
          </div>
        )}
      </FCard>
      <FCard
        icon={ClipboardCheck}
        title="Interpret and finalise"
        sub="Your interpretation and decision; finalising signs and locks it"
        className="xl:col-span-5"
        footer={
          p.canEdit && (
            <Button
              variant="primary"
              onClick={() =>
                post(
                  { type: "review-finalise", reviewId: open.id, ...fin },
                  "Reassessment signed",
                  "Follow-up tasks were created",
                )
              }
            >
              Sign reassessment
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <textarea
            aria-label="Clinical interpretation"
            placeholder="Progress, barriers, risk changes and plan implications"
            className={cn(textArea, "min-h-32")}
            value={fin.interpretation}
            onChange={(e) => setFin({ ...fin, interpretation: e.target.value })}
          />
          <Field label="Outcome">
            <Select
              aria-label="Outcome"
              value={fin.outcome}
              onChange={(e) => setFin({ ...fin, outcome: e.target.value })}
            >
              {opts(reviewOutcomes)}
            </Select>
          </Field>
          <label className="flex items-start gap-2 text-small">
            <input
              type="checkbox"
              checked={fin.safetyChecked}
              onChange={(e) => setFin({ ...fin, safetyChecked: e.target.checked })}
            />{" "}
            Risks and consent reviewed for this reassessment
          </label>
          {open.domains.some((d) => !open.items.some((x) => x.domain === d)) && (
            <p className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small">
              Unfinished:{" "}
              {open.domains.filter((d) => !open.items.some((x) => x.domain === d)).join(", ")}
            </p>
          )}
        </div>
      </FCard>
    </div>
  );
}

function PastReviews({ past, className }: { past: EpisodeFull["reviews"]; className?: string }) {
  return (
    <FCard icon={History} title="Signed reassessments" className={className} flush>
      <ul className="divide-y divide-border">
        {past.map((r) => (
          <li key={r.id} className="px-5 py-3">
            <p className="text-small font-semibold text-ink-900">
              {r.trigger} · {r.outcome}
            </p>
            <p className="text-caption text-ink-700">{r.interpretation}</p>
            {r.signed && (
              <p className="text-caption text-ink-500">
                Signed by {r.signed.by}, {dayOnly(r.signed.at)}
              </p>
            )}
          </li>
        ))}
        {!past.length && (
          <li className="px-5 py-8 text-center text-small text-ink-500">
            No signed reassessments yet.
          </li>
        )}
      </ul>
    </FCard>
  );
}

/* ------------------------------------------------------------------ reports */

function Reports({ p, post, base }: { p: EpisodeFull; post: Post; base: string }) {
  const router = useRouter();
  const [r, setR] = useState(() => ({
    reportType: p.state === "Assessment Only" ? "FCA report" : "NDIS therapy progress report",
    purpose: "NDIS Review",
    due: new Date(Date.now() + 10 * 86_400_000).toISOString(),
  }));
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FileText}
        title="Reports for this course of care"
        sub="Drafts are never visible to the participant"
        className="xl:col-span-8"
        flush
      >
        <ul className="divide-y divide-border">
          {p.reports.map((x) => (
            <li key={x.id}>
              <a
                href={`${base}/reports/${x.id}`}
                className="flex items-center gap-3 px-5 py-3 hover:bg-canvas hover:no-underline"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-small font-semibold text-ink-900">{x.type}</span>
                  <span className="font-mono text-caption text-ink-500">
                    {x.ref} · v{x.version} · {x.purpose} · due {dayOnly(x.dueAt)}
                  </span>
                </span>
                <Tag tone={reportTone[x.status]}>{x.status}</Tag>
              </a>
            </li>
          ))}
          {!p.reports.length && (
            <li className="px-5 py-10 text-center text-small text-ink-500">No reports yet.</li>
          )}
        </ul>
      </FCard>
      <FCard
        icon={FilePlus2}
        title="Request a report"
        sub="Creates the draft and a task for the treating clinician"
        className="xl:col-span-4"
        footer={
          p.canEdit && (
            <Button
              variant="primary"
              onClick={async () => {
                const res = await post({ type: "request-report", ...r }, "Report created");
                if (res?.id) router.push(`${base}/reports/${res.id}`);
              }}
            >
              Create report
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-3">
          <Field label="Report type">
            <Select
              aria-label="Report type"
              value={r.reportType}
              onChange={(e) => setR({ ...r, reportType: e.target.value })}
            >
              {opts(reportTypes)}
            </Select>
          </Field>
          <Field label="Purpose and audience">
            <Select
              aria-label="Purpose"
              value={r.purpose}
              onChange={(e) => setR({ ...r, purpose: e.target.value })}
            >
              {opts(purposes)}
            </Select>
          </Field>
          <Field label="Due date">
            <input
              type="date"
              className={inputClass}
              value={r.due.slice(0, 10)}
              onChange={(e) => setR({ ...r, due: new Date(e.target.value).toISOString() })}
            />
          </Field>
        </div>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ discharge */

function Discharge({ p, post }: { p: EpisodeFull; post: Post }) {
  const d = p.discharge;
  const [v, setV] = useState({
    outcome: d.outcome,
    reason: d.reason,
    followUp: d.followUp,
    exceptions: d.exceptions,
  });
  const done = Boolean(d.signed);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={LogOut}
        title="Discharge"
        sub="Clinical discharge and financial closure are tracked separately"
        className="xl:col-span-7"
        footer={
          p.canEdit &&
          !done && (
            <Button
              variant="primary"
              onClick={() =>
                post(
                  { type: "discharge", ...v },
                  "Discharge signed",
                  "Billing reconciliation continues separately",
                )
              }
            >
              Sign discharge
            </Button>
          )
        }
      >
        {done && d.signed ? (
          <div className="flex flex-col gap-3 text-small">
            <Signature name={d.signed.by} when={when(d.signed.at)} label="Discharge signed" />
            <p>
              <strong>Reason:</strong> {d.reason}
            </p>
            {p.view !== "status" && (
              <>
                <p>
                  <strong>Outcome:</strong> {d.outcome}
                </p>
                <p>
                  <strong>Follow-up:</strong> {d.followUp}
                </p>
              </>
            )}
          </div>
        ) : p.canEdit ? (
          <div className="flex flex-col gap-3">
            <Field label="Outcome summary">
              <textarea
                className={textArea}
                value={v.outcome}
                onChange={(e) => setV({ ...v, outcome: e.target.value })}
              />
            </Field>
            <Field label="Reason">
              <input
                className={inputClass}
                value={v.reason}
                onChange={(e) => setV({ ...v, reason: e.target.value })}
              />
            </Field>
            <Field label="Follow-up and referrals">
              <textarea
                className={textArea}
                value={v.followUp}
                onChange={(e) => setV({ ...v, followUp: e.target.value })}
              />
            </Field>
            <Field label="Exceptions for open checklist items">
              <input
                className={inputClass}
                value={v.exceptions}
                onChange={(e) => setV({ ...v, exceptions: e.target.value })}
              />
            </Field>
          </div>
        ) : (
          <p className="text-small text-ink-500">Not discharged.</p>
        )}
      </FCard>
      <FCard
        icon={ClipboardCheck}
        title="Closure checklist"
        sub="Open items need completion or a documented exception"
        className="xl:col-span-5"
        action={<RuleMark>Checklist</RuleMark>}
      >
        <ul className="flex flex-col gap-2">
          {d.checklist.map((c) => (
            <li key={c.item}>
              <label className="flex items-center gap-2.5 text-small">
                <input
                  type="checkbox"
                  disabled={!p.canEdit}
                  checked={c.done}
                  onChange={(e) =>
                    post(
                      { type: "checklist", item: c.item, done: e.target.checked },
                      "Checklist updated",
                    )
                  }
                />
                <span className={cn(c.done ? "text-ink-900" : "text-ink-700")}>{c.item}</span>
              </label>
            </li>
          ))}
        </ul>
        <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4 text-small">
          <div>
            <dt className="text-caption text-ink-500">Clinical</dt>
            <dd className="text-ink-900">{d.clinical}</dd>
          </div>
          <div>
            <dt className="text-caption text-ink-500">Financial</dt>
            <dd className="text-ink-900">{d.financial}</dd>
          </div>
        </dl>
      </FCard>
    </div>
  );
}
