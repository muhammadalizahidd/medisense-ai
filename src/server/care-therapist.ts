import "server-only";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { caseloadStatus, declineReasons, practitioner } from "@/lib/live/catalogue";
import { ageLabel, slotLabel } from "@/lib/live/time";
import type { TherapistHomeDto } from "@/lib/live/types";
import { collections } from "./db";
import { appointmentDto, assignmentDto, nameMap, needOf, seriesLookup } from "./dto";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { UserDoc } from "./models";
import { bookSeries } from "./visits";

export const respondSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("accept") }),
  z.object({ decision: z.literal("decline"), reason: z.enum(declineReasons) }),
]);

async function myTherapist(user: UserDoc) {
  const { therapists } = await collections();
  const therapist = user.therapistId ? await therapists.findOne({ _id: user.therapistId }) : null;
  if (!therapist) throw new UserFacingError("No therapist profile is linked to this account.", 404);
  return therapist;
}

export async function respond(
  user: UserDoc,
  assignmentId: ObjectId,
  input: z.infer<typeof respondSchema>,
) {
  const db = await collections();
  const therapist = await myTherapist(user);
  const assignment = await db.assignments.findOne({
    _id: assignmentId,
    therapistId: therapist._id,
  });
  if (!assignment) throw new UserFacingError("Request not found.", 404);
  if (assignment.status !== "pending") {
    throw new UserFacingError("This request has already been answered or withdrawn.", 409);
  }
  const client = await db.clients.findOne({ _id: assignment.clientId });
  const visit = await db.appointments.findOne({ _id: assignment.appointmentId });
  if (!client || !visit) throw new UserFacingError("Request not found.", 404);
  const accepted = input.decision === "accept";
  const now = new Date();
  const result: { conversationId: ObjectId | null } = { conversationId: null };

  const session = db.db.client.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await db.assignments.updateOne(
        { _id: assignmentId, status: "pending" },
        {
          $set: {
            status: accepted ? "accepted" : "declined",
            declineReason: accepted ? null : input.reason,
            respondedAt: now,
          },
        },
        { session },
      );
      if (claimed.modifiedCount !== 1) {
        throw new UserFacingError("This request has already been answered or withdrawn.", 409);
      }
      await db.appointments.updateOne(
        { _id: visit._id },
        { $set: accepted ? { status: "booked" } : { status: "cancelled", holdsSlot: false } },
        { session },
      );
      await db.clients.updateOne(
        { _id: client._id, "needs.id": assignment.needId },
        {
          $set: accepted
            ? { "needs.$.status": "assigned", "needs.$.therapistId": therapist._id }
            : { "needs.$.status": "needs-therapist", "needs.$.therapistId": null },
        },
        { session },
      );
      if (accepted) {
        await db.therapists.updateOne(
          { _id: therapist._id },
          { $inc: { activeClients: 1 } },
          { session },
        );
        const conversation = await db.conversations.findOneAndUpdate(
          { clientId: client._id, therapistId: therapist._id },
          {
            $setOnInsert: {
              _id: new ObjectId(),
              memberIds: [client.userId, user._id],
              lastMessage: null,
              createdAt: now,
            },
          },
          { upsert: true, returnDocument: "after", session },
        );
        result.conversationId = conversation?._id ?? null;
      }
    });
  } finally {
    await session.endSession();
  }

  const admins = await adminIds();
  const schedule = { booked: 0, skipped: 0 };
  if (accepted) {
    const frequency = needOf(client, assignment)?.frequency ?? "Assessment";
    const series = await bookSeries({ ...visit, status: "booked" }, therapist, frequency);
    schedule.booked = series.booked.length;
    schedule.skipped = series.skipped.length;
    const plan =
      schedule.booked > 1
        ? ` ${schedule.booked} visits are booked, ${frequency.toLowerCase()}.`
        : "";
    await notify([client.userId], {
      title: `${therapist.name} is your ${practitioner[assignment.discipline].toLowerCase()}`,
      body: `Your first visit is ${slotLabel(visit.start)}.${plan} You can message ${therapist.name.split(" ")[0]} in the app.`,
      href: "/mobile/patient",
    });
    await notify(admins, {
      title: `${therapist.name} accepted ${client.name}`,
      body: `${assignment.discipline}. First visit ${slotLabel(visit.start)}.${plan}${schedule.skipped ? ` ${schedule.skipped} could not be booked; choose times on the patient page.` : ""}`,
      href: `/care/${client._id.toHexString()}`,
    });
  } else {
    await notify(admins, {
      title: `${therapist.name} declined ${client.name}`,
      body: `${input.decision === "decline" ? input.reason : ""}. Choose another ${assignment.discipline.toLowerCase()} therapist.`,
      href: `/care/${client._id.toHexString()}`,
    });
  }
  await audit(
    user,
    accepted
      ? `Accepted ${assignment.discipline}`
      : `Declined ${assignment.discipline}: ${input.decision === "decline" ? input.reason : ""}`,
    client._id,
  );
  await publish([...admins, user._id, client.userId], "care", {
    clientId: client._id.toHexString(),
  });
  return { conversationId: result.conversationId?.toHexString() ?? null, ...schedule };
}

export async function therapistHome(user: UserDoc): Promise<TherapistHomeDto> {
  const db = await collections();
  const therapist = await myTherapist(user);
  const [assigned, visits, conversations, unrecorded, unwritten, past] = await Promise.all([
    db.assignments
      .find({ therapistId: therapist._id, status: { $in: ["pending", "accepted"] } })
      .sort({ createdAt: -1 })
      .toArray(),
    db.appointments
      .find({ therapistId: therapist._id, holdsSlot: true, start: { $gte: new Date() } })
      .sort({ start: 1 })
      .limit(20)
      .toArray(),
    db.conversations.find({ therapistId: therapist._id }).toArray(),
    db.appointments
      .find({
        therapistId: therapist._id,
        status: "booked",
        start: { $lt: new Date(), $gte: new Date(Date.now() - 14 * 86_400_000) },
      })
      .sort({ start: 1 })
      .toArray(),
    db.appointments
      .find({
        therapistId: therapist._id,
        status: "completed",
        note: { $in: [null] },
        start: { $gte: new Date(Date.now() - 30 * 86_400_000) },
      })
      .sort({ start: 1 })
      .toArray(),
    db.appointments
      .find({
        therapistId: therapist._id,
        // Released holds from declined or withdrawn requests have no cancellation record; skip them.
        $or: [
          { status: { $in: ["completed", "no-show", "late-cancelled"] } },
          { status: "cancelled", cancellation: { $type: "object" } },
        ],
        start: { $gte: new Date(Date.now() - 14 * 86_400_000) },
      })
      .sort({ start: -1 })
      .limit(15)
      .toArray(),
  ]);
  const clientIds = [
    ...new Set(
      [...assigned, ...visits, ...unrecorded, ...unwritten, ...past].map((a) =>
        a.clientId.toHexString(),
      ),
    ),
  ].map((id) => new ObjectId(id));
  const clients = await db.clients.find({ _id: { $in: clientIds } }).toArray();
  const clientById = new Map(clients.map((c) => [c._id.toHexString(), c]));
  const clientNames = nameMap(clients);
  const me = nameMap([therapist]);
  const visitById = new Map(visits.map((v) => [v._id.toHexString(), v]));
  const seriesIds = [
    ...new Set(
      [...visits, ...unrecorded].flatMap((v) => (v.seriesId ? [v.seriesId.toHexString()] : [])),
    ),
  ];
  const series = seriesLookup(
    await db.appointments
      .find({ seriesId: { $in: seriesIds.map((id) => new ObjectId(id)) } })
      .toArray(),
  );
  const chatByClient = new Map(conversations.map((c) => [c.clientId.toHexString(), c._id]));

  const requests = assigned
    .filter((a) => a.status === "pending")
    .flatMap((a) => {
      const client = clientById.get(a.clientId.toHexString());
      const visit = visitById.get(a.appointmentId.toHexString());
      if (!client || !visit) return [];
      const need = needOf(client, a);
      return [
        {
          ...assignmentDto(a, visit.start, clientNames, me),
          age: ageLabel(client.dateOfBirth),
          suburb: client.suburb,
          funding: client.funding,
          support: need?.support ?? a.discipline,
          details: need?.details ?? "",
          location: need?.location ?? "Home",
          frequency: need?.frequency ?? "Weekly",
          notes: client.notes,
          precautions: client.precautions ?? null,
        },
      ];
    });

  return {
    therapist: {
      name: therapist.name,
      discipline: therapist.discipline,
      region: therapist.region,
      activeClients: therapist.activeClients,
      capacity: therapist.capacity,
      status: caseloadStatus(therapist.caseloadScore),
    },
    requests,
    clients: assigned
      .filter((a) => a.status === "accepted")
      .flatMap((a) => {
        const client = clientById.get(a.clientId.toHexString());
        if (!client) return [];
        const need = needOf(client, a);
        return [
          {
            id: client._id.toHexString(),
            name: client.name,
            suburb: client.suburb,
            discipline: a.discipline,
            frequency: need?.frequency ?? "Weekly",
            conversationId: chatByClient.get(client._id.toHexString())?.toHexString() ?? null,
            discharged: Boolean(client.discharged),
          },
        ];
      }),
    upcoming: visits.map((v) => appointmentDto(v, clientNames, me, series)),
    toRecord: unrecorded.map((v) => appointmentDto(v, clientNames, me, series)),
    notesToWrite: unwritten.map((v) => appointmentDto(v, clientNames, me, series)),
    recent: past.map((v) => appointmentDto(v, clientNames, me, series)),
  };
}

/** A therapist may open the record of any patient they've been asked to see. */
export async function assertMyPatient(user: UserDoc, clientId: ObjectId) {
  const db = await collections();
  const mine = user.therapistId
    ? await db.assignments.findOne({
        clientId,
        therapistId: user.therapistId,
        status: { $in: ["pending", "accepted"] },
      })
    : null;
  if (!mine) throw new UserFacingError("Patient not found.", 404);
}
