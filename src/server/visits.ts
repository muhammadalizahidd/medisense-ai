import "server-only";
import { MongoServerError, ObjectId } from "mongodb";
import { z } from "zod";
import { classifyCancellation } from "@/lib/live/cancellation";
import {
  cancelReasons,
  CLOSE_MINUTES,
  OPEN_MINUTES,
  seriesPlan,
  type Frequency,
} from "@/lib/live/catalogue";
import { addDays, atBrisbane, brisbaneDay, isoWeekday, slotLabel } from "@/lib/live/time";
import type { AppointmentDto } from "@/lib/live/types";
import { collections } from "./db";
import { appointmentDto, nameMap, seriesLookup } from "./dto";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import { isSlotFree, openSlots } from "./matching";
import type { AppointmentDoc, TherapistDoc, UserDoc } from "./models";

const SAME_DAY_STEP = 30;

/** The first free start on a day, nearest to the usual time, so a series keeps its rhythm. */
function nearestFreeOnDay(t: TherapistDoc, wanted: Date, held: AppointmentDoc[]) {
  if (isSlotFree(t, wanted, held)) return wanted;
  const day = brisbaneDay(wanted);
  const candidates: Date[] = [];
  for (let m = OPEN_MINUTES; m + t.sessionMinutes <= CLOSE_MINUTES; m += SAME_DAY_STEP) {
    candidates.push(atBrisbane(day, m));
  }
  return (
    candidates
      .filter((c) => isSlotFree(t, c, held))
      .sort(
        (a, b) =>
          Math.abs(a.getTime() - wanted.getTime()) - Math.abs(b.getTime() - wanted.getTime()),
      )[0] ?? null
  );
}

/** How many working days a series visit may move when its usual day is full. */
const SLIDE_DAYS = 2;

/** The usual day first, then the next working days, so a full day moves the visit rather than drops it. */
function nextFreeNear(t: TherapistDoc, wanted: Date, held: AppointmentDoc[]) {
  for (let slide = 0, moved = 0; moved <= SLIDE_DAYS && slide < 7; slide += 1) {
    const candidate = addDays(wanted, slide);
    const weekday = isoWeekday(brisbaneDay(candidate));
    if (weekday > 5) continue;
    const found = nearestFreeOnDay(t, candidate, held);
    if (found) return found;
    moved += 1;
  }
  return null;
}

/**
 * Books the rest of a client's visits from the frequency agreed at intake: the same weekday and
 * time where the therapist is free, the nearest free time that day if not, or a day or two later.
 * Visits that still can't fit are reported as skipped for the care team to place.
 */
export async function bookSeries(
  first: AppointmentDoc,
  therapist: TherapistDoc,
  frequency: Frequency,
) {
  const { appointments } = await collections();
  const plan = seriesPlan[frequency];
  await appointments.updateOne({ _id: first._id }, { $set: { seriesId: first._id } });
  const booked: Date[] = [first.start];
  const skipped: Date[] = [];
  const held = await appointments
    .find({ therapistId: therapist._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();

  for (let k = 1; k < plan.visits; k += 1) {
    const wanted = addDays(first.start, k * plan.everyDays);
    const start = nextFreeNear(therapist, wanted, held);
    if (!start) {
      skipped.push(wanted);
      continue;
    }
    const visit: AppointmentDoc = {
      _id: new ObjectId(),
      therapistId: therapist._id,
      clientId: first.clientId,
      discipline: first.discipline,
      start,
      end: new Date(start.getTime() + therapist.sessionMinutes * 60_000),
      status: "booked",
      holdsSlot: true,
      seriesId: first._id,
      replaces: null,
      cancellation: null,
      createdAt: new Date(),
    };
    try {
      await appointments.insertOne(visit);
      held.push(visit);
      booked.push(start);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) skipped.push(wanted);
      else throw error;
    }
  }
  return { booked, skipped };
}

/* ------------------------------------------------------------- access */

type Access = { visit: AppointmentDoc; actsFor: "client" | "therapist" | "admin" };

async function visitFor(user: UserDoc, id: ObjectId): Promise<Access> {
  const { appointments } = await collections();
  const visit = await appointments.findOne({ _id: id });
  const owns =
    visit &&
    (user.role === "admin" ||
      (user.role === "therapist" && user.therapistId?.equals(visit.therapistId)) ||
      (user.role === "client" && user.clientId?.equals(visit.clientId)));
  if (!visit || !owns) throw new UserFacingError("Visit not found.", 404);
  return { visit, actsFor: user.role === "admin" ? "admin" : user.role };
}

async function partiesOf(visit: AppointmentDoc) {
  const { clients, therapists } = await collections();
  const [client, therapist] = await Promise.all([
    clients.findOne({ _id: visit.clientId }),
    therapists.findOne({ _id: visit.therapistId }),
  ]);
  if (!client || !therapist) throw new UserFacingError("Visit not found.", 404);
  return { client, therapist };
}

/** Tells everyone involved except the person who made the change, each linked to their own screen. */
async function notifyParties(
  user: UserDoc,
  parties: { client: { _id: ObjectId; userId: ObjectId }; therapist: { userId: ObjectId } },
  note: { title: string; body: string },
) {
  const isActor = (id: ObjectId) => id.equals(user._id);
  const admins = (await adminIds()).filter((id) => !isActor(id));
  const { client, therapist } = parties;
  if (!isActor(client.userId)) await notify([client.userId], { ...note, href: "/mobile/patient" });
  if (!isActor(therapist.userId)) await notify([therapist.userId], { ...note, href: "/therapist" });
  await notify(admins, { ...note, href: `/care/${client._id.toHexString()}` });
}

/* ------------------------------------------------------------- cancel */

export const cancelSchema = z.object({
  /** Staff record who called it off. A client's own cancellation is always client-side. */
  by: z.enum(["client", "medisense"]).optional(),
  reason: z.enum(cancelReasons),
});

export async function cancelVisit(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof cancelSchema>,
) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (visit.status !== "booked") {
    throw new UserFacingError(
      visit.status === "tentative"
        ? "This visit is still waiting for the therapist. Withdraw the request instead."
        : "Only booked visits can be cancelled.",
      409,
    );
  }
  const now = new Date();
  if (visit.start <= now) throw new UserFacingError("This visit has already started.", 409);
  const by = actsFor === "client" ? "client" : (input.by ?? "medisense");
  const outcome = classifyCancellation(visit.start, now, by);
  const updated = await appointments.updateOne(
    { _id: id, status: "booked" },
    {
      $set: {
        status: outcome.status,
        holdsSlot: false,
        cancellation: {
          by,
          reason: input.reason,
          noticeHours: outcome.noticeHours,
          chargeable: outcome.late,
          actorName: user.name,
          at: now,
        },
      },
    },
  );
  if (updated.modifiedCount !== 1)
    throw new UserFacingError("This visit has already changed.", 409);

  const { client, therapist } = await partiesOf(visit);
  const when = slotLabel(visit.start);
  await notifyParties(
    user,
    { client, therapist },
    {
      title: `${outcome.late ? "Late cancellation" : "Visit cancelled"}: ${client.name}`,
      body: `${visit.discipline} with ${therapist.name}, ${when}. ${input.reason}.${outcome.late ? ` ${outcome.noticeHours} hours' notice.` : ""}`,
    },
  );
  await audit(
    user,
    `${outcome.late ? "Late cancellation" : "Cancelled"} ${visit.discipline} visit ${when} (${by === "client" ? "client" : "Medisense"}, ${input.reason.toLowerCase()})`,
    client._id,
  );
  await publish([...(await adminIds()), client.userId, therapist.userId], "care", {
    clientId: client._id.toHexString(),
  });
  return outcome;
}

/* ------------------------------------------------------------- rebook */

export async function newTimesFor(user: UserDoc, id: ObjectId) {
  const { appointments } = await collections();
  const { visit } = await visitFor(user, id);
  const { therapist } = await partiesOf(visit);
  const held = await appointments
    .find({ therapistId: therapist._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  return openSlots(therapist, held, { limit: 6, perDay: 2 }).map((s) => s.toISOString());
}

export const rebookSchema = z.object({ start: z.iso.datetime() });

/** Books a new time in place of a cancelled visit, with the same therapist. */
export async function rebookVisit(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof rebookSchema>,
) {
  const { appointments } = await collections();
  const { visit } = await visitFor(user, id);
  if (!["cancelled", "late-cancelled"].includes(visit.status)) {
    throw new UserFacingError("Cancel the visit before booking a new time.", 409);
  }
  if (await appointments.findOne({ replaces: visit._id, holdsSlot: true })) {
    throw new UserFacingError("A new time is already booked for this visit.", 409);
  }
  const { client, therapist } = await partiesOf(visit);
  const start = new Date(input.start);
  const held = await appointments
    .find({ therapistId: therapist._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  if (!isSlotFree(therapist, start, held)) {
    throw new UserFacingError("That time was just taken. Choose another time.", 409);
  }
  try {
    await appointments.insertOne({
      _id: new ObjectId(),
      therapistId: therapist._id,
      clientId: client._id,
      discipline: visit.discipline,
      start,
      end: new Date(start.getTime() + therapist.sessionMinutes * 60_000),
      status: "booked",
      holdsSlot: true,
      seriesId: visit.seriesId ?? null,
      replaces: visit._id,
      cancellation: null,
      createdAt: new Date(),
    });
  } catch (error) {
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new UserFacingError("That time was just taken. Choose another time.", 409);
    }
    throw error;
  }
  await notifyParties(
    user,
    { client, therapist },
    {
      title: `New visit time: ${client.name}`,
      body: `${visit.discipline} with ${therapist.name} moved to ${slotLabel(start)}.`,
    },
  );
  await audit(user, `Booked a new time, ${slotLabel(start)}, for the cancelled visit`, client._id);
  await publish([...(await adminIds()), client.userId, therapist.userId], "care", {
    clientId: client._id.toHexString(),
  });
}

/* ------------------------------------------------------------ outcome */

export const outcomeSchema = z.object({ outcome: z.enum(["completed", "no-show"]) });

/** After the visit time, the therapist or admin records whether it happened. */
export async function recordOutcome(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof outcomeSchema>,
) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor === "client") throw new UserFacingError("Only the care team can record this.", 409);
  if (visit.status !== "booked")
    throw new UserFacingError("This visit has already been recorded.", 409);
  if (visit.start > new Date()) throw new UserFacingError("This visit hasn't happened yet.", 409);
  const noShow = input.outcome === "no-show";
  await appointments.updateOne(
    { _id: id, status: "booked" },
    {
      $set: {
        status: input.outcome,
        holdsSlot: !noShow,
        cancellation: noShow
          ? {
              by: "client",
              reason: "No-show",
              noticeHours: 0,
              chargeable: true,
              actorName: user.name,
              at: new Date(),
            }
          : null,
      },
    },
  );
  const { client, therapist } = await partiesOf(visit);
  await audit(
    user,
    `${noShow ? "Recorded a no-show for" : "Completed"} the visit on ${slotLabel(visit.start)}`,
    client._id,
  );
  await publish([...(await adminIds()), therapist.userId], "care", {
    clientId: client._id.toHexString(),
  });
}

/* --------------------------------------------------------------- list */

/** Recent and upcoming visits for whoever is asking: a client sees theirs, a therapist theirs. */
export async function listVisits(user: UserDoc): Promise<AppointmentDto[]> {
  const { appointments, clients, therapists } = await collections();
  const filter =
    user.role === "client" && user.clientId
      ? { clientId: user.clientId }
      : user.role === "therapist" && user.therapistId
        ? { therapistId: user.therapistId }
        : null;
  if (!filter) throw new UserFacingError("No visits are linked to this account.", 404);
  const since = addDays(brisbaneDay(new Date()), -14);
  const rows = await appointments
    .find({ ...filter, start: { $gte: since }, status: { $ne: "tentative" } })
    .sort({ start: 1 })
    .limit(120)
    .toArray();
  const series = await appointments
    .find({
      seriesId: { $in: [...new Set(rows.flatMap((r) => (r.seriesId ? [r.seriesId] : [])))] },
    })
    .toArray();
  const [clientRows, therapistRows] = await Promise.all([
    clients
      .find({ _id: { $in: rows.map((r) => r.clientId) } }, { projection: { name: 1 } })
      .toArray(),
    therapists
      .find({ _id: { $in: rows.map((r) => r.therapistId) } }, { projection: { name: 1 } })
      .toArray(),
  ]);
  const lookup = seriesLookup(series);
  const viewer = user.role === "client" ? "patient" : "staff";
  return rows.map((r) =>
    appointmentDto(r, nameMap(clientRows), nameMap(therapistRows), lookup, viewer),
  );
}

/* ------------------------------------------------------- session notes */

export const noteSchema = z.object({
  text: z.string().trim().min(10, "Write at least a sentence").max(4000),
  forPatient: z.string().trim().min(10, "Add a short summary for the patient").max(800),
});

/** The therapist's note for a completed visit, plus a plain summary the patient sees. */
export async function writeNote(user: UserDoc, id: ObjectId, input: z.infer<typeof noteSchema>) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor === "client") throw new UserFacingError("Only the care team can write notes.", 409);
  if (visit.status !== "completed") {
    throw new UserFacingError("Record the visit as completed before writing its note.", 409);
  }
  const first = !visit.note;
  await appointments.updateOne(
    { _id: id },
    { $set: { note: { ...input, byName: user.name, at: new Date() } } },
  );
  const { client, therapist } = await partiesOf(visit);
  if (first) {
    await notify([client.userId], {
      title: `Visit summary from ${therapist.name.split(" ")[0]}`,
      body: `Your ${visit.discipline.toLowerCase()} visit on ${slotLabel(visit.start)}: ${input.forPatient.slice(0, 120)}`,
      href: "/mobile/patient",
    });
  }
  await audit(
    user,
    `${first ? "Wrote" : "Updated"} the session note for ${slotLabel(visit.start)}`,
    client._id,
  );
  await publish([...(await adminIds()), client.userId, therapist.userId], "care", {
    clientId: client._id.toHexString(),
  });
}

/* ------------------------------------------------------------ feedback */

export const feedbackSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(600),
});

/** The patient rates a completed visit, once. The therapist and care team see it straight away. */
export async function leaveFeedback(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof feedbackSchema>,
) {
  const { appointments } = await collections();
  const { visit, actsFor } = await visitFor(user, id);
  if (actsFor !== "client") throw new UserFacingError("Only the patient can rate a visit.", 409);
  if (visit.status !== "completed")
    throw new UserFacingError("Only completed visits can be rated.", 409);
  const saved = await appointments.updateOne(
    { _id: id, feedback: { $in: [null] } },
    { $set: { feedback: { ...input, at: new Date() } } },
  );
  if (saved.modifiedCount !== 1) throw new UserFacingError("You've already rated this visit.", 409);
  const { client, therapist } = await partiesOf(visit);
  const stars = `${input.rating} out of 5`;
  await notify([therapist.userId], {
    title: `New feedback: ${stars}`,
    body: `${client.name} rated your visit on ${slotLabel(visit.start)}.${input.comment ? ` "${input.comment.slice(0, 120)}"` : ""}`,
    href: "/profile",
  });
  await notify(await adminIds(), {
    title: `Feedback for ${therapist.name}: ${stars}`,
    body: `${client.name}, ${visit.discipline}, ${slotLabel(visit.start)}.`,
    href: `/care/therapists/${therapist._id.toHexString()}`,
  });
  await audit(user, `Rated the visit on ${slotLabel(visit.start)} ${stars}`, client._id);
  await publish([...(await adminIds()), therapist.userId, client.userId], "care", {
    clientId: client._id.toHexString(),
  });
}
