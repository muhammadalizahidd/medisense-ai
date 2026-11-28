"use client";

import { useAiEnabled } from "@/components/ai/ai-switch";
import {
  ArrowLeft,
  Check,
  FileSignature,
  FileText,
  History,
  Lock,
  Send,
  ShieldAlert,
  UserCheck,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
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
import { recipients, reportTone, type ReportFull } from "@/lib/live/progress";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { FCard } from "./funding-bits";
import { dayOnly, ops, textArea, when } from "./ops-bits";

const tabs = [
  { id: "compose", label: "Compose" },
  { id: "sign", label: "Checks & sign" },
  { id: "release", label: "Release" },
  { id: "history", label: "Versions & history" },
] as const;
type T = (typeof tabs)[number]["id"];
type Post = (body: unknown, ok: string, detail?: string) => Promise<boolean>;
const flow = ["Requested", "Draft", "Signed", "Released"];

/** "24 Aug 2026": report periods carry the year. */
const auPeriod = (iso: string) =>
  /^\d{4}-\d{2}-\d{2}/.test(iso)
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`))
    : iso;

export function ReportComposer({
  id,
  base,
}: {
  id: string;
  base: "/therapist/progress" | "/care/progress";
}) {
  const url = `/api/care/clinical-reports/${id}`;
  const { data, error, loading, reload } = useResource<{ report: ReportFull }>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const router = useRouter();
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[760px]" />;
  const r = data.report;
  const post: Post = async (body, ok, detail) => {
    const res = await ops<{ id?: string }>(url, body, ok, detail);
    if (res?.id && res.id !== id) router.push(`${base}/reports/${res.id}`);
    else if (res) reload();
    return Boolean(res);
  };
  const step =
    r.status === "Released"
      ? 3
      : ["Signed", "In Review"].includes(r.status)
        ? 2
        : r.status === "Requested"
          ? 0
          : 1;
  const visible =
    r.view === "status" ? tabs.filter((t) => t.id === "history" || t.id === "release") : tabs;
  const current = visible.some((t) => t.id === tab) ? tab : (visible[0]?.id ?? "history");
  const k = `${r.status}-${r.sections.map((s) => s.state).join("")}-${r.gaps.filter((g) => g.resolved).length}`;
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        leading={
          <ButtonLink size="sm" variant="ghost" href={`${base}/${encodeURIComponent(r.episodeId)}`}>
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Course of care
          </ButtonLink>
        }
        title={r.type}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">
              {r.ref} · v{r.version}
            </span>
            <Tag tone={reportTone[r.status]}>{r.status}</Tag>
            {r.restricted && (
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
          <p className="mt-1 type-display text-h2 text-ink-900">{r.participant}</p>
          <p className="font-mono text-caption text-ink-500">{r.participantId}</p>
          <p className="mt-2 text-small text-ink-700">
            {r.discipline} · {r.author}
          </p>
          <p className="text-small text-ink-700">
            {r.purpose} · {auPeriod(r.periodStart)} to {auPeriod(r.periodEnd)} · due{" "}
            {dayOnly(r.dueAt)}
          </p>
        </div>
        <div className="flex flex-col justify-center gap-4 p-6 xl:col-span-8">
          <Stepper steps={flow} current={step} />
          <div className="flex flex-wrap gap-2">
            <Tag tone="outline">Requested by {r.requestedBy}</Tag>
            {r.coSign.required && (
              <Tag tone={r.coSign.status === "Approved" ? "healthy" : "watch"}>
                Co-sign: {r.coSign.status}
              </Tag>
            )}
            {r.gaps.filter((g) => !g.resolved).length > 0 && (
              <Tag tone="watch">
                {r.gaps.filter((g) => !g.resolved).length}{" "}
                {r.gaps.filter((g) => !g.resolved).length === 1 ? "data check" : "data checks"} open
              </Tag>
            )}
            <Tag tone="outline">{r.releases.length} release(s)</Tag>
          </div>
        </div>
      </section>
      {r.view === "status" && (
        <p className="flex items-center gap-2 rounded-card border border-border bg-sunken px-4 py-3 text-small text-ink-700">
          <Lock className="size-4 text-ink-500" aria-hidden="true" /> Status view: due date, status
          and releases. Report content isn&apos;t shown to your role.
        </p>
      )}
      <div className="mt-2">
        <Tabs
          label="Report"
          tabs={visible.map((t) => ({
            ...t,
            count:
              t.id === "sign" ? r.gaps.filter((g) => !g.resolved).length || undefined : undefined,
          }))}
          value={current}
          onChange={(t: T) => setTab(t)}
        />
      </div>
      <TabPanel id="compose" value={current}>
        <Compose key={k} r={r} post={post} go={setTab} />
      </TabPanel>
      <TabPanel id="sign" value={current}>
        <Sign key={k} r={r} post={post} />
      </TabPanel>
      <TabPanel id="release" value={current}>
        <Release key={k} r={r} post={post} />
      </TabPanel>
      <TabPanel id="history" value={current}>
        <div className="grid items-stretch gap-6 xl:grid-cols-12">
          <FCard
            icon={FileText}
            title="Versions"
            sub="Every signed version is kept"
            className="xl:col-span-4"
            flush
          >
            <ul className="divide-y divide-border">
              {r.versions.map((v) => (
                <li key={v.id}>
                  <a
                    href={`${base}/reports/${v.id}`}
                    className={cn(
                      "flex items-center gap-3 px-5 py-3 hover:bg-canvas hover:no-underline",
                      v.id === r.id && "bg-accent-tint",
                    )}
                  >
                    <span className="font-mono text-small text-ink-900">v{v.version}</span>
                    <Tag tone={reportTone[v.status as keyof typeof reportTone] ?? "outline"}>
                      {v.status}
                    </Tag>
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
            title="Audit"
            sub="Views, edits, signatures and releases"
            className="xl:col-span-8"
            flush
          >
            <ol className="max-h-[560px] divide-y divide-border overflow-y-auto">
              {r.timeline.map((h, i) => (
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
        </div>
      </TabPanel>
    </>
  );
}

function SectionEditor({
  s,
  r,
  post,
}: {
  s: ReportFull["sections"][number];
  r: ReportFull;
  post: Post;
}) {
  const [text, setText] = useState(s.text);
  const ai = s.origin === "ai";
  const pending = ai && s.state === "pending";
  return (
    <div
      className={cn(
        "rounded-card border p-4",
        pending ? "border-dashed surface-draft" : "border-border bg-surface",
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-small font-semibold text-ink-900">{s.title}</span>
        {ai && (
          <Tag tone={pending ? "watch" : "outline"}>
            {pending ? "AI draft · not clinically verified" : `AI · ${s.state}`}
          </Tag>
        )}
        {s.cites.length > 0 && (
          <span className="ml-auto font-mono text-caption text-ink-500">{s.cites.join(" ")}</span>
        )}
      </div>
      <textarea
        aria-label={s.title}
        disabled={!r.canEdit}
        className={cn(textArea, "min-h-24")}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {r.canEdit && (
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={pending ? "primary" : "secondary"}
            disabled={!pending && text === s.text && ai}
            onClick={() =>
              post(
                {
                  type: "section",
                  key: s.key,
                  text,
                  state: ai ? (text !== s.text ? "edited" : "accepted") : "clinician",
                  reason: "",
                },
                ai ? (text !== s.text ? "Edited" : "Accepted") : "Saved",
              )
            }
          >
            <Check className="size-3.5" aria-hidden="true" />{" "}
            {!ai ? "Save" : text !== s.text ? "Save edit" : pending ? "Accept" : "Reviewed"}
          </Button>
          {ai && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                post(
                  {
                    type: "section",
                    key: s.key,
                    text: "",
                    state: "rejected",
                    reason: "Not supported by the evidence",
                  },
                  "Rejected",
                )
              }
            >
              <X className="size-3.5" aria-hidden="true" /> Reject
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Compose({ r, post, go }: { r: ReportFull; post: Post; go: (t: T) => void }) {
  const [busy, setBusy] = useState(false);
  const pending = r.sections.filter((s) => s.origin === "ai" && s.state === "pending").length;
  const ai = useAiEnabled();
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={FileText}
        title="Evidence"
        sub="Verified outcomes, signed notes and reassessments only; drafts are excluded"
        className="xl:col-span-4"
        flush
      >
        <ul className="max-h-[760px] divide-y divide-border overflow-y-auto">
          {r.evidence.map((e, i) => (
            <li key={e.id} className="px-4 py-2.5 text-small">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-caption text-ink-500">E{i + 1}</span>
                <span className="font-semibold text-ink-900">{e.label}</span>
                <Tag tone="outline">{e.kind}</Tag>
              </span>
              <span className="mt-0.5 block text-caption text-ink-700">{e.text}</span>
              <span className="text-caption text-ink-500">{dayOnly(e.date)}</span>
            </li>
          ))}
          {!r.evidence.length && (
            <li className="px-4 py-8 text-center text-small text-ink-500">
              No verified evidence in this period.
            </li>
          )}
        </ul>
      </FCard>
      <div className="flex flex-col gap-4 xl:col-span-8">
        {!ai && r.canEdit && r.sections.some((s) => s.text) && !pending && (
          <Button size="sm" variant="primary" className="w-fit" onClick={() => go("sign")}>
            Continue to checks and sign
          </Button>
        )}
        {busy ? (
          <AiDraft label="Drafting from verified evidence" suggestionsOnly generating />
        ) : (
          <AiDraft
            label="AI report draft"
            suggestionsOnly
            meta={`${r.evidence.length} verified source(s)`}
          >
            <p className="text-small text-ink-700">
              Every quantified statement cites its evidence. Measured changes are described
              neutrally; clinical significance is yours to judge. Missing data is said, never filled
              in.
            </p>
            {r.canEdit && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="soft"
                  disabled={!r.evidence.length}
                  onClick={async () => {
                    setBusy(true);
                    await post({ type: "generate" }, "Draft generated", "Review every section");
                    setBusy(false);
                  }}
                >
                  {r.sections.some((s) => s.origin === "ai") ? "Draft again" : "Draft with AI"}
                </Button>
                {!pending && r.sections.some((s) => s.text) && (
                  <Button size="sm" variant="primary" onClick={() => go("sign")}>
                    Continue to checks and sign
                  </Button>
                )}
              </div>
            )}
          </AiDraft>
        )}
        {r.sections.map((s) => (
          <SectionEditor key={`${s.key}-${s.state}-${s.text.length}`} s={s} r={r} post={post} />
        ))}
      </div>
    </div>
  );
}

function Sign({ r, post }: { r: ReportFull; post: Post }) {
  const [res, setRes] = useState<Record<string, string>>({});
  const [lim, setLim] = useState(r.limitations);
  const [confirm, setConfirm] = useState(false);
  const [note, setNote] = useState("");
  const open = r.gaps.filter((g) => !g.resolved);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex flex-col gap-6 xl:col-span-7 [&>*:last-child]:flex-1">
        <FCard
          icon={ShieldAlert}
          title="Data-quality checks"
          sub="Missing baselines, old measures, absent units, excluded drafts and unsupported numbers"
          action={<RuleMark>Check</RuleMark>}
          flush
        >
          <ul className="divide-y divide-border">
            {r.gaps.map((g) => (
              <li key={g.id} className="px-5 py-3">
                <div className="flex items-start gap-2">
                  <Tag tone={g.resolved ? "healthy" : "watch"}>
                    {g.resolved ? "Resolved" : "Check"}
                  </Tag>
                  <span className="min-w-0 flex-1 text-small text-ink-900">{g.text}</span>
                </div>
                {g.resolved ? (
                  <p className="mt-1 text-caption text-ink-500">{g.resolution}</p>
                ) : (
                  r.canEdit && (
                    <div className="mt-2 flex gap-2">
                      <input
                        aria-label="Resolution"
                        placeholder="Your action or documented override"
                        className={inputClass}
                        value={res[g.id] ?? ""}
                        onChange={(e) => setRes({ ...res, [g.id]: e.target.value })}
                      />
                      <Button
                        size="sm"
                        disabled={(res[g.id] ?? "").length < 3}
                        onClick={() =>
                          post(
                            { type: "resolve", id: g.id, resolution: res[g.id] ?? "" },
                            "Resolved",
                          )
                        }
                      >
                        Resolve
                      </Button>
                    </div>
                  )
                )}
              </li>
            ))}
            {!r.gaps.length && (
              <li className="px-5 py-8 text-center text-small text-healthy">
                No data-quality issues.
              </li>
            )}
          </ul>
        </FCard>
        <FCard
          icon={FileText}
          title="Limitations"
          sub="Required for major unassessed domains or incomplete data"
          footer={
            r.canEdit && (
              <Button
                size="sm"
                onClick={() => post({ type: "limitations", text: lim }, "Limitations saved")}
              >
                Save limitations
              </Button>
            )
          }
        >
          <textarea
            aria-label="Limitations"
            disabled={!r.canEdit}
            className={cn(textArea, "min-h-24")}
            value={lim}
            onChange={(e) => setLim(e.target.value)}
          />
        </FCard>
      </div>
      {r.canCoSign ? (
        <FCard
          icon={UserCheck}
          title="Clinical Lead review"
          sub="Approve to co-sign, or return it with a reason"
          className="xl:col-span-5"
          action={<RuleMark>Policy</RuleMark>}
        >
          <textarea
            aria-label="Feedback"
            placeholder="Feedback for the author"
            className={textArea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="primary"
              onClick={() => post({ type: "co-sign", decision: "Approve", note }, "Co-signed")}
            >
              Approve and co-sign
            </Button>
            <Button
              variant="ghost"
              onClick={() =>
                post(
                  { type: "co-sign", decision: "Request changes", note },
                  "Changes requested",
                  "The author has a task",
                )
              }
            >
              Request changes
            </Button>
          </div>
        </FCard>
      ) : (
        <FCard
          icon={FileSignature}
          title="Review and sign"
          sub={r.coSign.required ? "Then a Clinical Lead co-signs" : "Signing locks this version"}
          className="xl:col-span-5"
          footer={
            r.canEdit && (
              <Button
                variant="primary"
                disabled={!confirm || open.length > 0}
                onClick={() =>
                  post(
                    { type: "sign", confirm },
                    r.coSign.required ? "Signed; sent for co-signature" : "Signed",
                  )
                }
              >
                <FileSignature className="size-4" aria-hidden="true" /> Sign report
              </Button>
            )
          }
        >
          {r.signed ? (
            <div className="flex flex-col gap-3">
              <Signature name={r.signed.by} when={when(r.signed.at)} label="Signed" />
              {r.coSign.required && (
                <p className="text-small text-ink-700">
                  Co-sign: {r.coSign.status}
                  {r.coSign.by ? ` by ${r.coSign.by}` : ""}
                  {r.coSign.note ? ` · ${r.coSign.note}` : ""}
                </p>
              )}
              {r.view === "edit" && ["Signed", "Released"].includes(r.status) && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    post(
                      { type: "amend", reason: "Correction after review" },
                      "New version started",
                      "The signed version stays available",
                    )
                  }
                >
                  Amend as a new version
                </Button>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-small">
              <ul className="flex flex-col gap-1.5 text-ink-700">
                <li>Identity, dates, course of care and purpose are correct.</li>
                <li>Quoted values match their sources; nothing is unsupported.</li>
                <li>Interpretation is mine as the treating clinician.</li>
                <li>Limitations, risks and disclosures are documented.</li>
              </ul>
              {r.canEdit && (
                <label
                  className={cn(
                    "flex items-start gap-2.5 rounded-control border p-3",
                    confirm ? "border-healthy bg-healthy-bg" : "border-border-strong",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={confirm}
                    onChange={(e) => setConfirm(e.target.checked)}
                  />
                  <span>
                    <strong>I reviewed this report against the checklist.</strong>
                  </span>
                </label>
              )}
              {open.length > 0 && (
                <p className="text-over">Resolve {open.length} data check(s) first.</p>
              )}
              {r.sections.some((s) => s.origin === "ai" && s.state === "pending") && (
                <p className="text-over">Review every AI section in Compose first.</p>
              )}
            </div>
          )}
        </FCard>
      )}
    </div>
  );
}

function Release({ r, post }: { r: ReportFull; post: Post }) {
  const [v, setV] = useState({
    recipient: "Participant",
    name: r.participant,
    authorityVerified: false,
    consentVerified: false,
    channel: "Patient app",
  });
  const can = r.view === "edit" && ["Signed", "Released"].includes(r.status);
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Send}
        title="Release to an authorised recipient"
        sub="Only the signed version is released; recordings are never attached"
        className="xl:col-span-6"
        footer={
          can && (
            <Button
              variant="primary"
              onClick={() =>
                post(
                  { type: "release", ...v },
                  "Released",
                  "Logged with recipient, version and channel",
                )
              }
            >
              Release report
            </Button>
          )
        }
      >
        {can ? (
          <div className="flex flex-col gap-3">
            <Field label="Recipient">
              <Select
                aria-label="Recipient"
                value={v.recipient}
                onChange={(e) => setV({ ...v, recipient: e.target.value })}
              >
                {recipients.map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <Field label="Name">
              <input
                className={inputClass}
                value={v.name}
                onChange={(e) => setV({ ...v, name: e.target.value })}
              />
            </Field>
            <Field label="Channel">
              <Select
                aria-label="Channel"
                value={v.channel}
                onChange={(e) => setV({ ...v, channel: e.target.value })}
              >
                {["Patient app", "Secure link", "Secure email"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </Select>
            </Field>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={v.authorityVerified}
                onChange={(e) => setV({ ...v, authorityVerified: e.target.checked })}
              />{" "}
              Authority verified (scope and expiry)
            </label>
            <label className="flex items-center gap-2 text-small">
              <input
                type="checkbox"
                checked={v.consentVerified}
                onChange={(e) => setV({ ...v, consentVerified: e.target.checked })}
              />{" "}
              Consent for this release verified
            </label>
          </div>
        ) : (
          <p className="text-small text-ink-500">
            {["Signed", "Released"].includes(r.status)
              ? "The treating clinician releases this report."
              : "Available once the report is signed."}
          </p>
        )}
      </FCard>
      <FCard
        icon={History}
        title="Release log"
        sub="Recipient, version, channel and date"
        className="xl:col-span-6"
        flush
      >
        <ul className="divide-y divide-border">
          {r.releases.map((x, i) => (
            <li key={i} className="flex items-center gap-3 px-5 py-3 text-small">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink-900">
                  {x.recipient} · {x.name}
                </span>
                <span className="text-caption text-ink-500">
                  v{x.version} · {x.channel} · {when(x.at)}
                </span>
              </span>
              <Tag tone="healthy">Released</Tag>
            </li>
          ))}
          {!r.releases.length && (
            <li className="px-5 py-8 text-center text-small text-ink-500">Not released.</li>
          )}
        </ul>
      </FCard>
    </div>
  );
}
