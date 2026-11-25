"use client";

import { useAiText } from "@/components/ai/ai-switch";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  FlaskConical,
  History,
  Lock,
  MapPin,
  Plus,
  Ruler,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useState } from "react";
import { AiChip, AiDraft, RuleMark, Signature } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Stepper } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Field, Sheet, inputClass } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { useResource } from "@/lib/live/client";
import {
  consentStates,
  contexts,
  evidenceQuality,
  evidenceTypes,
  frequencies,
  instruments,
  modes,
  notAssessedReasons,
  outcomes,
  performance,
  purposes,
  releaseStates,
  respondentRoles,
  results,
  riskReviews,
  sensitivities,
  sources,
  statusTone,
  templatesFor,
  type AssessDto,
} from "@/lib/live/assess";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard, th, td } from "./funding-bits";
import { dayOnly, ops, textArea, when } from "./ops-bits";

const tabs = [
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan & template" },
  { id: "capture", label: "Workspace" },
  { id: "measures", label: "Measures & scores" },
  { id: "evidence", label: "Evidence" },
  { id: "visits", label: "Visits" },
  { id: "review", label: "Review & missing" },
  { id: "report", label: "Report" },
  { id: "approval", label: "Approval & sharing" },
  { id: "history", label: "History" },
] as const;
type T = (typeof tabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;

const lifecycle = ["Requested", "Ready", "In Progress", "Pending Signature", "Finalised"];

const opts = (list: readonly string[]) => list.map((o) => <option key={o}>{o}</option>);

export function AssessWorkspace({
  id,
  base,
}: {
  id: string;
  base: "/therapist/assessments" | "/care/assessments";
}) {
  const url = `/api/care/assessments/${id}`;
  const { data, error, loading, reload } = useResource<{ assessment: AssessDto }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  const a = data.assessment;
  const post: Post = async (body, ok, detail) => {
    const res = await ops(url, body, ok, detail);
    if (res) reload();
    return Boolean(res);
  };
  const status = a.view === "status";
  const visible = status
    ? tabs.filter((t) => ["overview", "visits", "history"].includes(t.id))
    : tabs;
  const current = visible.some((t) => t.id === tab) ? tab : "overview";
  const step = Math.max(
    0,
    lifecycle.indexOf(
      a.status === "Paused"
        ? "In Progress"
        : a.status === "Pending Review"
          ? "Pending Signature"
          : a.status === "Amended"
            ? "Finalised"
            : a.status,
    ),
  );
  const tabList = visible.map((t) => ({
    ...t,
    count:
      t.id === "review"
        ? a.blockers.length || undefined
        : t.id === "capture"
          ? a.observations.length || undefined
          : t.id === "evidence"
            ? a.evidence.length || undefined
            : undefined,
    alert: t.id === "review",
  }));
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={base}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Assessments
          </ButtonLink>
        }
        title={a.support}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{a.ref}</span>
            <Tag tone={statusTone[a.status]}>{a.status}</Tag>
            {a.restricted && (
              <Tag tone="outline">
                <Lock className="size-3" aria-hidden="true" /> Restricted discipline
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
          <p className="mt-1 type-display text-h2 text-ink-900">{a.participant}</p>
          <p className="font-mono text-caption text-ink-500">{a.participantId}</p>
          <p className="mt-2 text-small text-ink-700">
            {a.discipline} · {a.clinician}
          </p>
          <p className="text-small text-ink-700">
            {a.purpose} · {a.mode}
            {a.nextVisit ? ` · next visit ${when(a.nextVisit)}` : ""}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 xl:col-span-8">
          <Stepper steps={lifecycle} current={step} />
          <div className="flex flex-wrap gap-2">
            <Tag
              tone={
                a.consent === "Obtained"
                  ? "healthy"
                  : a.consent === "Not applicable"
                    ? "neutral"
                    : "watch"
              }
            >
              Consent {a.consent.toLowerCase()}
            </Tag>
            <Tag tone={a.risk === "Reviewed" ? "healthy" : a.risk === "Unknown" ? "watch" : "over"}>
              Safety {a.risk.toLowerCase()}
            </Tag>
            <Tag tone="outline">
              {a.templateTitle} v{a.templateVersion}
            </Tag>
            {a.coSign.required && (
              <Tag tone={a.coSign.by ? "healthy" : "watch"}>
                {a.coSign.by ? `Co-signed by ${a.coSign.by}` : "Co-sign required"}
              </Tag>
            )}
            <Tag tone={a.release.state === "Shared" ? "healthy" : "outline"}>
              Report {a.release.state.toLowerCase()}
            </Tag>
          </div>
        </div>
      </section>
      {status && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" /> Status view: clinical
          responses, scores and the report aren&apos;t shown to your role.
        </p>
      )}
      <div className="mt-2">
        <Tabs label="Assessment" tabs={tabList} value={current} onChange={(t: T) => setTab(t)} />
      </div>
      <TabPanel id="overview" value={current}>
        <Overview a={a} go={setTab} />
      </TabPanel>
      <TabPanel id="plan" value={current}>
        <Plan a={a} post={post} />
      </TabPanel>
      <TabPanel id="capture" value={current}>
        <Capture a={a} post={post} />
      </TabPanel>
      <TabPanel id="measures" value={current}>
        <Measures a={a} post={post} />
      </TabPanel>
      <TabPanel id="evidence" value={current}>
        <Evidence a={a} post={post} />
      </TabPanel>
      <TabPanel id="visits" value={current}>
        <Visits a={a} post={post} />
      </TabPanel>
      <TabPanel id="review" value={current}>
        <Review a={a} post={post} go={setTab} />
      </TabPanel>
      <TabPanel id="report" value={current}>
        <Report a={a} post={post} />
      </TabPanel>
      <TabPanel id="approval" value={current}>
        <Approval a={a} post={post} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <HistoryTab a={a} />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ overview */

function Overview({ a, go }: { a: AssessDto; go: (t: T) => void }) {
  const included = a.domains.filter((d) => d.included);
  const done = included.filter(
    (d) => d.state === "Complete" || d.state === "Unable to assess",
  ).length;
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={ClipboardList}
        title="Sections"
        sub={`${done} of ${included.length} complete or explained`}
        className="xl:col-span-7"
        flush
      >
        <ul className="divide-y divide-border">
          {included.map((d) => (
            <li key={d.key} className="flex items-center gap-3 px-5 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block text-small font-semibold text-ink-900">
                  {d.title}
                  {d.essential && (
                    <span className="ml-2 text-caption font-normal text-ink-500">required</span>
                  )}
                </span>
                {d.reason && <span className="text-caption text-ink-500">{d.reason}</span>}
              </span>
              <Tag
                tone={
                  d.state === "Complete"
                    ? "healthy"
                    : d.state === "Partial"
                      ? "available"
                      : d.state === "Unable to assess"
                        ? "neutral"
                        : "watch"
                }
              >
                {d.state}
              </Tag>
            </li>
          ))}
        </ul>
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={ShieldAlert}
          title="Before signing"
          sub="Rules, not AI"
          action={<RuleMark>Check</RuleMark>}
        >
          {a.blockers.length ? (
            <ul className="flex flex-col gap-2">
              {a.blockers.map((b) => (
                <li
                  key={b}
                  className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-small text-ink-900"
                >
                  {b}
                </li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 text-small text-healthy">
              <CheckCircle2 className="size-4" aria-hidden="true" /> Nothing blocking.
            </p>
          )}
          {a.view === "clinical" && (
            <Button className="mt-3" size="sm" variant="ghost" onClick={() => go("review")}>
              Open review
            </Button>
          )}
        </FCard>
        <FCard icon={Users} title="Visits and respondents">
          <p className="text-small text-ink-900">
            {a.visits.length} visit{a.visits.length === 1 ? "" : "s"}
            {a.visits.at(-1)?.paused ? ` · paused: ${a.visits.at(-1)?.paused}` : ""}
          </p>
          <p className="mt-1 text-caption text-ink-500">
            {a.respondents.map((r) => `${r.name} (${r.role})`).join(", ") ||
              "No respondents recorded yet"}
          </p>
          {a.outcome && (
            <p className="mt-3 text-small text-ink-900">
              Outcome: <strong>{a.outcome}</strong>
            </p>
          )}
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ plan (Choose Template) */

function Plan({ a, post }: { a: AssessDto; post: Post }) {
  const options = templatesFor(a.discipline, a.support);
  const [v, setV] = useState({
    purpose: a.purpose,
    purposeOther: a.purposeOther,
    templateId: a.templateId,
    mode: a.mode,
    modeOther: a.modeOther,
    consent: a.consent,
    photoConsent: a.photoConsent,
    risk: a.risk,
    riskNote: a.riskNote,
  });
  const [resp, setResp] = useState({ name: "", role: "Guardian", permission: "" });
  const [custom, setCustom] = useState({
    title: "",
    label: "",
    type: "Single choice",
    unit: "",
    options: "",
  });
  const tpl = options.find((o) => o.id === v.templateId);
  const edit = a.canEdit;
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FlaskConical}
        title="Assessment plan"
        sub="Purpose, template, location, consent and safety"
        className="xl:col-span-7"
        footer={
          edit && (
            <Button
              variant="primary"
              onClick={() =>
                post(
                  { type: "configure", ...v },
                  "Plan saved",
                  v.risk === "Concern" || v.risk === "Escalated"
                    ? "A Clinical Lead review task was raised"
                    : undefined,
                )
              }
            >
              Save plan
            </Button>
          )
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Purpose">
            <Select
              aria-label="Purpose"
              disabled={!edit}
              value={v.purpose}
              onChange={(e) => setV({ ...v, purpose: e.target.value })}
            >
              {opts(purposes)}
            </Select>
          </Field>
          {v.purpose === "Other" ? (
            <Field label="Explain Other (required)">
              <input
                className={inputClass}
                value={v.purposeOther}
                onChange={(e) => setV({ ...v, purposeOther: e.target.value })}
              />
            </Field>
          ) : (
            <span />
          )}
          <div className="sm:col-span-2">
            <Field label={`Template · ${a.discipline} templates only`}>
              <Select
                aria-label="Template"
                disabled={!edit}
                value={v.templateId}
                onChange={(e) => setV({ ...v, templateId: e.target.value })}
              >
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title} · v{o.version}
                  </option>
                ))}
              </Select>
            </Field>
            {tpl && tpl.instruments.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5 text-caption">
                {tpl.instruments.map((i) => {
                  const ins = instruments.find((x) => x.id === i);
                  return ins ? (
                    <Tag
                      key={i}
                      tone={ins.licence === "Unknown" ? "watch" : "outline"}
                    >{`${ins.name} ${ins.edition} · ${ins.licence === "Unknown" ? "licence unknown: restricted" : ins.licence.toLowerCase()}`}</Tag>
                  ) : null;
                })}
              </p>
            )}
          </div>
          <Field label="Mode and location">
            <Select
              aria-label="Location"
              disabled={!edit}
              value={v.mode}
              onChange={(e) => setV({ ...v, mode: e.target.value })}
            >
              {opts(modes)}
            </Select>
          </Field>
          {v.mode === "Other" ? (
            <Field label="Describe the location (required)">
              <input
                className={inputClass}
                value={v.modeOther}
                onChange={(e) => setV({ ...v, modeOther: e.target.value })}
              />
            </Field>
          ) : (
            <span className="self-end text-caption text-ink-500">
              {v.mode === "Home"
                ? "Adds the home environment and access checklist."
                : v.mode === "School"
                  ? "Adds school authorisation and respondent sources."
                  : v.mode === "Telehealth"
                    ? "Adds suitability and remote-limitation fields."
                    : ""}
            </span>
          )}
          <Field label="Assessment consent">
            <Select
              aria-label="Consent"
              disabled={!edit}
              value={v.consent}
              onChange={(e) => setV({ ...v, consent: e.target.value })}
            >
              {opts(consentStates)}
            </Select>
          </Field>
          <Field
            label="Photo / recording permission"
            hint="Recorded separately from assessment consent"
          >
            <Select
              aria-label="Photo consent"
              disabled={!edit}
              value={v.photoConsent}
              onChange={(e) => setV({ ...v, photoConsent: e.target.value })}
            >
              {opts(consentStates)}
            </Select>
          </Field>
          <Field label="Risk and safety review">
            <Select
              aria-label="Risk"
              disabled={!edit}
              value={v.risk}
              onChange={(e) => setV({ ...v, risk: e.target.value })}
            >
              {opts(riskReviews)}
            </Select>
          </Field>
          <Field label="Safety note" hint="A concern raises a Clinical Lead review; not AI triage">
            <input
              className={inputClass}
              disabled={!edit}
              value={v.riskNote}
              onChange={(e) => setV({ ...v, riskNote: e.target.value })}
            />
          </Field>
        </div>
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard
          icon={Users}
          title="Respondents and attendees"
          sub="Identity, role and permission for every source"
          flush
        >
          <ul className="divide-y divide-border">
            {a.respondents.map((r) => (
              <li key={r.id} className="px-5 py-2.5 text-small">
                <span className="font-semibold text-ink-900">{r.name}</span> · {r.role}
                <span className="block text-caption text-ink-500">
                  {r.permission || "Permission not recorded"}
                </span>
              </li>
            ))}
          </ul>
          {edit && (
            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              <input
                aria-label="Name"
                placeholder="Name"
                value={resp.name}
                onChange={(e) => setResp({ ...resp, name: e.target.value })}
                className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
              />
              <div className="w-36">
                <Select
                  aria-label="Role"
                  className="h-9"
                  value={resp.role}
                  onChange={(e) => setResp({ ...resp, role: e.target.value })}
                >
                  {opts(respondentRoles)}
                </Select>
              </div>
              <input
                aria-label="Permission"
                placeholder="Permission / authority"
                value={resp.permission}
                onChange={(e) => setResp({ ...resp, permission: e.target.value })}
                className="h-9 w-full rounded-control border border-border-strong px-2 text-small"
              />
              <Button
                size="sm"
                onClick={async () => {
                  if (await post({ type: "respondent", ...resp }, "Respondent added"))
                    setResp({ name: "", role: "Guardian", permission: "" });
                }}
              >
                Add respondent
              </Button>
            </div>
          )}
        </FCard>
        <FCard
          icon={ClipboardList}
          title="Sections"
          sub="Optional domains can be removed; required ones can't. Data is never lost on hide."
          flush
        >
          <ul className="max-h-96 divide-y divide-border overflow-y-auto">
            {a.domains.map((d) => (
              <li key={d.key} className="flex items-center gap-3 px-5 py-2">
                <span className="min-w-0 flex-1 text-small text-ink-900">{d.title}</span>
                {d.essential ? (
                  <Tag tone="outline">Required</Tag>
                ) : (
                  <label className="flex items-center gap-1.5 text-caption text-ink-700">
                    <input
                      type="checkbox"
                      disabled={!edit}
                      checked={d.included}
                      onChange={(e) =>
                        post(
                          { type: "domain", key: d.key, included: e.target.checked },
                          e.target.checked ? "Section included" : "Section removed",
                        )
                      }
                    />
                    Include
                  </label>
                )}
              </li>
            ))}
            {a.custom.map((c) => (
              <li key={c.id} className="px-5 py-2 text-small text-ink-900">
                {c.title}{" "}
                <span className="text-caption text-ink-500">
                  · custom ·{" "}
                  {c.fields
                    .map((f) => `${f.label} (${f.type}${f.unit ? `, ${f.unit}` : ""})`)
                    .join(", ")}
                </span>
              </li>
            ))}
          </ul>
          {edit && (
            <div className="flex flex-wrap gap-2 border-t border-border p-4">
              <input
                aria-label="Custom section title"
                placeholder="Custom section title"
                value={custom.title}
                onChange={(e) => setCustom({ ...custom, title: e.target.value })}
                className="h-9 w-full rounded-control border border-border-strong px-2 text-small"
              />
              <input
                aria-label="Field label"
                placeholder="Field label"
                value={custom.label}
                onChange={(e) => setCustom({ ...custom, label: e.target.value })}
                className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
              />
              <div className="w-36">
                <Select
                  aria-label="Field type"
                  className="h-9"
                  value={custom.type}
                  onChange={(e) => setCustom({ ...custom, type: e.target.value })}
                >
                  {opts([
                    "Short text",
                    "Long text",
                    "Single choice",
                    "Multi-choice",
                    "Number/unit",
                    "Date",
                  ])}
                </Select>
              </div>
              {custom.type === "Number/unit" && (
                <input
                  aria-label="Unit"
                  placeholder="Unit"
                  value={custom.unit}
                  onChange={(e) => setCustom({ ...custom, unit: e.target.value })}
                  className="h-9 w-24 rounded-control border border-border-strong px-2 text-small"
                />
              )}
              {custom.type.includes("choice") && (
                <input
                  aria-label="Options"
                  placeholder="Options, comma separated"
                  value={custom.options}
                  onChange={(e) => setCustom({ ...custom, options: e.target.value })}
                  className="h-9 w-full rounded-control border border-border-strong px-2 text-small"
                />
              )}
              <Button
                size="sm"
                onClick={() =>
                  post(
                    {
                      type: "custom",
                      title: custom.title,
                      fields: [
                        {
                          label: custom.label,
                          type: custom.type,
                          unit: custom.unit,
                          options: custom.options
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                      ],
                    },
                    "Custom section added",
                  )
                }
              >
                <Plus className="size-3.5" aria-hidden="true" /> Add section
              </Button>
            </div>
          )}
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ workspace */

function Capture({ a, post }: { a: AssessDto; post: Post }) {
  const included = a.domains.filter((d) => d.included);
  const [key, setKey] = useState(
    included.find((d) => d.state !== "Complete")?.key ?? included[0]?.key ?? "",
  );
  const d = included.find((x) => x.key === key) ?? included[0];
  const [v, setV] = useState({
    item: "",
    source: "Direct observation",
    performance: "Independent",
    context: a.mode === "Telehealth" ? "Telehealth" : a.mode === "School" ? "School" : "Home",
    frequency: "Often",
    result: "Completed safely",
    quality: "Observed",
    notes: "",
    reason: "",
  });
  const [unable, setUnable] = useState({ reason: "Not applicable", note: "" });
  if (!d) return null;
  const obs = a.observations.filter((o) => o.domain === d.key);
  const needsReason =
    v.performance === "Not assessed" ||
    v.result === "Not attempted" ||
    v.result === "Unable to assess";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <nav
        aria-label="Sections"
        className="overflow-hidden rounded-card border border-border bg-surface shadow-lift xl:col-span-3"
      >
        <ul className="max-h-[680px] divide-y divide-border overflow-y-auto">
          {included.map((x) => (
            <li key={x.key}>
              <button
                type="button"
                onClick={() => setKey(x.key)}
                aria-current={x.key === d.key}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 px-4 py-3 text-left text-small hover:bg-canvas",
                  x.key === d.key && "bg-accent-tint font-semibold text-accent",
                )}
              >
                <span
                  className={cn(
                    "size-2 flex-none rounded-full",
                    x.state === "Complete"
                      ? "bg-healthy-dot"
                      : x.state === "Partial"
                        ? "bg-available-dot"
                        : x.state === "Unable to assess"
                          ? "bg-ink-400"
                          : "bg-watch-dot",
                  )}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{x.title}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex flex-col gap-6 xl:col-span-9 [&>*:last-child]:flex-1">
        <FCard
          icon={ClipboardList}
          title={d.title}
          sub={d.hint || "Record each finding with its source, context and assistance"}
          action={
            <Tag
              tone={
                d.state === "Complete"
                  ? "healthy"
                  : d.state === "Unable to assess"
                    ? "neutral"
                    : "watch"
              }
            >
              {d.state}
            </Tag>
          }
        >
          {obs.length ? (
            <ul className="flex flex-col gap-2">
              {obs.map((o) => (
                <li
                  key={o.id}
                  className={cn(
                    "rounded-control border p-3 text-small",
                    o.aiSuggested && !o.accepted ? "border-dashed surface-draft" : "border-border",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-ink-900">{o.item}</strong>
                    <Tag tone="outline">{o.source}</Tag>
                    <Tag
                      tone={
                        o.result.startsWith("Completed safely")
                          ? "healthy"
                          : o.result.startsWith("Completed")
                            ? "available"
                            : "watch"
                      }
                    >
                      {o.performance}
                    </Tag>
                    {o.aiSuggested && !o.accepted && <AiChip>AI suggestion</AiChip>}
                    <span className="ml-auto text-caption text-ink-500">
                      {o.context} · {o.frequency} · {o.author}, {dayOnly(o.date)}
                    </span>
                  </div>
                  {o.notes && <p className="mt-1 text-ink-700">{o.notes}</p>}
                  {o.reason && <p className="mt-1 text-caption text-watch">Reason: {o.reason}</p>}
                  {o.aiSuggested && !o.accepted && a.canEdit && (
                    <Button
                      className="mt-2"
                      size="sm"
                      onClick={() =>
                        post(
                          { type: "accept-observation", id: o.id },
                          "Accepted",
                          "Now part of the assessment, with your name",
                        )
                      }
                    >
                      Accept into assessment
                    </Button>
                  )}
                  {o.aiSuggested && !o.accepted && a.canEdit && (
                    <Button
                      className="mt-2 ml-2"
                      size="sm"
                      variant="ghost"
                      onClick={() => post({ type: "discard-observation", id: o.id }, "Discarded")}
                    >
                      Discard
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-small text-ink-500">Nothing recorded for this section yet.</p>
          )}
        </FCard>
        {a.canEdit && (
          <FCard
            icon={Plus}
            title="Record a finding"
            sub="Performance categories are descriptive, not a validated scale"
            footer={
              <Button
                variant="primary"
                disabled={!v.item || (needsReason && v.reason.length < 3)}
                onClick={async () => {
                  if (await post({ type: "observe", domain: d.key, ...v }, "Finding recorded"))
                    setV({ ...v, item: "", notes: "", reason: "" });
                }}
              >
                Save finding
              </Button>
            }
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Item">
                <Select
                  aria-label="Item"
                  value={v.item}
                  onChange={(e) => setV({ ...v, item: e.target.value })}
                >
                  <option value="">Choose</option>
                  {opts(d.items.length ? d.items : ["Finding"])}
                </Select>
              </Field>
              <Field label="Source">
                <Select
                  aria-label="Source"
                  value={v.source}
                  onChange={(e) => setV({ ...v, source: e.target.value })}
                >
                  {opts(sources)}
                </Select>
              </Field>
              <Field label="Performance / ability">
                <Select
                  aria-label="Performance"
                  value={v.performance}
                  onChange={(e) => setV({ ...v, performance: e.target.value })}
                >
                  {opts(performance)}
                </Select>
              </Field>
              <Field label="Context">
                <Select
                  aria-label="Context"
                  value={v.context}
                  onChange={(e) => setV({ ...v, context: e.target.value })}
                >
                  {opts(contexts)}
                </Select>
              </Field>
              <Field label="Frequency">
                <Select
                  aria-label="Frequency"
                  value={v.frequency}
                  onChange={(e) => setV({ ...v, frequency: e.target.value })}
                >
                  {opts(frequencies)}
                </Select>
              </Field>
              <Field label="Task result">
                <Select
                  aria-label="Result"
                  value={v.result}
                  onChange={(e) => setV({ ...v, result: e.target.value })}
                >
                  {opts(results)}
                </Select>
              </Field>
              <Field label="Evidence quality">
                <Select
                  aria-label="Evidence quality"
                  value={v.quality}
                  onChange={(e) => setV({ ...v, quality: e.target.value })}
                >
                  {opts(evidenceQuality)}
                </Select>
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Observation"
                  hint={
                    a.mode === "Telehealth"
                      ? "Label remote observations as remote"
                      : "What you saw or were told, in plain words"
                  }
                >
                  <input
                    className={inputClass}
                    value={v.notes}
                    onChange={(e) => setV({ ...v, notes: e.target.value })}
                  />
                </Field>
              </div>
              {needsReason && (
                <div className="sm:col-span-3">
                  <Field label="Reason not attempted / assessed (required)">
                    <input
                      className={inputClass}
                      value={v.reason}
                      onChange={(e) => setV({ ...v, reason: e.target.value })}
                    />
                  </Field>
                </div>
              )}
            </div>
          </FCard>
        )}
        {a.canEdit && !d.essential && d.state !== "Complete" && (
          <section className="flex flex-wrap items-end gap-3 rounded-card border border-dashed border-border-strong bg-surface p-4">
            <span className="text-small font-semibold text-ink-900">
              Can&apos;t assess this section?
            </span>
            <div className="w-48">
              <Select
                aria-label="Reason"
                className="h-9"
                value={unable.reason}
                onChange={(e) => setUnable({ ...unable, reason: e.target.value })}
              >
                {opts(notAssessedReasons)}
              </Select>
            </div>
            <input
              aria-label="Explanation"
              placeholder="Explanation"
              value={unable.note}
              onChange={(e) => setUnable({ ...unable, note: e.target.value })}
              className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
            />
            <Button
              size="sm"
              onClick={() =>
                post(
                  { type: "unable", key: d.key, ...unable },
                  "Marked unable to assess",
                  "The reason appears in the report",
                )
              }
            >
              Mark unable to assess
            </Button>
          </section>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ measures and instruments */

function Measures({ a, post }: { a: AssessDto; post: Post }) {
  const [m, setM] = useState({
    parameter: "",
    value: "",
    unit: "",
    method: "",
    side: "",
    device: "",
    conditions: "",
    reported: false,
  });
  const [s, setS] = useState({
    instrument: instruments[0]?.id ?? "",
    version: "",
    score: "",
    domain: "",
    notes: "",
  });
  const base = a.baseline;
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
        <FCard
          icon={Ruler}
          title="Measurements"
          sub="Unit, method and conditions keep results comparable"
          flush
        >
          <table className="w-full text-left text-small">
            <thead className="bg-sunken text-label tracking-[0.08em] text-ink-500 uppercase">
              <tr>
                <th className={th}>Parameter</th>
                <th className={th}>Result</th>
                <th className={th}>Method · conditions</th>
                {base && <th className={th}>Baseline ({dayOnly(base.date)})</th>}
                <th className={th}>Recorded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {a.measurements.map((x) => {
                const b = base?.measurements.find(
                  (y) => y.parameter === x.parameter && y.method === x.method,
                );
                return (
                  <tr key={x.id}>
                    <td className={cn(td, "font-semibold text-ink-900")}>
                      {x.parameter}
                      {x.side && (
                        <span className="block text-caption font-normal text-ink-500">
                          {x.side}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {x.value} {x.unit}
                      <span className="block text-caption text-ink-500">
                        {x.reported ? "Reported" : "Measured"}
                      </span>
                    </td>
                    <td className={cn(td, "text-ink-700")}>
                      {x.method}
                      <span className="block text-caption text-ink-500">
                        {x.conditions}
                        {x.device ? ` · ${x.device}` : ""}
                      </span>
                    </td>
                    {base && (
                      <td className={td}>
                        {b ? (
                          `${b.value} ${b.unit}`
                        ) : (
                          <span className="text-caption text-ink-500">
                            No comparable baseline (different method)
                          </span>
                        )}
                      </td>
                    )}
                    <td className={td}>
                      {x.author}
                      <span className="block text-caption text-ink-500">{dayOnly(x.date)}</span>
                    </td>
                  </tr>
                );
              })}
              {!a.measurements.length && (
                <tr>
                  <td colSpan={5} className="px-5 py-6 text-small text-ink-500">
                    No measurements recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </FCard>
        {a.canEdit && (
          <FCard
            icon={Plus}
            title="Add a measurement"
            footer={
              <Button
                variant="primary"
                onClick={async () => {
                  if (await post({ type: "measure", ...m }, "Measurement saved"))
                    setM({ ...m, parameter: "", value: "", conditions: "" });
                }}
              >
                Save measurement
              </Button>
            }
          >
            <div className="grid gap-3 sm:grid-cols-4">
              {(
                ["parameter", "value", "unit", "method", "side", "device", "conditions"] as const
              ).map((k) => (
                <Field key={k} label={k[0]!.toUpperCase() + k.slice(1)}>
                  <input
                    className={inputClass}
                    value={m[k]}
                    onChange={(e) => setM({ ...m, [k]: e.target.value })}
                  />
                </Field>
              ))}
              <label className="flex items-center gap-2 self-end pb-2 text-small text-ink-900">
                <input
                  type="checkbox"
                  checked={m.reported}
                  onChange={(e) => setM({ ...m, reported: e.target.checked })}
                />{" "}
                Reported, not measured
              </label>
            </div>
          </FCard>
        )}
      </div>
      <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
        <FCard
          icon={FlaskConical}
          title="Standardised scores"
          sub="Manual entry with instrument metadata; no automatic interpretation"
          flush
        >
          <ul className="divide-y divide-border">
            {a.scores.map((x) => {
              const b = base?.scores.find((y) => y.instrument === x.instrument);
              return (
                <li key={x.id} className="px-5 py-3 text-small">
                  <span className="font-semibold text-ink-900">
                    {x.instrument} {x.version}
                  </span>
                  <span className="block text-ink-900">{x.score}</span>
                  <span className="text-caption text-ink-500">
                    {x.domain} · {x.assessor}, {dayOnly(x.date)}
                    {b ? ` · baseline ${b.score} (same instrument)` : ""}
                  </span>
                </li>
              );
            })}
            {!a.scores.length && (
              <li className="px-5 py-6 text-small text-ink-500">No scores entered.</li>
            )}
          </ul>
          {a.canEdit && (
            <div className="flex flex-col gap-2 border-t border-border p-4">
              <Select
                aria-label="Instrument"
                value={s.instrument}
                onChange={(e) => setS({ ...s, instrument: e.target.value })}
              >
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.edition} ·{" "}
                    {i.licence === "Unknown" ? "restricted: licence unknown" : i.licence}
                  </option>
                ))}
              </Select>
              <p className="text-caption text-ink-500">
                {instruments.find((i) => i.id === s.instrument)?.note}
              </p>
              <input
                aria-label="Score"
                placeholder="Score as recorded"
                value={s.score}
                onChange={(e) => setS({ ...s, score: e.target.value })}
                className="h-9 rounded-control border border-border-strong px-2 text-small"
              />
              <input
                aria-label="Domain"
                placeholder="Scored domain"
                value={s.domain}
                onChange={(e) => setS({ ...s, domain: e.target.value })}
                className="h-9 rounded-control border border-border-strong px-2 text-small"
              />
              <Button
                size="sm"
                onClick={() =>
                  post(
                    { type: "score", ...s },
                    "Score saved",
                    "Stored with tool, version and assessor",
                  )
                }
              >
                Save score
              </Button>
            </div>
          )}
        </FCard>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ evidence */

function Evidence({ a, post }: { a: AssessDto; post: Post }) {
  const [v, setV] = useState(() => ({
    evidenceType: "PDF",
    caption: "",
    date: new Date().toISOString().slice(0, 10),
    sensitivity: "Standard",
    sharing: "Care team only",
    domain: "",
  }));
  const photoBlocked = a.photoConsent !== "Obtained";
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Camera}
        title="Evidence"
        sub={`Photo consent: ${a.photoConsent}`}
        className="xl:col-span-7"
        flush
      >
        <ul className="divide-y divide-border">
          {a.evidence.map((x) => (
            <li key={x.id} className="flex items-start gap-3 px-5 py-3 text-small">
              <FileText className="mt-0.5 size-4 text-ink-500" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">{x.caption}</span>
                <span className="text-caption text-ink-500">
                  {x.type} · {x.date} · {x.sensitivity} · {x.sharing} · {x.author}
                </span>
              </span>
            </li>
          ))}
          {!a.evidence.length && (
            <li className="px-5 py-6 text-small text-ink-500">No evidence attached.</li>
          )}
        </ul>
      </FCard>
      {a.canEdit && (
        <FCard
          icon={Plus}
          title="Add evidence"
          sub="Type, date, caption, sensitivity and sharing are required"
          className="xl:col-span-5"
          footer={
            <Button
              variant="primary"
              disabled={v.evidenceType === "Photo" && photoBlocked}
              onClick={() => post({ type: "evidence", ...v }, "Evidence added")}
            >
              Add evidence
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Type">
              <Select
                aria-label="Type"
                value={v.evidenceType}
                onChange={(e) => setV({ ...v, evidenceType: e.target.value })}
              >
                {opts(evidenceTypes)}
              </Select>
            </Field>
            {v.evidenceType === "Photo" && photoBlocked && (
              <p className="rounded-control bg-over-bg px-3 py-2 text-caption text-over">
                Photo capture is unavailable: photo consent is {a.photoConsent.toLowerCase()}.
              </p>
            )}
            <Field label="Caption">
              <input
                className={inputClass}
                value={v.caption}
                onChange={(e) => setV({ ...v, caption: e.target.value })}
              />
            </Field>
            <Field label="Date">
              <input
                type="date"
                className={inputClass}
                value={v.date}
                onChange={(e) => setV({ ...v, date: e.target.value })}
              />
            </Field>
            <Field label="Sensitivity">
              <Select
                aria-label="Sensitivity"
                value={v.sensitivity}
                onChange={(e) => setV({ ...v, sensitivity: e.target.value })}
              >
                {opts(sensitivities)}
              </Select>
            </Field>
            <Field label="Sharing scope">
              <Select
                aria-label="Sharing"
                value={v.sharing}
                onChange={(e) => setV({ ...v, sharing: e.target.value })}
              >
                {opts(["Care team only", "Shareable with consent", "Not shareable"])}
              </Select>
            </Field>
          </div>
        </FCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ visits */

function Visits({ a, post }: { a: AssessDto; post: Post }) {
  const [v, setV] = useState({ location: a.mode, summary: "", paused: "", outstanding: "" });
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={MapPin}
        title="Visits"
        sub="Each visit keeps its own author and date"
        className="xl:col-span-7"
      >
        <ol className="relative ml-3 border-l border-border-strong">
          {a.visits.map((x, i) => (
            <li key={x.id} className="relative mb-5 pl-6">
              <span
                className={cn(
                  "absolute top-1.5 -left-[5px] size-2.5 rounded-full",
                  x.paused ? "bg-watch-dot" : "bg-accent-fill",
                )}
                aria-hidden="true"
              />
              <p className="text-small font-semibold text-ink-900">
                Visit {i + 1} · {x.location} · {when(x.date)}
              </p>
              <p className="text-caption text-ink-500">{x.author}</p>
              {x.summary && <p className="mt-1 text-small text-ink-700">{x.summary}</p>}
              {x.paused && (
                <p className="mt-1 text-caption font-semibold text-watch">Paused: {x.paused}</p>
              )}
              {x.outstanding.length > 0 && (
                <p className="text-caption text-ink-500">
                  Outstanding: {x.outstanding.join(", ")} · continuation booking task raised
                </p>
              )}
            </li>
          ))}
          {!a.visits.length && (
            <li className="pl-6 text-small text-ink-500">No visits recorded yet.</li>
          )}
        </ol>
      </FCard>
      {a.canEdit && (
        <FCard
          icon={Plus}
          title="Record this visit"
          sub="Pause with a reason; outstanding sections create a booking task"
          className="xl:col-span-5"
          footer={
            <Button
              variant="primary"
              onClick={() =>
                post(
                  {
                    type: "visit",
                    location: v.location,
                    summary: v.summary,
                    paused: v.paused,
                    outstanding: v.outstanding
                      .split(",")
                      .map((s) => s.trim())
                      .filter(Boolean),
                  },
                  v.paused ? "Visit saved and paused" : "Visit recorded",
                )
              }
            >
              Save visit
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Location">
              <Select
                aria-label="Location"
                value={v.location}
                onChange={(e) => setV({ ...v, location: e.target.value })}
              >
                {opts(modes)}
              </Select>
            </Field>
            <Field label="What happened">
              <textarea
                className={textArea}
                value={v.summary}
                onChange={(e) => setV({ ...v, summary: e.target.value })}
              />
            </Field>
            <Field
              label="Pause reason (optional)"
              hint="Fatigue, refusal, safety, time or technical issue"
            >
              <input
                className={inputClass}
                value={v.paused}
                onChange={(e) => setV({ ...v, paused: e.target.value })}
              />
            </Field>
            <Field label="Outstanding sections (comma separated)">
              <input
                className={inputClass}
                value={v.outstanding}
                onChange={(e) => setV({ ...v, outstanding: e.target.value })}
              />
            </Field>
          </div>
        </FCard>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ review */

function Review({ a, post, go }: { a: AssessDto; post: Post; go: (t: T) => void }) {
  const suggested = a.observations.filter((o) => o.aiSuggested && !o.accepted);
  const observed = a.observations.filter((o) => o.source === "Direct observation").length;
  const reported = a.observations.length - observed;
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={ShieldAlert}
        title="Completeness"
        sub="Rules check required sections, consent, safety and sign-off"
        className="xl:col-span-7"
        action={<RuleMark>Check</RuleMark>}
      >
        {a.blockers.length ? (
          <ul className="flex flex-col gap-2">
            {a.blockers.map((b) => (
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
            <CheckCircle2 className="size-4" aria-hidden="true" /> Ready to sign.
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => go("capture")}>
            Go to workspace
          </Button>
          <Button size="sm" variant="ghost" onClick={() => go("report")}>
            Go to report
          </Button>
        </div>
      </FCard>
      <div className="flex flex-col gap-6 xl:col-span-5 [&>*:last-child]:flex-1">
        <FCard icon={Users} title="Sources" sub="Observed and reported findings stay labelled">
          <dl className="grid grid-cols-2 gap-4 text-small">
            <div>
              <dt className="text-caption text-ink-500">Directly observed</dt>
              <dd className="type-display text-h2 text-ink-900">{observed}</dd>
            </div>
            <div>
              <dt className="text-caption text-ink-500">Reported or documented</dt>
              <dd className="type-display text-h2 text-ink-900">{reported}</dd>
            </div>
          </dl>
        </FCard>
        {suggested.length > 0 && (
          <AiDraft
            label="AI-suggested observations"
            suggestionsOnly
            meta="Not in the assessment until accepted"
          >
            <ul className="flex flex-col gap-2">
              {suggested.map((o) => (
                <li key={o.id} className="flex items-center gap-2 text-small">
                  <span className="min-w-0 flex-1">
                    {o.item}: {o.notes}
                  </span>
                  {a.canEdit && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => post({ type: "accept-observation", id: o.id }, "Accepted")}
                      >
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => post({ type: "discard-observation", id: o.id }, "Discarded")}
                      >
                        Discard
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </AiDraft>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ report */

function Report({ a, post }: { a: AssessDto; post: Post }) {
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState(a.report?.text ?? "");
  const label = useAiText();
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
        {busy ? (
          <AiDraft label="Drafting the report" suggestionsOnly generating />
        ) : a.report ? (
          <AiDraft
            label={
              a.report.reviewedBy
                ? `Reviewed by ${a.report.reviewedBy}`
                : "AI draft · needs your review"
            }
            suggestionsOnly={!a.report.reviewedBy}
            meta={when(a.report.at)}
          >
            {a.report.sections.map((s, i) => (
              <section key={i} className="mb-3">
                <h3 className="text-small font-semibold text-ink-900">{s.heading}</h3>
                <p className="text-small text-ink-900">{s.body}</p>
                <p className="mt-1 flex flex-wrap gap-1">
                  {s.cites.map((c) => (
                    <span
                      key={c}
                      className="rounded-tag bg-accent-tint px-1.5 font-mono text-label text-accent"
                    >
                      {c}
                    </span>
                  ))}
                </p>
              </section>
            ))}
            {a.report.aiDisclosure && (
              <p className="mt-2 text-caption text-ink-500">
                AI assisted with drafting; the clinician reviewed and owns the final text.
              </p>
            )}
          </AiDraft>
        ) : (
          <div
            data-ai-only
            className="rounded-card border border-dashed border-border-strong px-6 py-10 text-center"
          >
            <p className="text-small text-ink-700">
              No report draft yet. AI drafts from documented findings only, cites each one and never
              adds unobserved facts.
            </p>
          </div>
        )}
        {a.canEdit && (
          <FCard
            icon={FileText}
            title="Clinician-controlled final narrative"
            footer={
              <>
                <Button
                  variant="primary"
                  disabled={text.length < 20}
                  onClick={() =>
                    post(
                      { type: "review-report", text },
                      "Report reviewed",
                      "Your edit is the final narrative",
                    )
                  }
                >
                  Mark reviewed
                </Button>
                <Button
                  data-ai-only
                  variant="soft"
                  loading={busy}
                  onClick={async () => {
                    setBusy(true);
                    await post({ type: "ai-report" }, "Draft ready", "Check every citation");
                    setBusy(false);
                  }}
                >
                  {a.report ? "Redraft with AI" : "Draft with AI"}
                </Button>
              </>
            }
          >
            <textarea
              className={cn(textArea, "min-h-56")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={label(
                "The AI draft appears above; write or paste your final narrative here.",
                "Write or paste your final narrative here.",
              )}
            />
          </FCard>
        )}
      </div>
      <FCard
        icon={ClipboardList}
        title="Sources the report may cite"
        className="xl:col-span-4"
        flush
      >
        <ul className="max-h-[520px] divide-y divide-border overflow-y-auto">
          {a.observations
            .filter((o) => o.accepted)
            .map((o, i) => (
              <li key={o.id} className="px-5 py-2 text-caption">
                <span className="font-mono text-accent">O{i + 1}</span> {o.item} · {o.source}
              </li>
            ))}
          {a.measurements.map((m, i) => (
            <li key={m.id} className="px-5 py-2 text-caption">
              <span className="font-mono text-accent">M{i + 1}</span> {m.parameter} {m.value}{" "}
              {m.unit}
            </li>
          ))}
          {a.scores.map((s, i) => (
            <li key={s.id} className="px-5 py-2 text-caption">
              <span className="font-mono text-accent">S{i + 1}</span> {s.instrument} {s.score}
            </li>
          ))}
        </ul>
      </FCard>
    </div>
  );
}

/* ------------------------------------------------------------------ approval and sharing */

function Approval({ a, post }: { a: AssessDto; post: Post }) {
  const [outcome, setOutcome] = useState<string>(a.outcome || "Report only");
  const [note, setNote] = useState(a.outcomeNote);
  const [rel, setRel] = useState<{ state: string; recipients: string[] }>({
    state: a.release.state === "Not released" ? "Shared" : a.release.state,
    recipients: a.release.recipients,
  });
  const [amend, setAmend] = useState<null | { reason: string; text: string }>(null);
  const [cancel, setCancel] = useState("");
  const [coNote, setCoNote] = useState("");
  const signed = Boolean(a.signed);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-7 [&>*:last-child]:flex-1">
        <FCard
          icon={ClipboardList}
          title="Outcome"
          sub="Assessment only never creates treatment on its own"
        >
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Outcome">
            {outcomes.map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={outcome === o}
                disabled={!a.canEdit}
                onClick={() => setOutcome(o)}
                className={cn(
                  "h-8 cursor-pointer rounded-control border px-3 text-caption font-semibold",
                  outcome === o
                    ? "border-accent bg-accent-tint text-accent"
                    : "border-border-strong text-ink-700",
                )}
              >
                {o}
              </button>
            ))}
          </div>
          <textarea
            className={cn(textArea, "mt-3")}
            disabled={!a.canEdit}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Rationale and next step"
          />
          {a.canEdit && (
            <Button
              className="mt-3"
              size="sm"
              onClick={() => post({ type: "outcome", outcome, note }, "Outcome saved")}
            >
              Save outcome
            </Button>
          )}
          <p className="mt-3 text-caption text-ink-500">
            Treatment recommendation proposes a draft plan for approval · Further assessment books a
            continuation · Referral onward opens a care-coordination task.
          </p>
        </FCard>
        <FCard icon={FileSignature} title="Sign-off">
          {signed && a.signed ? (
            <div className="flex flex-col gap-3">
              <Signature name={a.signed.by} when={when(a.signed.at)} />
              {a.coSign.required &&
                (a.coSign.by ? (
                  <Signature name={a.coSign.by} when={when(a.coSign.at ?? "")} label="Co-signed" />
                ) : (
                  <p className="rounded-control bg-watch-bg px-3 py-2 text-caption text-watch">
                    Waiting for the Clinical Lead&apos;s co-signature.
                  </p>
                ))}
              {a.canCoSign && (
                <div className="flex gap-2">
                  <input
                    aria-label="Co-sign note"
                    placeholder="Review note"
                    value={coNote}
                    onChange={(e) => setCoNote(e.target.value)}
                    className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => post({ type: "co-sign", note: coNote }, "Co-signed")}
                  >
                    Co-sign
                  </Button>
                </div>
              )}
              {a.amendments.map((m, i) => (
                <div key={i} className="border-l-2 border-watch-dot pl-3 text-small">
                  <p className="text-caption font-semibold text-ink-700">
                    Addendum · {m.by}, {when(m.at)} · {m.reason}
                  </p>
                  <p>{m.text}</p>
                </div>
              ))}
              {a.view === "clinical" && a.status !== "Cancelled" && a.clinician && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setAmend({ reason: "", text: "" })}
                >
                  Add addendum
                </Button>
              )}
            </div>
          ) : a.canEdit ? (
            <div className="flex flex-col gap-3">
              {a.blockers.length > 0 && (
                <p className="rounded-control border border-watch bg-watch-bg px-3 py-2 text-caption text-ink-900">
                  Blocked: {a.blockers[0]}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  disabled={a.blockers.length > 0}
                  onClick={() =>
                    post(
                      { type: "sign" },
                      "Signed and locked",
                      a.coSign.required ? "Sent for Clinical Lead co-signature" : undefined,
                    )
                  }
                >
                  Sign assessment
                </Button>
                {a.status !== "Pending Signature" && (
                  <Button
                    disabled={a.blockers.length > 0}
                    onClick={() => post({ type: "submit" }, "Ready for signature")}
                  >
                    Mark ready for signature
                  </Button>
                )}
              </div>
              <div className="flex gap-2 border-t border-border pt-3">
                <input
                  aria-label="Cancel reason"
                  placeholder="Reason to cancel"
                  value={cancel}
                  onChange={(e) => setCancel(e.target.value)}
                  className="h-9 flex-1 rounded-control border border-border-strong px-2 text-small"
                />
                <Button
                  size="sm"
                  variant="danger"
                  disabled={cancel.length < 5}
                  onClick={() =>
                    post(
                      { type: "cancel", reason: cancel },
                      "Cancelled",
                      "Audit kept; no completed-service billing",
                    )
                  }
                >
                  Cancel assessment
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-small text-ink-500">Not signed yet.</p>
          )}
        </FCard>
      </div>
      <FCard
        icon={Users}
        title="Release"
        sub="Only authorised recipients; the participant app shows only what's released"
        className="xl:col-span-5"
      >
        <p className="text-small text-ink-900">
          Current: <strong>{a.release.state}</strong>
          {a.release.recipients.length ? ` · ${a.release.recipients.join(", ")}` : ""}
        </p>
        {signed && a.view === "clinical" && (
          <div className="mt-3 flex flex-col gap-2">
            <Select
              aria-label="Release decision"
              value={rel.state}
              onChange={(e) => setRel({ ...rel, state: e.target.value })}
            >
              {opts(releaseStates.filter((s) => s !== "Not released"))}
            </Select>
            {rel.state === "Shared" && (
              <fieldset className="flex flex-col gap-1">
                <legend className="text-caption font-semibold text-ink-700">Recipients</legend>
                {["Participant", ...a.contacts].map((c) => (
                  <label key={c} className="flex items-center gap-2 text-small">
                    <input
                      type="checkbox"
                      checked={rel.recipients.includes(c)}
                      onChange={(e) =>
                        setRel({
                          ...rel,
                          recipients: e.target.checked
                            ? [...rel.recipients, c]
                            : rel.recipients.filter((x) => x !== c),
                        })
                      }
                    />
                    {c}
                  </label>
                ))}
              </fieldset>
            )}
            <Button
              size="sm"
              variant="primary"
              onClick={() =>
                post(
                  {
                    type: "release",
                    state: rel.state,
                    recipients: rel.state === "Shared" ? rel.recipients : [],
                    scope: ["Summary", "Recommendations"],
                  },
                  `Report ${rel.state.toLowerCase()}`,
                )
              }
            >
              Save release decision
            </Button>
          </div>
        )}
      </FCard>
      {amend && (
        <Sheet
          title="Add addendum"
          onClose={() => setAmend(null)}
          footer={
            <Button
              variant="primary"
              onClick={async () => {
                if (
                  await post(
                    { type: "amend", ...amend },
                    "Addendum added",
                    "The signed original is unchanged",
                  )
                )
                  setAmend(null);
              }}
            >
              Save addendum
            </Button>
          }
        >
          <div className="flex flex-col gap-3">
            <Field label="Reason">
              <input
                className={inputClass}
                value={amend.reason}
                onChange={(e) => setAmend({ ...amend, reason: e.target.value })}
              />
            </Field>
            <Field label="Addendum">
              <textarea
                className={textArea}
                value={amend.text}
                onChange={(e) => setAmend({ ...amend, text: e.target.value })}
              />
            </Field>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function HistoryTab({ a }: { a: AssessDto }) {
  return (
    <FCard
      icon={History}
      title="History"
      sub="Every clinically material change: who, when and why"
      flush
    >
      <ol className="max-h-[620px] divide-y divide-border overflow-y-auto">
        {a.history.map((h, i) => (
          <li key={i} className="px-5 py-3">
            <p className="text-small text-ink-900">{h.action}</p>
            <p className="text-caption text-ink-500">
              {h.by} · {when(h.at)}
              {h.reason ? ` · ${h.reason}` : ""}
            </p>
          </li>
        ))}
        {!a.history.length && (
          <li className="px-5 py-6 text-small text-ink-500">No changes recorded yet.</li>
        )}
      </ol>
    </FCard>
  );
}
