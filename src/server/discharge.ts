import "server-only";
import type { ObjectId } from "mongodb";
import { z } from "zod";
import { dischargeReasons } from "@/lib/live/catalogue";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { UserDoc } from "./models";

export const dischargeSchema = z.object({ reason: z.enum(dischargeReasons) });

/**
 * Ends a patient's care: future visits are cancelled by Medisense (never charged), open requests
 * are withdrawn, each therapist's caseload drops by one, and everyone involved is told.
 */
export async function dischargePatient(
  user: UserDoc,
  clientId: ObjectId,
  input: z.infer<typeof dischargeSchema>,
) {
  const db = await collections();
  const client = await db.clients.findOne({ _id: clientId });
  if (!client) throw new UserFacingError("Patient not found.", 404);
  if (client.discharged)
    throw new UserFacingError("This patient has already been discharged.", 409);
  const assignedTo = client.needs.flatMap((n) =>
    n.status === "assigned" && n.therapistId ? [n.therapistId] : [],
  );
  if (user.role === "therapist" && !assignedTo.some((id) => user.therapistId?.equals(id))) {
    throw new UserFacingError("Only this patient's therapist or an admin can discharge them.", 409);
  }

  const now = new Date();
  const future = await db.appointments
    .find({ clientId, status: "booked", start: { $gt: now } })
    .toArray();
  const pending = await db.assignments.find({ clientId, status: "pending" }).toArray();
  const therapists = await db.therapists
    .find({ _id: { $in: assignedTo } }, { projection: { userId: 1, name: 1 } })
    .toArray();

  const session = db.db.client.startSession();
  try {
    await session.withTransaction(async () => {
      for (const v of future) {
        await db.appointments.updateOne(
          { _id: v._id },
          {
            $set: {
              status: "cancelled",
              holdsSlot: false,
              cancellation: {
                by: "medisense",
                reason: "Discharged",
                noticeHours: Math.max(
                  0,
                  Math.floor((v.start.getTime() - now.getTime()) / 3_600_000),
                ),
                chargeable: false,
                actorName: user.name,
                at: now,
              },
            },
          },
          { session },
        );
      }
      for (const a of pending) {
        await db.assignments.updateOne(
          { _id: a._id },
          { $set: { status: "withdrawn", respondedAt: now } },
          { session },
        );
        await db.appointments.updateOne(
          { _id: a.appointmentId },
          { $set: { status: "cancelled", holdsSlot: false } },
          { session },
        );
      }
      for (const t of therapists) {
        await db.therapists.updateOne({ _id: t._id }, { $inc: { activeClients: -1 } }, { session });
      }
      await db.clients.updateOne(
        { _id: clientId },
        { $set: { discharged: { at: now, reason: input.reason, byName: user.name } } },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }

  const cancelled = future.length ? `${future.length} upcoming visits were cancelled. ` : "";
  await notify([client.userId], {
    title: "Your care with Medisense has finished",
    body: `${input.reason}. ${cancelled}You can still rate your visits and read your history in the app.`,
    href: "/mobile/patient",
  });
  await notify(
    therapists.map((t) => t.userId).filter((id) => !id.equals(user._id)),
    {
      title: `${client.name} has been discharged`,
      body: `${input.reason}, by ${user.name}.`,
      href: "/therapist",
    },
  );
  await notify(
    (await adminIds()).filter((id) => !id.equals(user._id)),
    {
      title: `${client.name} has been discharged`,
      body: `${input.reason}, by ${user.name}. ${future.length} future visits cancelled.`,
      href: `/care/${clientId.toHexString()}`,
    },
  );
  await audit(user, `Discharged: ${input.reason}`, clientId);
  await publish(
    [...(await adminIds()), client.userId, ...therapists.map((t) => t.userId)],
    "care",
    { clientId: clientId.toHexString() },
  );
  return { cancelledVisits: future.length, withdrawn: pending.length };
}

export const patientProfileSchema = z
  .object({
    phone: z.string().trim().max(30).nullable(),
    emergencyContact: z
      .object({
        name: z.string().trim().min(2).max(80),
        relationship: z.string().trim().min(2).max(40),
        phone: z.string().trim().min(6).max(30),
      })
      .nullable(),
  })
  .strict();

/** The patient keeps their own phone number and emergency contact up to date from the app. */
export async function savePatientProfile(
  user: UserDoc,
  input: z.infer<typeof patientProfileSchema>,
) {
  const { clients, users } = await collections();
  if (!user.clientId)
    throw new UserFacingError("No patient record is linked to this account.", 404);
  await clients.updateOne(
    { _id: user.clientId },
    { $set: { phone: input.phone || null, emergencyContact: input.emergencyContact } },
  );
  await users.updateOne({ _id: user._id }, { $set: { phone: input.phone || null } });
  await audit(user, "Updated their contact details", user.clientId);
  await publish(await adminIds(), "care", { clientId: user.clientId.toHexString() });
}
