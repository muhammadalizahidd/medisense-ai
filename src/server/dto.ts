import "server-only";
import type { ObjectId } from "mongodb";
import type {
  AppointmentDto,
  AssignmentDto,
  ClientStage,
  ClientSummaryDto,
  NeedDto,
  NotificationDto,
} from "@/lib/live/types";
import type {
  AppointmentDoc,
  AssignmentDoc,
  ClientDoc,
  NotificationDoc,
  TherapistDoc,
} from "./models";
import { completenessOf, statusOf } from "./participants";

export type NameLookup = Map<string, string>;

export const nameMap = (docs: { _id: ObjectId; name: string }[]): NameLookup =>
  new Map(docs.map((d) => [d._id.toHexString(), d.name]));

const nameOf = (names: NameLookup, id: ObjectId | null) =>
  (id && names.get(id.toHexString())) ?? null;

export function stageOf(client: Pick<ClientDoc, "needs" | "discharged">): ClientStage {
  if (client.discharged) return "Discharged";
  if (client.needs.some((n) => n.status === "needs-therapist")) return "Needs a therapist";
  if (client.needs.some((n) => n.status === "waiting")) return "Waiting for therapist";
  return "Active";
}

/**
 * The service request a visit delivers. Older visits have no id, so fall back to the clinician's
 * service in that discipline, preferring one with a treatment plan.
 */
export function needOfVisit(
  client: Pick<ClientDoc, "needs">,
  visit: Pick<AppointmentDoc, "needId" | "discipline" | "therapistId">,
) {
  if (visit.needId) {
    const exact = client.needs.find((n) => n.id === visit.needId);
    if (exact) return exact;
  }
  const mine = client.needs.filter(
    (n) => n.discipline === visit.discipline && n.therapistId?.equals(visit.therapistId),
  );
  return mine.find((n) => n.status === "assigned") ?? mine[0];
}

/** The service request an assignment is for. */
export const needOf = (client: Pick<ClientDoc, "needs">, a: Pick<AssignmentDoc, "needId">) =>
  client.needs.find((n) => n.id === a.needId);

export function needDtos(client: ClientDoc, therapists: NameLookup): NeedDto[] {
  return client.needs.map((n) => ({
    id: n.id,
    support: n.support,
    details: n.details ?? "",
    location: n.location ?? "Home",
    discipline: n.discipline,
    frequency: n.frequency,
    status: n.status,
    therapistName: nameOf(therapists, n.therapistId),
  }));
}

export function clientSummary(client: ClientDoc, therapists: NameLookup): ClientSummaryDto {
  return {
    id: client._id.toHexString(),
    name: client.name,
    suburb: client.suburb,
    region: client.region,
    funding: client.funding,
    needs: needDtos(client, therapists),
    stage: stageOf(client),
    createdAt: client.createdAt.toISOString(),
    mrn: client.mrn ?? null,
    phone: client.phone,
    participantStatus: statusOf(client),
    completeness: completenessOf(client)?.percent ?? null,
    missing: completenessOf(client)?.missing ?? [],
  };
}

export type SeriesLookup = Map<string, { index: number; total: number }>;

/** Position of each visit in its recurring series. Cancelled visits drop out; replacements count. */
export function seriesLookup(visits: AppointmentDoc[]): SeriesLookup {
  const groups = new Map<string, AppointmentDoc[]>();
  for (const v of visits) {
    if (!v.seriesId || ["cancelled", "late-cancelled", "rescheduled"].includes(v.status)) continue;
    const key = v.seriesId.toHexString();
    groups.set(key, [...(groups.get(key) ?? []), v]);
  }
  const lookup: SeriesLookup = new Map();
  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => a.start.getTime() - b.start.getTime());
    ordered.forEach((v, i) =>
      lookup.set(v._id.toHexString(), { index: i + 1, total: ordered.length }),
    );
  }
  return lookup;
}

/** Notes written before signing existed count as final. */
export const noteStatusOf = (a: AppointmentDoc) => a.note?.status ?? "Final";

function noteDto(a: AppointmentDoc, viewer: "staff" | "patient"): AppointmentDto["note"] {
  const n = a.note;
  if (!n) return null;
  const status = noteStatusOf(a);
  // Patients see only the plain summary, and only once the clinician has signed the note.
  if (viewer === "patient" && status !== "Final" && status !== "Amended") return null;
  const staff = viewer === "staff";
  return {
    text: staff ? n.text : null,
    soap:
      staff && n.subjective !== undefined
        ? {
            subjective: n.subjective ?? "",
            objective: n.objective ?? "",
            assessment: n.assessment ?? "",
            plan: n.plan ?? "",
          }
        : null,
    forPatient: n.forPatient,
    status,
    aiDrafted: Boolean(n.aiDrafted),
    signedAt: n.signedAt?.toISOString() ?? (status === "Final" ? n.at.toISOString() : null),
    amendments: staff ? (n.amendments ?? []).map((m) => ({ ...m, at: m.at.toISOString() })) : [],
    byName: n.byName,
    at: n.at.toISOString(),
  };
}

export function appointmentDto(
  a: AppointmentDoc,
  clients: NameLookup,
  therapists: NameLookup,
  series: SeriesLookup = new Map(),
  /** Patients see the plain-language summary only, never the clinical note. */
  viewer: "staff" | "patient" = "staff",
): AppointmentDto {
  return {
    id: a._id.toHexString(),
    clientId: a.clientId.toHexString(),
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    status: a.status,
    discipline: a.discipline,
    clientName: nameOf(clients, a.clientId) ?? "Patient",
    therapistName: nameOf(therapists, a.therapistId) ?? "Therapist",
    series: series.get(a._id.toHexString()) ?? null,
    cancellation: a.cancellation
      ? {
          by: a.cancellation.by,
          reason: a.cancellation.reason,
          noticeHours: a.cancellation.noticeHours,
          chargeable: a.cancellation.chargeable,
          actorName: a.cancellation.actorName,
        }
      : null,
    note: noteDto(a, viewer),
    checkIn: a.checkIn ? { ...a.checkIn, at: a.checkIn.at.toISOString() } : null,
    checkOut: a.checkOut ? { ...a.checkOut, at: a.checkOut.at.toISOString() } : null,
    session: viewer === "staff" ? (a.session ?? null) : null,
    aborted: a.aborted ? { ...a.aborted, at: a.aborted.at.toISOString() } : null,
    invoiced: Boolean(a.invoiceId),
    modality: a.modality ?? "In person",
    confirmedByPatient: a.confirmedByPatient?.toISOString() ?? null,
    feedback: a.feedback
      ? { rating: a.feedback.rating, comment: a.feedback.comment, at: a.feedback.at.toISOString() }
      : null,
  };
}

export function assignmentDto(
  a: AssignmentDoc,
  firstVisit: Date,
  clients: NameLookup,
  therapists: NameLookup,
): AssignmentDto {
  return {
    id: a._id.toHexString(),
    clientId: a.clientId.toHexString(),
    needId: a.needId,
    clientName: nameOf(clients, a.clientId) ?? "Patient",
    therapistName: nameOf(therapists, a.therapistId) ?? "Therapist",
    discipline: a.discipline,
    status: a.status,
    firstVisit: firstVisit.toISOString(),
    declineReason: a.declineReason,
    createdAt: a.createdAt.toISOString(),
  };
}

export const notificationDto = (n: NotificationDoc): NotificationDto => ({
  id: n._id.toHexString(),
  title: n.title,
  body: n.body,
  href: n.href,
  read: n.read,
  createdAt: n.createdAt.toISOString(),
});

export const therapistNames = (therapists: TherapistDoc[]) => nameMap(therapists);
