import "server-only";
import type { ObjectId } from "mongodb";
import {
  appointmentTypes,
  isAppointmentType,
  periodLabel,
  typeLabel,
  systemReportById,
  type SystemReportFormat,
  type SystemReportId,
  type SystemReportTable,
} from "@/lib/live/system-reports";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit } from "./live";
import type { AppointmentDoc, AppointmentStatus, ClientDoc, TherapistDoc, UserDoc } from "./models";
import { can } from "./permissions";
import { modeOf } from "./reports";

const TZ = "Australia/Brisbane";
/** Brisbane has no daylight saving, so a day always starts at 00:00 +10:00. */
const OFFSET = "+10:00";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, dateStyle: "short" });
const timeFmt = new Intl.DateTimeFormat("en-AU", {
  timeZone: TZ,
  hour: "numeric",
  minute: "2-digit",
});
const weekdayFmt = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "long" });

const day = (d: Date | null | undefined) => (d ? dayFmt.format(d) : "");
const time = (d: Date) => timeFmt.format(d).toLowerCase();
const hours = (minutes: number) => Math.round(minutes / 6) / 10;

const statusLabel: Record<AppointmentStatus, string> = {
  tentative: "Tentative",
  booked: "Booked",
  completed: "Completed",
  cancelled: "Cancelled",
  "late-cancelled": "Late cancellation",
  "no-show": "Did not attend",
  aborted: "Incomplete",
  rescheduled: "Rescheduled",
};

const isCancelled = (s: AppointmentStatus) => s === "cancelled" || s === "late-cancelled";
/** Booked and not yet closed: a visit still to happen, or one whose outcome isn't recorded yet. */
const isBooked = (a: AppointmentDoc) => a.status === "booked" || a.status === "tentative";

/** Time actually given: the recorded check-out minutes, else the booked length. */
const minutesGiven = (a: AppointmentDoc) =>
  a.status === "completed"
    ? (a.checkOut?.minutes ?? Math.round((a.end.getTime() - a.start.getTime()) / 60_000))
    : 0;

function noteState(a: AppointmentDoc) {
  if (a.status !== "completed") return "";
  if (!a.note) return "Not written";
  if (a.note.signedAt || a.note.status === "Final" || a.note.status === "Amended") return "Signed";
  return a.note.status ?? "Draft";
}

function quote(value: string | number) {
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A byte-order mark first, so Excel reads names with accents correctly. */
const toCsv = (head: readonly string[], rows: (string | number)[][]) =>
  `﻿${[head, ...rows].map((r) => r.map(quote).join(",")).join("\r\n")}\r\n`;

/** "12 Wattle Avenue, Carindale QLD 4152" from the patient's record, or "" when there is none. */
function homeAddress(c: ClientDoc | undefined) {
  const a = c?.profile?.address;
  if (!a?.street) return "";
  return `${a.street}, ${[a.suburb, a.state, a.postcode].filter(Boolean).join(" ")}`;
}

const parseDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

type Tally = {
  visits: number;
  completed: number;
  cancelled: number;
  dna: number;
  upcoming: number;
  minutes: number;
  first: Date | null;
  last: Date | null;
};
const blank = (): Tally => ({
  visits: 0,
  completed: 0,
  cancelled: 0,
  dna: 0,
  upcoming: 0,
  minutes: 0,
  first: null,
  last: null,
});

function count(t: Tally, a: AppointmentDoc) {
  if (a.status === "rescheduled") return;
  t.visits += 1;
  if (a.status === "completed") {
    t.completed += 1;
    t.minutes += minutesGiven(a);
    if (!t.first || a.start < t.first) t.first = a.start;
    if (!t.last || a.start > t.last) t.last = a.start;
  }
  if (isCancelled(a.status)) t.cancelled += 1;
  if (a.status === "no-show") t.dna += 1;
  if (isBooked(a)) t.upcoming += 1;
}

/** What one row of each report counts, for the first headline figure. */
const rowNoun: Record<SystemReportId, string> = {
  "by-patient": "Patients",
  patients: "Patients",
  "by-therapist": "Therapists",
  "patient-therapist": "Patient and therapist pairs",
  caseload: "Therapists",
  visits: "Visits",
  missed: "Visits not delivered",
  "by-day": "Days",
  "by-type": "Appointment types",
  "type-home": "Home visits",
  "type-telehealth": "Telehealth appointments",
  "type-school": "School visits",
  "type-daycare": "Daycare visits",
  "type-day-program": "Day program visits",
  "type-community": "Community visits",
};

/** The columns people scan a report by, shown in bold on screen and in the PDF. */
const STRONG = new Set(["Reference", "MRN", "Patient", "Therapist", "Funding"]);

const number = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });

/**
 * Works out one system report on the server for a Brisbane date range (inclusive): the counting
 * happens here, so the screen and the files receive only the finished table. Row-level detail, so
 * each report needs its detail permission.
 */
export async function systemReportTable(
  admin: UserDoc,
  reportId: string,
  fromParam: string | null,
  toParam: string | null,
  typeParam: string | null = null,
): Promise<SystemReportTable> {
  const report = systemReportById(reportId);
  if (!report) throw new UserFacingError("That report doesn't exist.", 404);
  if (!can(admin, report.permission)) {
    throw new UserFacingError("You don't have access to this report.", 400);
  }
  const from = parseDay(fromParam);
  const to = parseDay(toParam);
  if (from && to && from > to) throw new UserFacingError("The start date is after the end date.");
  // A per-type report is always that type; otherwise an optional type cuts any visit report.
  const fixed = "appointmentType" in report ? report.appointmentType : null;
  const type = fixed ?? (isAppointmentType(typeParam) ? typeParam : null);

  const range: { $gte?: Date; $lt?: Date } = {};
  if (from) range.$gte = new Date(`${from}T00:00:00${OFFSET}`);
  if (to) range.$lt = new Date(new Date(`${to}T00:00:00${OFFSET}`).getTime() + 86_400_000);

  const { appointments, clients, therapists } = await collections();
  const needsVisits = report.id !== "caseload" && report.id !== "patients";
  const [allVisits, clientList, therapistList] = await Promise.all([
    needsVisits || report.id === "patients"
      ? appointments
          .find(report.id === "patients" || !(from || to) ? {} : { start: range }, {
            projection: {
              therapistId: 1,
              clientId: 1,
              discipline: 1,
              start: 1,
              end: 1,
              status: 1,
              cancellation: 1,
              checkOut: 1,
              note: 1,
              noShow: 1,
              aborted: 1,
              modality: 1,
              ref: 1,
              needId: 1,
              purpose: 1,
              "site.location": 1,
              "site.address": 1,
            },
          })
          .sort({ start: 1 })
          .toArray()
      : Promise.resolve([] as AppointmentDoc[]),
    clients
      .find(
        {},
        {
          projection: {
            name: 1,
            mrn: 1,
            dateOfBirth: 1,
            email: 1,
            phone: 1,
            suburb: 1,
            region: 1,
            funding: 1,
            discharged: 1,
            provisional: 1,
            createdAt: 1,
            "needs.id": 1,
            "needs.location": 1,
            "profile.address": 1,
          },
        },
      )
      .toArray() as Promise<ClientDoc[]>,
    therapists.find({}, { projection: { profile: 0, weekly: 0, staff: 0 } }).toArray() as Promise<
      TherapistDoc[]
    >,
  ]);

  const clientById = new Map(clientList.map((c) => [String(c._id), c]));
  const therapistById = new Map(therapistList.map((t) => [String(t._id), t]));
  const patientName = (id: ObjectId) => clientById.get(String(id))?.name ?? "Unknown patient";
  const patientMrn = (id: ObjectId) => clientById.get(String(id))?.mrn ?? "";
  const therapistName = (id: ObjectId) =>
    therapistById.get(String(id))?.name ?? "Unknown therapist";
  const byName = <T>(list: T[], name: (t: T) => string) =>
    list.sort((a, b) => name(a).localeCompare(name(b)));
  const typeOf = (a: AppointmentDoc) => {
    const need = clientById.get(String(a.clientId))?.needs?.find((n) => n.id === a.needId);
    return modeOf(a.site?.location ?? need?.location, a.modality);
  };
  // A chosen appointment type cuts every visit-based report down to that type.
  const visits = type ? allVisits.filter((a) => typeOf(a) === type) : allVisits;

  const head = report.columns;
  let rows: (string | number)[][] = [];

  switch (report.id satisfies SystemReportId) {
    case "by-patient": {
      const tallies = new Map<string, { tally: Tally; therapists: Set<string> }>();
      for (const a of visits) {
        const key = String(a.clientId);
        const entry = tallies.get(key) ?? { tally: blank(), therapists: new Set<string>() };
        count(entry.tally, a);
        if (a.status === "completed") entry.therapists.add(therapistName(a.therapistId));
        tallies.set(key, entry);
      }
      rows = byName([...tallies.entries()], ([id]) => clientById.get(id)?.name ?? "").map(
        ([id, { tally: t, therapists: ts }]) => {
          const c = clientById.get(id);
          return [
            c?.mrn ?? "",
            c?.name ?? "Unknown patient",
            c?.funding ?? "",
            c?.suburb ?? "",
            t.visits,
            t.completed,
            t.cancelled,
            t.dna,
            t.upcoming,
            hours(t.minutes),
            [...ts].sort().join("; "),
            day(t.first),
            day(t.last),
          ];
        },
      );
      break;
    }
    case "patients": {
      const seen = new Map<string, Set<string>>();
      for (const a of visits) {
        if (a.status !== "completed" && a.status !== "booked" && a.status !== "tentative") continue;
        const set = seen.get(String(a.clientId)) ?? new Set<string>();
        set.add(therapistName(a.therapistId));
        seen.set(String(a.clientId), set);
      }
      rows = byName([...clientList], (c) => c.name).map((c) => [
        c.mrn ?? "",
        c.name,
        c.dateOfBirth ?? "",
        c.phone ?? "",
        c.email,
        c.suburb,
        c.region,
        c.funding,
        c.discharged ? "Discharged" : c.provisional ? "Provisional" : "Active",
        [...(seen.get(String(c._id)) ?? [])].sort().join("; "),
        day(c.createdAt),
      ]);
      break;
    }
    case "by-therapist": {
      const tallies = new Map<string, { tally: Tally; patients: Set<string> }>();
      for (const t of therapistList) {
        if (t.active !== false) tallies.set(String(t._id), { tally: blank(), patients: new Set() });
      }
      for (const a of visits) {
        const key = String(a.therapistId);
        const entry = tallies.get(key) ?? { tally: blank(), patients: new Set<string>() };
        count(entry.tally, a);
        if (a.status === "completed") entry.patients.add(String(a.clientId));
        tallies.set(key, entry);
      }
      rows = byName([...tallies.entries()], ([id]) => therapistById.get(id)?.name ?? "").map(
        ([id, { tally: t, patients }]) => {
          const th = therapistById.get(id);
          return [
            th?.name ?? "Unknown therapist",
            th?.discipline ?? "",
            th?.region ?? "",
            patients.size,
            t.visits,
            t.completed,
            t.cancelled,
            t.dna,
            t.upcoming,
            hours(t.minutes),
            t.completed ? Math.round(t.minutes / t.completed) : 0,
          ];
        },
      );
      break;
    }
    case "patient-therapist": {
      const pairs = new Map<string, { a: AppointmentDoc; tally: Tally }>();
      for (const a of visits) {
        if (a.status !== "completed") continue;
        const key = `${String(a.therapistId)}|${String(a.clientId)}`;
        const entry = pairs.get(key) ?? { a, tally: blank() };
        count(entry.tally, a);
        pairs.set(key, entry);
      }
      rows = [...pairs.values()]
        .sort(
          (x, y) =>
            therapistName(x.a.therapistId).localeCompare(therapistName(y.a.therapistId)) ||
            patientName(x.a.clientId).localeCompare(patientName(y.a.clientId)),
        )
        .map(({ a, tally: t }) => [
          therapistName(a.therapistId),
          therapistById.get(String(a.therapistId))?.discipline ?? a.discipline,
          patientMrn(a.clientId),
          patientName(a.clientId),
          t.completed,
          t.minutes,
          hours(t.minutes),
          day(t.first),
          day(t.last),
        ]);
      break;
    }
    case "caseload": {
      rows = byName(
        therapistList.filter((t) => t.active !== false),
        (t) => t.name,
      ).map((t) => [
        t.name,
        t.discipline,
        t.region,
        t.seniority,
        t.activeClients,
        t.capacity,
        Math.max(t.capacity - t.activeClients, 0),
        t.caseloadScore,
        t.caseloadScore >= 80 ? "At Risk" : t.caseloadScore >= 60 ? "Watch" : "Healthy",
      ]);
      break;
    }
    case "visits": {
      rows = visits.map((a) => [
        a.ref ?? "",
        day(a.start),
        time(a.start),
        patientName(a.clientId),
        patientMrn(a.clientId),
        therapistName(a.therapistId),
        a.discipline,
        typeOf(a),
        statusLabel[a.status],
        Math.round((a.end.getTime() - a.start.getTime()) / 60_000),
        a.status === "completed" ? minutesGiven(a) : "",
        noteState(a),
      ]);
      break;
    }
    case "type-home":
    case "type-telehealth":
    case "type-school":
    case "type-daycare":
    case "type-day-program":
    case "type-community": {
      rows = visits.map((a) => {
        const c = clientById.get(String(a.clientId));
        const address =
          a.site?.address || (typeOf(a) === "Home" ? homeAddress(c) : "") || c?.suburb || "";
        return [
          a.ref ?? "",
          day(a.start),
          time(a.start),
          c?.name ?? "Unknown patient",
          c?.mrn ?? "",
          c?.dateOfBirth ?? "",
          c?.phone ?? "",
          c?.funding ?? "",
          typeOf(a) === "Telehealth" ? "Video call" : address,
          therapistName(a.therapistId),
          a.discipline,
          a.purpose ?? "",
          statusLabel[a.status],
          Math.round((a.end.getTime() - a.start.getTime()) / 60_000),
          a.status === "completed" ? minutesGiven(a) : "",
          noteState(a),
        ];
      });
      break;
    }
    case "missed": {
      rows = visits
        .filter((a) => isCancelled(a.status) || a.status === "no-show" || a.status === "aborted")
        .map((a) => [
          a.ref ?? "",
          day(a.start),
          time(a.start),
          patientName(a.clientId),
          patientMrn(a.clientId),
          therapistName(a.therapistId),
          statusLabel[a.status],
          a.cancellation
            ? `${a.cancellation.by === "client" ? "Patient" : "Medisense"}: ${a.cancellation.reason}`
            : a.aborted
              ? a.aborted.reason
              : a.noShow
                ? `Did not attend. Attempts: ${a.noShow.attempts}`
                : "",
        ]);
      break;
    }
    case "by-day": {
      const days = new Map<
        string,
        { tally: Tally; when: Date; patients: Set<string>; therapists: Set<string> }
      >();
      for (const a of visits) {
        const key = day(a.start);
        const entry = days.get(key) ?? {
          tally: blank(),
          when: a.start,
          patients: new Set<string>(),
          therapists: new Set<string>(),
        };
        count(entry.tally, a);
        if (a.status === "completed") {
          entry.patients.add(String(a.clientId));
          entry.therapists.add(String(a.therapistId));
        }
        days.set(key, entry);
      }
      rows = [...days.entries()]
        .sort(([x], [y]) => x.localeCompare(y))
        .map(([d, e]) => [
          d,
          weekdayFmt.format(e.when),
          e.tally.visits,
          e.tally.completed,
          e.tally.cancelled,
          e.tally.dna,
          hours(e.tally.minutes),
          e.patients.size,
          e.therapists.size,
        ]);
      break;
    }
    case "by-type": {
      const kinds = type ? [type] : [...appointmentTypes];
      const tallies = new Map(
        kinds.map((k) => [
          k as string,
          { tally: blank(), patients: new Set<string>(), therapists: new Set<string>() },
        ]),
      );
      for (const a of visits) {
        const entry = tallies.get(typeOf(a));
        if (!entry) continue;
        count(entry.tally, a);
        if (a.status === "completed") {
          entry.patients.add(String(a.clientId));
          entry.therapists.add(String(a.therapistId));
        }
      }
      rows = [...tallies.entries()].map(([k, e]) => [
        typeLabel(k),
        e.tally.visits,
        e.tally.completed,
        e.tally.cancelled,
        e.tally.dna,
        e.tally.upcoming,
        hours(e.tally.minutes),
        e.patients.size,
        e.therapists.size,
      ]);
      break;
    }
  }

  // Where a report lists visits by reference, the MRN comes straight after it.
  const order = head.map((_, i) => i);
  const ref = head.indexOf("Reference" as never);
  const mrn = head.indexOf("MRN" as never);
  if (ref === 0 && mrn > 1) order.splice(1, 0, ...order.splice(mrn, 1));
  const cols = order.map((i) => head[i] as string);
  rows = rows.map((r) => order.map((i) => r[i] ?? ""));
  const numeric = cols.map((_, i) => rows.some((r) => typeof r[i] === "number"));
  const sum = (label: string) => {
    const i = cols.indexOf(label);
    return rows.reduce((n, r) => n + (typeof r[i] === "number" ? r[i] : 0), 0);
  };
  return {
    id: report.id,
    title: report.title,
    description: report.description,
    period: periodLabel(from ?? "", to ?? ""),
    type: typeLabel(type ?? ""),
    generatedAt: new Date().toISOString(),
    columns: cols.map((label, i) => ({
      label,
      numeric: numeric[i] ?? false,
      strong: STRONG.has(label),
    })),
    rows,
    totals: [
      { label: rowNoun[report.id], value: number.format(rows.length) },
      ...(report.totals as readonly string[]).map((label) => ({
        label,
        value: number.format(sum(label)),
      })),
    ],
  };
}

/** A download of one report: CSV for Excel, or the branded PDF. Every download is audited. */
export async function downloadSystemReport(
  admin: UserDoc,
  table: SystemReportTable,
  format: Exclude<SystemReportFormat, "json">,
  stamp: string,
) {
  await audit(
    admin,
    `Downloaded system report "${table.title}" as ${format.toUpperCase()} (${table.period}, ${table.type}, ${table.rows.length} rows)`,
    null,
  );
  const base = `medisense-${table.id}-${stamp}`;
  if (format === "csv") {
    return {
      body: toCsv(
        table.columns.map((c) => c.label),
        table.rows,
      ),
      type: "text/csv; charset=utf-8",
      filename: `${base}.csv`,
    };
  }
  const [{ renderPdf }, { SystemReportDocument }] = await Promise.all([
    import("@/lib/pdf/render"),
    import("@/lib/pdf/documents/system-report"),
  ]);
  const pdf = await renderPdf(SystemReportDocument({ table, preparedBy: admin.name }));
  return { body: new Uint8Array(pdf), type: "application/pdf", filename: `${base}.pdf` };
}
