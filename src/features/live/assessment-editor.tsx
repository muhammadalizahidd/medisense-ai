"use client";

import {
  ArrowLeft,
  CircleCheck,
  FileCheck2,
  Lock,
  Plus,
  Send,
  Sparkles,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/sheet";
import { Tag } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import {
  activityFrequencies,
  activityNames,
  applicability,
  assessmentGaps,
  assistanceLevels,
  participationStatuses,
  recommendations,
  safetyLevels,
  type ActivityRecord,
  type AssessmentDto,
} from "@/lib/live/clinical";
import { relativeTime, shortDate } from "@/lib/live/time";
import { cn } from "@/lib/cn";
import { ErrorNote, Panel, Skeleton } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";

type Draft = Pick<
  AssessmentDto,
  "consent" | "sections" | "activities" | "findings" | "limitations" | "recommendation"
>;

export function AssessmentEditor({ id }: { id: string }) {
  const { data, error, reload } = useResource<{ assessment: AssessmentDto }>(
    `/api/clinical/assessments/${id}`,
  );
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-150" />;
  return <Editor key={data.assessment.status} a={data.assessment} reload={reload} />;
}

function Editor({ a, reload }: { a: AssessmentDto; reload: () => void }) {
  const [draft, setDraft] = useState<Draft>({
    consent: a.consent,
    sections: a.sections,
    activities: a.activities,
    findings: a.findings,
    limitations: a.limitations,
    recommendation: a.recommendation,
  });
  const [saved, setSaved] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const first = useRef(true);
  const editable = a.canEdit;

  // Autosave: a draft persists if the visit is cut short, and resumes at the next one.
  useEffect(() => {
    if (first.current || !editable) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaved("saving");
      api(`/api/clinical/assessments/${a.id}`, { method: "PUT", body: draft })
        .then(() => setSaved("saved"))
        .catch(() => setSaved("error"));
    }, 800);
    return () => clearTimeout(t);
  }, [draft, a.id, editable]);

  const gaps = assessmentGaps({ ...draft, support: a.support, discipline: a.discipline });
  const setSection = (key: string, part: Partial<Draft["sections"][string]>) =>
    setDraft((d) => ({
      ...d,
      sections: { ...d.sections, [key]: { ...d.sections[key]!, ...part } },
    }));

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      if (editable) await api(`/api/clinical/assessments/${a.id}`, { method: "PUT", body: draft });
      await api(`/api/clinical/assessments/${a.id}`, { body });
      reload();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href={`/therapist/patients/${a.clientId}`} variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {a.clientName}
          </ButtonLink>
        }
        title={a.template.title}
        description={`${a.kind} assessment · ${a.therapistName} · started ${shortDate(a.createdAt)}`}
        actions={
          <div className="flex items-center gap-2">
            {editable && (
              <span className="on-light text-caption text-ink-500">
                {saved === "saving"
                  ? "Saving…"
                  : saved === "error"
                    ? "Not saved: check connection"
                    : "Draft saved"}
              </span>
            )}
            <Tag tone={a.status === "Signed" || a.status === "Amended" ? "healthy" : "monitor"}>
              {a.status}
            </Tag>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel title="Consent">
            <Tick
              checked={draft.consent.obtained}
              onChange={(v) =>
                editable && setDraft((d) => ({ ...d, consent: { ...d.consent, obtained: v } }))
              }
            >
              The participant (or their authorised representative) consents to this assessment and
              to information sharing with the care team.
            </Tick>
            <div className="mt-3">
              <TextField
                label="Consent notes"
                value={draft.consent.notes}
                onChange={(v) =>
                  editable && setDraft((d) => ({ ...d, consent: { ...d.consent, notes: v } }))
                }
                placeholder="Who gave consent, and how"
              />
            </div>
          </Panel>

          {a.template.sections.map((s) => {
            const e = draft.sections[s.key] ?? {
              applicability: "",
              reason: "",
              reported: "",
              observed: "",
              measure: "",
            };
            return (
              <Panel
                key={s.key}
                title={s.title}
                action={
                  e.applicability ? (
                    <Tag tone={e.applicability === "Applicable" ? "available" : "neutral"}>
                      {e.applicability}
                    </Tag>
                  ) : undefined
                }
              >
                {s.prompts && <p className="-mt-2 mb-3 text-caption text-ink-500">{s.prompts}</p>}
                <fieldset disabled={!editable} className="flex flex-col gap-3">
                  <Choice
                    label="Applicability"
                    options={applicability}
                    value={e.applicability}
                    onChange={(v) => setSection(s.key, { applicability: v })}
                  />
                  {e.applicability === "Applicable" && (
                    <div className="grid gap-3 md:grid-cols-2">
                      <TextArea
                        label="Reported (participant or carer)"
                        value={e.reported}
                        onChange={(v) => setSection(s.key, { reported: v })}
                        rows={3}
                      />
                      <TextArea
                        label="Observed by you"
                        value={e.observed}
                        onChange={(v) => setSection(s.key, { observed: v })}
                        rows={3}
                      />
                      <div className="md:col-span-2">
                        <TextField
                          label="Measure (value, unit, tool or method)"
                          value={e.measure}
                          onChange={(v) => setSection(s.key, { measure: v })}
                          hint="Enter what you measured. Nothing is calculated for you."
                        />
                      </div>
                    </div>
                  )}
                  {e.applicability && e.applicability !== "Applicable" && (
                    <TextField
                      label="Reason"
                      required
                      value={e.reason}
                      onChange={(v) => setSection(s.key, { reason: v })}
                    />
                  )}
                </fieldset>
              </Panel>
            );
          })}

          <Panel
            title="Functional activities"
            action={
              editable && (
                <Button
                  size="sm"
                  onClick={() =>
                    setDraft((d) => ({ ...d, activities: [...d.activities, blankActivity()] }))
                  }
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add activity
                </Button>
              )
            }
          >
            {draft.activities.length === 0 ? (
              <p className="text-small text-ink-500">
                Record each meaningful activity: how it was assessed, the assistance needed and any
                safety concern.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                {draft.activities.map((act, i) => (
                  <ActivityRow
                    key={act.id}
                    value={act}
                    disabled={!editable}
                    onChange={(next) =>
                      setDraft((d) => ({
                        ...d,
                        activities: d.activities.map((x, j) => (j === i ? next : x)),
                      }))
                    }
                    onRemove={() =>
                      setDraft((d) => ({
                        ...d,
                        activities: d.activities.filter((_, j) => j !== i),
                      }))
                    }
                  />
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Clinical synthesis and recommendation">
            <fieldset disabled={!editable} className="flex flex-col gap-4">
              <TextArea
                label="Findings"
                required
                value={draft.findings}
                onChange={(v) => setDraft((d) => ({ ...d, findings: v }))}
                rows={5}
                hint="Observed findings and reported information, kept distinct."
              />
              <TextArea
                label="Limitations"
                value={draft.limitations}
                onChange={(v) => setDraft((d) => ({ ...d, limitations: v }))}
                rows={2}
              />
              <Choice
                label="Recommendation"
                options={recommendations}
                value={draft.recommendation.decision}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, recommendation: { ...d.recommendation, decision: v } }))
                }
              />
              <TextArea
                label="Recommendation notes"
                value={draft.recommendation.notes}
                onChange={(v) =>
                  setDraft((d) => ({ ...d, recommendation: { ...d.recommendation, notes: v } }))
                }
                rows={2}
              />
            </fieldset>
          </Panel>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          <div className="flex flex-col gap-6 xl:sticky xl:top-6">
            {editable ? (
              <Panel title="Before signing">
                {gaps.length === 0 ? (
                  <p className="flex items-center gap-2 text-small text-healthy">
                    <CircleCheck className="size-4" aria-hidden="true" /> Every safeguard is met.
                  </p>
                ) : (
                  <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto text-small">
                    {gaps.map((g) => (
                      <li key={g} className="flex gap-2">
                        <TriangleAlert
                          className="mt-0.5 size-3.5 flex-none text-monitor"
                          aria-hidden="true"
                        />
                        {g}
                      </li>
                    ))}
                  </ul>
                )}
                <Button
                  variant="primary"
                  className="mt-4 w-full"
                  disabled={busy || gaps.length > 0}
                  onClick={() => act({ action: "sign" })}
                >
                  <FileCheck2 className="size-4" aria-hidden="true" />
                  Sign assessment
                </Button>
                <p className="mt-2 text-caption text-ink-500">
                  Signing locks the record. Changes after that are amendments with a reason.
                </p>
                <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => act({ action: "request-review" })}
                  >
                    Request Clinical Lead review
                  </Button>
                  <AiCheck id={a.id} />
                </div>
                <CancelAssessment busy={busy} act={act} />
              </Panel>
            ) : (
              <SignedPanel a={a} busy={busy} act={act} />
            )}
            {fail && (
              <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
                {fail}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function SignedPanel({
  a,
  busy,
  act,
}: {
  a: AssessmentDto;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [summary, setSummary] = useState("");
  const [comment, setComment] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftNote, setDraftNote] = useState<string | null>(null);
  const signed = a.status === "Signed" || a.status === "Amended";
  return (
    <>
      {a.status === "Cancelled" && a.cancelled && (
        <Panel title="Cancelled">
          <p className="text-small">
            {a.cancelled.reason}. {a.cancelled.byName}, {relativeTime(a.cancelled.at)}.
          </p>
        </Panel>
      )}
      {a.status === "Awaiting Review" && (
        <Panel title="Clinical Lead review">
          {a.canReview ? (
            <div className="flex flex-col gap-3">
              <p className="text-small text-ink-700">
                Requested by {a.reviews.at(-1)?.requestedBy}. Your comments go back to the
                clinician, who finishes and signs.
              </p>
              <TextArea
                label="Review comments"
                required
                value={comment}
                onChange={setComment}
                rows={4}
              />
              <Button
                variant="primary"
                disabled={busy || comment.trim().length < 3}
                onClick={() => act({ action: "review", comment })}
              >
                Return with comments
              </Button>
            </div>
          ) : (
            <p className="text-small text-ink-700">
              Waiting for a Clinical Lead. Editing resumes when they return it.
            </p>
          )}
        </Panel>
      )}
      {a.reviews.some((r) => r.comment) && (
        <Panel title="Review comments">
          <ol className="flex flex-col gap-2 text-small">
            {a.reviews
              .filter((r) => r.comment)
              .map((r) => (
                <li key={r.requestedAt}>
                  {r.comment}
                  <span className="block text-caption text-ink-500">
                    {r.reviewedBy} · {r.reviewedAt ? relativeTime(r.reviewedAt) : ""}
                  </span>
                </li>
              ))}
          </ol>
        </Panel>
      )}
      <Panel title="Record">
        <p className="flex items-center gap-2 text-small">
          <Lock className="size-4 text-accent" aria-hidden="true" />
          {a.signed ? `Signed by ${a.signed.byName}, ${relativeTime(a.signed.at)}.` : "Read only."}
        </p>
        {a.recommendation.decision && (
          <p className="mt-2 text-small">
            Recommendation: <strong>{a.recommendation.decision}</strong>
          </p>
        )}
        {a.amendments.map((m) => (
          <div
            key={m.at}
            className="mt-3 rounded-control border border-border px-3 py-2 text-small"
          >
            <p className="font-semibold">Amendment: {m.reason}</p>
            <p className="whitespace-pre-line">{m.text}</p>
            <p className="text-caption text-ink-500">
              {m.byName} · {relativeTime(m.at)}
            </p>
          </div>
        ))}
      </Panel>
      {signed && (
        <Panel title="Report for the participant">
          {a.released ? (
            <p className="text-small">
              Released {relativeTime(a.released.at)} by {a.released.byName}.
              <span className="mt-2 block whitespace-pre-line text-ink-700">
                {a.released.summary}
              </span>
            </p>
          ) : (
            <>
              <Button
                size="sm"
                className="mb-3"
                disabled={drafting}
                onClick={async () => {
                  setDrafting(true);
                  setDraftNote(null);
                  try {
                    const d = await api<{ summary: string; sources: string[] }>(
                      `/api/clinical/assessments/${a.id}`,
                      { body: { action: "ai-report" } },
                    );
                    setSummary(d.summary);
                    setDraftNote(
                      `AI draft from: ${d.sources.join(", ")}. Check it before releasing.`,
                    );
                  } catch (e) {
                    setDraftNote(e instanceof Error ? e.message : "AI isn't available.");
                  } finally {
                    setDrafting(false);
                  }
                }}
              >
                <Sparkles className="size-3.5" aria-hidden="true" />
                {drafting ? "Drafting…" : "Draft with AI"}
              </Button>
              {draftNote && <p className="mb-2 text-caption text-ink-700">{draftNote}</p>}
              <TextArea
                label="Plain-language summary"
                value={summary}
                onChange={setSummary}
                rows={4}
                hint="Only this is shared. Clinical notes and risk records stay private."
              />
              <Button
                className="mt-2"
                disabled={busy || summary.trim().length < 20}
                onClick={() => act({ action: "release", summary })}
              >
                <Send className="size-3.5" aria-hidden="true" />
                Release to participant
              </Button>
            </>
          )}
        </Panel>
      )}
      {signed && (
        <Panel title="Add an amendment">
          <div className="flex flex-col gap-3">
            <TextField label="Reason" required value={reason} onChange={setReason} />
            <TextArea label="Amendment" required value={text} onChange={setText} rows={3} />
            <Button
              disabled={busy || reason.length < 5 || text.length < 5}
              onClick={() => act({ action: "amend", reason, text })}
            >
              Add amendment
            </Button>
          </div>
        </Panel>
      )}
    </>
  );
}

const blankActivity = (): ActivityRecord => ({
  id: crypto.randomUUID(),
  activity: "Dressing",
  custom: "",
  participation: "Observed",
  assistance: "Independent",
  frequency: "Daily",
  environment: "",
  safety: "None identified",
  safetyNotes: "",
  observation: "",
  reported: "",
});

function ActivityRow({
  value,
  disabled,
  onChange,
  onRemove,
}: {
  value: ActivityRecord;
  disabled: boolean;
  onChange: (next: ActivityRecord) => void;
  onRemove: () => void;
}) {
  const set = <K extends keyof ActivityRecord>(k: K, v: ActivityRecord[K]) =>
    onChange({ ...value, [k]: v });
  const pick = <T extends string>(
    label: string,
    options: readonly T[],
    v: T,
    on: (x: T) => void,
  ) => (
    <Field label={label}>
      <Select value={v} disabled={disabled} onChange={(e) => on(e.target.value as T)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </Select>
    </Field>
  );
  return (
    <fieldset
      disabled={disabled}
      className={cn(
        "rounded-card border border-border p-4",
        value.safety === "Concern identified" && "border-over",
      )}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {pick("Activity", activityNames, value.activity, (v) => set("activity", v))}
        {pick("How assessed", participationStatuses, value.participation, (v) =>
          set("participation", v),
        )}
        {pick("Assistance", assistanceLevels, value.assistance, (v) => set("assistance", v))}
        {pick("Frequency", activityFrequencies, value.frequency, (v) => set("frequency", v))}
        {pick("Safety", safetyLevels, value.safety, (v) => set("safety", v))}
        {value.activity === "Other" ? (
          <TextField
            label="Activity name"
            value={value.custom}
            onChange={(v) => set("custom", v)}
          />
        ) : (
          <TextField
            label="Conditions and environment"
            value={value.environment}
            onChange={(v) => set("environment", v)}
          />
        )}
        <div className="grid gap-3 md:col-span-3 md:grid-cols-2">
          <TextArea
            label="Observation"
            value={value.observation}
            onChange={(v) => set("observation", v)}
            rows={2}
          />
          <TextArea
            label="Reported view"
            value={value.reported}
            onChange={(v) => set("reported", v)}
            rows={2}
          />
        </div>
        {value.safety !== "None identified" && (
          <div className="md:col-span-3">
            <TextField
              label="Safety details and escalation"
              value={value.safetyNotes}
              onChange={(v) => set("safetyNotes", v)}
            />
          </div>
        )}
      </div>
      {!disabled && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={onRemove}>
          <Trash2 className="size-3.5" aria-hidden="true" />
          Remove
        </Button>
      )}
    </fieldset>
  );
}

/** AI gap detection (section 13): unanswered essentials and inconsistent values. You resolve them. */
function AiCheck({ id }: { id: string }) {
  const [issues, setIssues] = useState<{ section: string; issue: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  return (
    <div className="w-full">
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFail(null);
          try {
            await new Promise((r) => setTimeout(r, 900)); // let the autosave land first
            const res = await api<{ issues: { section: string; issue: string }[] }>(
              `/api/clinical/assessments/${id}`,
              { body: { action: "ai-check" } },
            );
            setIssues(res.issues);
          } catch (e) {
            setFail(e instanceof Error ? e.message : "AI isn't available.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        {busy ? "Checking…" : "AI consistency check"}
      </Button>
      {fail && <p className="mt-1 text-caption text-over">{fail}</p>}
      {issues && (
        <div className="mt-3 rounded-control bg-accent-tint p-3 text-small">
          {issues.length === 0 ? (
            <p>AI found no gaps or inconsistencies. You still decide.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {issues.map((i) => (
                <li key={i.section + i.issue}>
                  <strong>{i.section}:</strong> {i.issue}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function CancelAssessment({
  busy,
  act,
}: {
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  return (
    <div className="mt-3">
      {open ? (
        <div className="flex flex-col gap-2">
          <TextField
            label="Why it isn't going ahead"
            required
            value={reason}
            onChange={setReason}
          />
          <Button
            size="sm"
            disabled={busy || reason.trim().length < 3}
            onClick={() => act({ action: "cancel", reason })}
          >
            Cancel assessment
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          Not assessed? Cancel with a reason
        </Button>
      )}
    </div>
  );
}
