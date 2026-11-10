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

export type NameLookup = Map<string, string>;

export const nameMap = (docs: { _id: ObjectId; name: string }[]): NameLookup =>
  new Map(docs.map((d) => [d._id.toHexString(), d.name]));

const nameOf = (names: NameLookup, id: ObjectId | null) =>
  (id && names.get(id.toHexString())) ?? null;

export function stageOf(client: Pick<ClientDoc, "needs">): ClientStage {
  if (client.needs.some((n) => n.status === "needs-therapist")) return "Needs a therapist";
  if (client.needs.some((n) => n.status === "waiting")) return "Waiting for therapist";
  return "Active";
}

export function needDtos(client: ClientDoc, therapists: NameLookup): NeedDto[] {
  return client.needs.map((n) => ({
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
  };
}

export type SeriesLookup = Map<string, { index: number; total: number }>;

/** Position of each visit in its recurring series. Cancelled visits drop out; replacements count. */
export function seriesLookup(visits: AppointmentDoc[]): SeriesLookup {
  const groups = new Map<string, AppointmentDoc[]>();
  for (const v of visits) {
    if (!v.seriesId || v.status === "cancelled" || v.status === "late-cancelled") continue;
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

export function appointmentDto(
  a: AppointmentDoc,
  clients: NameLookup,
  therapists: NameLookup,
  series: SeriesLookup = new Map(),
): AppointmentDto {
  return {
    id: a._id.toHexString(),
    start: a.start.toISOString(),
    end: a.end.toISOString(),
    status: a.status,
    discipline: a.discipline,
    clientName: nameOf(clients, a.clientId) ?? "Client",
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
    clientName: nameOf(clients, a.clientId) ?? "Client",
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
