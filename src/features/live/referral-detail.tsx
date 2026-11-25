"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { AiChip, AiIcon, RuleMark } from "@/components/ai/provenance";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/sheet";
import { Sheet } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api, useResource, useSession } from "@/lib/live/client";
import {
  disciplines,
  regions,
  serviceDecisions,
  type Discipline,
  type ServiceDecision,
} from "@/lib/live/catalogue";
import { needsRiskReview, supportLine, type Gap } from "@/lib/live/referral";
import { ageLabel, relativeTime, shortDate } from "@/lib/live/time";
import type { ReferralDetailDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { Choice, TextArea, Tick } from "./form-bits";
import { FirstVisitFlow } from "./first-visit-flow";
import { ReferralStatusTag } from "./referral-queue";

const stages = [
  { label: "Received", statuses: ["Submitted"] },
  { label: "Intake review", statuses: ["Under Admin Review", "Needs Information"] },
  { label: "Clinical triage", statuses: ["Clinical Triage"] },
  { label: "Funding and consent", statuses: ["Funding Review"] },
  { label: "First visit", statuses: ["Accepted", "Closed"] },
];

type Invite = { mrn?: string; clientId?: string };

/** One referral's workspace: what was asked for, the checks, and the decision for its stage. */
export function ReferralDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useResource<{ referral: ReferralDetailDto }>(
    `/api/care/referrals/${id}`,
    (event) =>
      event.type === "care" && (!event.payload.referralId || event.payload.referralId === id),
  );
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<"waitlist" | "decline" | "withdraw" | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const ref = data?.referral;
  const tabs = [
    { id: "next", label: "Next step" },
    { id: "referral", label: "Referral as submitted" },
    {
      id: "documents",
      label: "Documents and requests",
      count:
        (ref?.documents.length ?? 0) + (ref?.infoRequests.filter((q) => !q.answeredAt).length ?? 0),
    },
    { id: "history", label: "History and audit" },
  ] as const;
  const [tab, setTab] = useTab(tabs);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setActionError(null);
    try {
      const result = await api<Invite>(`/api/care/referrals/${id}`, { body });
      if (result.clientId) setInvite(result);
      reload();
      return true;
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "That didn't work. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    );
  }
  const r = data.referral;
  const d = r.data;
  const at = stages.findIndex((s) => s.statuses.includes(r.status));
  const open = !["Accepted", "Declined", "Withdrawn", "Closed"].includes(r.status);
  const mine = session.user?.name === r.owner;
  const fv = r.firstVisit;
  const arranged = Boolean(
    fv?.welcome && fv.services.every((x) => x.request || x.status === "assigned"),
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/referrals" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Referrals and intake
          </ButtonLink>
        }
        title={r.name}
        description={
          <>
            <span className="font-mono">{r.reference}</span> · {ageLabel(r.dateOfBirth)} ·{" "}
            {r.suburb} · {r.funding} · sent {relativeTime(r.createdAt)} by {d.submitter.name} (
            {d.submitter.role.toLowerCase()})
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <LiveBadge />
            <ReferralStatusTag status={r.status} />
            {open && !mine && (
              <Button size="sm" disabled={busy} onClick={() => act({ type: "take-ownership" })}>
                <UserRound className="size-3.5" aria-hidden="true" />
                {r.owner ? `Take over from ${r.owner.split(" ")[0]}` : "Take ownership"}
              </Button>
            )}
            {open && <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />}
            {open && r.status !== "Waitlisted" && (
              <Button size="sm" variant="ghost" onClick={() => setSheet("waitlist")}>
                Waitlist
              </Button>
            )}
            {open && (
              <>
                <Button size="sm" variant="danger" onClick={() => setSheet("decline")}>
                  Decline
                </Button>
                <Button size="sm" variant="danger" onClick={() => setSheet("withdraw")}>
                  Withdraw
                </Button>
              </>
            )}
          </div>
        }
      />

      {r.status !== "Declined" && r.status !== "Withdrawn" && r.status !== "Waitlisted" && (
        <ol
          aria-label="Referral stages"
          className="no-scrollbar mb-6 flex items-center overflow-x-auto rounded-card border border-border bg-surface px-5 py-4"
        >
          {stages.map((s, i) => {
            const done =
              i < at ||
              r.status === "Closed" ||
              (r.status === "Accepted" && (i < stages.length - 1 || arranged));
            const now = i === at && !done;
            return (
              <li
                key={s.label}
                aria-current={now ? "step" : undefined}
                className="flex min-w-max flex-1 items-center gap-2.5 last:flex-none"
              >
                <span
                  className={cn(
                    "flex size-6 flex-none items-center justify-center rounded-full text-caption font-semibold",
                    done
                      ? "bg-accent-fill text-on-accent"
                      : now
                        ? "border-2 border-accent-fill bg-surface text-accent"
                        : "border border-border-strong text-ink-500",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : i + 1}
                </span>
                <span className="flex flex-col leading-tight">
                  <span
                    className={cn(
                      "text-small",
                      now ? "font-semibold text-ink-900" : done ? "text-ink-900" : "text-ink-500",
                    )}
                  >
                    {s.label}
                  </span>
                  <span className="text-caption text-ink-500">
                    {done ? "Done" : now ? "In progress" : "Not started"}
                  </span>
                </span>
                {i < stages.length - 1 && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mx-4 h-px min-w-6 flex-1",
                      done ? "bg-accent-fill" : "bg-border",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {actionError && (
        <p role="alert" className="mb-4 rounded-control bg-over-bg px-4 py-3 text-small text-over">
          {actionError}
        </p>
      )}

      <Tabs label="Referral" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="next" value={tab}>
        <NextStep r={r} busy={busy} act={act} invite={invite} onChanged={reload} />
      </TabPanel>
      <TabPanel id="referral" value={tab}>
        <ReferralContent r={r} />
      </TabPanel>
      <TabPanel id="documents" value={tab}>
        <div className="grid gap-6 lg:grid-cols-2">
          <ReferralDocuments r={r} busy={busy} act={act} onChanged={reload} />
          {r.infoRequests.length > 0 && (
            <Panel title="Requests for information">
              <ol className="flex flex-col gap-4">
                {r.infoRequests.map((q) => (
                  <li key={q.id} className="text-small">
                    <p className="font-semibold">
                      {q.items.map((i) => i.label).join("; ") || "Question"}
                    </p>
                    {q.message && (
                      <p className="mt-1 whitespace-pre-line text-ink-700">{q.message}</p>
                    )}
                    <p className="mt-1 text-caption text-ink-500">
                      {q.requestedBy} · {relativeTime(q.at)}
                    </p>
                    {q.answeredAt ? (
                      <p className="mt-2 rounded-control bg-healthy-bg px-3 py-2 whitespace-pre-line">
                        {q.answer || "Answered with documents."}
                        <span className="mt-1 block text-caption text-ink-500">
                          Answered {relativeTime(q.answeredAt)}
                        </span>
                      </p>
                    ) : (
                      <Tag tone="monitor">Waiting for the submitter</Tag>
                    )}
                  </li>
                ))}
              </ol>
            </Panel>
          )}
        </div>
      </TabPanel>
      <TabPanel id="history" value={tab}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Status history">
            <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
              {[...r.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative text-small">
                  <i
                    aria-hidden="true"
                    className="absolute top-1.5 -left-5.5 size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                  />
                  <span className="block font-semibold">{h.status}</span>
                  {h.note && <span className="block text-ink-700">{h.note}</span>}
                  <span className="text-caption text-ink-500">
                    {h.byName} · {relativeTime(h.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Audit trail">
            <ol className="flex flex-col gap-3">
              {r.activity.map((a) => (
                <li key={a.id} className="text-small">
                  <span className="block">{a.action}</span>
                  <span className="text-caption text-ink-500">
                    {a.actor} · {shortDate(a.at)}, {relativeTime(a.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </TabPanel>

      {sheet && (
        <ReasonSheet
          kind={sheet}
          busy={busy}
          onClose={() => setSheet(null)}
          onSubmit={async (reason) => {
            if (await act({ type: sheet, reason })) setSheet(null);
          }}
        />
      )}
    </>
  );
}

type Act = (body: Record<string, unknown>) => Promise<boolean>;

function NextStep({
  r,
  busy,
  act,
  invite,
  onChanged,
}: {
  r: ReferralDetailDto;
  busy: boolean;
  act: Act;
  invite: Invite | null;
  onChanged: () => void;
}) {
  switch (r.status) {
    case "Submitted":
    case "Under Admin Review":
      return <IntakeReview r={r} busy={busy} act={act} />;
    case "Needs Information": {
      const open = r.infoRequests.find((q) => !q.answeredAt);
      return (
        <Panel title="Waiting for information">
          <p className="text-small text-ink-700">
            Asked {open ? relativeTime(open.at) : "earlier"}. The submitter answers through their
            private tracking link; the referral returns to this queue when they do.
          </p>
          {open && open.items.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1 text-small">
              {open.items.map((i) => (
                <li key={i.field}>· {i.label}</li>
              ))}
            </ul>
          )}
        </Panel>
      );
    }
    case "Clinical Triage":
      return <ClinicalTriage r={r} busy={busy} act={act} />;
    case "Funding Review":
      return <FundingReview r={r} busy={busy} act={act} />;
    case "Waitlisted":
      return (
        <Panel title="On the waitlist">
          <p className="mb-4 text-small text-ink-700">
            {r.history.at(-1)?.note || "Waiting for capacity."} When a place opens, take it off the
            waitlist and it returns to the stage it left.
          </p>
          <Button variant="primary" disabled={busy} onClick={() => act({ type: "resume" })}>
            Take off the waitlist
          </Button>
        </Panel>
      );
    case "Accepted":
      if (r.firstVisit && r.clientId) {
        return (
          <FirstVisitFlow
            flow={r.firstVisit}
            mrn={invite?.mrn ?? r.mrn}
            clientId={r.clientId}
            busy={busy}
            onSend={() => void act({ type: "welcome" })}
            onChanged={onChanged}
            waitlisted={
              r.services.some((x) => x.decision !== "Accepted") ? (
                <Panel title="Services not started">
                  <ServiceOutcomes r={r} busy={busy} act={act} />
                </Panel>
              ) : undefined
            }
          />
        );
      }
      return (
        <Panel title="Accepted: ready for matching">
          {(invite?.mrn ?? r.mrn) && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-control border border-border bg-canvas px-4 py-3">
              <div>
                <p className="text-caption font-semibold tracking-wide text-ink-500 uppercase">
                  Medical record number
                </p>
                <p className="font-mono text-section font-semibold">{invite?.mrn ?? r.mrn}</p>
              </div>
              <p className="max-w-80 text-caption text-ink-700">
                The participant signs in to the patient app with this MRN. The app is optional.
              </p>
            </div>
          )}
          <p className="mb-4 text-small text-ink-700">
            Each accepted support is now its own service request on the patient&apos;s record.
            Choose a therapist for each one by availability.
          </p>
          {r.services.length > 0 && <ServiceOutcomes r={r} busy={busy} act={act} />}
          {r.clientId && (
            <ButtonLink href={`/care/${r.clientId}`} variant="primary">
              Match therapists
            </ButtonLink>
          )}
        </Panel>
      );
    default:
      return (
        <Panel title={r.status}>
          <p className="text-small text-ink-700">
            {r.outcome
              ? `${r.outcome.reason}. ${r.outcome.byName}, ${shortDate(r.outcome.at)}.`
              : "No further action."}
          </p>
        </Panel>
      );
  }
}

/** One line of the intake checklist: state icon, what was checked, and its status. */
function CheckRow({
  state,
  title,
  detail,
  status,
  children,
}: {
  state: "ok" | "attention" | "blocked";
  title: string;
  detail?: ReactNode;
  status: ReactNode;
  children?: ReactNode;
}) {
  const Icon = state === "ok" ? CircleCheck : state === "attention" ? CircleAlert : AlertTriangle;
  return (
    <li className="flex gap-3.5 border-t border-border px-5 py-4 first:border-0">
      <Icon
        className={cn(
          "mt-0.5 size-4.5 flex-none",
          state === "ok" ? "text-healthy" : state === "attention" ? "text-watch" : "text-over",
        )}
        strokeWidth={2}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
          <p className="text-small font-semibold text-ink-900">{title}</p>
          {status}
        </div>
        {detail && <div className="mt-0.5 text-small text-ink-700">{detail}</div>}
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

/** Key facts of the referral, always in view beside the work. */
function ReferralFacts({ r }: { r: ReferralDetailDto }) {
  const rows: [string, ReactNode][] = [
    [
      "Reference",
      <span key="ref" className="font-mono">
        {r.reference}
      </span>,
    ],
    ["Received", `${shortDate(r.createdAt)} · ${relativeTime(r.createdAt)}`],
    ["Referred by", `${r.data.submitter.name} (${r.data.submitter.role.toLowerCase()})`],
    ["Funding", r.funding],
    ["Owner", r.owner ?? "Unassigned"],
    ["Region", r.region ?? "Not set"],
  ];
  return (
    <section
      aria-label="Referral summary"
      className="overflow-hidden rounded-card border border-border bg-surface"
    >
      <h3 className="border-b border-border px-5 py-3 text-small font-semibold text-ink-900">
        Referral summary
      </h3>
      <dl className="divide-y divide-border">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-2.5 text-small">
            <dt className="text-ink-500">{k}</dt>
            <dd className="text-right text-ink-900">{v}</dd>
          </div>
        ))}
        <div className="px-5 py-2.5 text-small">
          <dt className="text-ink-500">Supports requested</dt>
          <dd className="mt-1.5 flex flex-wrap gap-1.5">
            {r.supports.map((s) => (
              <Tag key={s} tone="meta">
                {s}
              </Tag>
            ))}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function IntakeReview({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<Gap[]>(r.gapsList);
  const risk = needsRiskReview(r.data);
  const duplicateOpen = r.duplicatesList.length > 0 && !r.duplicateDecision;
  const attention =
    (r.gapsList.length ? 1 : 0) + (duplicateOpen ? 1 : 0) + (risk ? 1 : 0) + (r.region ? 0 : 1);
  const blockers = [
    duplicateOpen && "Decide whether this is the same person as an existing record.",
  ].filter(Boolean) as string[];

  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <div className="flex min-w-0 flex-col gap-6 xl:col-span-8">
        <section
          aria-labelledby="intake-checks"
          className="overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-3.5">
            <div>
              <h2 id="intake-checks" className="text-section font-semibold text-ink-900">
                Intake checks
              </h2>
              <p className="flex items-center gap-1.5 text-caption text-ink-500">
                <RuleMark>Rules</RuleMark> run on every referral · you verify each one
              </p>
            </div>
            {attention === 0 ? (
              <Tag tone="healthy">All checks clear</Tag>
            ) : (
              <Tag tone="watch">{attention} need attention</Tag>
            )}
          </div>
          <ul>
            <CheckRow
              state={r.gapsList.length ? "attention" : "ok"}
              title="Required information"
              status={
                r.gapsList.length ? (
                  <Tag tone="watch">{r.gapsList.length} missing</Tag>
                ) : (
                  <Tag tone="healthy">Complete</Tag>
                )
              }
              detail={
                r.gapsList.length ? (
                  <ul className="mt-1 flex flex-col gap-1">
                    {r.gapsList.map((g) => (
                      <li key={g.field} className="flex items-center gap-2">
                        <CircleDashed
                          className="size-3.5 flex-none text-ink-400"
                          aria-hidden="true"
                        />
                        {g.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  "Everything the requirements ask for is present."
                )
              }
            />
            <CheckRow
              state={duplicateOpen ? "blocked" : "ok"}
              title="Duplicate check"
              status={
                duplicateOpen ? (
                  <Tag tone="over">Decision needed</Tag>
                ) : r.duplicateDecision ? (
                  <Tag tone="healthy">Decided</Tag>
                ) : (
                  <Tag tone="healthy">No match</Tag>
                )
              }
              detail={
                duplicateOpen ? (
                  "A possible match was found. Records are never merged automatically."
                ) : r.duplicateDecision ? (
                  <>
                    {r.duplicateDecision.clientId ? (
                      <>
                        Linked to an{" "}
                        <Link
                          href={`/care/${r.duplicateDecision.clientId}`}
                          className="font-semibold"
                        >
                          existing patient
                        </Link>
                        ; services will be added to their record.
                      </>
                    ) : (
                      "Confirmed as a new person."
                    )}{" "}
                    <span className="text-caption text-ink-500">{r.duplicateDecision.byName}</span>
                  </>
                ) : (
                  "No existing patient or open referral matches this person."
                )
              }
            >
              {duplicateOpen && (
                <div className="overflow-hidden rounded-control border border-border">
                  {r.duplicatesList.map((dup) => (
                    <div
                      key={dup.id}
                      className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-3.5 py-2.5 last:border-0"
                    >
                      <span className="min-w-0 text-small">
                        <Link
                          href={
                            dup.kind === "patient" ? `/care/${dup.id}` : `/care/referrals/${dup.id}`
                          }
                          className="font-semibold"
                        >
                          {dup.name}
                        </Link>
                        <span className="block text-caption text-ink-500">
                          {dup.kind === "patient" ? "Existing patient" : "Open referral"} ·{" "}
                          {dup.why}
                        </span>
                      </span>
                      {dup.kind === "patient" && (
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() => act({ type: "duplicate", clientId: dup.id })}
                        >
                          Same person
                        </Button>
                      )}
                    </div>
                  ))}
                  <div className="flex justify-end bg-sunken px-3.5 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => act({ type: "duplicate", clientId: null })}
                    >
                      Not the same person
                    </Button>
                  </div>
                </div>
              )}
            </CheckRow>
            <CheckRow
              state={risk ? "blocked" : "ok"}
              title="Risk screening"
              status={
                risk ? (
                  <Tag tone="over">Clinical review</Tag>
                ) : (
                  <Tag tone="healthy">None reported</Tag>
                )
              }
              detail={
                risk
                  ? "A risk or behaviours of concern are reported (Yes or Unknown). Clinical triage reviews it before any therapist is matched."
                  : "No risks or behaviours of concern reported."
              }
            />
            <CheckRow
              state={r.region ? "ok" : "attention"}
              title="Service region"
              status={
                r.region ? <Tag tone="healthy">Set</Tag> : <Tag tone="watch">Choose a region</Tag>
              }
              detail={
                r.region
                  ? "Suggested from the postcode. Used to match therapists who cover the area."
                  : "The postcode wasn't recognised. Choose the region for matching."
              }
            >
              <RegionPicker r={r} busy={busy} act={act} />
            </CheckRow>
          </ul>
        </section>

        <AiReview
          id={r.id}
          onUse={(items) => {
            setChosen((list) => [
              ...list,
              ...items.filter((i) => !list.some((c) => c.field === i.field)),
            ]);
            setAsking(true);
          }}
        />
      </div>

      <aside className="flex flex-col gap-4 xl:sticky xl:top-[calc(var(--topbar-h)+4rem)] xl:col-span-4 xl:self-start">
        <section
          aria-labelledby="decision"
          className="overflow-hidden rounded-card border border-border bg-surface"
        >
          <div className="px-5 pt-4 pb-5">
            <p className="label-caps">Next step</p>
            <h2 id="decision" className="mt-1.5 text-section font-semibold text-ink-900">
              Send to clinical triage
            </h2>
            <p className="mt-1 text-small text-ink-700">
              A Clinical Lead decides whether to accept. Missing information can be requested now or
              after triage.
            </p>
            {blockers.length > 0 && (
              <ul className="mt-3 flex flex-col gap-1.5 rounded-control border border-over bg-over-bg px-3 py-2.5 text-small text-ink-900">
                {blockers.map((b) => (
                  <li key={b} className="flex gap-2">
                    <AlertTriangle
                      className="mt-0.5 size-3.5 flex-none text-over"
                      aria-hidden="true"
                    />
                    {b}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-col gap-2">
              <Button
                variant="primary"
                className="w-full"
                disabled={busy || blockers.length > 0}
                onClick={() => act({ type: "to-triage", note: "" })}
              >
                Send to clinical triage
              </Button>
              <Button className="w-full" disabled={busy} onClick={() => setAsking(true)}>
                Request information
              </Button>
            </div>
          </div>
          <p className="border-t border-border bg-sunken px-5 py-2.5 text-caption text-ink-500">
            Waitlist, decline or withdraw from the top of the page.
          </p>
        </section>
        <ReferralFacts r={r} />
      </aside>

      {asking && (
        <RequestInfoSheet
          r={r}
          busy={busy}
          chosen={chosen}
          setChosen={setChosen}
          onClose={() => setAsking(false)}
          onSend={async (message) => {
            if (await act({ type: "request-info", items: chosen, message })) setAsking(false);
          }}
        />
      )}
    </div>
  );
}

/** Ask the submitter for what's missing; they answer on their private tracking link. */
function RequestInfoSheet({
  r,
  busy,
  chosen,
  setChosen,
  onClose,
  onSend,
}: {
  r: ReferralDetailDto;
  busy: boolean;
  chosen: Gap[];
  setChosen: (update: (list: Gap[]) => Gap[]) => void;
  onClose: () => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const options = [
    ...r.gapsList,
    ...chosen.filter((c) => !r.gapsList.some((g) => g.field === c.field)),
  ];
  return (
    <Sheet
      title="Request information"
      description={`${r.data.submitter.name} answers on their private tracking link. The referral waits in Needs information until they do.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="ml-auto"
            loading={busy}
            disabled={!chosen.length && !message.trim()}
            onClick={() => onSend(message)}
          >
            Send request{chosen.length ? ` · ${chosen.length}` : ""}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div>
          <p className="mb-2 label-caps">What to ask for</p>
          {options.length ? (
            <div className="flex flex-col gap-2">
              {options.map((g) => (
                <Tick
                  key={g.field}
                  checked={chosen.some((c) => c.field === g.field)}
                  onChange={(on) =>
                    setChosen((list) =>
                      on ? [...list, g] : list.filter((c) => c.field !== g.field),
                    )
                  }
                >
                  {g.label}
                  {g.field.startsWith("ai:") && (
                    <span className="ml-2 align-middle">
                      <AiChip>AI suggested</AiChip>
                    </span>
                  )}
                </Tick>
              ))}
            </div>
          ) : (
            <p className="text-small text-ink-500">
              Nothing is flagged as missing. Write what you need below.
            </p>
          )}
        </div>
        <TextArea
          label="Message"
          value={message}
          onChange={setMessage}
          rows={4}
          placeholder="Anything else you need, in plain words"
        />
      </div>
    </Sheet>
  );
}

function RegionPicker({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  return (
    <div className="w-60">
      <Select
        aria-label="Service region for matching"
        value={r.region ?? ""}
        disabled={busy}
        onChange={(e) => e.target.value && act({ type: "set-region", region: e.target.value })}
      >
        {!r.region && <option value="">Choose a region…</option>}
        {regions.map((region) => (
          <option key={region}>{region}</option>
        ))}
      </Select>
    </div>
  );
}

function ClinicalTriage({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  const risk = needsRiskReview(r.data);
  const [decision, setDecision] = useState<
    "Accepted" | "More information" | "Waitlisted" | "Declined"
  >("Accepted");
  const [notes, setNotes] = useState("");
  const [riskAction, setRiskAction] = useState("");
  const [precaution, setPrecaution] = useState("");
  const [tried, setTried] = useState(false);
  const c = r.data.clinical;
  const riskFields = risk && decision === "Accepted";
  const missing = {
    notes: !notes.trim() ? "Write your clinical review notes." : undefined,
    riskAction:
      riskFields && !riskAction.trim() ? "Describe how the risk will be managed." : undefined,
    precaution:
      riskFields && !precaution.trim() ? "Write the precaution therapists will see." : undefined,
  };
  const problems = Object.values(missing).filter(Boolean) as string[];
  const actionLabel = {
    Accepted: "Accept referral",
    "More information": "Ask for more information",
    Waitlisted: "Put on the waitlist",
    Declined: "Decline referral",
  }[decision];

  return (
    <Panel title="Clinical suitability and safety">
      <div className="flex flex-col gap-5">
        <dl className="grid gap-x-6 gap-y-2 rounded-control bg-canvas p-4 text-small md:grid-cols-[180px_1fr]">
          <dt className="text-ink-500">Diagnosis (reported)</dt>
          <dd>{c.diagnosis || "Not given"}</dd>
          <dt className="text-ink-500">Behaviours of concern</dt>
          <dd className={cn(c.behaviours !== "No" && "font-semibold text-over")}>
            {c.behaviours}
            {c.behavioursDetails && `: ${c.behavioursDetails}`}
          </dd>
          <dt className="text-ink-500">Known risk to therapist</dt>
          <dd className={cn(c.knownRisk !== "No" && "font-semibold text-over")}>
            {c.knownRisk}
            {c.riskDetails && `: ${c.riskDetails}`}
          </dd>
          <dt className="text-ink-500">Supports</dt>
          <dd>{r.data.supports.map(supportLine).join("; ")}</dd>
        </dl>
        {risk && (
          <p className="flex gap-2 text-small text-ink-700">
            <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
            No therapist can be matched until a Clinical Lead records how this risk is managed. A
            missing answer is not proof that there is no risk.
          </p>
        )}
        {!r.canTriage ? (
          <p className="rounded-control border border-border bg-canvas px-4 py-3 text-small">
            Waiting for a Clinical Lead to review. Only a Clinical Lead or Super Admin can make this
            decision.
          </p>
        ) : (
          <>
            <Choice
              label="Decision"
              options={["Accepted", "More information", "Waitlisted", "Declined"] as const}
              value={decision}
              onChange={setDecision}
            />
            <TextArea
              label="Clinical review notes"
              required
              value={notes}
              onChange={setNotes}
              rows={3}
              error={tried ? missing.notes : undefined}
              placeholder="Why this decision: suitability, scope, anything the therapist should know"
            />
            {risk && decision === "Accepted" && (
              <>
                <TextArea
                  label="How the risk will be managed"
                  required
                  value={riskAction}
                  onChange={setRiskAction}
                  rows={3}
                  error={tried ? missing.riskAction : undefined}
                  placeholder="For example, two-person visit for the first session; carer present"
                />
                <TextArea
                  label="Precaution every therapist sees before visiting"
                  required
                  value={precaution}
                  onChange={setPrecaution}
                  rows={2}
                  error={tried ? missing.precaution : undefined}
                  placeholder="Shown on the request and the patient record"
                  maxLength={1000}
                />
              </>
            )}
            {!risk && decision === "Accepted" && (
              <TextArea
                label="Precaution for therapists"
                value={precaution}
                onChange={setPrecaution}
                rows={2}
                maxLength={1000}
              />
            )}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              <Button
                variant={decision === "Declined" ? "danger" : "primary"}
                loading={busy}
                onClick={() => {
                  setTried(true);
                  if (problems.length) return;
                  void act({ type: "triage", decision, notes, riskAction, precaution });
                }}
              >
                {actionLabel}
              </Button>
              {tried && problems.length > 0 ? (
                <p role="alert" className="flex items-center gap-1.5 text-small text-over">
                  <AlertTriangle className="size-4 flex-none" aria-hidden="true" />
                  {problems.length === 1
                    ? problems[0]
                    : `${problems.length} fields to complete above.`}
                </p>
              ) : (
                <p className="text-caption text-ink-500">
                  {decision === "Accepted"
                    ? "Moves the referral to Funding and consent."
                    : decision === "More information"
                      ? "Sets it to Needs information, waiting on the referrer."
                      : decision === "Waitlisted"
                        ? "Parks it until there is capacity."
                        : "Closes the referral with your notes as the reason."}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function FundingReview({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  const saved = r.fundingReview;
  const [verification, setVerification] = useState<"Verified" | "Exception">(
    saved?.verification ?? "Verified",
  );
  const [exceptionReason, setExceptionReason] = useState(saved?.exceptionReason ?? "");
  const [agreement, setAgreement] = useState<"Signed" | "Sent" | "Not required">(
    saved?.agreement ?? "Signed",
  );
  const [consentRecorded, setConsent] = useState(saved?.consentRecorded ?? false);
  const [notes, setNotes] = useState(saved?.notes ?? "");
  const others = r.data.supports.map((s, i) => ({ s, i })).filter(({ s }) => s.support === "Other");
  const [otherDisciplines, setOther] = useState<Record<string, Discipline>>({});
  const [choices, setChoices] = useState<
    Record<string, { decision: ServiceDecision; reason: string }>
  >({});
  const choice = (i: number) => choices[String(i)] ?? { decision: "Accepted" as const, reason: "" };
  const accepted = r.data.supports.filter((_, i) => choice(i).decision === "Accepted").length;
  const f = r.data.funding;

  const blockers = [
    !saved && "Save the funding review.",
    saved && !saved.consentRecorded && "Record the participant's consent.",
    saved?.agreement === "Sent" && "The service agreement isn't signed yet.",
    !r.region && "Set the service region.",
    r.triage?.decision !== "Accepted" && "Clinical triage hasn't accepted it.",
    others.some(({ i }) => choice(i).decision === "Accepted" && !otherDisciplines[String(i)]) &&
      'Choose who delivers each accepted "Other" support.',
    accepted === 0 && "Accept at least one service, or waitlist the whole referral.",
    r.data.supports.some((_, i) => choice(i).decision !== "Accepted" && !choice(i).reason.trim()) &&
      "Give a reason for each service you waitlist or decline.",
  ].filter(Boolean) as string[];

  return (
    <>
      {r.triage && (
        <Panel title="Clinical triage decision">
          <p className="text-small">
            <strong>{r.triage.decision}</strong> by {r.triage.byName}, {relativeTime(r.triage.at)}.
          </p>
          <p className="mt-1 text-small whitespace-pre-line text-ink-700">{r.triage.notes}</p>
          {r.triage.precaution && (
            <p className="mt-3 flex gap-2 rounded-control bg-over-bg px-3 py-2 text-small">
              <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
              {r.triage.precaution}
            </p>
          )}
        </Panel>
      )}
      <Panel title="Payment path and consent">
        <div className="flex flex-col gap-5">
          <dl className="grid gap-x-6 gap-y-2 rounded-control bg-canvas p-4 text-small md:grid-cols-[180px_1fr]">
            <dt className="text-ink-500">Funding source</dt>
            <dd>{f.source}</dd>
            {f.source === "NDIS" ? (
              <>
                <dt className="text-ink-500">NDIS number</dt>
                <dd className="font-mono">{f.ndisNumber}</dd>
                <dt className="text-ink-500">Plan</dt>
                <dd>
                  {f.planType}, ends{" "}
                  {f.planEndDate ? shortDate(`${f.planEndDate}T00:00:00Z`) : "not given"} · funding
                  periods: {f.fundingPeriods || "not given"}
                </dd>
                {(f.periods ?? []).length > 0 && (
                  <>
                    <dt className="text-ink-500">Funding periods</dt>
                    <dd>{periodsLine(f.periods)}</dd>
                  </>
                )}
                {f.planType === "Plan Managed" && (
                  <>
                    <dt className="text-ink-500">Plan manager</dt>
                    <dd>
                      {[f.planManagerCompany, f.planManagerEmail].filter(Boolean).join(", ") ||
                        "Not given"}
                    </dd>
                  </>
                )}
              </>
            ) : (
              <>
                <dt className="text-ink-500">Details</dt>
                <dd>{f.otherDetails || "Not given"}</dd>
              </>
            )}
            <dt className="text-ink-500">Agreement signatory</dt>
            <dd>
              {r.data.signatory.name || "Not given"} ({r.data.signatory.role.toLowerCase()})
              {r.data.signatory.email && `, ${r.data.signatory.email}`}
            </dd>
          </dl>
          <Choice
            label="Funding"
            options={["Verified", "Exception"] as const}
            value={verification}
            onChange={setVerification}
            hint="Verified against the plan or payer, or a documented exception."
          />
          {verification === "Exception" && (
            <TextArea
              label="Documented exception"
              required
              value={exceptionReason}
              onChange={setExceptionReason}
              rows={2}
              placeholder="For example, plan renewal pending; first visit approved by the Operations Manager"
            />
          )}
          <Choice
            label="Service agreement"
            options={["Signed", "Sent", "Not required"] as const}
            value={agreement}
            onChange={setAgreement}
          />
          <Tick checked={consentRecorded} onChange={setConsent}>
            The participant (or their authorised representative) has consented to the services and
            to information sharing with the care team.
          </Tick>
          <TextArea label="Notes" value={notes} onChange={setNotes} rows={2} />
          <div>
            <Button
              disabled={busy}
              onClick={() =>
                act({
                  type: "funding",
                  verification,
                  exceptionReason,
                  agreement,
                  consentRecorded,
                  notes,
                })
              }
            >
              {saved ? "Update funding review" : "Save funding review"}
            </Button>
            {saved && (
              <span className="ml-3 text-caption text-ink-500">
                Saved by {saved.byName}, {relativeTime(saved.at)}
              </span>
            )}
          </div>
          <RegionPicker r={r} busy={busy} act={act} />
          {f.source === "NDIS" && <FundingRecordLink referralId={r.id} />}
        </div>
      </Panel>
      <Panel title="Accept the referral">
        <p className="mb-3 text-small text-ink-700">
          Decide each service on its own: accept it now, hold it on the waitlist, or decline it.
        </p>
        <ul className="mb-5 flex flex-col divide-y divide-border rounded-card border border-border">
          {r.data.supports.map((s, i) => {
            const c = choice(i);
            return (
              <li key={`${s.support}-${i}`} className="flex flex-col gap-3 px-4 py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-small font-semibold">{s.support}</p>
                    <p className="text-caption text-ink-500">
                      {supportLine(s).split(" · ").slice(1).join(" · ")}
                      {s.details ? ` · ${s.details}` : ""}
                    </p>
                  </div>
                  <div
                    role="radiogroup"
                    aria-label={`Decision for ${s.support}`}
                    className="flex rounded-control bg-sunken p-0.5"
                  >
                    {serviceDecisions.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={c.decision === d}
                        onClick={() =>
                          setChoices((all) => ({ ...all, [String(i)]: { ...c, decision: d } }))
                        }
                        className={cn(
                          "h-8 cursor-pointer rounded-[8px] px-3 text-caption font-semibold transition-colors duration-(--duration-fast)",
                          c.decision === d
                            ? d === "Declined"
                              ? "bg-surface text-over shadow-lift"
                              : d === "Waitlisted"
                                ? "bg-surface text-watch shadow-lift"
                                : "bg-surface text-healthy shadow-lift"
                            : "text-ink-500 hover:text-ink-900",
                        )}
                      >
                        {d === "Accepted" ? "Accept" : d === "Waitlisted" ? "Waitlist" : "Decline"}
                      </button>
                    ))}
                  </div>
                </div>
                {c.decision !== "Accepted" && (
                  <TextArea
                    label={
                      c.decision === "Waitlisted" ? "Why it's waitlisted" : "Why it's declined"
                    }
                    required
                    rows={2}
                    value={c.reason}
                    onChange={(v) =>
                      setChoices((all) => ({ ...all, [String(i)]: { ...c, reason: v } }))
                    }
                    placeholder={
                      c.decision === "Waitlisted"
                        ? "For example, no psychology capacity in Brisbane South until March"
                        : "For example, outside the funded plan"
                    }
                  />
                )}
              </li>
            );
          })}
        </ul>
        {others.length > 0 && (
          <div className="mb-4 grid gap-3 md:grid-cols-2">
            {others.map(({ s, i }) => (
              <Field key={i} label={`Who delivers "${s.details}"?`}>
                <Select
                  value={otherDisciplines[String(i)] ?? ""}
                  onChange={(e) =>
                    setOther((o) => ({ ...o, [String(i)]: e.target.value as Discipline }))
                  }
                >
                  <option value="">Choose…</option>
                  {disciplines.map((dsc) => (
                    <option key={dsc}>{dsc}</option>
                  ))}
                </Select>
              </Field>
            ))}
          </div>
        )}
        <p className="mb-3 text-small text-ink-700">
          Accepting creates{" "}
          {r.duplicateDecision?.clientId
            ? "new service requests on the existing patient record"
            : "the patient record"}{" "}
          with {accepted} service request{accepted === 1 ? "" : "s"}, ready for therapist matching.
          Waitlisted services stay on this referral and can start later.
        </p>
        {blockers.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1 text-small text-over">
            {blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        )}
        <Button
          variant="primary"
          disabled={busy || blockers.length > 0}
          onClick={() => act({ type: "accept", otherDisciplines, services: choices })}
        >
          {accepted === r.data.supports.length
            ? "Accept and create service requests"
            : `Accept ${accepted} of ${r.data.supports.length} services`}
        </Button>
      </Panel>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-0 first:pt-0">
      <h3 className="mb-2 text-caption font-semibold tracking-wide text-ink-500 uppercase">
        {title}
      </h3>
      <dl className="grid gap-x-6 gap-y-1.5 text-small md:grid-cols-[200px_1fr]">{children}</dl>
    </section>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  if (value === "" || value === null || value === undefined) return null;
  return (
    <>
      <dt className="text-ink-500">{label}</dt>
      <dd className="whitespace-pre-line">{value}</dd>
    </>
  );
}

/** The referral exactly as submitted. Intake decisions never change it. */
function ReferralContent({ r }: { r: ReferralDetailDto }) {
  const d = r.data;
  const addr = (a: { street: string; suburb: string; state: string; postcode: string }) =>
    [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", ");
  const contact = (c: { name: string; email: string; phone: string }) =>
    [c.name, c.phone, c.email].filter(Boolean).join(" · ");
  return (
    <Panel title="Referral as submitted">
      <div className="flex flex-col gap-4">
        <Section title="Submitted by">
          <Row label="Name" value={`${d.submitter.name} (${d.submitter.role})`} />
          <Row label="Organisation" value={d.submitter.organisation} />
          <Row
            label="Contact"
            value={[d.submitter.phone, d.submitter.email].filter(Boolean).join(" · ")}
          />
          <Row
            label="Authority"
            value={d.submitter.authorityConfirmed ? "Declared" : "Not declared"}
          />
        </Section>
        <Section title="Participant">
          <Row label="Name" value={`${d.participant.firstName} ${d.participant.lastName}`} />
          <Row label="Date of birth" value={shortDate(`${d.participant.dateOfBirth}T00:00:00Z`)} />
          <Row label="Address" value={addr(d.participant.address)} />
          <Row
            label="Contact"
            value={[d.participant.phone, d.participant.email].filter(Boolean).join(" · ")}
          />
        </Section>
        <Section title="Funding">
          <Row label="Source" value={d.funding.source} />
          {d.funding.source === "NDIS" ? (
            <>
              <Row label="NDIS number" value={d.funding.ndisNumber} />
              <Row label="Plan type" value={d.funding.planType} />
              <Row
                label="Plan end date"
                value={d.funding.planEndDate ? shortDate(`${d.funding.planEndDate}T00:00:00Z`) : ""}
              />
              <Row label="Funding periods" value={d.funding.fundingPeriods} />
              <Row label="Periods" value={periodsLine(d.funding.periods ?? [])} />
              <Row
                label="Plan manager"
                value={[d.funding.planManagerCompany, d.funding.planManagerEmail]
                  .filter(Boolean)
                  .join(" · ")}
              />
            </>
          ) : (
            <Row label="Details" value={d.funding.otherDetails} />
          )}
        </Section>
        <Section title="Contacts">
          <Row label="Support coordinator" value={contact(d.supportCoordinator)} />
          <Row
            label="Agreement signatory"
            value={`${contact(d.signatory)} (${d.signatory.role})`}
          />
          <Row
            label="Booking contact"
            value={`${contact(d.booking)} (${d.booking.role}) · prefers ${d.booking.method.toLowerCase()}${d.booking.preferredTime ? `, ${d.booking.preferredTime}` : ""}`}
          />
        </Section>
        <Section title="Service location">
          <Row label="Location" value={d.location.type} />
          <Row
            label="Address"
            value={
              d.location.type === "Telehealth"
                ? ""
                : d.location.sameAsHome
                  ? "Same as current address"
                  : addr(d.location.address)
            }
          />
          <Row
            label="Location contact"
            value={[d.location.contactName, d.location.contactPhone, d.location.contactEmail]
              .filter(Boolean)
              .join(" · ")}
          />
          <Row label="Access notes" value={d.location.contactNotes} />
        </Section>
        <Section title="Supports requested">
          {d.supports.map((s) => (
            <Row
              key={s.support}
              label={s.support}
              value={
                supportLine(s).split(" · ").slice(1).join(" · ") +
                (s.details ? ` · ${s.details}` : "")
              }
            />
          ))}
        </Section>
        <Section title="Health and safety (as reported)">
          <Row label="Diagnosis" value={d.clinical.diagnosis || "Not given"} />
          <Row
            label="Behaviours of concern"
            value={`${d.clinical.behaviours}${d.clinical.behavioursDetails ? `: ${d.clinical.behavioursDetails}` : ""}`}
          />
          <Row
            label="Known risk"
            value={`${d.clinical.knownRisk}${d.clinical.riskDetails ? `: ${d.clinical.riskDetails}` : ""}`}
          />
          <Row
            label="Person present"
            value={d.clinical.personPresent ? d.clinical.personPresentDetails : "Not required"}
          />
        </Section>
        <Section title="Goals and comments">
          <Row label="NDIS goals" value={d.goals || "Not given"} />
          <Row label="Comments" value={d.comments} />
        </Section>
      </div>
    </Panel>
  );
}

const reasonCopy = {
  waitlist: { title: "Waitlist this referral", label: "Why is it waitlisted?", button: "Waitlist" },
  decline: {
    title: "Decline this referral",
    label: "Reason (shared with the submitter by phone)",
    button: "Decline",
  },
  withdraw: { title: "Withdraw this referral", label: "Why is it withdrawn?", button: "Withdraw" },
};

function ReasonSheet({
  kind,
  busy,
  onClose,
  onSubmit,
}: {
  kind: "waitlist" | "decline" | "withdraw";
  busy: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const copy = reasonCopy[kind];
  return (
    <Sheet
      title={copy.title}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || !reason.trim()}
            onClick={() => onSubmit(reason)}
          >
            {copy.button}
          </Button>
        </div>
      }
    >
      <TextArea
        label={copy.label}
        required
        value={reason}
        onChange={setReason}
        rows={4}
        maxLength={1000}
      />
    </Sheet>
  );
}

/**
 * AI referral review (section 13): suggestions for what's missing or unclear. Each one is chosen
 * by a person before anything is sent.
 */
function AiReview({ id, onUse }: { id: string; onUse: (items: Gap[]) => void }) {
  type Item = { field: string; label: string; why: string };
  const [items, setItems] = useState<Item[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setFail(null);
    try {
      const found = (
        await api<{ items: Item[] }>(`/api/care/referrals/${id}/ai-review`, { method: "POST" })
      ).items;
      setItems(found);
      setPicked(found.map((i) => i.field + i.label));
    } catch (e) {
      setFail(e instanceof Error ? e.message : "AI isn't available.");
    } finally {
      setBusy(false);
    }
  }

  const chosen = (items ?? []).filter((i) => picked.includes(i.field + i.label));

  return (
    <section
      data-ai-only
      aria-labelledby="ai-review"
      className="overflow-hidden rounded-card surface-draft"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5">
        <div>
          <h2
            id="ai-review"
            className="flex items-center gap-2 text-section font-semibold text-ink-900"
          >
            <AiIcon className="size-4" /> AI completeness review
          </h2>
          <p className="text-caption text-ink-500">
            Reads the referral for anything a clinician would need that&apos;s missing or unclear ·
            suggestions only
          </p>
        </div>
        <Button size="sm" loading={busy} onClick={run}>
          {busy ? "Reviewing…" : items ? "Review again" : "Review with AI"}
        </Button>
      </div>

      {busy && !items && (
        <div role="status" aria-label="Reviewing" className="flex flex-col gap-2 px-5 pb-5">
          <span className="ai-shimmer h-3 w-11/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-8/12 rounded-tag" />
          <span className="ai-shimmer h-3 w-10/12 rounded-tag" />
        </div>
      )}
      {fail && <p className="px-5 pb-4 text-small text-over">{fail}</p>}

      {items && (
        <>
          {items.length === 0 ? (
            <p className="border-t border-draft-rule/60 px-5 py-4 text-small text-ink-700">
              Nothing missing found. You still verify the checks above.
            </p>
          ) : (
            <ul className="border-t border-draft-rule/60 bg-surface">
              {items.map((i) => {
                const key = i.field + i.label;
                const on = picked.includes(key);
                return (
                  <li key={key} className="border-b border-border last:border-0">
                    <label className="flex cursor-pointer gap-3 px-5 py-3 hover:bg-sunken/60">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={(e) =>
                          setPicked((list) =>
                            e.target.checked ? [...list, key] : list.filter((k) => k !== key),
                          )
                        }
                        className="mt-0.5 size-4 flex-none accent-(--color-accent-fill)"
                      />
                      <span className="min-w-0">
                        <span className="block text-small font-semibold text-ink-900">
                          {i.label}
                        </span>
                        <span className="block text-small text-ink-700">{i.why}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-draft-rule/60 px-5 py-3">
              <p className="text-caption text-ink-500">
                {chosen.length} of {items.length} selected · nothing is sent until you choose
              </p>
              <Button
                size="sm"
                disabled={!chosen.length}
                onClick={() =>
                  onUse(chosen.map((i) => ({ field: `ai:${i.field}`, label: i.label })))
                }
              >
                Add to a request
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** "1 Jul 2026 to 30 Sep 2026; 1 Oct 2026 to 31 Dec 2026". */
function periodsLine(periods: { start: string; end: string }[]) {
  return periods
    .filter((p) => p.start || p.end)
    .map(
      (p) =>
        `${p.start ? shortDate(`${p.start}T00:00:00Z`) : "?"} to ${p.end ? shortDate(`${p.end}T00:00:00Z`) : "?"}`,
    )
    .join("; ");
}

const decisionTone = { Accepted: "healthy", Waitlisted: "watch", Declined: "over" } as const;

/** After acceptance: what happened to each requested service, and starting a waitlisted one. */
function ServiceOutcomes({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  const [who, setWho] = useState<Record<number, Discipline>>({});
  return (
    <ul className="mb-4 flex flex-col divide-y divide-border rounded-card border border-border">
      {r.services.map((x) => {
        const support = r.data.supports[x.index];
        const isOther = support?.support === "Other";
        return (
          <li key={x.index} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-small font-semibold">{x.support}</p>
              {x.reason && <p className="text-caption text-ink-500">{x.reason}</p>}
            </div>
            <Tag tone={decisionTone[x.decision]}>
              {x.decision === "Accepted" ? "Service request created" : x.decision}
            </Tag>
            {x.decision === "Waitlisted" && (
              <div className="flex items-center gap-2">
                {isOther && (
                  <Select
                    aria-label="Who delivers it"
                    value={who[x.index] ?? ""}
                    onChange={(e) =>
                      setWho((w) => ({ ...w, [x.index]: e.target.value as Discipline }))
                    }
                  >
                    <option value="">Who delivers it…</option>
                    {disciplines.map((dsc) => (
                      <option key={dsc}>{dsc}</option>
                    ))}
                  </Select>
                )}
                <Button
                  size="sm"
                  disabled={busy || (isOther && !who[x.index])}
                  onClick={() =>
                    act({ type: "start-service", index: x.index, discipline: who[x.index] })
                  }
                >
                  Start now
                </Button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const documentTone = {
  "Pending review": "monitor",
  Accepted: "healthy",
  Rejected: "over",
  Superseded: "neutral",
} as const;

/** Referral documents with their review state: accept, reject with a reason, or replace. */
function ReferralDocuments({
  r,
  busy,
  act,
  onChanged,
}: {
  r: ReferralDetailDto;
  busy: boolean;
  act: Act;
  onChanged: () => void;
}) {
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [uploading, setUploading] = useState<string | null>(null);
  const [fail, setFail] = useState<string | null>(null);
  const current = r.documents.filter((d) => d.status !== "Superseded");
  const earlier = r.documents.filter((d) => d.status === "Superseded");

  async function replace(id: string, file: File) {
    setUploading(id);
    setFail(null);
    try {
      const body = new FormData();
      body.append("files", file);
      body.append("kinds", "Other");
      body.append("answer", id);
      const res = await fetch(`/api/care/referrals/${r.id}/documents`, { method: "POST", body });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "The file couldn't be uploaded.");
      }
      onChanged();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "The file couldn't be uploaded.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <Panel title="Documents">
      {current.length === 0 ? (
        <p className="text-small text-ink-500">No documents attached.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {current.map((d) => (
            <li key={d.id} className="rounded-control border border-border p-3">
              <div className="flex flex-wrap items-start gap-3">
                <a
                  href={`/api/documents/${d.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 hover:no-underline"
                >
                  <span className="block truncate text-small font-semibold text-ink-900">
                    {d.name}
                  </span>
                  <span className="block text-caption text-ink-500">
                    {d.kind} · version {d.version ?? 1} · {Math.max(1, Math.round(d.size / 1024))}{" "}
                    KB · {d.uploadedBy}, {relativeTime(d.at)}
                  </span>
                </a>
                <Tag tone={documentTone[d.status ?? "Pending review"]}>
                  {d.status ?? "Pending review"}
                </Tag>
              </div>
              {d.review && (
                <p className="mt-2 text-caption text-ink-700">
                  {d.status} by {d.review.byName}, {relativeTime(d.review.at)}
                  {d.review.reason && `: ${d.review.reason}`}
                </p>
              )}
              {rejecting === d.id ? (
                <div className="mt-3 flex flex-col gap-2">
                  <TextArea
                    label="Why it's rejected"
                    required
                    rows={2}
                    value={reason}
                    onChange={setReason}
                    placeholder="For example, the plan pages are from the previous plan"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={busy || !reason.trim()}
                      onClick={async () => {
                        const ok = await act({
                          type: "document-review",
                          documentId: d.id,
                          decision: "Rejected",
                          reason,
                        });
                        if (ok) {
                          setRejecting(null);
                          setReason("");
                        }
                      }}
                    >
                      Reject document
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setRejecting(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 flex flex-wrap gap-2">
                  {d.status !== "Accepted" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        act({
                          type: "document-review",
                          documentId: d.id,
                          decision: "Accepted",
                          reason: "",
                        })
                      }
                    >
                      <Check className="size-3.5" aria-hidden="true" />
                      Accept
                    </Button>
                  )}
                  {d.status !== "Rejected" && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setRejecting(d.id);
                        setReason("");
                      }}
                    >
                      Reject
                    </Button>
                  )}
                  <label
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border border-border-strong px-3 text-caption font-semibold hover:bg-canvas",
                      uploading === d.id && "pointer-events-none opacity-60",
                    )}
                  >
                    {uploading === d.id ? "Uploading…" : "Replace with new version"}
                    <input
                      type="file"
                      className="sr-only"
                      accept=".pdf,.jpg,.jpeg,.png,.docx"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (file) void replace(d.id, file);
                      }}
                    />
                  </label>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {fail && (
        <p role="alert" className="mt-3 text-small text-over">
          {fail}
        </p>
      )}
      {earlier.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-small font-semibold text-ink-700">
            Earlier versions ({earlier.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {earlier.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-caption text-ink-500">
                <a href={`/api/documents/${d.id}`} target="_blank" rel="noreferrer">
                  {d.name}
                </a>
                · version {d.version ?? 1} · replaced
                {d.review ? ` · was ${d.review.reason ? "rejected" : "reviewed"}` : ""}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Panel>
  );
}

/**
 * Module 06: opens (or starts) the detailed funding record for this referral, without needing a
 * participant account (AT-01). Everything starts participant-reported.
 */
function FundingRecordLink({ referralId }: { referralId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-accent-tint bg-accent-tint/40 px-4 py-3">
      <span className="min-w-0 flex-1 text-small text-ink-700">
        Plan evidence, budgets, payers and the service agreement are kept in the funding record.
      </span>
      <Button
        size="sm"
        variant="soft"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await api<{ planId: string; clientId: string | null }>(
              "/api/care/funding",
              {
                body: { type: "from-referral", referralId },
              },
            );
            if (res.clientId) router.push(`/care/funding/${res.clientId}`);
            else {
              toast("Funding draft created", {
                tone: "success",
                detail: "It joins the participant record when the referral is accepted.",
              });
            }
          } catch (e) {
            toast("Couldn't open the funding record", {
              tone: "error",
              detail: e instanceof Error ? e.message : "",
            });
          } finally {
            setBusy(false);
          }
        }}
      >
        Open funding record
      </Button>
    </div>
  );
}
