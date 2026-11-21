"use client";

import { ArrowLeft, CheckCircle2, Plus, Target, Trash2 } from "lucide-react";
import { AiIcon } from "@/components/ai/provenance";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/ui/sheet";
import { Tag, type TagTone } from "@/components/ui/tag";
import { api, useResource } from "@/lib/live/client";
import {
  goalDomains,
  goalStatuses,
  reviewDecisions,
  type GoalDto,
  type GoalStatus,
  type PlanDto,
  type PlanStatus,
  type ReviewDecision,
} from "@/lib/live/clinical";
import { relativeTime, shortDate } from "@/lib/live/time";
import { ErrorNote, Panel, Skeleton } from "./bits";
import { Choice, TextArea, TextField } from "./form-bits";

export const planTone: Record<PlanStatus, TagTone> = {
  Draft: "monitor",
  Active: "healthy",
  "Under Review": "live",
  Revised: "monitor",
  Completed: "neutral",
  Discontinued: "neutral",
};

type Editable = Pick<
  PlanDto,
  "indication" | "goals" | "interventions" | "precautions" | "frequency" | "duration" | "reviewDate"
>;

export function PlanEditor({ id }: { id: string }) {
  const { data, error, reload } = useResource<{ plan: PlanDto }>(`/api/clinical/plans/${id}`);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-150" />;
  return <Plan key={`${data.plan.status}-${data.plan.version}`} p={data.plan} reload={reload} />;
}

const blankGoal = (): GoalDto => ({
  id: crypto.randomUUID(),
  description: "",
  domain: "Self-care",
  measure: "",
  baseline: "",
  target: "",
  current: "",
  status: "Active",
  rationale: "",
  history: [],
});

function Plan({ p, reload }: { p: PlanDto; reload: () => void }) {
  const editable = p.canEdit && (p.status === "Draft" || p.status === "Revised");
  const [d, setD] = useState<Editable>({
    indication: p.indication,
    goals: p.goals,
    interventions: p.interventions,
    precautions: p.precautions,
    frequency: p.frequency,
    duration: p.duration,
    reviewDate: p.reviewDate,
  });
  const [saved, setSaved] = useState("Draft saved");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current || !editable) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => {
      setSaved("Saving…");
      api(`/api/clinical/plans/${p.id}`, { method: "PUT", body: d })
        .then(() => setSaved("Draft saved"))
        .catch((e: unknown) => setSaved(e instanceof Error ? e.message : "Not saved"));
    }, 800);
    return () => clearTimeout(t);
  }, [d, p.id, editable]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      if (editable) await api(`/api/clinical/plans/${p.id}`, { method: "PUT", body: d });
      await api(`/api/clinical/plans/${p.id}`, { body });
      reload();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const setGoal = (i: number, part: Partial<GoalDto>) =>
    setD((x) => ({ ...x, goals: x.goals.map((g, j) => (j === i ? { ...g, ...part } : g)) }));

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href={`/therapist/patients/${p.clientId}`} variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            {p.clientName}
          </ButtonLink>
        }
        title={`${p.support} treatment plan`}
        description={`Version ${p.version} · ${p.therapistName}${p.approved ? ` · approved ${shortDate(p.approved.at)}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {editable && <span className="text-caption text-ink-500">{saved}</span>}
            <Tag tone={planTone[p.status]}>{p.status}</Tag>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          <Panel title="Plan">
            <fieldset disabled={!editable} className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <TextArea
                  label="Clinical indication"
                  required
                  value={d.indication}
                  onChange={(v) => setD((x) => ({ ...x, indication: v }))}
                  rows={3}
                  hint="From the signed assessment"
                />
              </div>
              <div className="md:col-span-2">
                <TextArea
                  label="Interventions"
                  required
                  value={d.interventions}
                  onChange={(v) => setD((x) => ({ ...x, interventions: v }))}
                  rows={3}
                />
              </div>
              <TextField
                label="Frequency"
                required
                value={d.frequency}
                onChange={(v) => setD((x) => ({ ...x, frequency: v }))}
                hint="Clinician-approved, not the referral's preference"
              />
              <TextField
                label="Duration"
                value={d.duration}
                onChange={(v) => setD((x) => ({ ...x, duration: v }))}
                placeholder="For example, 10 weeks"
              />
              <TextField
                label="Review date"
                type="date"
                required
                value={d.reviewDate}
                onChange={(v) => setD((x) => ({ ...x, reviewDate: v }))}
              />
              <TextField
                label="Precautions"
                value={d.precautions}
                onChange={(v) => setD((x) => ({ ...x, precautions: v }))}
              />
            </fieldset>
          </Panel>

          <Panel
            title="Goals"
            action={
              editable && (
                <Button
                  size="sm"
                  onClick={() => setD((x) => ({ ...x, goals: [...x.goals, blankGoal()] }))}
                >
                  <Plus className="size-3.5" aria-hidden="true" />
                  Add goal
                </Button>
              )
            }
          >
            {d.goals.length === 0 && (
              <p className="text-small text-ink-500">
                Add at least one goal with how it&apos;s measured, the baseline and the target.
              </p>
            )}
            <ol className="flex flex-col gap-4">
              {d.goals.map((g, i) => (
                <li key={g.id} className="rounded-card border border-border p-4">
                  {editable ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="md:col-span-2">
                        <TextField
                          label={`Goal ${i + 1}`}
                          required
                          value={g.description}
                          onChange={(v) => setGoal(i, { description: v })}
                          placeholder="Sam will put on a t-shirt independently"
                        />
                      </div>
                      <Field label="Domain">
                        <Select
                          value={g.domain}
                          onChange={(e) => setGoal(i, { domain: e.target.value })}
                        >
                          {goalDomains.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </Select>
                      </Field>
                      <TextField
                        label="Measure or tool"
                        required
                        value={g.measure}
                        onChange={(v) => setGoal(i, { measure: v })}
                        placeholder="Steps completed of 5, observed"
                      />
                      <TextField
                        label="Baseline"
                        required
                        value={g.baseline}
                        onChange={(v) => setGoal(i, { baseline: v })}
                      />
                      <TextField
                        label="Target"
                        required
                        value={g.target}
                        onChange={(v) => setGoal(i, { target: v })}
                      />
                      <Field label="Status">
                        <Select
                          value={g.status}
                          onChange={(e) => setGoal(i, { status: e.target.value as GoalStatus })}
                        >
                          {goalStatuses.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </Select>
                      </Field>
                      <TextField
                        label="Rationale for changes"
                        value={g.rationale}
                        onChange={(v) => setGoal(i, { rationale: v })}
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="justify-self-start"
                        onClick={() =>
                          setD((x) => ({ ...x, goals: x.goals.filter((_, j) => j !== i) }))
                        }
                      >
                        <Trash2 className="size-3.5" aria-hidden="true" />
                        Remove goal
                      </Button>
                    </div>
                  ) : (
                    <GoalView g={g} />
                  )}
                </li>
              ))}
            </ol>
          </Panel>
        </div>

        <div className="flex flex-col gap-6 xl:col-span-4">
          {editable && (
            <Panel title="Approve">
              <p className="mb-3 text-small text-ink-700">
                Approving makes the plan active. The participant sees the goals in their app, and
                each visit records progress against them.
              </p>
              <Button
                variant="primary"
                className="w-full"
                disabled={busy}
                onClick={() => act({ action: "activate" })}
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                Approve plan
              </Button>
            </Panel>
          )}
          {p.canEdit && p.status === "Active" && (
            <Panel title="Review and reassess">
              <p className="mb-3 text-small text-ink-700">
                Start the review when it&apos;s due, or sooner if something changes. Reassess with a
                new assessment from the patient page if measures need repeating.
              </p>
              <Button
                variant="primary"
                disabled={busy}
                onClick={() => act({ action: "start-review" })}
              >
                Start review
              </Button>
            </Panel>
          )}
          {p.canEdit && p.status === "Under Review" && <Review p={p} busy={busy} act={act} />}
          {p.canEdit && p.status === "Active" && (
            <Panel title="Progress summary">
              {p.progressSummary ? (
                <div className="text-small">
                  <Tag tone="live">AI draft</Tag>
                  <p className="mt-2 whitespace-pre-line">{p.progressSummary.text}</p>
                  <p className="mt-2 text-caption text-ink-500">
                    Drafted {relativeTime(p.progressSummary.at)} from recorded measures. You
                    interpret it.
                  </p>
                </div>
              ) : (
                <p className="text-small text-ink-700">
                  AI drafts a tentative summary from the measures recorded at each visit.
                </p>
              )}
              <Button
                size="sm"
                className="mt-3"
                disabled={busy}
                onClick={() => act({ action: "progress-summary" })}
              >
                <AiIcon className="size-3.5" />
                {p.progressSummary ? "Draft again" : "Draft progress summary"}
              </Button>
            </Panel>
          )}
          {p.reviews.length > 0 && (
            <Panel title="Reviews">
              <ol className="flex flex-col gap-3">
                {[...p.reviews].reverse().map((r) => (
                  <li key={r.at} className="text-small">
                    <strong>{r.decision}</strong>
                    <span className="block whitespace-pre-line text-ink-700">{r.notes}</span>
                    <span className="text-caption text-ink-500">
                      {r.byName} · {relativeTime(r.at)}
                    </span>
                  </li>
                ))}
              </ol>
            </Panel>
          )}
          {fail && (
            <p role="alert" className="rounded-control bg-over-bg px-3 py-2 text-small text-over">
              {fail}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function GoalView({ g }: { g: GoalDto }) {
  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="flex gap-2 text-small font-semibold">
          <Target className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
          {g.description}
        </p>
        <Tag
          tone={
            g.status === "Achieved" ? "healthy" : g.status === "Active" ? "available" : "neutral"
          }
        >
          {g.status}
        </Tag>
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-2 text-caption sm:grid-cols-4">
        <div>
          <dt className="text-ink-500">Measure</dt>
          <dd>{g.measure}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Baseline</dt>
          <dd>{g.baseline}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Current</dt>
          <dd className="font-semibold">{g.current || "–"}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Target</dt>
          <dd>{g.target}</dd>
        </div>
      </dl>
      {g.history.length > 0 && (
        <ol className="mt-3 flex flex-wrap gap-1.5">
          {g.history.map((h) => (
            <li
              key={h.at}
              title={h.note}
              className="rounded-full bg-canvas px-2.5 py-0.5 text-caption"
            >
              {shortDate(h.at)}: <strong>{h.value}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Review({
  p,
  busy,
  act,
}: {
  p: PlanDto;
  busy: boolean;
  act: (b: Record<string, unknown>) => Promise<void>;
}) {
  const [decision, setDecision] = useState<ReviewDecision>("Continue");
  const [notes, setNotes] = useState("");
  const [next, setNext] = useState("");
  const [goals, setGoals] = useState<Record<string, GoalStatus>>(
    Object.fromEntries(p.goals.map((g) => [g.id, g.status])),
  );
  return (
    <Panel title="Review and reassess">
      <div className="flex flex-col gap-3">
        <p className="text-caption text-ink-500">
          Review due {p.reviewDate ? shortDate(`${p.reviewDate}T00:00:00Z`) : "not set"}.
        </p>
        {p.goals.map((g) => (
          <Field key={g.id} label={g.description || "Goal"}>
            <Select
              value={goals[g.id] ?? g.status}
              onChange={(e) => setGoals((x) => ({ ...x, [g.id]: e.target.value as GoalStatus }))}
            >
              {goalStatuses.map((o) => (
                <option key={o}>{o}</option>
              ))}
            </Select>
          </Field>
        ))}
        <Choice
          label="Decision"
          options={reviewDecisions}
          value={decision}
          onChange={setDecision}
        />
        {decision === "Continue" && (
          <TextField
            label="Next review date"
            type="date"
            required
            value={next}
            onChange={setNext}
          />
        )}
        <TextArea
          label="Clinical interpretation"
          required
          value={notes}
          onChange={setNotes}
          rows={3}
        />
        <Button
          variant="primary"
          disabled={busy || notes.trim().length < 5 || (decision === "Continue" && !next)}
          onClick={() =>
            act({
              action: "review",
              decision,
              notes,
              nextReviewDate: next,
              goals: Object.entries(goals).map(([id, status]) => ({ id, status })),
            })
          }
        >
          Record review
        </Button>
        <p className="text-caption text-ink-500">
          Revise reopens the plan as a new version. Discharge completes it; then discharge the
          participant from their record.
        </p>
      </div>
    </Panel>
  );
}
