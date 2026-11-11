import "server-only";
import type { ClientHomeDto } from "@/lib/live/types";
import { patientInvoices } from "./billing";
import { patientProgress } from "./clinical";
import { collections } from "./db";
import { appointmentDto, nameMap, needDtos, seriesLookup } from "./dto";
import { UserFacingError } from "./http";
import type { UserDoc } from "./models";

export async function clientHome(user: UserDoc): Promise<ClientHomeDto> {
  const db = await collections();
  const client = user.clientId ? await db.clients.findOne({ _id: user.clientId }) : null;
  if (!client) throw new UserFacingError("No patient record is linked to this account.", 404);
  const [team, visits, conversations, progress, invoices] = await Promise.all([
    db.therapists.find({}, { projection: { name: 1 } }).toArray(),
    db.appointments.find({ clientId: client._id }).sort({ start: 1 }).toArray(),
    db.conversations.find({ clientId: client._id }).toArray(),
    patientProgress(client._id),
    patientInvoices(client._id),
  ]);
  const names = nameMap(team);
  const series = seriesLookup(visits);
  const now = Date.now();
  const upcoming = visits
    .filter((v) => v.status === "booked" && v.start.getTime() >= now)
    .slice(0, 10);
  const chatByTherapist = new Map(
    conversations.map((c) => [c.therapistId.toHexString(), c._id.toHexString()]),
  );
  const toRate = visits
    .filter(
      (v) => v.status === "completed" && !v.feedback && v.start.getTime() >= now - 30 * 86_400_000,
    )
    .slice(-5);
  return {
    name: client.name,
    phone: client.phone,
    emergencyContact: client.emergencyContact ?? null,
    discharged: client.discharged
      ? { at: client.discharged.at.toISOString(), reason: client.discharged.reason }
      : null,
    toRate: toRate.map((v) => appointmentDto(v, nameMap([client]), names, series, "patient")),
    needs: needDtos(client, names),
    // One row per therapist, even when they deliver more than one service (an FCA and OT, say).
    team: client.needs.flatMap((n, i, all) =>
      n.status === "assigned" &&
      n.therapistId &&
      all.findIndex((m) => m.status === "assigned" && m.therapistId?.equals(n.therapistId!)) === i
        ? [
            {
              therapistName: names.get(n.therapistId.toHexString()) ?? "Your therapist",
              discipline: n.discipline,
              conversationId: chatByTherapist.get(n.therapistId.toHexString()) ?? null,
            },
          ]
        : [],
    ),
    upcoming: upcoming.map((v) => appointmentDto(v, nameMap([client]), names, series, "patient")),
    progress,
    invoices,
    dischargeAdvice: client.discharged?.advice || null,
  };
}
