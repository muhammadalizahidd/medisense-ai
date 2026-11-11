"use client";

import {
  CircleCheck,
  Clock,
  LogIn,
  LogOut,
  ShieldAlert,
  Target,
  TriangleAlert,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { api, useNow, useResource } from "@/lib/live/client";
import { shortDate, slotLabel, timeOfDay } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { cn } from "@/lib/cn";
import { ErrorNote, Skeleton } from "./bits";
import { TextArea, TextField, Tick } from "./form-bits";

type Briefing = {
  visitId: string;
  patient: string;
  when: string;
  service: string;
  location: string;
  suburb: string;
  phone: string | null;
  precautions: string | null;
  notes: string;
  consent: boolean;
  assessment: { id: string; status: string } | null;
  plan: {
    id: string;
    status: string;
    goals: {
      id: string;
      description: string;
      measure: string;
      baseline: string;
      target: string;
      current: string;
    }[];
  } | null;
  lastVisit: { at: string; plan: string; summary: string } | null;
};

/** "2026-11-10T14:00" in Brisbane, for a datetime-local field. */
const local = (iso: string) =>
  new Date(new Date(iso).getTime() + 10 * 3_600_000).toISOString().slice(0, 16);
const fromLocal = (value: string) => new Date(`${value}:00+10:00`).toISOString();

/**
 * The home, school or community visit (section 11): pre-visit summary, arrival check-in, the
 * session against the plan's goals, and check-out. An unsafe or incomplete visit ends early with
 * the reason and what remains.
 */
export function VisitSheet({
  visit,
  onClose,
  onChanged,
  onCheckedOut,
}: {
  visit: AppointmentDto;
  onClose: () => void;
  onChanged: () => void;
  onCheckedOut: (visit: AppointmentDto) => void;
}) {
  const { data, error, reload } = useResource<{ briefing: Briefing }>(
    `/api/visits/${visit.id}/briefing`,
  );
  const now = useNow() ?? 0;
  const late = now - new Date(visit.end).getTime() > 30 * 60_000;
  const [stage, setStage] = useState<"brief" | "session" | "end">(
    visit.checkIn ? "session" : "brief",
  );
  const [checkedIn, setCheckedIn] = useState(Boolean(visit.checkIn));
  const [attendees, setAttendees] = useState(visit.checkIn?.attendees ?? "");
  const [safe, setSafe] = useState(true);
  const [arrivalNotes, setArrivalNotes] = useState("");
  const [inAt, setInAt] = useState(local(visit.checkIn?.at ?? visit.start));
  const [outAt, setOutAt] = useState(local(visit.end));
  const [measures, setMeasures] = useState<Record<string, { value: string; note: string }>>(
    Object.fromEntries(
      (visit.session?.goals ?? []).map((g) => [g.goalId, { value: g.value, note: g.note }]),
    ),
  );
  const [interventions, setInterventions] = useState(visit.session?.interventions ?? "");
  const [response, setResponse] = useState(visit.session?.response ?? "");
  const [incidents, setIncidents] = useState(visit.session?.incidents ?? "");
  const [followUp, setFollowUp] = useState(visit.session?.followUp ?? "");
  const [reason, setReason] = useState("");
  const [remaining, setRemaining] = useState("");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setFail(null);
    try {
      await fn();
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  const b = data?.briefing;
  const sessionBody = () => ({
    goals: Object.entries(measures)
      .filter(([, m]) => m.value || m.note)
      .map(([goalId, m]) => ({ goalId, value: m.value, note: m.note })),
    interventions,
    response,
    incidents,
    followUp,
  });

  const footer =
    stage === "brief" ? (
      <>
        <Button
          variant="primary"
          disabled={busy || !safe || attendees.trim().length < 2}
          onClick={() =>
            run(async () => {
              await api(`/api/visits/${visit.id}/checkin`, {
                body: {
                  attendees,
                  safe,
                  notes: arrivalNotes,
                  ...(late ? { at: fromLocal(inAt) } : {}),
                },
              });
              setCheckedIn(true);
              setStage("session");
              onChanged();
            })
          }
        >
          <LogIn className="size-4" aria-hidden="true" />
          Check in
        </Button>
        <Button onClick={() => setStage("end")}>End visit early</Button>
      </>
    ) : stage === "session" ? (
      <>
        <Button
          variant="primary"
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api(`/api/visits/${visit.id}/session`, { body: sessionBody() });
              await api(`/api/visits/${visit.id}/checkout`, {
                body: late ? { at: fromLocal(outAt) } : {},
              });
              onChanged();
              onCheckedOut({ ...visit, status: "completed" });
            })
          }
        >
          <LogOut className="size-4" aria-hidden="true" />
          Save and check out
        </Button>
        <Button
          disabled={busy}
          onClick={() =>
            run(async () => {
              await api(`/api/visits/${visit.id}/session`, { body: sessionBody() });
              onChanged();
            })
          }
        >
          Save progress
        </Button>
        <Button variant="ghost" onClick={() => setStage("end")}>
          End early
        </Button>
      </>
    ) : (
      <>
        <Button
          variant="primary"
          disabled={busy || reason.trim().length < 3}
          onClick={() =>
            run(async () => {
              await api(`/api/visits/${visit.id}/abort`, { body: { reason, remaining } });
              onChanged();
              onClose();
            })
          }
        >
          End visit as incomplete
        </Button>
        <Button onClick={() => setStage(checkedIn ? "session" : "brief")}>Back</Button>
      </>
    );

  return (
    <Sheet
      title={`Visit · ${visit.clientName}`}
      description={`${visit.discipline} · ${slotLabel(visit.start)}`}
      onClose={onClose}
      footer={footer}
    >
      <ol className="mb-5 grid grid-cols-3 gap-1.5 text-caption font-semibold">
        {[
          { id: "brief", label: "Arrive", done: checkedIn },
          { id: "session", label: "Session", done: false },
          { id: "out", label: "Check out", done: false },
        ].map((s, i) => (
          <li
            key={s.id}
            className={cn(
              "flex items-center gap-1.5 rounded-control border px-2 py-1.5",
              s.done
                ? "border-accent-fill bg-accent-tint"
                : (stage === "brief" && i === 0) || (stage === "session" && i === 1)
                  ? "border-ink-900"
                  : "border-border text-ink-500",
            )}
          >
            {s.done ? (
              <CircleCheck className="size-3.5 text-accent" aria-hidden="true" />
            ) : (
              <span>{i + 1}</span>
            )}
            {s.label}
          </li>
        ))}
      </ol>

      {error && !b ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : !b ? (
        <Skeleton className="h-60" />
      ) : (
        <div className="flex flex-col gap-5">
          {stage === "brief" && (
            <>
              <section
                aria-label="Pre-visit summary"
                className="rounded-card bg-canvas p-4 text-small"
              >
                <h3 className="mb-2 font-semibold">Pre-visit summary</h3>
                <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5">
                  <dt className="text-ink-500">Service</dt>
                  <dd>{b.service}</dd>
                  <dt className="text-ink-500">Where</dt>
                  <dd>
                    {b.location}, {b.suburb}
                    {b.phone ? ` · ${b.phone}` : ""}
                  </dd>
                  <dt className="text-ink-500">Consent</dt>
                  <dd>
                    {b.consent
                      ? "Recorded in the assessment"
                      : "Not recorded yet: confirm at the visit"}
                  </dd>
                  <dt className="text-ink-500">Assessment</dt>
                  <dd>{b.assessment ? b.assessment.status : "Not started"}</dd>
                  <dt className="text-ink-500">Plan</dt>
                  <dd>
                    {b.plan
                      ? `${b.plan.status}, ${b.plan.goals.length} active goals`
                      : "No plan yet"}
                  </dd>
                  {b.lastVisit && (
                    <>
                      <dt className="text-ink-500">Last visit</dt>
                      <dd>
                        {shortDate(b.lastVisit.at)}
                        {b.lastVisit.plan ? `: plan was “${b.lastVisit.plan}”` : ""}
                      </dd>
                    </>
                  )}
                </dl>
              </section>
              {b.precautions && (
                <p className="flex gap-2 rounded-control bg-over-bg px-3 py-2 text-small">
                  <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
                  {b.precautions}
                </p>
              )}
              <h3 className="text-body font-semibold">On arrival</h3>
              <TextField
                label="Who is present"
                required
                value={attendees}
                onChange={setAttendees}
                placeholder="Participant and parent (Jordan)"
              />
              <Tick checked={safe} onChange={setSafe}>
                I have confirmed the participant and location, and it is safe to continue
              </Tick>
              {!safe && (
                <p className="flex gap-2 text-small text-over">
                  <TriangleAlert className="mt-0.5 size-4 flex-none" aria-hidden="true" />
                  Don&apos;t continue. End the visit early and record why; intake will follow up.
                </p>
              )}
              <TextArea
                label="Site notes"
                value={arrivalNotes}
                onChange={setArrivalNotes}
                rows={2}
              />
              {late && (
                <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
                  Actual check-in time (recording after the visit)
                  <input
                    type="datetime-local"
                    value={inAt}
                    onChange={(e) => setInAt(e.target.value)}
                    className="h-9 rounded-control border border-border-strong bg-surface-raised px-3 text-small"
                  />
                </label>
              )}
            </>
          )}

          {stage === "session" && (
            <>
              <p className="flex items-center gap-2 text-caption text-ink-500">
                <Clock className="size-3.5" aria-hidden="true" />
                Checked in {visit.checkIn ? timeOfDay(visit.checkIn.at) : "just now"}
              </p>
              {b.plan?.goals.length ? (
                <section aria-label="Goals addressed" className="flex flex-col gap-3">
                  <h3 className="text-body font-semibold">Goals addressed</h3>
                  {b.plan.goals.map((g) => (
                    <div key={g.id} className="rounded-control border border-border p-3">
                      <p className="flex gap-2 text-small font-semibold">
                        <Target
                          className="mt-0.5 size-4 flex-none text-accent"
                          aria-hidden="true"
                        />
                        {g.description}
                      </p>
                      <p className="mt-1 text-caption text-ink-500">
                        {g.measure} · baseline {g.baseline} · target {g.target} · last{" "}
                        {g.current || "–"}
                      </p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <TextField
                          label="Measured today"
                          value={measures[g.id]?.value ?? ""}
                          onChange={(v) =>
                            setMeasures((m) => ({
                              ...m,
                              [g.id]: { value: v, note: m[g.id]?.note ?? "" },
                            }))
                          }
                          hint="As measured, with the same method"
                        />
                        <TextField
                          label="Note"
                          value={measures[g.id]?.note ?? ""}
                          onChange={(v) =>
                            setMeasures((m) => ({
                              ...m,
                              [g.id]: { value: m[g.id]?.value ?? "", note: v },
                            }))
                          }
                        />
                      </div>
                    </div>
                  ))}
                </section>
              ) : (
                <p className="rounded-control bg-canvas px-3 py-2 text-small text-ink-700">
                  No approved plan yet, so there are no goals to measure. Assessment visits record
                  findings in the assessment.
                </p>
              )}
              <TextArea
                label="Interventions"
                value={interventions}
                onChange={setInterventions}
                rows={3}
                placeholder="What you did, with dosage or parameters"
              />
              <TextArea
                label="Response"
                value={response}
                onChange={setResponse}
                rows={2}
                placeholder="Tolerance, assistance needed, any adverse response"
              />
              <TextArea
                label="Incidents"
                value={incidents}
                onChange={setIncidents}
                rows={2}
                hint="Anything here alerts the care team"
              />
              <TextArea label="Follow-up" value={followUp} onChange={setFollowUp} rows={2} />
              {late && (
                <label className="flex flex-col gap-1 text-caption font-semibold text-ink-700">
                  Actual check-out time
                  <input
                    type="datetime-local"
                    value={outAt}
                    onChange={(e) => setOutAt(e.target.value)}
                    className="h-9 rounded-control border border-border-strong bg-surface-raised px-3 text-small"
                  />
                </label>
              )}
            </>
          )}

          {stage === "end" && (
            <>
              <p className="text-small text-ink-700">
                The visit is recorded as incomplete, nothing is charged, and intake is asked to book
                a follow-up.
              </p>
              <TextArea
                label="Why the visit ended early"
                required
                value={reason}
                onChange={setReason}
                rows={3}
              />
              <TextArea
                label="What remains to do"
                value={remaining}
                onChange={setRemaining}
                rows={2}
              />
            </>
          )}
          {fail && (
            <p role="alert" className="text-small text-over">
              {fail}
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
