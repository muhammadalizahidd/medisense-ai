"use client";

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CircleCheck,
  ShieldAlert,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/sheet";
import { Sheet } from "@/components/ui/sheet";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { api, useResource, useSession } from "@/lib/live/client";
import { disciplines, regions, type Discipline } from "@/lib/live/catalogue";
import { needsRiskReview, supportLine, type Gap } from "@/lib/live/referral";
import { ageLabel, relativeTime, shortDate } from "@/lib/live/time";
import type { ReferralDetailDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { DocumentList } from "./client-detail";
import { Choice, TextArea, Tick } from "./form-bits";
import { ReferralStatusTag } from "./referral-queue";

const stages = [
  { label: "Received", statuses: ["Submitted"] },
  { label: "Intake review", statuses: ["Under Admin Review", "Needs Information"] },
  { label: "Clinical triage", statuses: ["Clinical Triage"] },
  { label: "Funding and consent", statuses: ["Funding Review"] },
  { label: "Ready for matching", statuses: ["Accepted", "Closed"] },
];

type Invite = { inviteCode?: string; inviteExpires?: string; clientId?: string };

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
              <Button
                size="sm"
                className="on-light"
                disabled={busy}
                onClick={() => act({ type: "take-ownership" })}
              >
                <UserRound className="size-3.5" aria-hidden="true" />
                {r.owner ? `Take over from ${r.owner.split(" ")[0]}` : "Take ownership"}
              </Button>
            )}
            {open && r.status !== "Waitlisted" && (
              <Button size="sm" className="on-light" onClick={() => setSheet("waitlist")}>
                Waitlist
              </Button>
            )}
            {open && (
              <>
                <Button size="sm" className="on-light" onClick={() => setSheet("decline")}>
                  Decline
                </Button>
                <Button size="sm" className="on-light" onClick={() => setSheet("withdraw")}>
                  Withdraw
                </Button>
              </>
            )}
          </div>
        }
      />

      {r.status !== "Declined" && r.status !== "Withdrawn" && r.status !== "Waitlisted" && (
        <ol aria-label="Referral stages" className="mb-6 grid grid-cols-5 gap-2">
          {stages.map((s, i) => {
            const done = i < at || r.status === "Accepted";
            const now = i === at && r.status !== "Accepted";
            return (
              <li
                key={s.label}
                aria-current={now ? "step" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-control border px-3 py-2 text-caption font-semibold",
                  done
                    ? "border-accent-fill bg-accent-tint text-ink-900"
                    : now
                      ? "border-ink-900 bg-surface text-ink-900 shadow-hairline"
                      : "border-border bg-surface text-ink-500",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 flex-none items-center justify-center rounded-full text-eyebrow",
                    done
                      ? "bg-accent-fill text-on-accent"
                      : now
                        ? "bg-ink-900 text-surface"
                        : "bg-canvas",
                  )}
                >
                  {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span className="truncate">{s.label}</span>
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
        <NextStep r={r} busy={busy} act={act} invite={invite} />
      </TabPanel>
      <TabPanel id="referral" value={tab}>
        <ReferralContent r={r} />
      </TabPanel>
      <TabPanel id="documents" value={tab}>
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Documents">
            {r.documents.length ? (
              <DocumentList documents={r.documents} />
            ) : (
              <p className="text-small text-ink-500">No documents attached.</p>
            )}
          </Panel>
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
}: {
  r: ReferralDetailDto;
  busy: boolean;
  act: Act;
  invite: Invite | null;
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
      return (
        <Panel title="Accepted: ready for matching">
          {invite?.inviteCode && (
            <div className="mb-4 rounded-control border border-border bg-canvas px-4 py-3">
              <p className="text-small text-ink-700">
                Patient app invite code, shown only once. Give it to the participant or their
                booking contact; the app is optional.
              </p>
              <p className="my-2 font-mono text-h2 tracking-widest">{invite.inviteCode}</p>
              {invite.inviteExpires && (
                <p className="text-caption text-ink-500">
                  Valid until {shortDate(invite.inviteExpires)}.
                </p>
              )}
            </div>
          )}
          <p className="mb-4 text-small text-ink-700">
            Each support is now its own service request on the patient&apos;s record. Choose a
            therapist for each one by availability.
          </p>
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

function IntakeReview({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  const [asking, setAsking] = useState(false);
  const [chosen, setChosen] = useState<Gap[]>(r.gapsList);
  const [message, setMessage] = useState("");
  const risk = needsRiskReview(r.data);

  return (
    <Panel title="Intake review" action={<Tag tone="available">Step 3 of the lifecycle</Tag>}>
      <div className="flex flex-col gap-5">
        <AiReview
          id={r.id}
          onUse={(items) =>
            setChosen((list) => [
              ...list,
              ...items.filter((i) => !list.some((c) => c.field === i.field)),
            ])
          }
          onAsk={() => setAsking(true)}
        />
        <section aria-label="Completeness check">
          <h3 className="flex items-center gap-2 text-small font-semibold">
            Completeness check
            <span className="text-caption font-normal text-ink-500">rules, verified by you</span>
          </h3>
          {r.gapsList.length === 0 ? (
            <p className="mt-2 flex items-center gap-2 text-small text-healthy">
              <CircleCheck className="size-4" aria-hidden="true" /> Nothing missing.
            </p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1.5">
              {r.gapsList.map((g) => (
                <li key={g.field} className="flex items-center gap-2 text-small">
                  <i aria-hidden="true" className="size-1.5 rounded-full bg-monitor-dot" />
                  {g.label}
                </li>
              ))}
            </ul>
          )}
        </section>

        {r.duplicatesList.length > 0 && (
          <section
            aria-label="Possible duplicates"
            className="rounded-control border border-monitor-bg bg-monitor-bg/50 p-4"
          >
            <h3 className="flex items-center gap-2 text-small font-semibold">
              <Users className="size-4 text-monitor" aria-hidden="true" /> Possible duplicate
            </h3>
            <p className="mt-1 text-caption text-ink-700">
              Records are never merged automatically. Check the details and decide.
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {r.duplicatesList.map((dup) => (
                <li
                  key={dup.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface px-3 py-2"
                >
                  <span className="text-small">
                    {dup.kind === "patient" ? (
                      <Link href={`/care/${dup.id}`} className="font-semibold">
                        {dup.name}
                      </Link>
                    ) : (
                      <Link href={`/care/referrals/${dup.id}`} className="font-semibold">
                        {dup.name}
                      </Link>
                    )}
                    <span className="block text-caption text-ink-500">
                      {dup.kind === "patient" ? "Existing patient" : "Open referral"}: {dup.why}
                    </span>
                  </span>
                  {dup.kind === "patient" && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => act({ type: "duplicate", clientId: dup.id })}
                    >
                      Same person: add to their record
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <Button
              size="sm"
              variant="ghost"
              className="mt-2"
              disabled={busy}
              onClick={() => act({ type: "duplicate", clientId: null })}
            >
              Not the same person
            </Button>
          </section>
        )}
        {r.duplicateDecision && (
          <p className="text-small text-ink-700">
            {r.duplicateDecision.clientId ? (
              <>
                Linked to an{" "}
                <Link href={`/care/${r.duplicateDecision.clientId}`} className="font-semibold">
                  existing patient
                </Link>
                ; services will be added to their record.
              </>
            ) : (
              "Confirmed as a new person."
            )}{" "}
            <span className="text-caption text-ink-500">({r.duplicateDecision.byName})</span>
          </p>
        )}

        <RegionPicker r={r} busy={busy} act={act} />

        {risk && (
          <p className="flex gap-2 rounded-control bg-over-bg px-3 py-2 text-small text-over">
            <AlertTriangle className="mt-0.5 size-4 flex-none" aria-hidden="true" />A risk or
            behaviours of concern are reported (Yes or Unknown). Clinical triage must review it
            before any therapist is matched.
          </p>
        )}

        {asking ? (
          <div className="flex flex-col gap-3 rounded-control border border-border p-4">
            <p className="text-small font-semibold">What do you need from the submitter?</p>
            {[
              ...r.gapsList,
              ...chosen.filter((c) => !r.gapsList.some((g) => g.field === c.field)),
            ].map((g) => (
              <Tick
                key={g.field}
                checked={chosen.some((c) => c.field === g.field)}
                onChange={(on) =>
                  setChosen((list) => (on ? [...list, g] : list.filter((c) => c.field !== g.field)))
                }
              >
                {g.label}
              </Tick>
            ))}
            <TextArea
              label="Message"
              value={message}
              onChange={setMessage}
              rows={3}
              placeholder="Anything else you need, in plain words"
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={busy || (!chosen.length && !message.trim())}
                onClick={async () => {
                  if (await act({ type: "request-info", items: chosen, message })) setAsking(false);
                }}
              >
                Send request
              </Button>
              <Button variant="ghost" onClick={() => setAsking(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button
              variant="primary"
              disabled={busy || (r.duplicatesList.length > 0 && !r.duplicateDecision)}
              onClick={() => act({ type: "to-triage", note: "" })}
            >
              Send to clinical triage
            </Button>
            <Button disabled={busy} onClick={() => setAsking(true)}>
              Request information
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}

function RegionPicker({ r, busy, act }: { r: ReferralDetailDto; busy: boolean; act: Act }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="w-56">
        <Field
          label="Service region for matching"
          hint={r.region ? "Suggested from the postcode" : "Not recognised from the postcode"}
        >
          <Select
            value={r.region ?? ""}
            disabled={busy}
            onChange={(e) => e.target.value && act({ type: "set-region", region: e.target.value })}
          >
            {!r.region && <option value="">Choose…</option>}
            {regions.map((region) => (
              <option key={region}>{region}</option>
            ))}
          </Select>
        </Field>
      </div>
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
  const c = r.data.clinical;

  return (
    <Panel
      title="Clinical suitability and safety"
      action={<Tag tone="live">Step 4 of the lifecycle</Tag>}
    >
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
            />
            {risk && decision === "Accepted" && (
              <>
                <TextArea
                  label="How the risk will be managed"
                  required
                  value={riskAction}
                  onChange={setRiskAction}
                  rows={3}
                  placeholder="For example, two-person visit for the first session; carer present"
                />
                <TextArea
                  label="Precaution every therapist sees before visiting"
                  required
                  value={precaution}
                  onChange={setPrecaution}
                  rows={2}
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
            <div>
              <Button
                variant="primary"
                disabled={busy || !notes.trim()}
                onClick={() => act({ type: "triage", decision, notes, riskAction, precaution })}
              >
                Record decision
              </Button>
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
  const f = r.data.funding;

  const blockers = [
    !saved && "Save the funding review.",
    saved && !saved.consentRecorded && "Record the participant's consent.",
    saved?.agreement === "Sent" && "The service agreement isn't signed yet.",
    !r.region && "Set the service region.",
    r.triage?.decision !== "Accepted" && "Clinical triage hasn't accepted it.",
    others.some(({ i }) => !otherDisciplines[String(i)]) &&
      'Choose who delivers each "Other" support.',
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
      <Panel
        title="Payment path and consent"
        action={<Tag tone="live">Step 5 of the lifecycle</Tag>}
      >
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
        </div>
      </Panel>
      <Panel title="Accept the referral">
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
          with {r.data.supports.length} service request{r.data.supports.length === 1 ? "" : "s"},
          ready for therapist matching.
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
          onClick={() => act({ type: "accept", otherDisciplines })}
        >
          Accept and create service requests
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

/** AI referral review (section 13): a missing-information checklist. The admin verifies each item. */
function AiReview({
  id,
  onUse,
  onAsk,
}: {
  id: string;
  onUse: (items: Gap[]) => void;
  onAsk: () => void;
}) {
  const [items, setItems] = useState<{ field: string; label: string; why: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  return (
    <section
      aria-label="AI review"
      className="rounded-card border border-accent/30 bg-accent-tint p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-small font-semibold">
          <Sparkles className="size-4 text-accent" aria-hidden="true" /> AI completeness review
        </p>
        <Button
          size="sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFail(null);
            try {
              setItems(
                (
                  await api<{ items: { field: string; label: string; why: string }[] }>(
                    `/api/care/referrals/${id}/ai-review`,
                    { method: "POST" },
                  )
                ).items,
              );
            } catch (e) {
              setFail(e instanceof Error ? e.message : "AI isn't available.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Reviewing…" : items ? "Review again" : "Review with AI"}
        </Button>
      </div>
      {fail && <p className="mt-2 text-caption text-over">{fail}</p>}
      {items && (
        <>
          {items.length === 0 ? (
            <p className="mt-2 text-small">AI found nothing missing. You still verify.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5 text-small">
              {items.map((i) => (
                <li key={i.field + i.label}>
                  <strong>{i.label}</strong> <span className="text-ink-700">· {i.why}</span>
                </li>
              ))}
            </ul>
          )}
          {items.length > 0 && (
            <Button
              size="sm"
              className="mt-3"
              onClick={() => {
                onUse(items.map((i) => ({ field: `ai:${i.field}`, label: i.label })));
                onAsk();
              }}
            >
              Add to a request for information
            </Button>
          )}
          <p className="mt-2 text-caption text-ink-500">
            Suggestions only: nothing is sent until you choose.
          </p>
        </>
      )}
    </section>
  );
}
