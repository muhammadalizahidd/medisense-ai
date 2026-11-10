import "server-only";
import { MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import { disciplines, frequencies, fundingStreams, regions } from "@/lib/live/catalogue";
import type { ClientDetailDto, MatchDto } from "@/lib/live/types";
import { slotLabel } from "@/lib/live/time";
import { newInviteCode } from "./auth";
import { collections } from "./db";
import { appointmentDto, assignmentDto, clientSummary, nameMap } from "./dto";
import { UserFacingError } from "./http";
import { audit, notify, publish, adminIds } from "./live";
import { isSlotFree, rankTherapists } from "./matching";
import type { AppointmentDoc, ClientDoc, UserDoc } from "./models";

export const newClientSchema = z.object({
  name: z.string().trim().min(2, "Enter the client's full name").max(120),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  email: z.email("Enter a valid email").transform((v) => v.toLowerCase()),
  phone: z.string().trim().max(30).nullable(),
  suburb: z.string().trim().min(2, "Enter the suburb").max(80),
  region: z.enum(regions),
  funding: z.enum(fundingStreams),
  needs: z
    .array(z.object({ discipline: z.enum(disciplines), frequency: z.enum(frequencies) }))
    .min(1, "Choose at least one therapy")
    .refine(
      (needs) => new Set(needs.map((n) => n.discipline)).size === needs.length,
      "Each therapy can only be added once",
    ),
  notes: z.string().trim().max(2000),
});

export async function createClient(admin: UserDoc, input: z.infer<typeof newClientSchema>) {
  const { users, clients } = await collections();
  if (await users.findOne({ email: input.email })) {
    throw new UserFacingError("An account already uses this email.", 409);
  }
  const clientId = new ObjectId();
  const userId = new ObjectId();
  const { code, invite } = newInviteCode();
  const now = new Date();
  await users.insertOne({
    _id: userId,
    email: input.email,
    name: input.name,
    role: "client",
    passwordHash: null,
    invite,
    therapistId: null,
    clientId,
    createdAt: now,
  });
  const client: ClientDoc = {
    _id: clientId,
    ...input,
    needs: input.needs.map((n) => ({ ...n, status: "needs-therapist", therapistId: null })),
    userId,
    createdBy: admin._id,
    createdAt: now,
  };
  await clients.insertOne(client);
  await audit(admin, "Added client", clientId);
  await publish(await adminIds(), "care", { clientId: clientId.toHexString() });
  return { id: clientId.toHexString(), inviteCode: code, inviteExpires: invite.expiresAt };
}

export async function listClients() {
  const { clients, therapists } = await collections();
  const [rows, team] = await Promise.all([
    clients.find().sort({ createdAt: -1 }).limit(200).toArray(),
    therapists.find({}, { projection: { name: 1 } }).toArray(),
  ]);
  const names = nameMap(team);
  return rows.map((c) => clientSummary(c, names));
}

async function loadClient(id: ObjectId) {
  const { clients } = await collections();
  const client = await clients.findOne({ _id: id });
  if (!client) throw new UserFacingError("Client not found.", 404);
  return client;
}

export async function clientDetail(id: ObjectId): Promise<ClientDetailDto> {
  const { users, therapists, assignments, appointments, audit: log } = await collections();
  const client = await loadClient(id);
  const [account, team, assigned, allVisits, activity] = await Promise.all([
    users.findOne({ _id: client.userId }),
    therapists.find({}, { projection: { name: 1 } }).toArray(),
    assignments.find({ clientId: id }).sort({ createdAt: -1 }).toArray(),
    appointments.find({ clientId: id }).sort({ start: 1 }).toArray(),
    log.find({ clientId: id }).sort({ at: -1 }).limit(30).toArray(),
  ]);
  const names = nameMap(team);
  const clientNames = new Map([[id.toHexString(), client.name]]);
  const visitById = new Map(allVisits.map((v) => [v._id.toHexString(), v]));
  const visits = allVisits.filter((v) => v.status !== "cancelled");
  return {
    ...clientSummary(client, names),
    dateOfBirth: client.dateOfBirth,
    email: client.email,
    phone: client.phone,
    notes: client.notes,
    account: account?.passwordHash
      ? "Active"
      : account?.invite && account.invite.expiresAt > new Date()
        ? "Invited"
        : "Invite expired",
    assignments: assigned.map((a) =>
      assignmentDto(
        a,
        visitById.get(a.appointmentId.toHexString())?.start ?? a.createdAt,
        clientNames,
        names,
      ),
    ),
    appointments: visits.map((v) => appointmentDto(v, clientNames, names)),
    activity: activity.map((e) => ({
      id: e._id.toHexString(),
      action: e.action,
      actor: e.actorName,
      at: e.at.toISOString(),
    })),
  };
}

export async function matchesFor(clientId: ObjectId, discipline: string): Promise<MatchDto[]> {
  const { therapists, appointments } = await collections();
  const client = await loadClient(clientId);
  const need = client.needs.find((n) => n.discipline === discipline);
  if (!need) throw new UserFacingError("This client doesn't need that therapy.");
  const candidates = await therapists.find({ discipline: need.discipline }).toArray();
  const ids = candidates.map((c) => c._id);
  const upcoming = await appointments
    .find({ therapistId: { $in: ids }, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  const byTherapist = new Map<string, AppointmentDoc[]>();
  for (const a of upcoming) {
    const key = a.therapistId.toHexString();
    byTherapist.set(key, [...(byTherapist.get(key) ?? []), a]);
  }
  return rankTherapists(candidates, byTherapist, client.region);
}

export const requestSchema = z.object({
  discipline: z.enum(disciplines),
  therapistId: z.string(),
  start: z.iso.datetime(),
});

/** Holds the chosen time and asks the therapist. Nothing is booked until they accept. */
export async function requestTherapist(
  admin: UserDoc,
  clientId: ObjectId,
  input: z.infer<typeof requestSchema>,
) {
  const db = await collections();
  const client = await loadClient(clientId);
  const need = client.needs.find((n) => n.discipline === input.discipline);
  if (!need || need.status !== "needs-therapist") {
    throw new UserFacingError("This therapy already has a therapist or a request waiting.", 409);
  }
  if (!ObjectId.isValid(input.therapistId)) throw new UserFacingError("Therapist not found.", 404);
  const therapist = await db.therapists.findOne({ _id: new ObjectId(input.therapistId) });
  if (!therapist || therapist.discipline !== input.discipline) {
    throw new UserFacingError("Therapist not found.", 404);
  }
  const start = new Date(input.start);
  const held = await db.appointments
    .find({ therapistId: therapist._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  if (!isSlotFree(therapist, start, held)) {
    throw new UserFacingError("That time was just taken. Choose another time.", 409);
  }

  const appointmentId = new ObjectId();
  const assignmentId = new ObjectId();
  const now = new Date();
  const session = db.db.client.startSession();
  try {
    await session.withTransaction(async () => {
      await db.appointments.insertOne(
        {
          _id: appointmentId,
          therapistId: therapist._id,
          clientId,
          discipline: input.discipline,
          start,
          end: new Date(start.getTime() + therapist.sessionMinutes * 60_000),
          status: "tentative",
          holdsSlot: true,
          createdAt: now,
        },
        { session },
      );
      await db.assignments.insertOne(
        {
          _id: assignmentId,
          clientId,
          therapistId: therapist._id,
          discipline: input.discipline,
          status: "pending",
          appointmentId,
          declineReason: null,
          createdBy: admin._id,
          createdAt: now,
          respondedAt: null,
        },
        { session },
      );
      const updated = await db.clients.updateOne(
        {
          _id: clientId,
          needs: { $elemMatch: { discipline: input.discipline, status: "needs-therapist" } },
        },
        { $set: { "needs.$.status": "waiting", "needs.$.therapistId": therapist._id } },
        { session },
      );
      if (updated.modifiedCount !== 1) {
        throw new UserFacingError("This therapy already has a request waiting.", 409);
      }
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new UserFacingError("That time was just taken. Choose another time.", 409);
    }
    throw error;
  } finally {
    await session.endSession();
  }

  await notify([therapist.userId], {
    title: `New client: ${client.name}`,
    body: `${input.discipline}, ${need.frequency.toLowerCase()}. First visit ${slotLabel(start)}. Accept or decline.`,
    href: "/therapist",
  });
  await audit(admin, `Asked ${therapist.name} to take ${input.discipline}`, clientId);
  await publish([...(await adminIds()), therapist.userId], "care", {
    clientId: clientId.toHexString(),
  });
}

export async function withdrawRequest(admin: UserDoc, assignmentId: ObjectId) {
  const db = await collections();
  const assignment = await db.assignments.findOne({ _id: assignmentId });
  if (!assignment || assignment.status !== "pending") {
    throw new UserFacingError("This request has already been answered.", 409);
  }
  const therapist = await db.therapists.findOne({ _id: assignment.therapistId });
  const client = await loadClient(assignment.clientId);
  await db.assignments.updateOne(
    { _id: assignmentId, status: "pending" },
    { $set: { status: "withdrawn", respondedAt: new Date() } },
  );
  await db.appointments.updateOne(
    { _id: assignment.appointmentId },
    { $set: { status: "cancelled", holdsSlot: false } },
  );
  await db.clients.updateOne(
    { _id: assignment.clientId, "needs.discipline": assignment.discipline },
    { $set: { "needs.$.status": "needs-therapist", "needs.$.therapistId": null } },
  );
  if (therapist) {
    await notify([therapist.userId], {
      title: `Request withdrawn: ${client.name}`,
      body: `The ${assignment.discipline} request was withdrawn by ${admin.name}.`,
      href: "/therapist",
    });
  }
  await audit(admin, `Withdrew the ${assignment.discipline} request`, assignment.clientId);
  await publish([...(await adminIds()), ...(therapist ? [therapist.userId] : [])], "care", {
    clientId: assignment.clientId.toHexString(),
  });
}

export async function reissueInvite(admin: UserDoc, clientId: ObjectId) {
  const { users } = await collections();
  const client = await loadClient(clientId);
  const account = await users.findOne({ _id: client.userId });
  if (account?.passwordHash) throw new UserFacingError("This client has already activated.", 409);
  const { code, invite } = newInviteCode();
  await users.updateOne({ _id: client.userId }, { $set: { invite } });
  await audit(admin, "Created a new app invite code", clientId);
  return { inviteCode: code, inviteExpires: invite.expiresAt };
}
