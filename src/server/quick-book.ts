import "server-only";
import { randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { supportCatalogue, type Support } from "@/lib/live/catalogue";
import type { QuickBookOptionsDto } from "@/lib/live/quick-book";
import { slotLabel } from "@/lib/live/time";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import { isSlotFree, openSlots } from "./matching";
import type { AppointmentDoc, ClientDoc, TherapistDoc, UserDoc } from "./models";
import { mrnAccess, mrnHash, nextMrn } from "./mrn";

/** The service a quick booking asks for: the clinician's own treatment service. */
function supportFor(t: TherapistDoc): Support {
  return (
    supportCatalogue.find((s) => s.discipline === t.discipline && s.kind === "treatment")?.name ??
    "Other"
  );
}

/** A patient's services that already have their own clinician: the ones a visit can be booked for. */
const bookableNeeds = (c: Pick<ClientDoc, "needs" | "discharged">) =>
  c.discharged ? [] : c.needs.filter((n) => n.therapistId && n.status !== "completed");

/**
 * Clinicians with their next real free times. For someone new, every active clinician; for an
 * existing patient, only the clinicians already assigned to them, so matching rules stay in force.
 */
export async function quickBookOptions(clientId?: string | null): Promise<QuickBookOptionsDto> {
  const { therapists, appointments, clients } = await collections();
  const client = clientId ? await clients.findOne({ _id: new ObjectId(clientId) }) : null;
  if (clientId && !client) throw new UserFacingError("Patient not found.", 404);
  const own = client
    ? bookableNeeds(client).flatMap((n) => (n.therapistId ? [n.therapistId] : []))
    : null;
  const team = (await therapists.find({ active: { $ne: false } }).toArray())
    .filter((t) => !own || own.some((id) => id.equals(t._id)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const held = await appointments.find({ holdsSlot: true, start: { $gte: new Date() } }).toArray();
  const patients = clientId
    ? []
    : (
        await clients
          .find(
            {},
            { projection: { name: 1, mrn: 1, phone: 1, suburb: 1, needs: 1, discharged: 1 } },
          )
          .toArray()
      )
        .filter((c) => bookableNeeds(c).length > 0)
        .map((c) => ({
          id: c._id.toHexString(),
          name: c.name,
          mrn: c.mrn ?? null,
          suburb: c.suburb,
          phone: c.phone ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
  return {
    patients,
    clinicians: team.map((t) => {
      const mine = held.filter((a) => a.therapistId.equals(t._id));
      return {
        id: t._id.toHexString(),
        name: t.name,
        discipline: t.discipline,
        region: t.region,
        support: supportFor(t),
        slots: openSlots(t, mine, { limit: 6, perDay: 2 }).map((d) => d.toISOString()),
      };
    }),
  };
}

export const quickBookSchema = z
  .object({
    /** An existing patient; without it, name and phone open a provisional record. */
    clientId: z
      .string()
      .regex(/^[a-f0-9]{24}$/)
      .optional(),
    name: z.string().trim().max(80).default(""),
    phone: z
      .string()
      .trim()
      .max(20)
      .regex(/^[0-9 +()-]*$/, "Use digits only")
      .default(""),
    therapistId: z.string().regex(/^[a-f0-9]{24}$/),
    start: z.iso.datetime(),
    telehealth: z.boolean(),
    note: z.string().trim().max(300).default(""),
  })
  .superRefine((v, ctx) => {
    if (v.clientId) return;
    if (v.name.length < 2) {
      ctx.addIssue({ code: "custom", path: ["name"], message: "Enter their name" });
    }
    if (v.phone.replace(/\D/g, "").length < 8) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Enter a phone number" });
    }
  });

async function nextAptRef() {
  const { db } = await collections();
  const r = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "appointment" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `APT-${String(r?.seq ?? 1).padStart(6, "0")}`;
}

/**
 * Books a visit for someone not yet in Medisense, from a name and phone only. A provisional
 * patient record is opened (with an MRN) so the visit shows everywhere; intake completes it later.
 */
export async function quickBook(admin: UserDoc, input: z.infer<typeof quickBookSchema>) {
  const db = await collections();
  const t = await db.therapists.findOne({ _id: new ObjectId(input.therapistId) });
  if (!t || t.active === false) throw new UserFacingError("Choose a clinician who's working.", 409);
  const start = new Date(input.start);
  const held = await db.appointments
    .find({ therapistId: t._id, holdsSlot: true, start: { $gte: new Date() } })
    .toArray();
  if (!isSlotFree(t, start, held)) {
    throw new UserFacingError(`${slotLabel(start)} was just taken. Choose another time.`, 409);
  }
  if (input.clientId) return bookExisting(admin, new ObjectId(input.clientId), t, start, input);
  const phone = input.phone.replace(/\s+/g, " ");
  const now = new Date();
  const clientId = new ObjectId();
  const userId = new ObjectId();
  const mrn = await nextMrn(db.db, now);
  const support = supportFor(t);
  const needId = randomBytes(6).toString("hex");
  await db.users.insertOne({
    _id: userId,
    // Placeholder until intake records their email; it can't receive mail.
    email: `pending-${clientId.toHexString()}@intake.medisense.invalid`,
    name: input.name,
    role: "client",
    passwordHash: null,
    invite: { codeHash: mrnHash(mrn), ...mrnAccess(now) },
    therapistId: null,
    clientId,
    phone,
    createdAt: now,
  });
  const client: ClientDoc = {
    _id: clientId,
    mrn,
    name: input.name,
    dateOfBirth: null,
    email: "",
    phone,
    suburb: "To confirm",
    region: t.region,
    funding: "Private",
    needs: [
      {
        id: needId,
        support,
        discipline: t.discipline,
        frequency: "Assessment",
        location: input.telehealth ? "Telehealth" : "Home",
        status: "assigned",
        therapistId: t._id,
      },
    ],
    notes: input.note || "Booked by phone. Details to complete at intake.",
    precautions: null,
    emergencyContact: null,
    provisional: { byName: admin.name, at: now, note: input.note },
    userId,
    createdBy: admin._id,
    createdAt: now,
  };
  await db.clients.insertOne(client);
  const ref = await nextAptRef();
  const visit: AppointmentDoc = {
    _id: new ObjectId(),
    therapistId: t._id,
    clientId,
    discipline: t.discipline,
    start,
    end: new Date(start.getTime() + t.sessionMinutes * 60_000),
    status: "booked",
    holdsSlot: true,
    needId,
    modality: input.telehealth ? "Telehealth" : "In person",
    ref,
    purpose: null,
    createdAt: now,
  };
  await db.appointments.insertOne(visit);
  const tu = await db.users.findOne({ therapistId: t._id }, { projection: { _id: 1 } });
  if (tu) {
    await notify([tu._id], {
      title: `New visit: ${slotLabel(start)}`,
      body: `${input.name} (new, booked by phone) with you${input.telehealth ? " by video" : ""}. Details are still to be completed.`,
      href: "/mobile/therapist",
    });
  }
  await audit(
    admin,
    `Quick booking: ${ref} for ${input.name} (new, ${mrn}) with ${t.name}, ${slotLabel(start)}. Details to complete at intake`,
    clientId,
  );
  await publish([...(await adminIds()), ...(tu ? [tu._id] : [])], "care", {
    clientId: clientId.toHexString(),
  });
  return {
    ref,
    mrn,
    clientId: clientId.toHexString(),
    summary: `${ref} booked for ${input.name} with ${t.name}, ${slotLabel(start)}.`,
  };
}

/** Books a visit for an existing patient with one of their own clinicians. */
async function bookExisting(
  admin: UserDoc,
  clientId: ObjectId,
  t: TherapistDoc,
  start: Date,
  input: z.infer<typeof quickBookSchema>,
) {
  const db = await collections();
  const c = await db.clients.findOne({ _id: clientId });
  if (!c) throw new UserFacingError("Patient not found.", 404);
  const need = bookableNeeds(c).find((n) => n.therapistId?.equals(t._id));
  if (!need) {
    throw new UserFacingError(
      `${t.name} isn't ${c.name}'s clinician. Assign them first through referrals or the booking agent.`,
      409,
    );
  }
  const ref = await nextAptRef();
  await db.appointments.insertOne({
    _id: new ObjectId(),
    therapistId: t._id,
    clientId: c._id,
    discipline: need.discipline,
    start,
    end: new Date(start.getTime() + t.sessionMinutes * 60_000),
    status: "booked",
    holdsSlot: true,
    needId: need.id,
    modality: input.telehealth ? "Telehealth" : "In person",
    ref,
    purpose: null,
    createdAt: new Date(),
  });
  const tu = await db.users.findOne({ therapistId: t._id }, { projection: { _id: 1 } });
  const cu = await db.users.findOne({ clientId: c._id }, { projection: { _id: 1 } });
  const people = [tu?._id, cu?._id].filter((x): x is ObjectId => Boolean(x));
  await notify(people, {
    title: `Visit booked: ${slotLabel(start)}`,
    body: `${need.support} with ${t.name}${input.telehealth ? " by video" : ""}. Booked by ${admin.name}.`,
    href: "/mobile/patient",
  });
  await audit(
    admin,
    `Booked ${ref} for ${c.name} with ${t.name}, ${slotLabel(start)}${input.note ? `. ${input.note}` : ""}`,
    c._id,
  );
  await publish([...(await adminIds()), ...people], "care", { clientId: c._id.toHexString() });
  return {
    ref,
    mrn: c.mrn ?? "",
    clientId: c._id.toHexString(),
    summary: `${ref} booked for ${c.name} with ${t.name}, ${slotLabel(start)}.`,
  };
}
