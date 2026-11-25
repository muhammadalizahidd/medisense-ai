"use client";

import {
  ArrowLeft,
  CalendarRange,
  Check,
  CircleAlert,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileCheck2,
  FilePlus2,
  FileText,
  History,
  Landmark,
  Mail,
  Pencil,
  Plus,
  ShieldCheck,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { AiChip, AiIcon, RuleMark } from "@/components/ai/provenance";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource } from "@/lib/live/client";
import {
  agencyChecklist,
  aud,
  eligibilityStates,
  evidenceCategories,
  geographies,
  infoSources,
  managementTypes,
  maskNdis,
  referralPlanTypes,
  type BudgetDto,
  type EvidenceDto,
  type FieldCheckDto,
  type FundingWorkspaceDto,
  type GateDto,
  type PlanDto,
  type ReadinessDto,
} from "@/lib/live/funding";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";
import { AlertsTab, PayerSheet } from "./funding-overview";
import {
  agreementTone,
  bookingTone,
  Caveat,
  dayLabel,
  eligibilityTone,
  evidenceTone,
  Fact,
  FCard,
  fieldTone,
  ManagementChip,
  payerTone,
  relativeDays,
  td,
  th,
} from "./funding-bits";

type Data = { workspace: FundingWorkspaceDto };

const isDay = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const tabs = [
  { id: "plans", label: "Plans and evidence" },
  { id: "budgets", label: "Budgets and payers" },
  { id: "agreements", label: "Service agreements" },
  { id: "readiness", label: "Booking readiness" },
  { id: "history", label: "Alerts and history" },
] as const;
type TabId = (typeof tabs)[number]["id"];

async function post(url: string, body: unknown, ok: string, detail?: string) {
  try {
    const res = await api<Record<string, unknown>>(url, { body });
    toast(ok, { tone: "success", detail });
    return res;
  } catch (e) {
    toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

/** Module 06: one participant's funding: plans, budgets, agreements, readiness and history. */
export function FundingWorkspace({ clientId }: { clientId: string }) {
  const url = `/api/care/funding/${clientId}`;
  const { data, error, loading, reload } = useResource<Data>(url, (e) => e.type === "care");
  const [tab, setTab] = useTab(tabs);
  const [planId, setPlanId] = useState<string | null>(null);
  const router = useRouter();
  const w = data?.workspace;

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !w) return <Skeleton className="h-[640px]" />;

  const plan = w.plans.find((p) => p.id === planId) ?? w.plans[0] ?? null;
  const openAlerts = w.alerts.filter((a) => !a.acknowledged).length;
  const tabList = tabs.map((t) =>
    t.id === "readiness"
      ? {
          ...t,
          count: w.readiness.filter((r) => r.booking !== "Ready").length || undefined,
          alert: true,
        }
      : t.id === "history"
        ? { ...t, count: openAlerts || undefined, alert: true }
        : t.id === "agreements"
          ? { ...t, count: w.agreements.length || undefined }
          : t.id === "budgets"
            ? { ...t, count: plan?.budgets.length || undefined }
            : t,
  );

  async function newAgreement() {
    const res = await post(
      url,
      { type: "new-agreement", planId: plan?.id ?? "" },
      "Agreement drafted",
      "Pre-filled from the service requests. Review every line before issuing.",
    );
    if (res?.agreementId) router.push(`/care/funding/agreements/${String(res.agreementId)}`);
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/funding" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" /> Funding
          </ButtonLink>
        }
        title="Participant funding"
        actions={<LiveBadge />}
      />
      <section className="mb-5 overflow-hidden rounded-card border border-border bg-surface shadow-lift">
        <div className="flex flex-wrap items-center gap-5 px-6 py-5">
          <Avatar name={w.client.name} size={60} className="ring-4 ring-accent-tint" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="type-display text-h1 leading-tight text-ink-900">{w.client.name}</h1>
              <Tag tone="outline">{w.client.funding}</Tag>
              {plan && <ManagementChip value={plan.management || "Unknown"} />}
              {plan && new Set(plan.budgets.map((b) => b.management)).size > 1 && (
                <Tag tone="monitor">Mixed management</Tag>
              )}
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-small text-ink-700">
              {w.client.mrn && (
                <span className="rounded-tag bg-sunken px-2 py-0.5 font-mono text-caption">
                  {w.client.mrn}
                </span>
              )}
              <span>
                {w.plans.length} plan{w.plans.length === 1 ? "" : "s"} · {w.agreements.length}{" "}
                agreement version
                {w.agreements.length === 1 ? "" : "s"}
              </span>
              {w.client.reported && (
                <span className="inline-flex items-center gap-1.5">
                  Referral said{" "}
                  <strong className="font-semibold">{w.client.reported.planType}</strong>
                  <Caveat>Participant-reported</Caveat>
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={`/care/${w.client.id}`} variant="secondary" size="sm">
              Participant record
            </ButtonLink>
            {w.can.edit && (
              <Button variant="primary" size="sm" onClick={newAgreement}>
                <FilePlus2 className="size-3.5" aria-hidden="true" /> New agreement
              </Button>
            )}
          </div>
        </div>
        {w.readiness.length > 0 && (
          <div className="flex flex-wrap gap-px border-t border-border bg-border">
            {w.readiness.map((r) => (
              <button
                key={r.needId}
                type="button"
                onClick={() => setTab("readiness")}
                className="group flex min-w-56 flex-1 cursor-pointer items-center justify-between gap-3 bg-surface px-6 py-3 text-left transition-colors hover:bg-canvas"
              >
                <span className="min-w-0">
                  <span className="block truncate text-small font-semibold text-ink-900">
                    {r.support}
                  </span>
                  <span className="text-caption text-ink-500">
                    {r.gates.filter((g) => g.severity !== "ok").length
                      ? `${r.gates.filter((g) => g.severity !== "ok").length} gate${r.gates.filter((g) => g.severity !== "ok").length === 1 ? "" : "s"} open`
                      : "All gates clear"}
                  </span>
                </span>
                <Tag tone={bookingTone[r.booking]}>{r.booking}</Tag>
              </button>
            ))}
          </div>
        )}
      </section>

      <Tabs
        label="Participant funding"
        tabs={tabList}
        value={tab}
        onChange={(t: TabId) => setTab(t)}
      />

      <TabPanel id="plans" value={tab}>
        <PlansTab w={w} plan={plan} onPick={setPlanId} onDone={reload} url={url} />
      </TabPanel>
      <TabPanel id="budgets" value={tab}>
        {plan ? <BudgetsTab w={w} plan={plan} onDone={reload} /> : <NoPlan />}
      </TabPanel>
      <TabPanel id="agreements" value={tab}>
        <AgreementsList w={w} onNew={newAgreement} />
      </TabPanel>
      <TabPanel id="readiness" value={tab}>
        <ReadinessTab w={w} onDone={reload} url={url} />
      </TabPanel>
      <TabPanel id="history" value={tab}>
        <div className="grid items-stretch gap-6 xl:grid-cols-12">
          <div className="xl:col-span-5">
            <AlertsTab alerts={w.alerts} canAck={w.can.edit} onDone={reload} compact />
          </div>
          <div className="xl:col-span-7">
            <HistoryCard w={w} />
          </div>
        </div>
      </TabPanel>
    </>
  );
}

function NoPlan() {
  return (
    <div className="flex min-h-64 items-center justify-center rounded-card border border-border bg-surface p-6 shadow-lift">
      <EmptyNote title="No plan record yet.">Add a plan in Plans and evidence first.</EmptyNote>
    </div>
  );
}

/* ------------------------------------------------------------------ plans */

function PlansTab({
  w,
  plan,
  onPick,
  onDone,
  url,
}: {
  w: FundingWorkspaceDto;
  plan: PlanDto | null;
  onPick: (id: string) => void;
  onDone: () => void;
  url: string;
}) {
  const [editing, setEditing] = useState(false);
  const [showNdis, setShowNdis] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {w.plans.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={plan?.id === p.id}
            onClick={() => onPick(p.id)}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-card border px-4 py-2.5 text-left transition-all duration-(--duration-fast) hover:-translate-y-px",
              plan?.id === p.id
                ? "border-accent-fill bg-accent-tint shadow-lift"
                : "border-border bg-surface hover:border-border-strong",
            )}
          >
            <Landmark
              className={cn("size-4", plan?.id === p.id ? "text-accent" : "text-ink-500")}
              aria-hidden="true"
            />
            <span>
              <span className="block font-mono text-small font-semibold text-ink-900">{p.ref}</span>
              <span className="text-caption text-ink-500">
                {p.start ? dayLabel(p.start) : "Start ?"} to {p.end ? dayLabel(p.end) : "end ?"} ·{" "}
                {p.status}
              </span>
            </span>
          </button>
        ))}
        {w.can.edit && (
          <Button
            variant="soft"
            size="sm"
            onClick={async () => {
              const res = await post(
                url,
                { type: "new-plan" },
                "Plan added",
                "A participant can have plans with different dates.",
              );
              if (res?.planId) {
                onDone();
                onPick(String(res.planId));
              }
            }}
          >
            <Plus className="size-3.5" aria-hidden="true" /> Add plan
          </Button>
        )}
      </div>

      {!plan ? (
        <NoPlan />
      ) : (
        <>
          <FCard
            icon={Landmark}
            title={
              <span className="flex flex-wrap items-center gap-2">
                NDIS plan <span className="font-mono">{plan.ref}</span>
                <Tag
                  tone={
                    plan.status === "Active"
                      ? "healthy"
                      : plan.status === "Expired"
                        ? "over"
                        : "neutral"
                  }
                >
                  {plan.status}
                </Tag>
                <Tag tone={evidenceTone[plan.evidenceStatus]}>Evidence: {plan.evidenceStatus}</Tag>
              </span>
            }
            sub="Recorded values. Each is participant-reported until a Finance officer verifies it against evidence."
            action={
              <div className="flex gap-2">
                {w.can.verify && <PlanStatus plan={plan} onDone={onDone} />}
                {w.can.edit && (
                  <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                    <Pencil className="size-3.5" aria-hidden="true" /> Edit plan
                  </Button>
                )}
              </div>
            }
          >
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3 xl:grid-cols-6">
              <Fact label="NDIS number" mono>
                <span className="inline-flex items-center gap-1.5">
                  {plan.ndisNumber
                    ? showNdis
                      ? plan.ndisNumber
                      : maskNdis(plan.ndisNumber)
                    : "Not recorded"}
                  {plan.ndisNumber && (
                    <button
                      type="button"
                      aria-label={showNdis ? "Hide NDIS number" : "Show NDIS number"}
                      onClick={() => setShowNdis((v) => !v)}
                      className="cursor-pointer text-ink-500 hover:text-accent"
                    >
                      {showNdis ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                    </button>
                  )}
                </span>
              </Fact>
              <Fact label="Plan start">
                {plan.start ? dayLabel(plan.start) : "Not evidenced yet"}
              </Fact>
              <Fact label="Plan end">
                {plan.end ? dayLabel(plan.end) : "Not recorded"}
                {plan.end && (
                  <span
                    className={cn(
                      "ml-1.5 text-caption",
                      plan.daysToEnd !== null && plan.daysToEnd <= 30
                        ? "font-semibold text-over"
                        : "text-ink-500",
                    )}
                  >
                    {relativeDays(plan.daysToEnd)}
                  </span>
                )}
              </Fact>
              <Fact label="Management (referral)">{plan.management || "Not given"}</Fact>
              <Fact label="Funding periods">
                {plan.fundingPeriods}
                {plan.fundingPeriods === "Yes" && ` · ${plan.periods.length}`}
              </Fact>
              <Fact label="Service geography">{plan.geography}</Fact>
            </dl>
          </FCard>

          <div className="grid items-stretch gap-6 xl:grid-cols-12">
            <div className="flex flex-col gap-6 xl:col-span-8 [&>*:last-child]:flex-1">
              <FieldReview plan={plan} w={w} onDone={onDone} />
              <PeriodsCard plan={plan} />
              <EvidenceCard plan={plan} w={w} onDone={onDone} />
            </div>
            <div className="flex flex-col gap-6 xl:col-span-4 [&>*:last-child]:flex-1">
              <MissingCard plan={plan} w={w} onDone={onDone} />
              <InfoRequests plan={plan} w={w} onDone={onDone} />
              {plan.budgets.some((b) => b.management === "Agency Managed") && (
                <AgencyCard plan={plan} w={w} onDone={onDone} />
              )}
            </div>
          </div>
          {editing && <PlanSheet plan={plan} onClose={() => setEditing(false)} onDone={onDone} />}
        </>
      )}
    </>
  );
}

function PlanStatus({ plan, onDone }: { plan: PlanDto; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [to, setTo] = useState<"Draft" | "Active" | "Expired" | "Superseded">(
    plan.status === "Active" ? "Expired" : "Active",
  );
  const [reason, setReason] = useState("");
  return (
    <>
      <Button size="sm" variant="soft" onClick={() => setOpen(true)}>
        Plan status
      </Button>
      {open && (
        <Sheet
          title={`Change ${plan.ref} status`}
          onClose={() => setOpen(false)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  if (
                    await post(
                      `/api/care/funding/plans/${plan.id}`,
                      { type: "status", status: to, reason },
                      `Plan is now ${to}`,
                    )
                  ) {
                    onDone();
                    setOpen(false);
                  }
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-4">
            <Choice
              label="New status"
              options={(["Draft", "Active", "Expired", "Superseded"] as const).filter(
                (s) => s !== plan.status,
              )}
              value={to}
              onChange={setTo}
            />
            <p className="text-caption text-ink-500">
              Active needs verified evidence, NDIS number and end date. Old plans stay for history.
            </p>
            <TextArea label="Reason" value={reason} onChange={setReason} rows={2} required />
          </div>
        </Sheet>
      )}
    </>
  );
}

function FieldReview({
  plan,
  w,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  onDone: () => void;
}) {
  const [reviewing, setReviewing] = useState<{
    f: FieldCheckDto;
    decision: "Verified" | "Rejected";
  } | null>(null);
  return (
    <FCard
      icon={ClipboardCheck}
      title="Reported and verified values"
      sub="Shown side by side, never merged (AT-09)"
      flush
    >
      <table className="w-full text-left text-small">
        <thead className="border-b border-border text-caption text-ink-500">
          <tr>
            <th className={th}>Field</th>
            <th className={th}>Participant-reported</th>
            <th className={th}>Recorded</th>
            <th className={th}>State</th>
            <th className={cn(th, "text-right")}>Review</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {plan.fields.map((f) => (
            <tr key={f.key} className={cn(f.differs && "bg-watch-bg/40")}>
              <td className={cn(td, "font-semibold text-ink-900")}>{f.label}</td>
              <td className={td}>
                {f.key === "ndisNumber" && f.reported !== "Not given"
                  ? maskNdis(f.reported)
                  : isDay(f.reported)
                    ? dayLabel(f.reported)
                    : f.reported}
              </td>
              <td className={td}>
                <span className={cn(f.differs && "font-semibold text-watch")}>
                  {f.key === "ndisNumber" && f.current !== "Not recorded"
                    ? maskNdis(f.current)
                    : isDay(f.current)
                      ? dayLabel(f.current)
                      : f.current}
                </span>
                {f.differs && (
                  <span className="mt-0.5 block text-caption text-watch">
                    Differs from the referral
                  </span>
                )}
              </td>
              <td className={td}>
                <Tag tone={fieldTone[f.state]}>{f.state}</Tag>
                {f.by && (
                  <span className="mt-1 block text-caption text-ink-500" title={f.note}>
                    {f.source} · {f.by}
                  </span>
                )}
              </td>
              <td className={cn(td, "text-right")}>
                <span className="inline-flex gap-1.5">
                  {f.state !== "Verified" && (
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={!w.can.verify}
                      title={
                        w.can.verify ? undefined : "Only a Funding or Finance officer can verify"
                      }
                      onClick={() => setReviewing({ f, decision: "Verified" })}
                    >
                      Verify
                    </Button>
                  )}
                  {f.state !== "Rejected" && w.can.edit && (
                    <Button
                      size="sm"
                      variant="soft-danger"
                      onClick={() => setReviewing({ f, decision: "Rejected" })}
                    >
                      Reject
                    </Button>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!w.can.verify && (
        <p className="flex items-center gap-2 border-t border-border bg-canvas px-5 py-2.5 text-caption text-ink-700">
          <ShieldCheck className="size-3.5 text-ink-500" aria-hidden="true" />
          You can record and reject values. Verifying is for Funding or Finance officers.
        </p>
      )}
      {reviewing && (
        <FieldSheet
          plan={plan}
          f={reviewing.f}
          decision={reviewing.decision}
          onClose={() => setReviewing(null)}
          onDone={onDone}
        />
      )}
    </FCard>
  );
}

function FieldSheet({
  plan,
  f,
  decision,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  f: FieldCheckDto;
  decision: "Verified" | "Rejected";
  onClose: () => void;
  onDone: () => void;
}) {
  const [source, setSource] = useState<(typeof infoSources)[number]>("NDIA document");
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={`${decision === "Verified" ? "Verify" : "Reject"} ${f.label.toLowerCase()}`}
      description={`Recorded: ${f.current}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === "Verified" ? "primary" : "soft-danger"}
            disabled={decision === "Rejected" && note.trim().length < 3}
            onClick={async () => {
              if (
                await post(
                  `/api/care/funding/plans/${plan.id}`,
                  { type: "field-review", key: f.key, decision, source, note },
                  `${f.label} ${decision.toLowerCase()}`,
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            {decision === "Verified" ? "Mark verified" : "Reject value"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {f.differs && (
          <p className="rounded-control bg-watch-bg px-3 py-2.5 text-small text-ink-900">
            The referral reported <strong>{f.reported}</strong>. Check the evidence before verifying
            the recorded value.
          </p>
        )}
        <Choice
          label="Source of information"
          options={infoSources}
          value={source}
          onChange={setSource}
        />
        <TextArea
          label={decision === "Rejected" ? "Reason (required)" : "Verification note"}
          value={note}
          onChange={setNote}
          rows={3}
        />
      </div>
    </Sheet>
  );
}

function PeriodsCard({ plan }: { plan: PlanDto }) {
  return (
    <FCard
      icon={CalendarRange}
      title="Funding periods"
      sub={
        plan.fundingPeriods === "Unknown"
          ? "Unknown: no dates are invented. Request the schedule."
          : plan.fundingPeriods === "No"
            ? "The plan has no funding periods."
            : "In date order. Bookings and estimates use these dates."
      }
      flush
    >
      {plan.fundingPeriods !== "Yes" ? (
        <p
          className={cn(
            "flex items-center gap-2 px-5 py-4 text-small",
            plan.fundingPeriods === "Unknown" ? "text-watch" : "text-ink-700",
          )}
        >
          {plan.fundingPeriods === "Unknown" && (
            <CircleAlert className="size-4" aria-hidden="true" />
          )}
          {plan.fundingPeriods === "Unknown"
            ? "Missing information: whether this plan has funding periods."
            : "Not applicable."}
        </p>
      ) : (
        <>
          {plan.overlaps && (
            <p className="flex items-center gap-2 border-b border-border bg-over-bg px-5 py-2.5 text-small text-over">
              <CircleAlert className="size-4" aria-hidden="true" /> Periods overlap. Review the
              dates.
            </p>
          )}
          <ol className="divide-y divide-border">
            {plan.periods.map((p, i) => {
              const today = new Date().toISOString().slice(0, 10);
              const now = p.start <= today && p.end >= today;
              return (
                <li key={p.id} className="flex items-center gap-4 px-5 py-3">
                  <span
                    className={cn(
                      "flex size-7 items-center justify-center rounded-full text-caption font-semibold",
                      now ? "bg-accent-fill text-on-accent" : "bg-sunken text-ink-700",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="flex-1 text-small text-ink-900">
                    {dayLabel(p.start)} to {dayLabel(p.end)}
                    {p.note && <span className="block text-caption text-ink-500">{p.note}</span>}
                  </span>
                  {now && <Tag tone="healthy">Current</Tag>}
                  {p.end < today && <Tag tone="neutral">Ended</Tag>}
                </li>
              );
            })}
          </ol>
        </>
      )}
    </FCard>
  );
}

function EvidenceCard({
  plan,
  w,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  onDone: () => void;
}) {
  const [upload, setUpload] = useState<EvidenceDto | "new" | null>(null);
  const [review, setReview] = useState<{
    e: EvidenceDto;
    decision: "Verified" | "Rejected";
  } | null>(null);
  return (
    <FCard
      icon={FileCheck2}
      title="Plan evidence"
      sub="PDF, JPG or PNG up to 5 MB. Replacing keeps every version."
      flush
      action={
        w.can.edit && (
          <Button size="sm" variant="primary" onClick={() => setUpload("new")}>
            <Upload className="size-3.5" aria-hidden="true" /> Upload evidence
          </Button>
        )
      }
    >
      {plan.evidence.length === 0 ? (
        <div className="flex min-h-32 items-center justify-center p-6">
          <EmptyNote title="No evidence received.">
            Upload the plan excerpt, or request it from the participant.
          </EmptyNote>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {plan.evidence.map((e) => (
            <li
              key={e.id}
              className={cn(
                "flex flex-wrap items-start gap-3 px-5 py-3.5",
                e.status === "Superseded" && "opacity-60",
              )}
            >
              <span className="flex size-9 flex-none items-center justify-center rounded-control bg-accent-tint text-accent">
                <FileText className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  {e.documentId ? (
                    <a
                      href={`/api/documents/${e.documentId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-small font-semibold text-ink-900"
                    >
                      {e.name}
                    </a>
                  ) : (
                    <span className="text-small font-semibold text-ink-900">{e.name}</span>
                  )}
                  <span className="rounded-tag bg-sunken px-1.5 font-mono text-label text-ink-700">
                    v{e.version}
                  </span>
                  <Tag tone={evidenceTone[e.status]}>{e.status}</Tag>
                </p>
                <p className="text-caption text-ink-500">
                  {e.category} · from {e.source} · uploaded by {e.uploadedBy} on {dayLabel(e.at)}
                  {e.reviewedBy && ` · reviewed by ${e.reviewedBy}`}
                </p>
                {e.note && (
                  <p
                    className={cn(
                      "mt-1 text-caption",
                      e.status === "Rejected" ? "text-over" : "text-ink-700",
                    )}
                  >
                    {e.status === "Rejected" ? "Rejected: " : ""}
                    {e.note}
                  </p>
                )}
              </div>
              {e.status !== "Superseded" && (
                <span className="flex flex-none flex-wrap gap-1.5">
                  {e.status !== "Verified" && (
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={!w.can.verify}
                      title={w.can.verify ? undefined : "Finance verifies evidence"}
                      onClick={() => setReview({ e, decision: "Verified" })}
                    >
                      Verify
                    </Button>
                  )}
                  {e.status !== "Rejected" && w.can.edit && (
                    <Button
                      size="sm"
                      variant="soft-danger"
                      onClick={() => setReview({ e, decision: "Rejected" })}
                    >
                      Reject
                    </Button>
                  )}
                  {w.can.edit && (
                    <Button size="sm" variant="secondary" onClick={() => setUpload(e)}>
                      Replace
                    </Button>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {upload && (
        <UploadSheet
          plan={plan}
          replace={upload === "new" ? null : upload}
          onClose={() => setUpload(null)}
          onDone={onDone}
        />
      )}
      {review && (
        <EvidenceReviewSheet
          plan={plan}
          e={review.e}
          decision={review.decision}
          onClose={() => setReview(null)}
          onDone={onDone}
        />
      )}
    </FCard>
  );
}

function UploadSheet({
  plan,
  replace,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  replace: EvidenceDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [category, setCategory] = useState<(typeof evidenceCategories)[number]>(
    replace?.category ?? "NDIS plan excerpt",
  );
  const [source, setSource] = useState<(typeof infoSources)[number]>(
    replace?.source ?? "Participant",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function send() {
    if (!file) return setError("Choose a file.");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type))
      return setError("Upload a PDF, JPG or PNG.");
    if (file.size > 5 * 1024 * 1024) return setError("The file is larger than 5 MB.");
    setBusy(true);
    const form = new FormData();
    form.append("file", file);
    form.append("category", category);
    form.append("source", source);
    form.append("replaceId", replace?.id ?? "");
    try {
      const res = await fetch(`/api/care/funding/plans/${plan.id}/evidence`, {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Upload failed.");
      toast(replace ? `Version ${replace.version + 1} uploaded` : "Evidence uploaded", {
        tone: "success",
        detail: "It's pending review by Finance.",
      });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={replace ? `Replace ${replace.name}` : "Upload plan evidence"}
      description={
        replace
          ? `The new file becomes version ${replace.version + 1}. Version ${replace.version} is kept.`
          : undefined
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || !file} onClick={send}>
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-border-strong bg-canvas px-4 py-8 text-center transition-colors hover:border-accent hover:bg-accent-tint"
        >
          <Upload className="size-6 text-accent" aria-hidden="true" />
          <span className="text-small font-semibold text-ink-900">
            {file ? file.name : "Choose a file"}
          </span>
          <span className="text-caption text-ink-500">
            {file ? `${Math.round(file.size / 1024)} KB` : "PDF, JPG or PNG, up to 5 MB"}
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            setFile(e.target.files?.[0] ?? null);
            setError("");
          }}
        />
        {error && <p className="text-small text-over">{error}</p>}
        {!replace && (
          <Choice
            label="Document category"
            options={evidenceCategories}
            value={category}
            onChange={setCategory}
          />
        )}
        <Choice
          label="Source of information"
          options={infoSources}
          value={source}
          onChange={setSource}
        />
      </div>
    </Sheet>
  );
}

function EvidenceReviewSheet({
  plan,
  e,
  decision,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  e: EvidenceDto;
  decision: "Verified" | "Rejected";
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={`${decision === "Verified" ? "Verify" : "Reject"} ${e.name}`}
      description={`Version ${e.version} · ${e.category}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision === "Verified" ? "primary" : "soft-danger"}
            disabled={decision === "Rejected" && note.trim().length < 3}
            onClick={async () => {
              if (
                await post(
                  `/api/care/funding/plans/${plan.id}`,
                  { type: "evidence-review", evidenceId: e.id, decision, note },
                  decision === "Verified" ? "Evidence verified" : "Evidence rejected",
                  decision === "Rejected"
                    ? "The reason is kept. Upload a replacement when it arrives."
                    : undefined,
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            {decision === "Verified" ? "Mark verified" : "Reject evidence"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {e.documentId && (
          <a
            href={`/api/documents/${e.documentId}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-small font-semibold text-accent"
          >
            <Eye className="size-4" aria-hidden="true" /> Open the document
          </a>
        )}
        <TextArea
          label={decision === "Rejected" ? "Rejection reason (required)" : "Note"}
          value={note}
          onChange={setNote}
          rows={3}
          placeholder={
            decision === "Rejected"
              ? "For example: plan pages are cut off; the end date isn't visible"
              : ""
          }
        />
      </div>
    </Sheet>
  );
}

function MissingCard({
  plan,
  w,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<{
    flags: { label: string; why: string }[];
    recipient: string;
    subject: string;
    message: string;
  } | null>(null);
  const [requesting, setRequesting] = useState<{
    items: string[];
    message: string;
    to: string;
  } | null>(null);
  async function run() {
    setBusy(true);
    try {
      const res = await api<{ check: NonNullable<typeof check> }>(
        `/api/care/funding/plans/${plan.id}/ai`,
        { body: {} },
      );
      setCheck(res.check);
    } catch (e) {
      toast("AI check unavailable", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  const defaultTo =
    w.contacts.find((c) => c.role === "Support Coordinator")?.name ??
    w.contacts[0]?.name ??
    "Participant";
  return (
    <FCard
      icon={CircleAlert}
      title="Still needed"
      sub={
        <span className="inline-flex items-center gap-1.5">
          Completeness checks <RuleMark />
        </span>
      }
      footer={
        w.can.edit && (
          <>
            <Button data-ai-only size="sm" variant="primary" disabled={busy} onClick={run}>
              <AiIcon className="size-3.5" /> {busy ? "AI is checking…" : "AI completeness check"}
            </Button>
            {plan.missing.length > 0 && (
              <Button
                size="sm"
                variant="soft"
                onClick={() =>
                  setRequesting({
                    items: plan.missing,
                    message: `Hello,\n\nTo set up ${w.client.name}'s supports we still need: ${plan.missing.join("; ")}. You can reply with the documents or upload them through the secure link we send.\n\nThank you,\nMedisense intake`,
                    to: defaultTo,
                  })
                }
              >
                <Mail className="size-3.5" aria-hidden="true" /> Request information
              </Button>
            )}
          </>
        )
      }
    >
      {plan.missing.length === 0 ? (
        <p className="flex items-center gap-2 text-small text-healthy">
          <Check className="size-4" aria-hidden="true" /> Nothing missing from the plan record.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plan.missing.map((m) => (
            <li key={m} className="flex items-start gap-2 text-small text-ink-900">
              <span
                className="mt-1.5 size-1.5 flex-none rounded-full bg-watch-dot"
                aria-hidden="true"
              />
              {m}
            </li>
          ))}
        </ul>
      )}
      {check && (
        <div
          data-ai-only
          className="bubble-in mt-4 rounded-control border border-dashed border-draft-rule bg-draft p-3"
        >
          <p className="mb-2 flex items-center justify-between gap-2">
            <AiChip>AI review</AiChip>
            <span className="text-caption text-ink-500">For you to check and send</span>
          </p>
          {check.flags.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5">
              {check.flags.map((f) => (
                <li key={f.label} className="text-caption text-ink-900">
                  <strong className="font-semibold">{f.label}.</strong> {f.why}
                </li>
              ))}
            </ul>
          )}
          <p className="text-caption text-ink-500">Draft follow-up to {check.recipient}:</p>
          <p className="mt-1 line-clamp-4 text-caption whitespace-pre-line text-ink-700">
            {check.message}
          </p>
          <Button
            size="sm"
            variant="soft"
            className="mt-2"
            onClick={() =>
              setRequesting({
                items: plan.missing.length ? plan.missing : check.flags.map((f) => f.label),
                message: check.message,
                to: check.recipient || defaultTo,
              })
            }
          >
            Use this draft
          </Button>
        </div>
      )}
      {requesting && (
        <RequestSheet
          plan={plan}
          w={w}
          draft={requesting}
          onClose={() => setRequesting(null)}
          onDone={onDone}
        />
      )}
    </FCard>
  );
}

function RequestSheet({
  plan,
  w,
  draft,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  draft: { items: string[]; message: string; to: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [items, setItems] = useState(draft.items);
  const [message, setMessage] = useState(draft.message);
  const [to, setTo] = useState(draft.to);
  return (
    <Sheet
      title="Request information"
      description="Recorded on the plan; the referral isn't restarted (AT-37). Delivery is simulated."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!items.length || message.trim().length < 10}
            onClick={async () => {
              const res = await post(
                `/api/care/funding/plans/${plan.id}`,
                { type: "info-request", items, message, to },
                "Request recorded",
                `A secure upload link for ${to} was copied. Delivery is simulated.`,
              );
              if (res) {
                if (typeof res.link === "string") {
                  await navigator.clipboard
                    ?.writeText(`${window.location.origin}${res.link}`)
                    .catch(() => undefined);
                }
                onDone();
                onClose();
              }
            }}
          >
            Record request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-700">
            Send to (an authorised person)
          </span>
          <Select aria-label="Recipient" value={to} onChange={(e) => setTo(e.target.value)}>
            {[...new Set([to, ...w.contacts.map((c) => c.name), "Participant"])].map((n) => (
              <option key={n} value={n}>
                {n}
                {w.contacts.find((c) => c.name === n)
                  ? ` (${w.contacts.find((c) => c.name === n)!.role}, ${w.contacts.find((c) => c.name === n)!.state.toLowerCase()})`
                  : ""}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <p className="mb-1.5 text-caption font-semibold text-ink-700">Items requested</p>
          <div className="flex flex-wrap gap-1.5">
            {draft.items.map((i) => {
              const on = items.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setItems(on ? items.filter((x) => x !== i) : [...items, i])}
                  className={cn(
                    "h-7 cursor-pointer rounded-tag border px-2.5 text-caption font-semibold transition-colors",
                    on
                      ? "border-accent-fill bg-accent-tint text-accent"
                      : "border-border-strong text-ink-500",
                  )}
                >
                  {i}
                </button>
              );
            })}
          </div>
        </div>
        <TextArea label="Message" value={message} onChange={setMessage} rows={8} required />
        <p className="text-caption text-ink-500">
          Non-clinical only. Never include diagnosis or clinical notes.
        </p>
      </div>
    </Sheet>
  );
}

function InfoRequests({
  plan,
  w,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  onDone: () => void;
}) {
  if (!plan.infoRequests.length) return null;
  return (
    <FCard
      icon={Mail}
      title="Information requests"
      sub="Tracked without restarting the referral"
      flush
    >
      <ul className="divide-y divide-border">
        {plan.infoRequests
          .slice()
          .reverse()
          .map((r) => (
            <li key={r.id} className="px-5 py-3">
              <p className="flex items-center justify-between gap-2">
                <span className="text-small font-semibold text-ink-900">To {r.to}</span>
                <Tag tone={r.receivedAt ? "healthy" : "watch"}>
                  {r.receivedAt ? "Received" : "Awaiting"}
                </Tag>
              </p>
              <p className="text-caption text-ink-500">
                {r.items.join(" · ")} · {dayLabel(r.at)} by {r.by}
              </p>
              {r.receivedNote && <p className="mt-1 text-caption text-ink-700">{r.receivedNote}</p>}
              {!r.receivedAt && w.can.edit && (
                <Button
                  size="sm"
                  variant="soft"
                  className="mt-2"
                  onClick={async () => {
                    if (
                      await post(
                        `/api/care/funding/plans/${plan.id}`,
                        { type: "info-received", requestId: r.id, note: "Received" },
                        "Marked received",
                      )
                    )
                      onDone();
                  }}
                >
                  Mark received
                </Button>
              )}
            </li>
          ))}
      </ul>
    </FCard>
  );
}

function AgencyCard({
  plan,
  w,
  onDone,
}: {
  plan: PlanDto;
  w: FundingWorkspaceDto;
  onDone: () => void;
}) {
  return (
    <FCard
      icon={ShieldCheck}
      title="Agency-managed checklist"
      sub="Before any claim could be prepared (AT-05). Claims are simulated."
    >
      <div className="flex flex-col gap-2">
        {agencyChecklist.map((item) => {
          const on = plan.agencyChecks.includes(item);
          return (
            <Tick
              key={item}
              checked={on}
              onChange={async (v) => {
                if (!w.can.verify)
                  return toast("Finance completes this checklist", { tone: "info" });
                if (
                  await post(
                    `/api/care/funding/plans/${plan.id}`,
                    { type: "agency-check", item, checked: v },
                    v ? "Confirmed" : "Unticked",
                  )
                )
                  onDone();
              }}
            >
              {item}
            </Tick>
          );
        })}
      </div>
    </FCard>
  );
}

function PlanSheet({
  plan,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    ndisNumber: plan.ndisNumber,
    start: plan.start,
    end: plan.end,
    management: plan.management as (typeof referralPlanTypes)[number] | "",
    fundingPeriods: plan.fundingPeriods,
    periods: plan.periods.map((p) => ({ ...p })),
    geography: plan.geography,
    source: "NDIA document" as (typeof infoSources)[number],
    reason: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (v.ndisNumber && !/^\d+$/.test(v.ndisNumber))
      return setError("An NDIS number has digits only.");
    if (v.start && v.end && v.start >= v.end)
      return setError("The plan start must be before the end.");
    if (v.fundingPeriods === "Yes" && !v.periods.length)
      return setError("Add at least one funding period.");
    if (v.periods.some((p) => !p.start || !p.end || p.start > p.end))
      return setError("Each period needs a start before its end.");
    setBusy(true);
    try {
      await api(`/api/care/funding/plans/${plan.id}`, {
        body: {
          type: "update",
          plan: { ...v, periods: v.fundingPeriods === "Yes" ? v.periods : [] },
        },
      });
      toast("Plan updated", { tone: "success", detail: "Changed values go back to unverified." });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={`Edit plan ${plan.ref}`}
      description="Changes are kept in history with the previous value and reason"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save plan"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="NDIS number"
          value={v.ndisNumber}
          onChange={(x) => setV({ ...v, ndisNumber: x.replace(/\s/g, "") })}
          hint="Digits only. Shown masked."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Plan start"
            type="date"
            value={v.start}
            onChange={(x) => setV({ ...v, start: x })}
          />
          <TextField
            label="Plan end"
            type="date"
            value={v.end}
            onChange={(x) => setV({ ...v, end: x })}
          />
        </div>
        <Choice
          label="Plan management (referral level)"
          options={referralPlanTypes}
          value={v.management}
          onChange={(x) => setV({ ...v, management: x })}
          hint="Per-budget management is set in Budgets and payers"
        />
        <Choice
          label="Funding periods present"
          options={["Yes", "No", "Unknown"] as const}
          value={v.fundingPeriods}
          onChange={(x) => setV({ ...v, fundingPeriods: x })}
        />
        {v.fundingPeriods === "Yes" && (
          <div className="flex flex-col gap-2 rounded-control border border-border p-3">
            {v.periods.map((p, i) => (
              <div key={p.id || i} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <TextField
                  label={`Period ${i + 1} start`}
                  type="date"
                  value={p.start}
                  onChange={(x) =>
                    setV({
                      ...v,
                      periods: v.periods.map((q, j) => (j === i ? { ...q, start: x } : q)),
                    })
                  }
                />
                <TextField
                  label="End"
                  type="date"
                  value={p.end}
                  onChange={(x) =>
                    setV({
                      ...v,
                      periods: v.periods.map((q, j) => (j === i ? { ...q, end: x } : q)),
                    })
                  }
                />
                <Button
                  variant="danger"
                  size="icon"
                  aria-label="Remove period"
                  onClick={() => setV({ ...v, periods: v.periods.filter((_, j) => j !== i) })}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="soft"
              onClick={() =>
                setV({ ...v, periods: [...v.periods, { id: "", start: "", end: "", note: "" }] })
              }
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add period
            </Button>
          </div>
        )}
        <Choice
          label="Service geography"
          options={geographies}
          value={v.geography}
          onChange={(x) => setV({ ...v, geography: x })}
          hint="Used only to pick price limits"
        />
        <Choice
          label="Source of these values"
          options={infoSources}
          value={v.source}
          onChange={(x) => setV({ ...v, source: x })}
        />
        <TextArea
          label="Reason for the change"
          value={v.reason}
          onChange={(x) => setV({ ...v, reason: x })}
          rows={2}
          hint="Required when a value differs from the referral"
        />
        {error && (
          <p className="rounded-control bg-over-bg px-3 py-2 text-small text-over">{error}</p>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ budgets */

function BudgetsTab({
  w,
  plan,
  onDone,
}: {
  w: FundingWorkspaceDto;
  plan: PlanDto;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState<BudgetDto | "new" | null>(null);
  const [verifying, setVerifying] = useState<BudgetDto | null>(null);
  const [eligibility, setEligibility] = useState<BudgetDto | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-lift">
        <Wallet className="size-4 text-accent" aria-hidden="true" />
        <span className="flex-1 text-small text-ink-700">
          Remaining amounts are <strong>local estimates</strong>: last verified snapshot minus
          commitments recorded here. Medisense can&apos;t see a live NDIS balance.
        </span>
        {w.can.edit && (
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" aria-hidden="true" /> Add budget
          </Button>
        )}
      </div>
      {plan.budgets.length === 0 ? (
        <NoBudgets />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {plan.budgets.map((b) => {
            const share =
              b.verified && b.verified.amount > 0
                ? Math.min(100, Math.round((b.committed / b.verified.amount) * 100))
                : null;
            return (
              <section
                key={b.id}
                className="bubble-in overflow-hidden rounded-card border border-border bg-surface shadow-lift transition-shadow hover:-translate-y-px"
              >
                <header className="flex flex-wrap items-start gap-3 border-b border-border px-5 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-body font-semibold text-ink-900">{b.name}</span>
                      <ManagementChip value={b.management} />
                    </p>
                    <p className="mt-0.5 truncate text-caption text-ink-500">
                      {b.priceItem} · {b.period}
                    </p>
                  </div>
                  <Tag tone={eligibilityTone[b.eligibility]}>Eligibility: {b.eligibility}</Tag>
                </header>
                <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                      Reported
                    </dt>
                    <dd className="text-small font-semibold text-ink-900">
                      {aud(b.reportedTotal)}
                    </dd>
                    <dd className="mt-0.5">
                      <Caveat>Not verified</Caveat>
                    </dd>
                  </div>
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                      Verified snapshot
                    </dt>
                    <dd className="text-small font-semibold text-ink-900">
                      {b.verified ? aud(b.verified.amount) : "None"}
                    </dd>
                    <dd className="truncate text-caption text-ink-500">
                      {b.verified
                        ? `${dayLabel(b.verified.at)} · ${b.verified.by}`
                        : "Funds not known"}
                    </dd>
                  </div>
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                      Committed
                    </dt>
                    <dd className="text-small font-semibold text-ink-900">{aud(b.committed)}</dd>
                    <dd className="text-caption text-ink-500">Billed {aud(b.used)}</dd>
                  </div>
                  <div className="bg-surface px-4 py-3">
                    <dt className="text-label font-semibold tracking-[0.08em] text-ink-500 uppercase">
                      Remaining
                    </dt>
                    <dd
                      className={cn(
                        "text-small font-semibold",
                        b.remaining !== null && b.remaining < 0 ? "text-over" : "text-ink-900",
                      )}
                    >
                      {b.remaining === null ? "Unknown" : aud(b.remaining)}
                    </dd>
                    <dd className="mt-0.5">
                      <Caveat>Local estimate</Caveat>
                    </dd>
                  </div>
                </dl>
                {share !== null && (
                  <div className="px-5 pt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          share >= 100
                            ? "bg-over-dot"
                            : share >= b.alertThreshold
                              ? "bg-watch-dot"
                              : "bg-accent-fill",
                        )}
                        style={{ width: `${share}%` }}
                      />
                    </div>
                    <p className="mt-1 text-caption text-ink-500">
                      {share}% committed · alert at {b.alertThreshold}%
                    </p>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 px-5 py-3 text-small">
                  <span className="text-ink-500">Payer:</span>
                  <span className="font-semibold text-ink-900">{b.payer ?? "Not assigned"}</span>
                  {b.payerStatus && <Tag tone={payerTone[b.payerStatus]}>{b.payerStatus}</Tag>}
                  <span className="ml-auto text-caption text-ink-500">
                    {b.travelAllowed ? "Travel billable" : "No travel line"}
                  </span>
                </div>
                {b.warnings.length > 0 && (
                  <ul className="mx-5 mb-3 flex flex-col gap-1 rounded-control bg-watch-bg px-3 py-2">
                    {b.warnings.map((x) => (
                      <li key={x} className="flex items-start gap-1.5 text-caption text-ink-900">
                        <CircleAlert
                          className="mt-0.5 size-3 flex-none text-watch"
                          aria-hidden="true"
                        />
                        {x}
                      </li>
                    ))}
                  </ul>
                )}
                {w.can.edit && (
                  <footer className="flex flex-wrap gap-2 border-t border-border bg-canvas px-5 py-3">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(b)}>
                      <Pencil className="size-3.5" aria-hidden="true" /> Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="soft"
                      disabled={!w.can.verify}
                      title={w.can.verify ? undefined : "Finance records verified snapshots"}
                      onClick={() => setVerifying(b)}
                    >
                      Record verified snapshot
                    </Button>
                    <Button size="sm" variant="soft" onClick={() => setEligibility(b)}>
                      Service eligibility
                    </Button>
                  </footer>
                )}
              </section>
            );
          })}
        </div>
      )}
      <InvoicePreview plan={plan} w={w} />
      {editing && (
        <BudgetSheet
          w={w}
          plan={plan}
          budget={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={onDone}
        />
      )}
      {verifying && (
        <SnapshotSheet
          plan={plan}
          b={verifying}
          onClose={() => setVerifying(null)}
          onDone={onDone}
        />
      )}
      {eligibility && (
        <EligibilitySheet
          plan={plan}
          b={eligibility}
          canVerify={w.can.verify}
          onClose={() => setEligibility(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function NoBudgets() {
  return (
    <div className="flex min-h-48 items-center justify-center rounded-card border border-border bg-surface p-6 shadow-lift">
      <EmptyNote title="No budgets on this plan.">
        Add the support budgets from the plan, with how each is managed.
      </EmptyNote>
    </div>
  );
}

/** Scenario B, step 10: where each agreement line's invoice would go. */
function InvoicePreview({ plan, w }: { plan: PlanDto; w: FundingWorkspaceDto }) {
  const lines = w.agreements
    .filter((a) => a.planId === plan.id && !["Cancelled", "Superseded"].includes(a.status))
    .flatMap((a) =>
      a.lines.map((l) => ({ ...l, ref: `${a.ref} v${a.version}`, status: a.status })),
    );
  if (!lines.length) return null;
  return (
    <FCard
      icon={Landmark}
      title="Invoice routing preview"
      sub="Where each agreement line would be invoiced. NDIA claims are simulated."
      flush
    >
      <table className="w-full text-left text-small">
        <thead className="border-b border-border text-caption text-ink-500">
          <tr>
            <th className={th}>Line</th>
            <th className={th}>Budget</th>
            <th className={th}>Payment destination</th>
            <th className={cn(th, "text-right")}>Estimate</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {lines.map((l) => (
            <tr key={`${l.ref}-${l.id}`}>
              <td className={td}>
                {l.support} · {l.kind}
                <span className="block text-caption text-ink-500">
                  {l.ref} · {l.status}
                </span>
              </td>
              <td className={td}>
                {l.budget ?? "Not linked"}
                {l.management && (
                  <span className="mt-1 block">
                    <ManagementChip value={l.management} />
                  </span>
                )}
              </td>
              <td className={cn(td, "font-semibold text-ink-900")}>{l.payerRoute}</td>
              <td className={cn(td, "text-right")}>{aud(l.estimate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FCard>
  );
}

function BudgetSheet({
  w,
  plan,
  budget,
  onClose,
  onDone,
}: {
  w: FundingWorkspaceDto;
  plan: PlanDto;
  budget: BudgetDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    id: budget?.id,
    name: budget?.name ?? "Capacity Building: Improved Daily Living",
    priceItemId: budget?.priceItemId ?? "",
    management: budget?.management ?? ("Unknown" as BudgetDto["management"]),
    payerId: budget?.payerId ?? "",
    periodId: budget?.periodId ?? "",
    reportedTotal: budget?.reportedTotal?.toString() ?? "",
    sharing: budget?.sharing ?? "",
    alertThreshold: budget?.alertThreshold ?? 80,
    travelAllowed: budget?.travelAllowed ?? false,
    travelNote: budget?.travelNote ?? "",
    reason: "",
  });
  const [addingPayer, setAddingPayer] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const kindFor =
    v.management === "Plan Managed"
      ? "Plan manager"
      : v.management === "Self-Managed"
        ? "Self-managed payer"
        : null;
  const payers = w.payers.filter(
    (p) =>
      p.kind === kindFor &&
      p.status !== "Inactive" &&
      (p.kind !== "Self-managed payer" || !p.clientId || p.clientId === w.client.id),
  );
  async function save() {
    setBusy(true);
    setError("");
    try {
      await api(`/api/care/funding/plans/${plan.id}`, {
        body: {
          type: "budget-save",
          budget: {
            ...v,
            payerId: kindFor ? v.payerId : "",
            reportedTotal: v.reportedTotal.trim() === "" ? null : Number(v.reportedTotal),
          },
        },
      });
      toast(budget ? "Budget updated" : "Budget added", { tone: "success" });
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={budget ? `Edit ${budget.name}` : "Add support budget"}
      description="Management can differ per budget for mixed plans (AT-02)"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy || v.name.trim().length < 2} onClick={save}>
            {busy ? "Saving…" : "Save budget"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Support budget"
          value={v.name}
          onChange={(x) => setV({ ...v, name: x })}
          hint="As named in the plan. No category codes are invented."
          required
        />
        <div className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-700">Default support item</span>
          <Select
            aria-label="Support item"
            value={v.priceItemId}
            onChange={(e) => setV({ ...v, priceItemId: e.target.value })}
          >
            <option value="">None</option>
            {w.priceItems.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {!i.active ? " (inactive)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Choice
          label="How this budget is managed"
          options={managementTypes}
          value={v.management}
          onChange={(x) => setV({ ...v, management: x, payerId: "" })}
        />
        {v.management === "Plan Managed" || v.management === "Self-Managed" ? (
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">
              {v.management === "Plan Managed" ? "Plan manager" : "Authorised self-managed payer"}
            </span>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Select
                  aria-label="Payer"
                  value={v.payerId}
                  onChange={(e) => setV({ ...v, payerId: e.target.value })}
                >
                  <option value="">Choose a payer</option>
                  {payers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.status}){p.email ? "" : ": email missing"}
                    </option>
                  ))}
                </Select>
              </div>
              <Button variant="soft" onClick={() => setAddingPayer(true)}>
                <Plus className="size-3.5" aria-hidden="true" /> New
              </Button>
            </div>
            {v.management === "Self-Managed" && (
              <span className="text-caption text-ink-500">
                No plan manager details needed for a self-managed line (AT-04).
              </span>
            )}
          </div>
        ) : v.management === "Agency Managed" ? (
          <p className="rounded-control bg-canvas px-3 py-2.5 text-small text-ink-700">
            Agency managed: claimed from the NDIA. Finance completes the agency checklist on the
            plan. Claims here are simulated.
          </p>
        ) : (
          <p className="rounded-control bg-watch-bg px-3 py-2.5 text-small text-ink-900">
            Unknown management: request clarification before invoicing.
          </p>
        )}
        {plan.periods.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">Funding period</span>
            <Select
              aria-label="Funding period"
              value={v.periodId}
              onChange={(e) => setV({ ...v, periodId: e.target.value })}
            >
              <option value="">Whole plan</option>
              {plan.periods.map((p, i) => (
                <option key={p.id} value={p.id}>
                  Period {i + 1}: {dayLabel(p.start)} to {dayLabel(p.end)}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Participant-reported total (AUD)"
            value={v.reportedTotal}
            onChange={(x) => setV({ ...v, reportedTotal: x })}
            hint="Never shown as verified"
          />
          <TextField
            label="Alert threshold (%)"
            value={String(v.alertThreshold)}
            onChange={(x) =>
              setV({ ...v, alertThreshold: Math.max(10, Math.min(100, Number(x) || 80)) })
            }
          />
        </div>
        <Tick checked={v.travelAllowed} onChange={(x) => setV({ ...v, travelAllowed: x })}>
          Provider travel can be billed from this budget (a separate, visible line)
        </Tick>
        <TextArea
          label="Budget flexibility or sharing notes"
          value={v.sharing}
          onChange={(x) => setV({ ...v, sharing: x })}
          rows={2}
          hint="Shown as unconfirmed until checked"
        />
        {budget && (
          <TextArea
            label="Change reason"
            value={v.reason}
            onChange={(x) => setV({ ...v, reason: x })}
            rows={2}
            hint="Required for changes to management, payer, totals or item"
          />
        )}
        {error && (
          <p className="rounded-control bg-over-bg px-3 py-2 text-small text-over">{error}</p>
        )}
      </div>
      {addingPayer && kindFor && (
        <PayerSheet
          payer={null}
          clients={[{ id: w.client.id, name: w.client.name }]}
          presetClientId={kindFor === "Self-managed payer" ? w.client.id : ""}
          presetKind={kindFor}
          onClose={() => setAddingPayer(false)}
          onDone={(id) => {
            onDone();
            if (id) setV((x) => ({ ...x, payerId: id }));
          }}
        />
      )}
    </Sheet>
  );
}

function SnapshotSheet({
  plan,
  b,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  b: BudgetDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [amount, setAmount] = useState(b.verified?.amount.toString() ?? "");
  const [source, setSource] = useState<(typeof infoSources)[number]>("NDIA document");
  const [note, setNote] = useState("");
  return (
    <Sheet
      title={`Verified snapshot: ${b.name}`}
      description="The amount you confirmed from a source, with today's date. It isn't a live balance."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!(Number(amount) >= 0) || amount.trim() === ""}
            onClick={async () => {
              if (
                await post(
                  `/api/care/funding/plans/${plan.id}`,
                  { type: "budget-verify", budgetId: b.id, amount: Number(amount), source, note },
                  "Snapshot recorded",
                  "Local estimates now use this figure.",
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Record snapshot
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField label="Amount observed (AUD)" value={amount} onChange={setAmount} required />
        <Choice
          label="Where it came from"
          options={infoSources}
          value={source}
          onChange={setSource}
        />
        <TextArea
          label="Note"
          value={note}
          onChange={setNote}
          rows={2}
          placeholder="For example: plan manager statement dated today"
        />
      </div>
    </Sheet>
  );
}

function EligibilitySheet({
  plan,
  b,
  canVerify,
  onClose,
  onDone,
}: {
  plan: PlanDto;
  b: BudgetDto;
  canVerify: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [state, setState] = useState(b.eligibility);
  const [note, setNote] = useState(b.eligibilityNote);
  const needsVerify = state === "Confirmed" || state === "Not Confirmed";
  return (
    <Sheet
      title={`Service eligibility: ${b.name}`}
      description="Whether these supports may be funded from this budget. Clinical suitability is decided separately."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={needsVerify && (!canVerify || note.trim().length < 5)}
            onClick={async () => {
              if (
                await post(
                  `/api/care/funding/plans/${plan.id}`,
                  { type: "budget-eligibility", budgetId: b.id, state, note },
                  `Eligibility: ${state}`,
                )
              ) {
                onDone();
                onClose();
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice label="Eligibility" options={eligibilityStates} value={state} onChange={setState} />
        {needsVerify && !canVerify && (
          <p className="text-caption text-over">
            Only Finance can confirm or rule out eligibility.
          </p>
        )}
        <TextArea
          label={needsVerify ? "Rationale or evidence (required)" : "Note"}
          value={note}
          onChange={setNote}
          rows={3}
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ agreements */

function AgreementsList({ w, onNew }: { w: FundingWorkspaceDto; onNew: () => void }) {
  const chains = new Map<string, FundingWorkspaceDto["agreements"]>();
  for (const a of w.agreements) chains.set(a.rootId, [...(chains.get(a.rootId) ?? []), a]);
  if (!w.agreements.length) {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface p-6 shadow-lift">
        <EmptyNote title="No service agreements yet.">
          A written agreement is recommended for these supports. It&apos;s pre-filled from the
          service requests and never signed automatically.
        </EmptyNote>
        {w.can.edit && (
          <Button variant="primary" onClick={onNew}>
            <FilePlus2 className="size-4" aria-hidden="true" /> New agreement
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {[...chains.values()].map((versions) => {
        const sorted = versions.slice().sort((a, b) => b.version - a.version);
        const top = sorted[0]!;
        return (
          <section
            key={top.rootId}
            className="overflow-hidden rounded-card border border-border bg-surface shadow-lift"
          >
            <header className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3.5">
              <FileText className="size-4 text-accent" aria-hidden="true" />
              <span className="font-mono text-small font-semibold text-ink-900">{top.ref}</span>
              <span className="text-caption text-ink-500">
                {sorted.length} version{sorted.length === 1 ? "" : "s"}
              </span>
              <span className="ml-auto text-caption text-ink-500">
                {dayLabel(top.start)} to {dayLabel(top.end)}
              </span>
            </header>
            <ol className="divide-y divide-border">
              {sorted.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/care/funding/agreements/${a.id}`}
                    className="group flex items-center gap-3 px-5 py-3 hover:bg-canvas hover:no-underline"
                  >
                    <span className="flex size-8 flex-none items-center justify-center rounded-full bg-sunken font-mono text-caption font-semibold text-ink-700">
                      v{a.version}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-small font-semibold text-ink-900">
                        {a.type} ·{" "}
                        {a.lines
                          .filter((l) => l.kind === "Service")
                          .map((l) => l.support)
                          .join(", ") || "No service lines"}
                      </span>
                      <span className="text-caption text-ink-500">
                        {aud(a.total)} estimate · signatory {a.signatory.name}
                        {a.acceptance ? ` · signed ${dayLabel(a.acceptance.at)}` : ""}
                      </span>
                    </span>
                    <Tag tone={agreementTone[a.status]}>{a.status}</Tag>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ readiness */

const gateDot = { ok: "bg-healthy-dot", warn: "bg-watch-dot", block: "bg-over-dot" } as const;

function ReadinessTab({
  w,
  onDone,
  url,
}: {
  w: FundingWorkspaceDto;
  onDone: () => void;
  url: string;
}) {
  const [open, setOpen] = useState<{ r: ReadinessDto; g: GateDto } | null>(null);
  if (!w.readiness.length) {
    return (
      <div className="flex min-h-48 items-center justify-center rounded-card border border-border bg-surface p-6 shadow-lift">
        <EmptyNote title="No open services.">
          Readiness is shown for each active service request.
        </EmptyNote>
      </div>
    );
  }
  const gateKeys = w.readiness[0]!.gates.map((g) => g.label);
  return (
    <>
      <TableFrame className="h-auto min-h-0">
        <table className="w-full min-w-[1080px] text-left text-small">
          <thead className="border-b border-border text-caption text-ink-500">
            <tr>
              <th className={th}>Service</th>
              {gateKeys.map((k) => (
                <th key={k} className={th}>
                  {k}
                </th>
              ))}
              <th className={th}>Booking</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {w.readiness.map((r) => (
              <tr key={r.needId}>
                <td className={cn(td, "font-semibold text-ink-900")}>
                  {r.support}
                  <span className="block text-caption font-normal text-ink-500">
                    {r.discipline}
                  </span>
                </td>
                {r.gates.map((g) => (
                  <td key={g.key} className={td}>
                    <button
                      type="button"
                      onClick={() => setOpen({ r, g })}
                      className="group flex w-full cursor-pointer flex-col items-start gap-0.5 rounded-control px-2 py-1.5 text-left transition-colors hover:bg-canvas"
                    >
                      <span className="flex items-center gap-1.5 font-semibold text-ink-900">
                        <span
                          className={cn("size-2 rounded-full", gateDot[g.severity])}
                          aria-hidden="true"
                        />
                        {g.status}
                      </span>
                      <span className="text-caption text-ink-500">
                        {g.reviewed ? `Reviewed by ${g.reviewed.by}` : g.owner}
                      </span>
                    </button>
                  </td>
                ))}
                <td className={td}>
                  <Tag tone={bookingTone[r.booking]}>{r.booking}</Tag>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      <p className="text-caption text-ink-500">
        Each gate is independent: funding never decides clinical care, and consent and clinical
        suitability stay outside funding verification. Select a gate to see its owner and next
        action.
      </p>
      {open && (
        <GateSheet
          w={w}
          r={open.r}
          g={open.g}
          url={url}
          onClose={() => setOpen(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function GateSheet({
  w,
  r,
  g,
  url,
  onClose,
  onDone,
}: {
  w: FundingWorkspaceDto;
  r: ReadinessDto;
  g: GateDto;
  url: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [clinical, setClinical] = useState<"Cleared" | "Not Cleared">(
    g.status === "Not Cleared" ? "Not Cleared" : "Cleared",
  );
  const canReview =
    g.key === "clinical" ? w.can.clinical : g.key === "consent" ? w.can.edit : w.can.verify;
  return (
    <Sheet
      title={`${g.label}: ${r.support}`}
      description={`Owner: ${g.owner}`}
      onClose={onClose}
      footer={
        canReview && (g.severity !== "ok" || g.key === "clinical") ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              disabled={note.trim().length < 3}
              onClick={async () => {
                if (
                  await post(
                    url,
                    {
                      type: "review-gate",
                      review: {
                        needId: r.needId,
                        gate: g.key,
                        note,
                        ...(g.key === "clinical" ? { clinicalState: clinical } : {}),
                      },
                    },
                    g.key === "clinical" ? `Clinical acceptance: ${clinical}` : "Marked reviewed",
                  )
                ) {
                  onDone();
                  onClose();
                }
              }}
            >
              {g.key === "clinical" ? "Save decision" : "Mark reviewed"}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-card border border-border p-4">
          <span className={cn("size-3 rounded-full", gateDot[g.severity])} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-ink-900">{g.status}</p>
            <p className="text-small text-ink-700">{g.next}</p>
          </div>
          <Tag tone={g.severity === "ok" ? "healthy" : g.severity === "block" ? "over" : "watch"}>
            {g.severity === "ok" ? "Clear" : g.severity === "block" ? "Blocks booking" : "Warning"}
          </Tag>
        </div>
        <Link
          href={g.href}
          className="inline-flex items-center gap-1.5 text-small font-semibold text-accent"
        >
          Open where this is fixed →
        </Link>
        {g.reviewed && (
          <p className="rounded-control bg-canvas px-3 py-2.5 text-small text-ink-700">
            Reviewed by {g.reviewed.by} on {dayLabel(g.reviewed.at)}: {g.reviewed.note}
          </p>
        )}
        {g.key === "clinical" && canReview && (
          <Choice
            label="Clinical acceptance (Clinical Lead)"
            options={["Cleared", "Not Cleared"] as const}
            value={clinical}
            onChange={setClinical}
          />
        )}
        {canReview && (g.severity !== "ok" || g.key === "clinical") && (
          <TextArea
            label={g.key === "clinical" ? "Clinical rationale" : "Why this is acceptable for now"}
            value={note}
            onChange={setNote}
            rows={3}
            hint={
              g.key === "clinical"
                ? undefined
                : "A reviewed warning stops counting against booking; a block never does."
            }
          />
        )}
        {!canReview && g.severity !== "ok" && (
          <p className="text-caption text-ink-500">
            Only the owner ({g.owner}) can review this gate.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ history */

function HistoryCard({ w }: { w: FundingWorkspaceDto }) {
  const [area, setArea] = useState("");
  const areas = [...new Set(w.history.map((h) => h.area.split(" ")[0]!))];
  const rows = w.history.filter((h) => !area || h.area.startsWith(area));
  return (
    <FCard
      icon={History}
      title="Funding history"
      sub="Plans, evidence, budgets, payers and agreements, with previous values and reasons"
      flush
      action={
        <div className="w-40">
          <Select
            aria-label="Area"
            className="h-8"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          >
            <option value="">Everything</option>
            {areas.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </Select>
        </div>
      }
    >
      {rows.length === 0 ? (
        <p className="px-5 py-8 text-center text-small text-ink-500">No history yet.</p>
      ) : (
        <ol className="relative mx-5 my-4 max-h-[560px] overflow-auto border-l border-border pl-6">
          {rows.map((h, i) => (
            <li key={`${h.at}-${i}`} className="bubble-in relative py-2">
              <span
                aria-hidden="true"
                className="absolute top-3.5 -left-[31px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
              />
              <p className="text-small text-ink-900">
                <span className="font-semibold">{h.action}</span>
                <span className="ml-2 text-caption text-ink-500">{h.area}</span>
              </p>
              {h.detail && <p className="text-caption text-ink-700">{h.detail}</p>}
              <p className="text-caption text-ink-500">
                {h.by} ·{" "}
                {new Date(h.at).toLocaleString("en-AU", {
                  day: "numeric",
                  month: "short",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </li>
          ))}
        </ol>
      )}
    </FCard>
  );
}

export { payerTone };
