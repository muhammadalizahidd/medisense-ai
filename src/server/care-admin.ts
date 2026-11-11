import "server-only";
import { MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import type { ClientDetailDto, MatchDto } from "@/lib/live/types";
import { slotLabel } from "@/lib/live/time";
import { newInviteCode } from "./auth";
import { collections } from "./db";
import { needsRiskReview } from "@/lib/live/referral";
import { appointmentDto, assignmentDto, clientSummary, nameMap, seriesLookup } from "./dto";
import { UserFacingError } from "./http";
import { audit, notify, publish, adminIds } from "./live";
import { ineligibility, isSlotFree, rankTherapists } from "./matching";
import type { AppointmentDoc, UserDoc } from "./models";

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
  if (!client) throw new UserFacingError("Patient not found.", 404);
  return client;
}

export async function clientDetail(id: ObjectId): Promise<ClientDetailDto> {
  const {
    users,
    therapists,
    assignments,
    appointments,
    audit: log,
    documents,
    referrals,
  } = await collections();
  const client = await loadClient(id);
  const [account, team, assigned, allVisits, activity, docs, refs] = await Promise.all([
    users.findOne({ _id: client.userId }),
    therapists.find({}, { projection: { name: 1 } }).toArray(),
    assignments.find({ clientId: id }).sort({ createdAt: -1 }).toArray(),
    appointments.find({ clientId: id }).sort({ start: 1 }).toArray(),
    log.find({ clientId: id }).sort({ at: -1 }).limit(30).toArray(),
    documents
      .find({ clientId: id }, { projection: { data: 0 } })
      .sort({ at: -1 })
      .toArray(),
    referrals
      .find({ clientId: id }, { projection: { reference: 1 } })
      .sort({ createdAt: -1 })
      .toArray(),
  ]);
  const names = nameMap(team);
  const clientNames = new Map([[id.toHexString(), client.name]]);
  const visitById = new Map(allVisits.map((v) => [v._id.toHexString(), v]));
  // Holds released by a declined or withdrawn request carry no cancellation record; leave them out.
  const visits = allVisits.filter(
    (v) => v.status !== "tentative" && !(v.status === "cancelled" && !v.cancellation),
  );
  const series = seriesLookup(allVisits);
  return {
    ...clientSummary(client, names),
    discharged: client.discharged
      ? {
          at: client.discharged.at.toISOString(),
          reason: client.discharged.reason,
          byName: client.discharged.byName,
          outcomes: client.discharged.outcomes ?? null,
          outstandingRisks: client.discharged.outstandingRisks ?? null,
          advice: client.discharged.advice ?? null,
          handover: client.discharged.handover ?? null,
        }
      : null,
    emergencyContact: client.emergencyContact ?? null,
    precautions: client.precautions ?? null,
    documents: docs.map((d) => ({
      id: d._id.toHexString(),
      kind: d.kind,
      name: d.name,
      size: d.size,
      uploadedBy: d.uploadedBy,
      at: d.at.toISOString(),
    })),
    referrals: refs.map((r) => ({ id: r._id.toHexString(), reference: r.reference })),
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
    appointments: visits.map((v) => appointmentDto(v, clientNames, names, series)),
    activity: activity.map((e) => ({
      id: e._id.toHexString(),
      action: e.action,
      actor: e.actorName,
      at: e.at.toISOString(),
    })),
  };
}

export async function matchesFor(clientId: ObjectId, needId: string): Promise<MatchDto[]> {
  const { therapists, appointments } = await collections();
  const client = await loadClient(clientId);
  const need = client.needs.find((n) => n.id === needId);
  if (!need) throw new UserFacingError("Service request not found.", 404);
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
  return rankTherapists(candidates, byTherapist, client.region, need.support);
}

/**
 * Automatic allocation (section 13): for validated low-risk services only, the best eligible
 * clinician with a time this week gets a tentative request. Anything with a reported risk, a
 * precaution or no clear match needs a person to choose.
 */
export async function autoAllocate(admin: UserDoc, clientId: ObjectId, needId: string) {
  const { referrals } = await collections();
  const client = await loadClient(clientId);
  const need = client.needs.find((n) => n.id === needId);
  if (!need || need.status !== "needs-therapist")
    throw new UserFacingError("This service isn't waiting for a therapist.", 409);
  if (client.precautions)
    throw new UserFacingError(
      "Not automatic: this patient has a clinical precaution. Choose the therapist yourself.",
      409,
    );
  const referral = need.referralId ? await referrals.findOne({ _id: need.referralId }) : null;
  if (referral && needsRiskReview(referral.data)) {
    throw new UserFacingError(
      "Not automatic: the referral reported a risk (Yes or Unknown). Choose the therapist yourself.",
      409,
    );
  }
  const matches = await matchesFor(clientId, needId);
  const best = matches.find((m) => m.eligible && m.slots.length && m.status !== "At Risk");
  const soon = best?.slots[0] && new Date(best.slots[0]).getTime() - Date.now() < 7 * 86_400_000;
  if (!best || !soon)
    throw new UserFacingError(
      "No eligible therapist has a time this week. Choose one yourself.",
      409,
    );
  await requestTherapist(admin, clientId, {
    needId,
    therapistId: best.therapistId,
    start: best.slots[0]!,
  });
  await audit(admin, `Automatic allocation (low-risk rule): asked ${best.name}`, clientId);
  return { therapist: best.name, start: best.slots[0] };
}

export const requestSchema = z.object({
  needId: z.string().min(1),
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
  const need = client.needs.find((n) => n.id === input.needId);
  if (!need || need.status !== "needs-therapist") {
    throw new UserFacingError("This service already has a therapist or a request waiting.", 409);
  }
  if (client.discharged) throw new UserFacingError("This patient has been discharged.", 409);
  if (!ObjectId.isValid(input.therapistId)) throw new UserFacingError("Therapist not found.", 404);
  const therapist = await db.therapists.findOne({ _id: new ObjectId(input.therapistId) });
  const blocked = therapist
    ? ineligibility(therapist, need.support, new Date(Date.now() + 36e6).toISOString().slice(0, 10))
    : [];
  if (blocked.length)
    throw new UserFacingError(`${therapist!.name} can't take this: ${blocked.join(", ")}.`, 409);
  if (!therapist || therapist.discipline !== need.discipline) {
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
          discipline: need.discipline,
          start,
          end: new Date(start.getTime() + therapist.sessionMinutes * 60_000),
          status: "tentative",
          holdsSlot: true,
          modality: need.location === "Telehealth" ? "Telehealth" : "In person",
          needId: need.id,
          createdAt: now,
        },
        { session },
      );
      await db.assignments.insertOne(
        {
          _id: assignmentId,
          clientId,
          needId: need.id,
          therapistId: therapist._id,
          discipline: need.discipline,
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
          needs: { $elemMatch: { id: need.id, status: "needs-therapist" } },
        },
        { $set: { "needs.$.status": "waiting", "needs.$.therapistId": therapist._id } },
        { session },
      );
      if (updated.modifiedCount !== 1) {
        throw new UserFacingError("This service already has a request waiting.", 409);
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
    title: `New patient: ${client.name}`,
    body: `${need.support}, ${need.frequency.toLowerCase()}. First visit ${slotLabel(start)}. Accept or decline.`,
    href: "/therapist",
  });
  await audit(admin, `Asked ${therapist.name} to take ${need.support}`, clientId);
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
    { _id: assignment.clientId, "needs.id": assignment.needId },
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

/**
 * A fresh invite code. If the patient had already activated, this also resets their app access:
 * the old password stops working and they are signed out everywhere.
 */
export async function reissueInvite(admin: UserDoc, clientId: ObjectId) {
  const { users, sessions } = await collections();
  const client = await loadClient(clientId);
  const account = await users.findOne({ _id: client.userId });
  const wasActive = Boolean(account?.passwordHash);
  const { code, invite } = newInviteCode();
  await users.updateOne({ _id: client.userId }, { $set: { invite, passwordHash: null } });
  if (wasActive) await sessions.deleteMany({ userId: client.userId });
  await audit(
    admin,
    wasActive ? "Reset app access with a new invite code" : "Created a new app invite code",
    clientId,
  );
  return { inviteCode: code, inviteExpires: invite.expiresAt };
}
