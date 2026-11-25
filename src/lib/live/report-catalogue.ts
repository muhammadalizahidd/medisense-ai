import {
  SUPPRESS_BELOW,
  bucketLabel,
  bucketOf,
  bucketsIn,
  capacityHours,
  isConfidential,
  dayKey,
  inRange,
  isCancelled,
  isDelivered,
  type AppointmentFact,
  type Ctx,
  type Domain,
  type ReportFacts,
  type ReportFilters,
  type ReportScope,
  type TimeGrain,
} from "./reports";

/* ------------------------------------------------------------------ report catalogue (section 5) */

export type ColKind = "text" | "id" | "number" | "money" | "date" | "pct";
export type Column = { key: string; label: string; kind: ColKind; required?: boolean };
export type Cell = string | number | null;
export type Row = Record<string, Cell> & { _href?: Cell; _key?: Cell };

export type ReportDef = {
  id: string;
  title: string;
  domain: Domain;
  grain: string;
  basis: string;
  unit: string;
  /** Detail reports list records; aggregate reports group them. */
  detail: boolean;
  drill: string;
  columns: Column[];
  rows: (f: ReportFacts, filters: ReportFilters, ctx: Ctx, names: Map<string, string>) => Row[];
};

const STAGES = [
  "Submitted",
  "Needs Information",
  "Under Admin Review",
  "Clinical Triage",
  "Funding Review",
  "Waitlisted",
  "Accepted",
  "Declined",
  "Withdrawn",
  "Closed",
];
const age = (iso: string, today: string) =>
  Math.max(
    0,
    Math.round(
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(iso)}T00:00:00Z`)) / 86_400_000,
    ),
  );
const money = (n: number) => Math.round(n * 100) / 100;
const groupCount = <T>(xs: T[], key: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
};
const apptHref = (a: Pick<AppointmentFact, "id">) => `/appointment/${a.id}`;

export const reports: ReportDef[] = [
  {
    id: "R01",
    title: "Referral volume",
    domain: "Referrals",
    grain: "One row per period × source",
    basis: "Submitted",
    unit: "parent referrals; requests",
    detail: false,
    drill: "/care/referrals",
    columns: [
      { key: "date", label: "Period", kind: "text" },
      { key: "source", label: "Source", kind: "text" },
      { key: "submitted", label: "Referrals submitted", kind: "number" },
      { key: "supports", label: "Supports requested", kind: "number" },
    ],
    rows: (f, filters) => {
      const inR = f.referrals.filter((r) => inRange(r.submittedAt, filters.from, filters.to));
      const out: Row[] = [];
      for (const [k, list] of groupCount(
        inR,
        (r) => `${bucketOf(dayKey(r.submittedAt), filters.grain)}|${r.source}`,
      )) {
        const [b, source] = k.split("|") as [string, string];
        out.push({
          _key: b,
          _href: "/care/referrals",
          date: bucketLabel(b, filters.grain),
          source,
          submitted: list.length,
          supports: list.reduce((s, r) => s + r.supports.length, 0),
        });
      }
      return out.sort((a, b) => String(a._key).localeCompare(String(b._key)));
    },
  },
  {
    id: "R02",
    title: "Referral pipeline",
    domain: "Referrals",
    grain: "One row per stage",
    basis: "Snapshot now",
    unit: "parent referrals",
    detail: false,
    drill: "/care/referrals",
    columns: [
      { key: "stage", label: "Stage", kind: "text" },
      { key: "current", label: "Current", kind: "number" },
      { key: "a0", label: "0–2 days", kind: "number" },
      { key: "a3", label: "3–7 days", kind: "number" },
      { key: "a8", label: "8–14 days", kind: "number" },
      { key: "a15", label: "15+ days", kind: "number" },
      { key: "owner", label: "Main owner", kind: "text" },
      { key: "blocked", label: "Blocked", kind: "number" },
    ],
    rows: (f, _filters, ctx) =>
      STAGES.map((stage) => {
        const list = f.referrals.filter((r) => r.status === stage);
        const ages = list.map((r) => age(r.stageSince, ctx.today));
        const owners = groupCount(list, (r) => r.owner);
        const top = [...owners.entries()].sort((a, b) => b[1].length - a[1].length)[0];
        return {
          stage,
          _href: "/care/referrals",
          current: list.length,
          a0: ages.filter((a) => a <= 2).length,
          a3: ages.filter((a) => a > 2 && a <= 7).length,
          a8: ages.filter((a) => a > 7 && a <= 14).length,
          a15: ages.filter((a) => a > 14).length,
          owner: top ? top[0] : "—",
          blocked: list.filter((r) => r.blocked).length,
        };
      }),
  },
  {
    id: "R03",
    title: "Referral completeness",
    domain: "Referrals",
    grain: "One row per referral with missing information",
    basis: "Submitted",
    unit: "referrals",
    detail: true,
    drill: "/care/referrals",
    columns: [
      { key: "ref", label: "Referral", kind: "id", required: true },
      { key: "service", label: "Services", kind: "text" },
      { key: "missing", label: "Missing sections", kind: "text" },
      { key: "requested", label: "Submitted", kind: "date" },
      { key: "owner", label: "Owner", kind: "text" },
      { key: "contact", label: "Last contact", kind: "date" },
      { key: "status", label: "Status", kind: "text" },
    ],
    rows: (f, filters) =>
      f.referrals
        .filter((r) => r.missing.length && inRange(r.submittedAt, filters.from, filters.to))
        .map((r) => ({
          _href: `/care/referrals/${r.id}`,
          _rid: r.id,
          ref: r.ref,
          service: r.supports.join(", "),
          missing: r.missing.join("; "),
          requested: dayKey(r.submittedAt),
          owner: r.owner,
          contact: r.lastContact ? dayKey(r.lastContact) : null,
          status: r.status,
        })),
  },
  {
    id: "R04",
    title: "Service demand",
    domain: "Participants",
    grain: "One row per requested support",
    basis: "Requested",
    unit: "requests",
    detail: false,
    drill: "/care",
    columns: [
      { key: "category", label: "Support", kind: "text" },
      { key: "count", label: "Requested", kind: "number" },
      { key: "waitlisted", label: "Waiting", kind: "number" },
      { key: "allocated", label: "Allocated", kind: "number" },
      { key: "started", label: "Started", kind: "number" },
    ],
    rows: (f, filters) =>
      [
        ...groupCount(
          f.services.filter(
            (s) =>
              inRange(s.requestedAt, filters.from, filters.to) ||
              (dayKey(s.requestedAt) < filters.from && !s.closedAt),
          ),
          (s) => s.support,
        ),
      ]
        .map(([category, list]) => ({
          category,
          _href: "/care",
          count: list.length,
          waitlisted: list.filter((s) => s.status === "waiting" || s.status === "needs-therapist")
            .length,
          allocated: list.filter((s) => s.therapistId).length,
          started: list.filter((s) => s.startedAt).length,
        }))
        .sort((a, b) => b.count - a.count),
  },
  {
    id: "R05",
    title: "Participant cohorts",
    domain: "Participants",
    grain: "One row per service setting × month",
    basis: "Started / closed",
    unit: "people; episodes",
    detail: false,
    drill: "/care",
    columns: [
      { key: "category", label: "Service setting", kind: "text" },
      { key: "month", label: "Month", kind: "text" },
      { key: "people", label: "Unique people", kind: "number" },
      { key: "newEpisodes", label: "New episodes", kind: "number" },
      { key: "closed", label: "Closed episodes", kind: "number" },
    ],
    rows: (f, filters) => {
      const out: Row[] = [];
      const months = bucketsIn(filters.from, filters.to, "Month");
      const settings = [...new Set(f.services.flatMap((s) => s.settings))];
      for (const setting of settings)
        for (const m of months) {
          const list = f.services.filter((s) => s.settings.includes(setting));
          const active = list.filter(
            (s) =>
              dayKey(s.requestedAt).slice(0, 7) <= m &&
              (!s.closedAt || dayKey(s.closedAt).slice(0, 7) >= m),
          );
          const n = list.filter((s) => s.startedAt && dayKey(s.startedAt).startsWith(m)).length;
          const c = list.filter((s) => s.closedAt && dayKey(s.closedAt).startsWith(m)).length;
          if (!active.length && !n && !c) continue;
          out.push({
            _href: "/care",
            category: setting,
            month: bucketLabel(m, "Month"),
            people: new Set(active.map((s) => s.participantId)).size,
            newEpisodes: n,
            closed: c,
          });
        }
      return out;
    },
  },
  {
    id: "R06",
    title: "Therapist workload",
    domain: "Staff",
    grain: "One row per clinician",
    basis: "Scheduled / completed",
    unit: "hours; notes",
    detail: true,
    drill: "/care/therapists",
    columns: [
      { key: "clinician", label: "Clinician", kind: "text", required: true },
      { key: "discipline", label: "Discipline", kind: "text" },
      { key: "credential", label: "Credentials", kind: "text" },
      { key: "capacity", label: "Capacity hours", kind: "number" },
      { key: "booked", label: "Booked hours", kind: "number" },
      { key: "delivered", label: "Delivered hours", kind: "number" },
      { key: "utilisation", label: "Utilisation", kind: "pct" },
      { key: "notes", label: "Notes outstanding", kind: "number" },
    ],
    rows: (f, filters, ctx) =>
      f.clinicians
        .filter((c) => c.active)
        .map((c) => {
          const mine = f.appointments.filter(
            (a) => a.therapistId === c.id && inRange(a.start, filters.from, filters.to),
          );
          const cap = capacityHours(c, filters.from, filters.to);
          const del =
            Math.round(
              (mine.filter(isDelivered).reduce((s, a) => s + (a.deliveredMinutes ?? 0), 0) / 60) *
                10,
            ) / 10;
          return {
            _href: `/care/therapists/${c.id}`,
            clinician: c.name,
            discipline: c.discipline,
            credential: c.credential,
            capacity: cap,
            booked:
              Math.round(
                (mine
                  .filter((a) => ["booked", "completed"].includes(a.status))
                  .reduce((s, a) => s + a.scheduledMinutes, 0) /
                  60) *
                  10,
              ) / 10,
            delivered: del,
            utilisation: cap > 0 ? Math.round((del / cap) * 1000) / 10 : null,
            notes: f.appointments.filter(
              (a) =>
                a.therapistId === c.id &&
                a.status === "completed" &&
                !["Final", "Amended"].includes(a.noteStatus) &&
                (a.noteDue ?? "") < ctx.now,
            ).length,
          };
        })
        .sort((a, b) => (b.booked as number) - (a.booked as number)),
  },
  {
    id: "R07",
    title: "Appointment delivery",
    domain: "Scheduling",
    grain: "One row per appointment",
    basis: "Scheduled",
    unit: "bookings",
    detail: true,
    drill: "/care/schedule",
    columns: [
      { key: "ref", label: "Booking", kind: "id", required: true },
      { key: "date", label: "Date", kind: "date" },
      { key: "mode", label: "Mode", kind: "text" },
      { key: "therapist", label: "Therapist", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "duration", label: "Delivered minutes", kind: "number" },
      { key: "moved", label: "Moved from", kind: "date" },
    ],
    rows: (f, filters, _ctx, names) =>
      f.appointments
        .filter(
          (a) =>
            inRange(a.start, filters.from, filters.to) &&
            (!filters.status || statusLabel(a.status) === filters.status),
        )
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((a) => ({
          _href: apptHref(a),
          ref: a.ref,
          date: dayKey(a.start),
          mode: a.mode,
          therapist: names.get(a.therapistId) ?? "—",
          status: statusLabel(a.status),
          duration: isDelivered(a) ? a.deliveredMinutes : null,
          moved: a.movedFrom ? dayKey(a.movedFrom) : null,
        })),
  },
  {
    id: "R08",
    title: "Cancellation reasons",
    domain: "Scheduling",
    grain: "One row per reason",
    basis: "Scheduled",
    unit: "bookings; %",
    detail: false,
    drill: "/care/schedule",
    columns: [
      { key: "reason", label: "Reason", kind: "text" },
      { key: "by", label: "Called off by", kind: "text" },
      { key: "count", label: "Cancelled", kind: "number" },
      { key: "share", label: "% of cancellations", kind: "pct" },
      { key: "service", label: "Most affected service", kind: "text" },
    ],
    rows: (f, filters) => {
      const c = f.appointments.filter(
        (a) => isCancelled(a) && inRange(a.start, filters.from, filters.to),
      );
      return [
        ...groupCount(
          c,
          (a) =>
            `${a.cancelReason ?? "Not recorded"}|${a.cancelledBy === "client" ? "Participant" : "Medisense"}`,
        ),
      ]
        .map(([k, list]) => {
          const [reason, by] = k.split("|") as [string, string];
          const top = [...groupCount(list, (a) => a.support)].sort(
            (x, y) => y[1].length - x[1].length,
          )[0];
          return {
            reason,
            _href: "/care/schedule",
            by,
            count: list.length,
            share: Math.round((list.length / c.length) * 1000) / 10,
            service: top?.[0] ?? "—",
          };
        })
        .sort((a, b) => b.count - a.count);
    },
  },
  {
    id: "R09",
    title: "Travel operations",
    domain: "Scheduling",
    grain: "One row per home or community visit",
    basis: "Completed",
    unit: "minutes",
    detail: true,
    drill: "/care/schedule",
    columns: [
      { key: "ref", label: "Visit", kind: "id", required: true },
      { key: "date", label: "Date", kind: "date" },
      { key: "mode", label: "Location", kind: "text" },
      { key: "booked", label: "Booked travel (min)", kind: "number" },
      { key: "recorded", label: "Recorded travel (min)", kind: "number" },
      { key: "charge", label: "Travel charge", kind: "text" },
    ],
    rows: (f, filters) =>
      f.appointments
        .filter(
          (a) =>
            a.mode !== "Telehealth" &&
            a.status === "completed" &&
            inRange(a.start, filters.from, filters.to),
        )
        .map((a) => ({
          _href: apptHref(a),
          ref: a.ref,
          date: dayKey(a.start),
          mode: a.mode,
          booked: a.travelBooked,
          recorded: a.travelRecorded,
          charge: a.travelCharge,
        })),
  },
  {
    id: "R10",
    title: "Telehealth reliability",
    domain: "Telehealth",
    grain: "One row per telehealth appointment",
    basis: "Scheduled",
    unit: "appointments",
    detail: true,
    drill: "/telehealth/recordings",
    columns: [
      { key: "ref", label: "Booking", kind: "id", required: true },
      { key: "date", label: "Date", kind: "date" },
      { key: "attempt", label: "Attempt", kind: "text" },
      { key: "issue", label: "Connection issue", kind: "text" },
      { key: "outcome", label: "Join outcome", kind: "text" },
      { key: "reconnects", label: "Reconnects", kind: "number" },
      { key: "recording", label: "Recording (metadata)", kind: "text" },
    ],
    rows: (f, filters) =>
      f.telehealth
        .filter((t) => inRange(t.start, filters.from, filters.to))
        .map((t) => ({
          _href: `/appointment/${t.appointmentId}`,
          ref: t.ref,
          date: dayKey(t.start),
          attempt: t.attempt,
          issue: t.issue || "None",
          outcome: t.joinOutcome,
          reconnects: t.reconnects,
          recording: t.recorded
            ? "Recorded with consent"
            : t.recordingConsent === "Given"
              ? "Consent given, not recorded"
              : "Not recorded",
        })),
  },
  {
    id: "R11",
    title: "Assessment pipeline",
    domain: "Clinical Operations",
    grain: "One row per assessment",
    basis: "Requested",
    unit: "assessments",
    detail: true,
    drill: "/care",
    columns: [
      { key: "id", label: "Assessment", kind: "id", required: true },
      { key: "type", label: "Type", kind: "text" },
      { key: "therapist", label: "Assigned therapist", kind: "text" },
      { key: "stage", label: "Stage", kind: "text" },
      { key: "visits", label: "Visits", kind: "number" },
      { key: "due", label: "Due", kind: "date" },
      { key: "signed", label: "Signed", kind: "date" },
    ],
    rows: (f) =>
      f.assessments.map((a) => ({
        _href: `/care/${a.participantId}?tab=clinical`,
        id: a.id,
        type: `${a.support} (${a.kind})`,
        therapist: a.therapist,
        stage: a.status,
        visits: a.visits,
        due: a.dueAt,
        signed: a.signedAt ? dayKey(a.signedAt) : null,
      })),
  },
  {
    id: "R12",
    title: "Notes and report backlog",
    domain: "Clinical Operations",
    grain: "One row per document task",
    basis: "Due",
    unit: "documents",
    detail: true,
    drill: "/care",
    columns: [
      { key: "doc", label: "Document", kind: "id", required: true },
      { key: "kind", label: "Kind", kind: "text" },
      { key: "due", label: "Due", kind: "date" },
      { key: "owner", label: "Owner", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "overdue", label: "Days overdue", kind: "number" },
      { key: "escalation", label: "Escalation", kind: "text" },
    ],
    rows: (f, _filters, ctx, names) => {
      const days = (due: string) =>
        Math.max(
          0,
          Math.floor(
            (Date.parse(ctx.now) - Date.parse(due.length === 10 ? `${due}T07:00:00Z` : due)) /
              86_400_000,
          ),
        );
      const notes = f.appointments
        .filter((a) => a.status === "completed" && !["Final", "Amended"].includes(a.noteStatus))
        .map((a) => {
          const o = a.noteDue ? days(a.noteDue) : 0;
          return {
            _href: apptHref(a),
            doc: `Note ${a.ref}`,
            kind: "Session note",
            due: a.noteDue ? dayKey(a.noteDue) : null,
            owner: names.get(a.therapistId) ?? "—",
            status: a.noteStatus === "None" ? "Not started" : a.noteStatus,
            overdue: o,
            escalation: o >= 5 ? "Clinical Lead" : o >= 1 ? "Reminder sent" : "—",
          };
        });
      const docs = f.assessments
        .filter((a) => ["Draft", "In Progress", "Awaiting Review"].includes(a.status))
        .map((a) => {
          const o = a.dueAt < ctx.today ? days(a.dueAt) : 0;
          return {
            _href: `/care/${a.participantId}?tab=clinical`,
            doc: `Report ${a.id}`,
            kind: `${a.support} report`,
            due: a.dueAt,
            owner: a.therapist,
            status: a.status,
            overdue: o,
            escalation: o >= 7 ? "Clinical Lead" : o >= 1 ? "Reminder sent" : "—",
          };
        });
      return [...notes, ...docs].sort((a, b) => b.overdue - a.overdue);
    },
  },
  {
    id: "R13",
    title: "Goal review operations",
    domain: "Clinical Operations",
    grain: "One row per active treatment plan review",
    basis: "Review due",
    unit: "plans",
    detail: true,
    drill: "/care",
    columns: [
      { key: "plan", label: "Plan", kind: "id", required: true },
      { key: "discipline", label: "Discipline", kind: "text" },
      { key: "goals", label: "Goals", kind: "number" },
      { key: "due", label: "Review due", kind: "date" },
      { key: "status", label: "Status", kind: "text" },
      { key: "last", label: "Last review", kind: "date" },
    ],
    rows: (f) =>
      f.goalReviews.map((g) => ({
        _href: `/care/${g.participantId}?tab=clinical`,
        plan: g.plan,
        discipline: g.discipline,
        goals: g.goals,
        due: g.reviewDue,
        status: g.status,
        last: g.lastReview ? dayKey(g.lastReview) : null,
      })),
  },
  {
    id: "R14",
    title: "Service delivery billing",
    domain: "Finance",
    grain: "One row per billable item",
    basis: "Delivered",
    unit: "billable lines",
    detail: true,
    drill: "/care/billing?tab=queue",
    columns: [
      { key: "ref", label: "Line", kind: "id", required: true },
      { key: "session", label: "Session", kind: "text" },
      { key: "date", label: "Date", kind: "date" },
      { key: "item", label: "Item", kind: "text" },
      { key: "units", label: "Units", kind: "number" },
      { key: "route", label: "Payer route", kind: "text" },
      { key: "state", label: "Billing state", kind: "text" },
    ],
    rows: (f, filters) =>
      f.billables
        .filter((b) => inRange(b.start, filters.from, filters.to))
        .map((b) => ({
          _href: "/care/billing?tab=queue",
          ref: b.ref,
          session: b.session,
          date: dayKey(b.start),
          item: b.item,
          units: b.units,
          route: b.route,
          state: b.state,
        })),
  },
  {
    id: "R15",
    title: "Invoice ageing",
    domain: "Finance",
    grain: "One row per issued invoice",
    basis: "Snapshot at range end",
    unit: "AUD",
    detail: true,
    drill: "/care/billing?tab=invoices",
    columns: [
      { key: "number", label: "Invoice", kind: "id", required: true },
      { key: "payer", label: "Payer", kind: "text" },
      { key: "amount", label: "Amount", kind: "money" },
      { key: "paid", label: "Paid", kind: "money" },
      { key: "open", label: "Open", kind: "money" },
      { key: "due", label: "Due", kind: "date" },
      { key: "bucket", label: "Ageing", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
    ],
    rows: (f, filters, ctx) => {
      const end = filters.to < ctx.today ? filters.to : ctx.today;
      return f.invoices
        .filter(
          (i) =>
            i.issuedAt &&
            dayKey(i.issuedAt) <= end &&
            !["Draft", "Pending Approval", "Approved", "Voided"].includes(i.status),
        )
        .map((i) => ({
          _href: `/care/billing/${i.id}`,
          number: i.number,
          payer: i.payer,
          amount: money(i.gross - i.credits),
          paid: i.paid,
          open: i.balance,
          due: i.dueDate,
          bucket: ageBucket(i.dueDate, i.balance, end),
          status: i.status,
        }))
        .sort((a, b) => (b.open as number) - (a.open as number));
    },
  },
  {
    id: "R16",
    title: "NDIS funding exceptions",
    domain: "Finance",
    grain: "One row per support allocation",
    basis: "Snapshot now",
    unit: "cases",
    detail: true,
    drill: "/care/funding?tab=alerts",
    columns: [
      { key: "allocation", label: "Allocation", kind: "id", required: true },
      { key: "management", label: "Management", kind: "text" },
      { key: "period", label: "Period", kind: "text" },
      { key: "verification", label: "Verification", kind: "text" },
      { key: "exception", label: "Exception", kind: "text" },
      { key: "owner", label: "Owner", kind: "text" },
    ],
    rows: (f) =>
      f.funding
        .filter((x) => x.blocking || x.exception !== "None")
        .map((x) => ({
          _href: `/care/funding/${x.participantId}`,
          allocation: x.allocation,
          management: x.management,
          period: x.period,
          verification: x.verification,
          exception: x.exception,
          owner: x.owner,
        })),
  },
  {
    id: "R17",
    title: "Payments and reconciliation",
    domain: "Finance",
    grain: "One row per payment",
    basis: "Paid (receipt date)",
    unit: "AUD",
    detail: true,
    drill: "/care/billing?tab=payments",
    columns: [
      { key: "ref", label: "Payment", kind: "id", required: true },
      { key: "date", label: "Received", kind: "date" },
      { key: "payer", label: "Payer", kind: "text" },
      { key: "matched", label: "Matched", kind: "money" },
      { key: "unmatched", label: "Unmatched", kind: "money" },
      { key: "state", label: "State", kind: "text" },
    ],
    rows: (f, filters) =>
      f.payments
        .filter((p) => inRange(p.receivedOn, filters.from, filters.to))
        .map((p) => ({
          _href: "/care/billing?tab=payments",
          ref: p.ref,
          date: p.receivedOn,
          payer: p.payer,
          matched: p.matched,
          unmatched: p.unmatched,
          state: p.status,
        })),
  },
  {
    id: "R18",
    title: "Workflow automation",
    domain: "Automation",
    grain: "One row per workflow rule",
    basis: "Run time",
    unit: "runs",
    detail: false,
    drill: "/care/operations?tab=rules",
    columns: [
      { key: "rule", label: "Rule", kind: "text" },
      { key: "status", label: "Status", kind: "text" },
      { key: "triggered", label: "Triggered", kind: "number" },
      { key: "successful", label: "Successful", kind: "number" },
      { key: "failed", label: "Failed", kind: "number" },
      { key: "skipped", label: "Skipped", kind: "number" },
      { key: "overrides", label: "Manual overrides", kind: "number" },
      { key: "exceptions", label: "Exceptions", kind: "number" },
    ],
    rows: (f) =>
      f.rules
        .map((r) => ({
          _href: "/care/operations?tab=rules",
          rule: `${r.code} ${r.name}`,
          status: r.status,
          triggered: r.triggered,
          successful: r.successful,
          failed: r.failed,
          skipped: r.skipped,
          overrides: r.overrides,
          exceptions: r.exceptions,
        }))
        .sort((a, b) => b.triggered - a.triggered),
  },
  {
    id: "R19",
    title: "AI suggestions",
    domain: "Automation",
    grain: "One row per suggestion type",
    basis: "Reviewed",
    unit: "suggestions",
    detail: false,
    drill: "/care/operations",
    columns: [
      { key: "type", label: "Suggestion type", kind: "text" },
      { key: "proposed", label: "Proposed", kind: "number" },
      { key: "reviewed", label: "Reviewed", kind: "number" },
      { key: "accepted", label: "Accepted", kind: "number" },
      { key: "rejected", label: "Rejected", kind: "number" },
      { key: "deferred", label: "Deferred", kind: "number" },
      { key: "saved", label: "Est. minutes saved", kind: "number" },
    ],
    rows: (f, filters) =>
      [
        ...groupCount(
          f.suggestions.filter((s) => inRange(s.at, filters.from, filters.to)),
          (s) => s.type,
        ),
      ].map(([type, list]) => ({
        type,
        _href: "/care/operations",
        proposed: list.length,
        reviewed: list.filter((s) => s.decision !== "Pending").length,
        accepted: list.filter((s) => s.decision === "Accepted").length,
        rejected: list.filter((s) => s.decision === "Rejected").length,
        deferred: list.filter((s) => s.decision === "Deferred").length,
        saved: list
          .filter((s) => s.decision === "Accepted")
          .reduce((n, s) => n + s.minutesSaved, 0),
      })),
  },
  {
    id: "R20",
    title: "Operational audit",
    domain: "Audit",
    grain: "One row per action",
    basis: "Action time",
    unit: "actions",
    detail: true,
    drill: "/care/operations",
    columns: [
      { key: "at", label: "Time", kind: "text", required: true },
      { key: "actor", label: "Actor", kind: "text" },
      { key: "module", label: "Module", kind: "text" },
      { key: "action", label: "Action", kind: "text" },
      { key: "target", label: "Target", kind: "id" },
      { key: "outcome", label: "Outcome", kind: "text" },
    ],
    rows: (f, filters) =>
      f.audit
        .filter((a) => inRange(a.at, filters.from, filters.to))
        .map((a) => ({
          at: new Intl.DateTimeFormat("en-AU", {
            timeZone: "Australia/Brisbane",
            day: "numeric",
            month: "short",
            hour: "numeric",
            minute: "2-digit",
          }).format(new Date(a.at)),
          actor: a.actor,
          module: a.module,
          action: a.action,
          target: a.target,
          outcome: a.outcome,
        })),
  },
];

export const reportById = new Map(reports.map((r) => [r.id, r]));

export function ageBucket(due: string | null, balance: number, snapshot: string) {
  if (!due || balance <= 0) return balance <= 0 ? "Settled" : "No due date";
  const d = Math.round(
    (Date.parse(`${snapshot}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000,
  );
  if (d <= 0) return "Not yet due";
  if (d <= 30) return "1–30 days";
  if (d <= 60) return "31–60 days";
  if (d <= 90) return "61–90 days";
  return "90+ days";
}

export function statusLabel(s: string) {
  return (
    (
      {
        tentative: "Tentative",
        booked: "Booked",
        completed: "Completed",
        cancelled: "Cancelled",
        "late-cancelled": "Late cancelled",
        "no-show": "Did not attend",
        aborted: "Incomplete",
        rescheduled: "Rescheduled",
      } as Record<string, string>
    )[s] ?? s
  );
}

/** Runs a report for a scope. Aggregate-only scopes never receive detail rows (section 8). */
export function runReport(
  def: ReportDef,
  facts: ReportFacts,
  filters: ReportFilters,
  ctx: Ctx,
  names: Map<string, string>,
  scope: ReportScope,
) {
  if (!scope.domains.includes(def.domain))
    return { allowed: false as const, reason: "Your role can't open this report." };
  if (def.detail && !scope.detail.includes(def.domain))
    return {
      allowed: false as const,
      reason: "Your role sees aggregate figures for this area, not record-level detail.",
    };
  const rows = suppress(def.rows(facts, filters, ctx, names), scope);
  return { allowed: true as const, rows };
}

/** AT-43: confidential disciplines with fewer than three records are hidden without clinical scope. */
export function suppress(rows: Row[], scope: ReportScope) {
  if (scope.clinicalDetail) return rows;
  return rows.map((r) => {
    const label = Object.values(r).find((v) => typeof v === "string" && isConfidential(v));
    if (!label) return r;
    const n = Object.values(r).find((v) => typeof v === "number");
    if (typeof n === "number" && n > 0 && n < SUPPRESS_BELOW) {
      const out: Row = { ...r };
      for (const [k, v] of Object.entries(out)) if (typeof v === "number") out[k] = null;
      out._suppressed = "Suppressed: fewer than 3";
      return out;
    }
    return r;
  });
}

/* ------------------------------------------------------------------ report builder (section 6) */

export const builderCategories = [
  "Referrals",
  "Participants",
  "Staff",
  "Scheduling",
  "Clinical Operations",
  "Telehealth",
  "Finance",
  "Automation",
] as const;
export type BuilderCategory = (typeof builderCategories)[number];

type Fact = Record<string, unknown>;
type Dim = { key: string; label: string; get: (x: Fact) => string };
type Measure = {
  key: string;
  label: string;
  unit: string;
  agg: (xs: Fact[]) => number | null;
  notWith?: string[];
};
type Basis = { key: string; label: string; get: (x: Fact) => string | null };
type Category = {
  source: keyof ReportFacts;
  bases: Basis[];
  dims: Dim[];
  measures: Measure[];
  statuses: string[];
  status: (x: Fact) => string;
  columns: { key: string; label: string; required?: boolean }[];
};

const s = (k: string) => (x: Fact) => String(x[k] ?? "—");
const rate = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export const categories: Record<BuilderCategory, Category> = {
  Referrals: {
    source: "referrals",
    bases: [
      { key: "submitted", label: "Submitted", get: (x) => x.submittedAt as string },
      { key: "accepted", label: "Accepted", get: (x) => x.acceptedAt as string | null },
    ],
    dims: [
      { key: "status", label: "Status", get: s("status") },
      { key: "source", label: "Source", get: s("source") },
      { key: "region", label: "Region", get: s("region") },
      { key: "owner", label: "Owner", get: s("owner") },
      { key: "management", label: "Funding management", get: s("management") },
    ],
    measures: [
      { key: "count", label: "Referrals", unit: "parent referrals", agg: (xs) => xs.length },
      {
        key: "supports",
        label: "Supports requested",
        unit: "requests",
        agg: (xs) => xs.reduce((n, x) => n + ((x.supports as string[]) ?? []).length, 0),
        notWith: ["owner"],
      },
      {
        key: "missing",
        label: "With missing information",
        unit: "referrals",
        agg: (xs) => xs.filter((x) => ((x.missing as string[]) ?? []).length).length,
      },
      {
        key: "accepted",
        label: "Accepted rate",
        unit: "%",
        agg: (xs) =>
          rate(
            xs.filter((x) => x.status === "Accepted").length,
            xs.filter((x) => x.status !== "Withdrawn").length,
          ),
        notWith: ["status"],
      },
    ],
    statuses: STAGES,
    status: s("status"),
    columns: [
      { key: "ref", label: "Referral", required: true },
      { key: "status", label: "Status" },
      { key: "source", label: "Source" },
      { key: "supports", label: "Supports" },
      { key: "owner", label: "Owner" },
      { key: "region", label: "Region" },
    ],
  },
  Participants: {
    source: "services",
    bases: [
      { key: "requested", label: "Requested", get: (x) => x.requestedAt as string },
      { key: "started", label: "Started", get: (x) => x.startedAt as string | null },
    ],
    dims: [
      { key: "support", label: "Service", get: s("support") },
      { key: "discipline", label: "Discipline", get: s("discipline") },
      { key: "status", label: "Status", get: s("status") },
      { key: "location", label: "Location", get: s("location") },
    ],
    measures: [
      {
        key: "people",
        label: "Unique participants",
        unit: "people",
        agg: (xs) => new Set(xs.map((x) => x.participantId)).size,
      },
      { key: "requests", label: "Service requests", unit: "requests", agg: (xs) => xs.length },
      {
        key: "started",
        label: "Started episodes",
        unit: "episodes",
        agg: (xs) => xs.filter((x) => x.startedAt).length,
      },
    ],
    statuses: ["needs-therapist", "waiting", "assigned", "completed"],
    status: s("status"),
    columns: [
      { key: "id", label: "Service request", required: true },
      { key: "support", label: "Service" },
      { key: "discipline", label: "Discipline" },
      { key: "status", label: "Status" },
      { key: "location", label: "Location" },
    ],
  },
  Staff: {
    source: "appointments",
    bases: [{ key: "scheduled", label: "Scheduled", get: (x) => x.start as string }],
    dims: [
      { key: "discipline", label: "Discipline", get: s("discipline") },
      { key: "therapist", label: "Therapist", get: s("therapistId") },
    ],
    measures: [
      {
        key: "booked",
        label: "Booked hours",
        unit: "hours",
        agg: (xs) =>
          Math.round(
            (xs
              .filter((x) => ["booked", "completed"].includes(x.status as string))
              .reduce((n, x) => n + (x.scheduledMinutes as number), 0) /
              60) *
              10,
          ) / 10,
      },
      {
        key: "delivered",
        label: "Delivered hours",
        unit: "hours",
        agg: (xs) =>
          Math.round(
            (xs
              .filter((x) => x.status === "completed" && x.verified)
              .reduce((n, x) => n + ((x.deliveredMinutes as number | null) ?? 0), 0) /
              60) *
              10,
          ) / 10,
      },
      {
        key: "invoiceTotal",
        label: "Issued revenue",
        unit: "AUD",
        agg: () => null,
        notWith: ["discipline", "therapist", "time"],
      },
    ],
    statuses: ["booked", "completed"],
    status: s("status"),
    columns: [
      { key: "ref", label: "Booking", required: true },
      { key: "discipline", label: "Discipline" },
      { key: "status", label: "Status" },
      { key: "scheduledMinutes", label: "Scheduled minutes" },
      { key: "deliveredMinutes", label: "Delivered minutes" },
    ],
  },
  Scheduling: {
    source: "appointments",
    bases: [
      { key: "scheduled", label: "Scheduled", get: (x) => x.start as string },
      { key: "cancelled", label: "Cancelled", get: (x) => x.cancelledAt as string | null },
    ],
    dims: [
      { key: "status", label: "Status", get: (x) => statusLabel(String(x.status)) },
      { key: "mode", label: "Mode", get: s("mode") },
      { key: "discipline", label: "Discipline", get: s("discipline") },
      { key: "therapist", label: "Therapist", get: s("therapistId") },
    ],
    measures: [
      { key: "count", label: "Bookings", unit: "bookings", agg: (xs) => xs.length },
      {
        key: "delivered",
        label: "Delivered sessions",
        unit: "sessions",
        agg: (xs) => xs.filter((x) => x.status === "completed" && x.verified).length,
      },
      {
        key: "cancel",
        label: "Cancellation rate",
        unit: "%",
        notWith: ["status"],
        agg: (xs) => {
          const c = xs.filter((x) =>
            ["cancelled", "late-cancelled"].includes(x.status as string),
          ).length;
          return rate(
            c,
            c + xs.filter((x) => ["completed", "no-show"].includes(x.status as string)).length,
          );
        },
      },
      {
        key: "dna",
        label: "Did not attend rate",
        unit: "%",
        notWith: ["status"],
        agg: (xs) => {
          const n = xs.filter((x) => x.status === "no-show").length;
          return rate(n, n + xs.filter((x) => x.status === "completed").length);
        },
      },
    ],
    statuses: [
      "Booked",
      "Completed",
      "Cancelled",
      "Late cancelled",
      "Did not attend",
      "Incomplete",
      "Rescheduled",
      "Tentative",
    ],
    status: (x) => statusLabel(String(x.status)),
    columns: [
      { key: "ref", label: "Booking", required: true },
      { key: "start", label: "Start" },
      { key: "mode", label: "Mode" },
      { key: "status", label: "Status" },
      { key: "discipline", label: "Discipline" },
    ],
  },
  "Clinical Operations": {
    source: "assessments",
    bases: [
      { key: "requested", label: "Requested", get: (x) => x.requestedAt as string },
      { key: "finalised", label: "Finalised", get: (x) => x.signedAt as string | null },
    ],
    dims: [
      { key: "status", label: "Stage", get: s("status") },
      { key: "support", label: "Assessment type", get: s("support") },
      { key: "discipline", label: "Discipline", get: s("discipline") },
    ],
    measures: [
      { key: "count", label: "Assessments", unit: "assessments", agg: (xs) => xs.length },
      {
        key: "open",
        label: "Not finalised",
        unit: "assessments",
        agg: (xs) =>
          xs.filter((x) => ["Draft", "In Progress", "Awaiting Review"].includes(x.status as string))
            .length,
      },
      {
        key: "visits",
        label: "Visits",
        unit: "sessions",
        agg: (xs) => xs.reduce((n, x) => n + (x.visits as number), 0),
      },
    ],
    statuses: ["Draft", "In Progress", "Awaiting Review", "Signed", "Amended", "Cancelled"],
    status: s("status"),
    columns: [
      { key: "id", label: "Assessment", required: true },
      { key: "support", label: "Type" },
      { key: "status", label: "Stage" },
      { key: "therapist", label: "Therapist" },
      { key: "dueAt", label: "Due" },
    ],
  },
  Telehealth: {
    source: "telehealth",
    bases: [{ key: "scheduled", label: "Scheduled", get: (x) => x.start as string }],
    dims: [
      { key: "attempt", label: "Attempt outcome", get: s("attempt") },
      { key: "discipline", label: "Discipline", get: s("discipline") },
      { key: "consent", label: "Recording consent", get: s("recordingConsent") },
    ],
    measures: [
      {
        key: "count",
        label: "Telehealth appointments",
        unit: "appointments",
        agg: (xs) => xs.length,
      },
      {
        key: "failures",
        label: "Technical failures",
        unit: "appointments",
        agg: (xs) =>
          xs.filter((x) => x.attempt === "Technical failure" || (x.reconnects as number) > 0)
            .length,
      },
      {
        key: "recorded",
        label: "Recorded sessions",
        unit: "sessions",
        agg: (xs) => xs.filter((x) => x.recorded).length,
      },
    ],
    statuses: ["Joined", "Did not join", "Technical failure", "Cancelled", "Not yet"],
    status: s("attempt"),
    columns: [
      { key: "ref", label: "Booking", required: true },
      { key: "attempt", label: "Attempt" },
      { key: "reconnects", label: "Reconnects" },
      { key: "recordingConsent", label: "Recording consent" },
    ],
  },
  Finance: {
    source: "invoices",
    bases: [
      { key: "created", label: "Created", get: (x) => x.createdAt as string },
      { key: "issued", label: "Issued", get: (x) => x.issuedAt as string | null },
    ],
    dims: [
      { key: "status", label: "Invoice status", get: s("status") },
      { key: "path", label: "Payer route", get: s("path") },
      { key: "payer", label: "Payer", get: s("payer") },
    ],
    measures: [
      { key: "count", label: "Invoices", unit: "invoices", agg: (xs) => xs.length },
      {
        key: "gross",
        label: "Gross invoiced",
        unit: "AUD",
        agg: (xs) => money(xs.reduce((n, x) => n + (x.gross as number), 0)),
      },
      {
        key: "net",
        label: "Net invoiced",
        unit: "AUD",
        agg: (xs) => money(xs.reduce((n, x) => n + (x.gross as number) - (x.credits as number), 0)),
      },
      {
        key: "paid",
        label: "Paid",
        unit: "AUD",
        agg: (xs) => money(xs.reduce((n, x) => n + (x.paid as number), 0)),
      },
      {
        key: "balance",
        label: "Open balance",
        unit: "AUD",
        agg: (xs) => money(xs.reduce((n, x) => n + (x.balance as number), 0)),
      },
    ],
    statuses: [
      "Draft",
      "Pending Approval",
      "Approved",
      "Issued",
      "Part-Paid",
      "Paid",
      "Disputed",
      "Voided",
      "Credited",
    ],
    status: s("status"),
    columns: [
      { key: "number", label: "Invoice", required: true },
      { key: "status", label: "Status" },
      { key: "path", label: "Payer route" },
      { key: "payer", label: "Payer" },
      { key: "gross", label: "Gross" },
      { key: "balance", label: "Balance" },
    ],
  },
  Automation: {
    source: "tasks",
    bases: [
      { key: "created", label: "Created", get: (x) => x.createdAt as string },
      { key: "due", label: "Due", get: (x) => x.dueAt as string },
    ],
    dims: [
      { key: "status", label: "Status", get: s("status") },
      { key: "team", label: "Team", get: s("team") },
      { key: "source", label: "Source", get: s("source") },
      { key: "category", label: "Category", get: s("category") },
    ],
    measures: [
      { key: "count", label: "Tasks", unit: "tasks", agg: (xs) => xs.length },
      {
        key: "open",
        label: "Open tasks",
        unit: "tasks",
        agg: (xs) =>
          xs.filter((x) => !["Completed", "Cancelled"].includes(x.status as string)).length,
        notWith: [],
      },
      {
        key: "rule",
        label: "Created by rules",
        unit: "tasks",
        agg: (xs) => xs.filter((x) => x.source === "Rule").length,
      },
    ],
    statuses: [
      "New",
      "Assigned",
      "In Progress",
      "Waiting for Patient",
      "Waiting for Staff",
      "On Hold",
      "Completed",
      "Cancelled",
      "Escalated",
    ],
    status: s("status"),
    columns: [
      { key: "ref", label: "Task", required: true },
      { key: "title", label: "Title" },
      { key: "status", label: "Status" },
      { key: "team", label: "Team" },
      { key: "owner", label: "Owner" },
      { key: "dueAt", label: "Due" },
    ],
  },
};

export const rowLimits = [25, 50, 100, 250, 500] as const;

export type BuilderSpec = {
  name: string;
  category: BuilderCategory;
  measures: string[];
  dimensions: string[];
  grain: TimeGrain | "";
  basis: string;
  statuses: string[];
  columns: string[];
  sort: { key: string; dir: "asc" | "desc" };
  limit: number;
  view: "Aggregate" | "Detail";
  description: string;
};

export const blankSpec = (category: BuilderCategory = "Scheduling"): BuilderSpec => {
  const c = categories[category];
  return {
    name: "",
    category,
    measures: [c.measures[0]?.key ?? "count"],
    dimensions: [c.dims[0]?.key ?? "status"],
    grain: "",
    basis: c.bases[0]?.key ?? "",
    statuses: [],
    columns: c.columns.map((x) => x.key),
    sort: { key: "", dir: "desc" },
    limit: 50,
    view: "Aggregate",
    description: "",
  };
};

/** Section 6 validations; an empty list means the report can be previewed (AT-33). */
export function specErrors(spec: BuilderSpec, scope: ReportScope): string[] {
  const out: string[] = [];
  const c = categories[spec.category];
  if (!c) return ["Choose a report category."];
  if (!scope.domains.includes(spec.category))
    out.push(`Your role can't report on ${spec.category}.`);
  if (spec.name && (spec.name.trim().length < 3 || spec.name.length > 80))
    out.push("A report name has 3 to 80 characters.");
  if (spec.description.length > 500) out.push("The description can be up to 500 characters.");
  if (!spec.measures.length) out.push("Choose at least one measure.");
  for (const m of spec.measures) {
    const def = c.measures.find((x) => x.key === m);
    if (!def) {
      out.push(`"${m}" isn't a measure for ${spec.category}.`);
      continue;
    }
    for (const d of [...spec.dimensions, ...(spec.grain ? ["time"] : [])])
      if (def.notWith?.includes(d)) {
        const dl = d === "time" ? "time" : (c.dims.find((x) => x.key === d)?.label ?? d);
        out.push(
          `${def.label} can't be grouped by ${dl.toLowerCase()}: the groups wouldn't mean anything.`,
        );
      }
  }
  for (const d of spec.dimensions)
    if (!c.dims.some((x) => x.key === d)) out.push(`"${d}" isn't a grouping for ${spec.category}.`);
  if (spec.dimensions.length > 2) out.push("Group by up to two fields.");
  if (spec.grain && !c.bases.some((b) => b.key === spec.basis))
    out.push("A time series needs a time basis.");
  const units = new Set(spec.measures.map((m) => c.measures.find((x) => x.key === m)?.unit));
  if (units.has("%") && units.size > 1)
    out.push(
      "Rates can't be shown with counts or amounts in one report: they use different units and denominators.",
    );
  if (spec.view === "Detail" && !scope.detail.includes(spec.category))
    out.push("Your role can see aggregate figures here, not record detail.");
  for (const r of c.columns.filter((x) => x.required))
    if (spec.view === "Detail" && !spec.columns.includes(r.key))
      out.push(`${r.label} is needed to open each row.`);
  return out;
}

export function runSpec(
  spec: BuilderSpec,
  facts: ReportFacts,
  filters: ReportFilters,
  names: Map<string, string>,
) {
  const c = categories[spec.category];
  const basis = c.bases.find((b) => b.key === spec.basis) ?? c.bases[0];
  let xs = (facts[c.source] as unknown as Fact[]).filter((x) => {
    const at = basis ? basis.get(x) : null;
    return at ? inRange(at, filters.from, filters.to) : false;
  });
  if (spec.statuses.length) xs = xs.filter((x) => spec.statuses.includes(c.status(x)));
  const label = (k: string, x: Fact) => {
    const d = c.dims.find((y) => y.key === k);
    const v = d ? d.get(x) : "—";
    return k === "therapist" ? (names.get(v) ?? (v === "—" ? "Unassigned" : v)) : v;
  };
  if (spec.view === "Detail") {
    const cols = c.columns.filter((col) => spec.columns.includes(col.key));
    let rows: Row[] = xs.map(
      (x) => Object.fromEntries(cols.map((col) => [col.key, fmtCell(x[col.key])])) as Row,
    );
    if (spec.sort.key) rows = sortRows(rows, spec.sort.key, spec.sort.dir);
    return {
      columns: cols.map((col) => ({ key: col.key, label: col.label, kind: "text" as ColKind })),
      rows: rows.slice(0, spec.limit),
      total: rows.length,
    };
  }
  const groups = new Map<string, Fact[]>();
  for (const x of xs) {
    const key = [
      spec.grain && basis ? bucketOf(dayKey(basis.get(x) as string), spec.grain) : "",
      ...spec.dimensions.map((d) => label(d, x)),
    ].join("|");
    groups.set(key, [...(groups.get(key) ?? []), x]);
  }
  const measures = spec.measures
    .map((m) => c.measures.find((x) => x.key === m))
    .filter((m): m is Measure => Boolean(m));
  const columns: Column[] = [
    ...(spec.grain ? [{ key: "period", label: spec.grain, kind: "text" as ColKind }] : []),
    ...spec.dimensions.map((d) => ({
      key: d,
      label: c.dims.find((x) => x.key === d)?.label ?? d,
      kind: "text" as ColKind,
    })),
    ...measures.map((m) => ({
      key: m.key,
      label: `${m.label} (${m.unit})`,
      kind: (m.unit === "AUD" ? "money" : m.unit === "%" ? "pct" : "number") as ColKind,
    })),
  ];
  let rows: Row[] = [...groups.entries()].map(([key, list]) => {
    const parts = key.split("|");
    const row: Row = { _key: parts[0] ?? "" };
    if (spec.grain) row.period = bucketLabel(parts[0] ?? "", spec.grain);
    spec.dimensions.forEach((d, i) => (row[d] = parts[i + 1] ?? "—"));
    for (const m of measures) row[m.key] = m.agg(list);
    return row;
  });
  rows = spec.sort.key
    ? sortRows(rows, spec.sort.key, spec.sort.dir)
    : rows.sort((a, b) => String(a._key).localeCompare(String(b._key)));
  return { columns, rows: rows.slice(0, spec.limit), total: rows.length };
}

const fmtCell = (v: unknown): Cell =>
  Array.isArray(v)
    ? v.join(", ")
    : typeof v === "number" || typeof v === "string"
      ? typeof v === "string" && /T\d\d:/.test(v)
        ? dayKey(v)
        : v
      : v === null || v === undefined
        ? null
        : String(v);

export function sortRows(rows: Row[], key: string, dir: "asc" | "desc") {
  return [...rows].sort((a, b) => {
    const x = a[key];
    const y = b[key];
    const c =
      typeof x === "number" && typeof y === "number"
        ? x - y
        : String(x ?? "").localeCompare(String(y ?? ""));
    return dir === "asc" ? c : -c;
  });
}

/* ------------------------------------------------------------------ CSV */

export function toCsv(
  columns: { key: string; label: string }[],
  rows: Row[],
  meta: [string, string][],
) {
  // Quoting alone does not stop a spreadsheet running a formula, so text that starts like one gets
  // a leading apostrophe. Numbers can't be formulas, so a negative amount stays a number.
  const cell = (v: unknown) => {
    const raw = v === null || v === undefined ? "" : String(v);
    const t = typeof v === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return [
    ...meta.map(([k, v]) => `${cell(`# ${k}`)},${cell(v)}`),
    "",
    columns.map((c) => cell(c.label)).join(","),
    ...rows.map((r) =>
      columns.map((c) => cell(r[c.key] ?? (r._suppressed ? "Suppressed" : ""))).join(","),
    ),
  ].join("\r\n");
}

/** A whole report's arithmetic is aggregate in nature; this guards the sample count notes. */
export const SMALL_SAMPLE = 5;
export const isTelehealth = (a: AppointmentFact) => a.mode === "Telehealth";
export const deliveredIn = (f: ReportFacts, from: string, to: string) =>
  f.appointments.filter((a) => isDelivered(a) && inRange(a.start, from, to));
