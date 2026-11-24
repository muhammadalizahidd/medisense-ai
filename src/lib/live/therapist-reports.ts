import {
  caseloadSet,
  dayKey,
  inRange,
  isDelivered,
  seenSet,
  type AppointmentFact,
  type ReportFacts,
} from "./reports";

/*
 * What a therapist sees about their own patients. Pure functions over the report facts, so the
 * figures can be tested without a screen, and the numbers on every screen come from here and from
 * the metrics in reports.ts, never from a second calculation.
 */

/** Which patients a list covers: those the therapist is responsible for, those they saw, or both. */
export const populations = ["caseload", "seen", "both"] as const;
export type Population = (typeof populations)[number];

export const populationLabel: Record<Population, string> = {
  caseload: "My caseload",
  seen: "Seen in the period",
  both: "Both",
};

export const populationHint: Record<Population, string> = {
  caseload: "Patients you are responsible for, whether or not you saw them in the period.",
  seen: "Patients you delivered a session to in the period, including cover for a colleague.",
  both: "Everyone on your caseload and everyone you saw.",
};

export type PatientRow = {
  id: string;
  name: string;
  onCaseload: boolean;
  seen: boolean;
  disciplines: string[];
  /** Delivered sessions in the period. */
  sessions: number;
  /** Delivered ÷ (delivered + did not attend + late cancelled), or null when none were due. */
  attendance: number | null;
  lastSeen: string | null;
  nextVisit: string | null;
  notesToSign: number;
  reviewDue: string | null;
};

const MISSED = ["no-show", "late-cancelled"];
const BOOKED = ["booked", "tentative"];

/** How a patient relates to the therapist: the plain-words tag shown beside their name. */
export function relation(row: Pick<PatientRow, "onCaseload" | "seen">) {
  if (row.onCaseload && row.seen) return "On caseload";
  if (row.onCaseload) return "On caseload, not seen";
  return "Seen, not on caseload";
}

function byPatient<T extends { participantId: string }>(items: T[]) {
  const m = new Map<string, T[]>();
  for (const x of items) m.set(x.participantId, [...(m.get(x.participantId) ?? []), x]);
  return m;
}

/** The ids in a population. */
export function populationIds(
  f: ReportFacts,
  from: string,
  to: string,
  today: string,
  population: Population,
) {
  const end = to < today ? to : today;
  const caseload = caseloadSet(f, end);
  const seen = seenSet(f, from, to);
  const ids =
    population === "caseload"
      ? caseload
      : population === "seen"
        ? seen
        : new Set([...caseload, ...seen]);
  return { ids, caseload, seen };
}

export function patientRows(
  f: ReportFacts,
  range: { from: string; to: string },
  clock: { today: string; now: string },
  population: Population,
): PatientRow[] {
  const { ids, caseload, seen } = populationIds(f, range.from, range.to, clock.today, population);
  const appts = byPatient(f.appointments);
  const services = byPatient(f.services);
  const reviews = byPatient(f.goalReviews);
  const named = new Map(f.participants.map((p) => [p.id, p.label]));
  const rows: PatientRow[] = [];
  for (const id of ids) {
    const mine = appts.get(id) ?? [];
    const inR = mine.filter((a) => inRange(a.start, range.from, range.to));
    const delivered = inR.filter(isDelivered);
    const missed = inR.filter((a) => MISSED.includes(a.status)).length;
    const lastSeen = mine
      .filter((a) => isDelivered(a) && a.start <= clock.now)
      .map((a) => a.start)
      .sort()
      .at(-1);
    const next = mine
      .filter((a) => BOOKED.includes(a.status) && a.start > clock.now)
      .map((a) => a.start)
      .sort()[0];
    rows.push({
      id,
      name: named.get(id) ?? mine[0]?.label ?? "Patient",
      onCaseload: caseload.has(id),
      seen: seen.has(id),
      disciplines: [...new Set((services.get(id) ?? []).map((s) => s.discipline))].sort(),
      sessions: delivered.length,
      attendance:
        delivered.length + missed > 0
          ? Math.round((delivered.length / (delivered.length + missed)) * 1000) / 10
          : null,
      lastSeen: lastSeen ? dayKey(lastSeen) : null,
      nextVisit: next ? dayKey(next) : null,
      notesToSign: mine.filter(
        (a) => isDelivered(a) && !a.noteSignedAt && !["Final", "Amended"].includes(a.noteStatus),
      ).length,
      reviewDue:
        (reviews.get(id) ?? [])
          .map((g) => g.reviewDue)
          .sort()
          .at(0) ?? null,
    });
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}

export type PatientSummary = {
  row: PatientRow;
  recent: { id: string; start: string; discipline: string; mode: string; status: string }[];
  services: { id: string; support: string; discipline: string; status: string }[];
  reviews: {
    id: string;
    plan: string;
    reviewDue: string;
    goals: number;
    lastReview: string | null;
  }[];
  assessments: { id: string; kind: string; status: string; dueAt: string }[];
};

/** One patient, for the summary dialog. Null when they are not in the facts. */
export function patientSummary(
  f: ReportFacts,
  id: string,
  range: { from: string; to: string },
  clock: { today: string; now: string },
): PatientSummary | null {
  const row = patientRows(f, range, clock, "both").find((r) => r.id === id);
  if (!row) return null;
  const mine = f.appointments.filter((a: AppointmentFact) => a.participantId === id);
  return {
    row,
    recent: [...mine]
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 8)
      .map((a) => ({
        id: a.id,
        start: a.start,
        discipline: a.discipline,
        mode: a.mode,
        status: a.status,
      })),
    services: f.services
      .filter((s) => s.participantId === id)
      .map((s) => ({ id: s.id, support: s.support, discipline: s.discipline, status: s.status })),
    reviews: f.goalReviews
      .filter((g) => g.participantId === id)
      .map((g) => ({
        id: g.id,
        plan: g.plan,
        reviewDue: g.reviewDue,
        goals: g.goals,
        lastReview: g.lastReview,
      })),
    assessments: f.assessments
      .filter((a) => a.participantId === id)
      .map((a) => ({ id: a.id, kind: a.kind, status: a.status, dueAt: a.dueAt })),
  };
}
