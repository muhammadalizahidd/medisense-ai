import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Db, ObjectId } from "mongodb";
import { z } from "zod";
import {
  consentItems,
  consentStates,
  contactSchema,
  delegateRoles,
  detailsSchema,
  manualStatuses,
  PROFILE_CHECKS,
  profileGaps,
  shareCategories,
  type Address,
  type ConsentKey,
  type ContactRole03,
  type ParticipantDetails,
  type ParticipantProfileDto,
  type ParticipantStatus,
  type Responsibility,
} from "@/lib/live/participant";
import { slotLabel } from "@/lib/live/time";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type {
  AppointmentDoc,
  AssignmentDoc,
  ClientDoc,
  ConsentDoc,
  ContactDoc,
  ParticipantProfileDoc,
  ReferralDoc,
  TherapistDoc,
  UserDoc,
} from "./models";

/** The participant's status: set by hand (hold, archive, deceased) or from the services. */
export function statusOf(client: ClientDoc): ParticipantStatus {
  const manual = client.profile?.manualStatus;
  if (manual === "Deceased" || manual === "Archived") return manual;
  if (client.discharged) return "Discharged";
  if (manual === "On Hold") return "On Hold";
  return client.needs.some((n) => n.status === "assigned" || n.status === "completed")
    ? "Active"
    : "Prospective";
}

const submitterRole: Record<string, ContactRole03> = {
  Participant: "Participant",
  "Parent or guardian": "Parent",
  "Authorised representative": "Nominee",
  "Support coordinator": "Support Coordinator",
  "Other referrer": "Referrer",
};
const formRole: Record<string, ContactRole03> = {
  Participant: "Participant",
  "Parent or guardian": "Parent",
  "Plan nominee": "Nominee",
  "Support coordinator": "Support Coordinator",
  Other: "Other",
};
const authorityFor = (role: ContactRole03) =>
  role === "Participant"
    ? ("Self" as const)
    : role === "Parent" || role === "Guardian"
      ? ("Parent/Guardian" as const)
      : role === "Nominee"
        ? ("Legal Nominee" as const)
        : ("None" as const);

/** The record built from the referral the first time it's needed: every value names its source. */
function initialRecord(client: ClientDoc, referral: ReferralDoc | null) {
  const now = new Date();
  const source = referral ? `Referral ${referral.reference}` : "Patient record";
  const input = referral?.data;
  const contacts: ContactDoc[] = [];
  const add = (
    role: ContactRole03,
    c: { name: string; email?: string; phone?: string; organisation?: string },
    duties: Responsibility[],
  ) => {
    if (!c.name?.trim()) return;
    const same = contacts.find(
      (x) =>
        x.name.toLowerCase() === c.name.trim().toLowerCase() &&
        (x.email || "") === (c.email || "").toLowerCase(),
    );
    if (same) {
      same.responsibilities = [...new Set([...same.responsibilities, ...duties])];
      return;
    }
    contacts.push({
      id: randomUUID(),
      role,
      name: c.name.trim(),
      organisation: c.organisation ?? "",
      relationship: role === "Participant" ? "Self" : "",
      phone: c.phone ?? "",
      email: (c.email ?? "").toLowerCase(),
      responsibilities: duties,
      primaryFor: [],
      authorityType: authorityFor(role),
      authorityScope: role === "Support Coordinator" ? ["Communicate"] : [],
      authorityExpires: "",
      restrictions: "",
      contactAllowed: true,
      state: "Unverified",
      verifiedBy: null,
      verifiedAt: null,
      revoked: null,
      source,
      createdAt: now,
    });
  };
  if (input) {
    const self = { name: client.name, email: client.email, phone: client.phone ?? "" };
    const named = (role: string, c: { name: string; email: string; phone: string }) =>
      role === "Participant" ? self : c;
    add(formRole[input.booking.role] ?? "Other", named(input.booking.role, input.booking), [
      "Booking",
      "General Communication",
    ]);
    add(formRole[input.signatory.role] ?? "Other", named(input.signatory.role, input.signatory), [
      "Consent/Signatory",
    ]);
    if (input.submitter.role !== "Participant") {
      add(submitterRole[input.submitter.role] ?? "Referrer", input.submitter, [
        "General Communication",
      ]);
    }
    add("Support Coordinator", input.supportCoordinator, ["Clinical Coordination"]);
    if (input.funding.planManagerCompany) {
      add(
        "Plan Manager",
        {
          name: input.funding.planManagerCompany,
          organisation: input.funding.planManagerCompany,
          email: input.funding.planManagerEmail,
        },
        ["Billing"],
      );
    }
  }
  if (client.emergencyContact) {
    add("Emergency Contact", client.emergencyContact, ["Emergency"]);
    const e = contacts.find((c) => c.name === client.emergencyContact!.name);
    if (e) e.relationship = client.emergencyContact.relationship;
  }
  // The first contact for each responsibility starts as its primary.
  for (const duty of ["Booking", "Consent/Signatory", "Emergency", "Billing"] as const) {
    const first = contacts.find((c) => c.responsibilities.includes(duty));
    if (first) first.primaryFor.push(duty);
  }

  const address: Address = input?.participant.address ?? {
    street: "",
    suburb: client.suburb,
    state: "QLD",
    postcode: "",
  };
  const from = { source, verifiedBy: null, at: referral?.createdAt ?? client.createdAt };
  const profile: ParticipantProfileDoc = {
    manualStatus: null,
    statusNote: null,
    preferredName: "",
    pronouns: "",
    address,
    addressHistory: [],
    language: "",
    interpreter: false,
    accessibility: [],
    accessibilityNotes: "",
    contactMode: input?.booking.method ?? "",
    contactTime: input?.booking.preferredTime ?? "",
    provenance: Object.fromEntries(
      ["name", "dateOfBirth", "email", "phone", "address", "contactMode"].map((f) => [f, from]),
    ),
    reportedDiagnosis: input?.clinical.diagnosis
      ? { text: input.clinical.diagnosis, source }
      : null,
  };

  const consents: ConsentDoc[] = consentItems.map((item) => ({
    key: item.key,
    state: "Not asked",
    version: "",
    respondent: "",
    recordedBy: "",
    at: null,
    scope: [],
    note: "",
    history: [],
  }));
  const give = (
    key: ConsentKey,
    respondent: string,
    recordedBy: string,
    at: Date,
    note: string,
  ) => {
    const c = consents.find((x) => x.key === key)!;
    Object.assign(c, { state: "Given", version: "2026.1", respondent, recordedBy, at, note });
    c.history.push({ state: "Given", respondent, recordedBy, at, note });
  };
  if (referral && input?.consent.privacy) {
    give("privacy-notice", input.submitter.name, "Referral form", referral.createdAt, source);
  }
  if (referral?.fundingReview?.consentRecorded) {
    give(
      "general-care",
      input!.signatory.name || client.name,
      referral.fundingReview.byName,
      referral.fundingReview.at,
      "Recorded at funding review",
    );
  }
  return { profile, contacts, consents };
}

/** Builds the Module 03 record from the referral once, then keeps it. */
export async function ensureProfile(db: Db, client: ClientDoc): Promise<ClientDoc> {
  if (client.profile && client.contacts && client.consents) return client;
  const referral = await db
    .collection<ReferralDoc>("referrals")
    .find({ clientId: client._id })
    .sort({ createdAt: 1 })
    .limit(1)
    .next();
  const built = initialRecord(client, referral);
  const set = {
    profile: client.profile ?? built.profile,
    contacts: client.contacts ?? built.contacts,
    consents: client.consents ?? built.consents,
  };
  await db.collection<ClientDoc>("clients").updateOne({ _id: client._id }, { $set: set });
  return { ...client, ...set };
}

const today = () => new Date().toISOString().slice(0, 10);
const contactState = (c: ContactDoc) =>
  c.state === "Verified" && c.authorityExpires && c.authorityExpires < today()
    ? ("Expired" as const)
    : c.state;

function detailsOf(client: ClientDoc): ParticipantDetails {
  const p = client.profile!;
  return {
    name: client.name,
    preferredName: p.preferredName,
    pronouns: p.pronouns,
    dateOfBirth: client.dateOfBirth ?? "",
    email: client.email,
    phone: client.phone ?? "",
    address: p.address,
    language: p.language,
    interpreter: p.interpreter,
    accessibility: p.accessibility as ParticipantDetails["accessibility"],
    accessibilityNotes: p.accessibilityNotes,
    contactMode: p.contactMode as ParticipantDetails["contactMode"],
    contactTime: p.contactTime,
  };
}

/** How complete a record is, for the directory and the summary. */
export function completenessOf(client: ClientDoc) {
  if (!client.profile || !client.contacts || !client.consents) return null;
  const missing = profileGaps({
    details: detailsOf(client),
    contacts: client.contacts.map((c) => ({ ...c, state: contactState(c) })),
    consents: client.consents,
  });
  return {
    percent: Math.round(((PROFILE_CHECKS - missing.length) / PROFILE_CHECKS) * 100),
    missing,
  };
}

async function loadProfile(id: ObjectId) {
  const { clients, db } = await collections();
  const client = await clients.findOne({ _id: id });
  if (!client) throw new UserFacingError("Patient not found.", 404);
  return ensureProfile(db, client);
}

export async function participantProfile(id: ObjectId): Promise<ParticipantProfileDto> {
  const { referrals, assessments, appointments } = await collections();
  const client = await loadProfile(id);
  const p = client.profile!;
  const [refs, signed, upcoming] = await Promise.all([
    referrals
      .find(
        { clientId: id },
        {
          projection: {
            reference: 1,
            status: 1,
            triage: 1,
            data: 1,
            history: 1,
            createdAt: 1,
            services: 1,
            submittedBy: 1,
          },
        },
      )
      .sort({ createdAt: 1 })
      .toArray(),
    assessments
      .find({ clientId: id, signed: { $ne: null } })
      .sort({ createdAt: -1 })
      .toArray(),
    appointments.countDocuments({
      clientId: id,
      status: "booked",
      start: { $gt: new Date() },
      modality: { $ne: "Telehealth" },
    }),
  ]);
  const risks = refs.flatMap((r) => {
    const c = r.data.clinical;
    const out: ParticipantProfileDto["clinical"]["risks"] = [];
    const reviewed = r.triage
      ? { byName: r.triage.byName, at: r.triage.at.toISOString(), action: r.triage.precaution }
      : null;
    if (c.knownRisk !== "No") {
      out.push({
        text: c.knownRisk === "Yes" ? c.riskDetails : "Unknown whether there is a risk to staff",
        kind: "Risk to staff",
        source: `Reported in referral ${r.reference}`,
        reviewed,
      });
    }
    if (c.behaviours !== "No") {
      out.push({
        text: c.behaviours === "Yes" ? c.behavioursDetails : "Unknown",
        kind: "Behaviours of concern",
        source: `Reported in referral ${r.reference}`,
        reviewed,
      });
    }
    return out;
  });
  return {
    status: statusOf(client),
    statusNote: p.statusNote ? { ...p.statusNote, at: p.statusNote.at.toISOString() } : null,
    completeness: completenessOf(client)!,
    details: detailsOf(client),
    provenance: Object.fromEntries(
      Object.entries(p.provenance).map(([k, v]) => [k, { ...v, at: v.at.toISOString() }]),
    ),
    addressHistory: p.addressHistory.map((h) => ({ ...h, until: h.until.toISOString() })),
    contacts: client.contacts!.map((c) => {
      const state = contactState(c);
      return {
        ...c,
        state,
        verifiedAt: c.verifiedAt?.toISOString() ?? null,
        revoked: c.revoked ? { ...c.revoked, at: c.revoked.at.toISOString() } : null,
        createdAt: c.createdAt.toISOString(),
        // A representative acts for the participant only with verified, current authority (AT-11).
        canAct: !delegateRoles.includes(c.role) || state === "Verified",
      };
    }),
    consents: consentItems.map((item) => {
      const c = client.consents!.find((x) => x.key === item.key);
      return {
        key: item.key,
        label: item.label,
        help: item.help,
        state: c?.state ?? "Not asked",
        version: c?.version ?? "",
        respondent: c?.respondent ?? "",
        recordedBy: c?.recordedBy ?? "",
        at: c?.at?.toISOString() ?? null,
        scope: c?.scope ?? [],
        note: c?.note ?? "",
        history: (c?.history ?? []).map((h) => ({ ...h, at: h.at.toISOString() })),
      };
    }),
    clinical: {
      reportedDiagnosis: p.reportedDiagnosis,
      verified: signed.map((a) => ({
        support: a.support,
        byName: a.signed!.byName,
        at: a.signed!.at.toISOString(),
        summary: a.released?.summary ?? null,
      })),
      risks,
    },
    referrals: refs.map((r) => ({
      id: r._id.toHexString(),
      reference: r.reference,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      submitter: `${r.data.submitter.name} (${r.data.submitter.role.toLowerCase()})`,
      enteredBy: r.submittedBy === "staff" ? "Entered by staff" : "Sent online",
      funding: r.data.funding.source,
      location: r.data.location.type,
      supports: r.data.supports.map((s, i) => ({
        name: s.support,
        frequency: s.frequency === "Other" ? s.frequencyOther : s.frequency,
        decision: r.services?.find((x) => x.index === i)?.decision ?? null,
      })),
      goals: r.data.goals,
      history: r.history.map((h) => ({ ...h, at: h.at.toISOString() })),
    })),
    upcomingInPerson: upcoming,
    funding: {
      source: client.funding,
      region: client.region,
      payer: client.fundingDetails?.payer ?? "",
      ndisNumber: client.fundingDetails?.ndisNumber ?? "",
      planType: client.fundingDetails?.planType ?? "",
      planEndDate: client.fundingDetails?.planEndDate ?? "",
    },
  };
}

export const participantActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("details"), details: detailsSchema }),
  z.object({
    type: z.literal("status"),
    to: z.enum([...manualStatuses, "Resume"]),
    reason: z.string().trim().min(3, "Give a reason").max(500),
  }),
  z.object({ type: z.literal("contact-save"), contact: contactSchema }),
  z.object({
    type: z.literal("contact-verify"),
    id: z.string(),
    evidence: z.string().trim().min(3, "Describe the evidence checked").max(300),
    expires: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]),
  }),
  z.object({
    type: z.literal("contact-revoke"),
    id: z.string(),
    reason: z.string().trim().min(3, "Give a reason").max(300),
  }),
  z.object({
    type: z.literal("consent"),
    key: z.enum(consentItems.map((c) => c.key) as [ConsentKey, ...ConsentKey[]]),
    state: z.enum(consentStates).exclude(["Not asked"]),
    respondent: z.string().trim().min(2, "Who gave this answer?").max(120),
    scope: z.array(z.enum(shareCategories)).max(6).default([]),
    note: z.string().trim().max(300).default(""),
  }),
  z.object({ type: z.literal("contact-link"), id: z.string() }),
  z.object({
    type: z.literal("close-service"),
    needId: z.string(),
    reason: z.string().trim().min(3, "Give a reason").max(300),
  }),
]);
export type ParticipantAction = z.infer<typeof participantActionSchema>;

const show = (v: unknown) =>
  Array.isArray(v)
    ? v.join(", ") || "none"
    : typeof v === "boolean"
      ? v
        ? "yes"
        : "no"
      : v === "" || v === null || v === undefined
        ? "blank"
        : String(v);
const addressLine = (a: Address) =>
  [a.street, a.suburb, a.state, a.postcode].filter(Boolean).join(", ");
const labels: Record<string, string> = {
  name: "Legal name",
  preferredName: "Preferred name",
  pronouns: "Pronouns",
  dateOfBirth: "Date of birth",
  email: "Email",
  phone: "Phone",
  address: "Address",
  language: "Preferred language",
  interpreter: "Interpreter needed",
  accessibility: "Accessibility needs",
  accessibilityNotes: "Accessibility notes",
  contactMode: "Preferred contact method",
  contactTime: "Preferred contact time",
};

/** Cancels a patient's future visits on Medisense's side: never charged. */
async function cancelFuture(
  clientId: ObjectId,
  reason: string,
  byName: string,
  filter: Partial<Pick<AppointmentDoc, "needId">> = {},
) {
  const { appointments, assignments } = await collections();
  const now = new Date();
  const future = await appointments
    .find({ clientId, status: "booked", start: { $gt: now }, ...filter })
    .toArray();
  for (const v of future) {
    await appointments.updateOne(
      { _id: v._id },
      {
        $set: {
          status: "cancelled",
          holdsSlot: false,
          cancellation: {
            by: "medisense",
            reason,
            noticeHours: Math.max(0, Math.floor((v.start.getTime() - now.getTime()) / 3_600_000)),
            chargeable: false,
            actorName: byName,
            at: now,
          },
        },
      },
    );
  }
  const pending = await assignments
    .find({
      clientId,
      status: "pending",
      ...(filter.needId ? { needId: filter.needId } : {}),
    } as Partial<AssignmentDoc>)
    .toArray();
  for (const a of pending) {
    await assignments.updateOne(
      { _id: a._id },
      { $set: { status: "withdrawn", respondedAt: now } },
    );
    await appointments.updateOne(
      { _id: a.appointmentId },
      { $set: { status: "cancelled", holdsSlot: false } },
    );
  }
  return future.length;
}

/** Profile, contact, consent and status changes. Each is audited with the old and new value. */
export async function participantAction(admin: UserDoc, id: ObjectId, action: ParticipantAction) {
  const { clients, users, therapists } = await collections();
  const client = await loadProfile(id);
  const p = client.profile!;
  const contacts = client.contacts!;
  const now = new Date();
  const result: { warning?: string; link?: string } = {};

  switch (action.type) {
    case "contact-link": {
      const c = contacts.find((x) => x.id === action.id);
      if (!c) throw new UserFacingError("Contact not found.", 404);
      const why = appointmentAccess(client, c);
      if (why) throw new UserFacingError(why, 409);
      const token = randomBytes(24).toString("base64url");
      await clients.updateOne(
        { _id: id, "contacts.id": c.id },
        {
          $set: {
            "contacts.$.portal": {
              hash: createHash("sha256").update(token).digest("hex"),
              expiresAt: new Date(Date.now() + 30 * 86_400_000),
            },
          },
        },
      );
      await audit(admin, `Shared an appointments link with ${c.name} (${c.role})`, id);
      result.link = `/contact/${token}`;
      break;
    }
    case "details": {
      const before = detailsOf(client);
      const next = action.details;
      const changed = (Object.keys(labels) as (keyof ParticipantDetails)[]).filter(
        (k) => JSON.stringify(before[k]) !== JSON.stringify(next[k]),
      );
      if (!changed.length) throw new UserFacingError("Nothing has changed.");
      if (next.email !== before.email) {
        if (!next.email) throw new UserFacingError("The account email can't be blank.");
        if (await users.findOne({ email: next.email, _id: { $ne: client.userId } })) {
          throw new UserFacingError("Another account already uses that email.", 409);
        }
        await users.updateOne({ _id: client.userId }, { $set: { email: next.email } });
      }
      if (next.dateOfBirth > today()) {
        throw new UserFacingError("The date of birth can't be in the future.");
      }
      const provenance = { ...p.provenance };
      for (const k of changed) {
        provenance[k] = { source: `Edited by ${admin.name}`, verifiedBy: admin.name, at: now };
      }
      const addressChanged = changed.includes("address");
      await clients.updateOne(
        { _id: id },
        {
          $set: {
            name: next.name,
            dateOfBirth: next.dateOfBirth,
            email: next.email,
            phone: next.phone || null,
            suburb: next.address.suburb || client.suburb,
            "profile.preferredName": next.preferredName,
            "profile.pronouns": next.pronouns,
            "profile.address": next.address,
            "profile.language": next.language,
            "profile.interpreter": next.interpreter,
            "profile.accessibility": next.accessibility,
            "profile.accessibilityNotes": next.accessibilityNotes,
            "profile.contactMode": next.contactMode,
            "profile.contactTime": next.contactTime,
            "profile.provenance": provenance,
          },
          ...(addressChanged
            ? {
                $push: {
                  "profile.addressHistory": {
                    address: before.address,
                    until: now,
                    byName: admin.name,
                  },
                },
              }
            : {}),
        },
      );
      for (const k of changed) {
        const from = k === "address" ? addressLine(before.address) : show(before[k]);
        const to = k === "address" ? addressLine(next.address) : show(next[k]);
        // Pronouns and accessibility are sensitive: the change is logged, the values aren't.
        const hidden = k === "pronouns";
        await audit(
          admin,
          hidden ? `Changed ${labels[k]}` : `Changed ${labels[k]}: ${from} → ${to}`,
          id,
        );
      }
      if (addressChanged) {
        const { appointments } = await collections();
        const visits = await appointments
          .find({
            clientId: id,
            status: "booked",
            start: { $gt: now },
            modality: { $ne: "Telehealth" },
          })
          .sort({ start: 1 })
          .toArray();
        if (visits.length) {
          result.warning = `${visits.length} upcoming home visit${visits.length === 1 ? "" : "s"} (first ${slotLabel(visits[0]!.start)}) need the new address reconfirmed with the therapist.`;
          await audit(
            admin,
            `Address changed: ${visits.length} upcoming visits flagged to reconfirm the location`,
            id,
          );
          const ids = [...new Set(visits.map((v) => v.therapistId.toHexString()))];
          const team = await therapists
            .find({ _id: { $in: visits.map((v) => v.therapistId) } }, { projection: { userId: 1 } })
            .toArray();
          if (ids.length) {
            await notify(
              team.map((t: Pick<TherapistDoc, "userId">) => t.userId),
              {
                title: `New address for ${client.name}`,
                body: `Reconfirm the location for upcoming visits: ${addressLine(next.address)}.`,
                href: "/therapist",
              },
            );
          }
        }
      }
      break;
    }
    case "status": {
      const current = statusOf(client);
      if (action.to === "Resume") {
        if (p.manualStatus !== "On Hold") {
          throw new UserFacingError("Only a participant on hold can resume.", 409);
        }
      } else if (current === "Deceased" || current === "Archived") {
        throw new UserFacingError(`This record is ${current.toLowerCase()}.`, 409);
      }
      const manual = action.to === "Resume" ? null : action.to;
      let cancelled = 0;
      if (action.to === "Deceased") {
        cancelled = await cancelFuture(id, "Participant deceased", admin.name);
      }
      await clients.updateOne(
        { _id: id },
        {
          $set: {
            "profile.manualStatus": manual,
            "profile.statusNote": {
              status: action.to === "Resume" ? "Active" : action.to,
              reason: action.reason,
              byName: admin.name,
              at: now,
            },
          },
        },
      );
      await audit(
        admin,
        `Status ${current} → ${action.to === "Resume" ? "resumed" : action.to}: ${action.reason}${cancelled ? `; ${cancelled} future visits cancelled` : ""}`,
        id,
      );
      if (action.to === "On Hold") {
        result.warning =
          "Bookings stay in place. Review upcoming visits with the therapists if the hold affects them.";
      }
      break;
    }
    case "contact-save": {
      const input = action.contact;
      const existing = input.id ? contacts.find((c) => c.id === input.id) : undefined;
      if (input.id && !existing) throw new UserFacingError("Contact not found.", 404);
      if (input.contactAllowed && !input.phone && !input.email) {
        throw new UserFacingError("Give a phone number or email so the contact can be reached.");
      }
      const primaryFor = input.primaryFor.filter((r) => input.responsibilities.includes(r));
      const replaced: string[] = [];
      const others = contacts
        .filter((c) => c.id !== existing?.id)
        .map((c) => {
          const lost = c.primaryFor.filter((r) => primaryFor.includes(r));
          if (lost.length) replaced.push(`${c.name} (${lost.join(", ")})`);
          return lost.length
            ? { ...c, primaryFor: c.primaryFor.filter((r) => !lost.includes(r)) }
            : c;
        });
      const saved: ContactDoc = existing
        ? { ...existing, ...input, id: existing.id, primaryFor }
        : {
            ...input,
            id: randomUUID(),
            primaryFor,
            state: "Unverified",
            verifiedBy: null,
            verifiedAt: null,
            revoked: null,
            source: `Added by ${admin.name}`,
            createdAt: now,
          };
      // Changing who a representative is, or their authority, needs verifying again.
      if (
        existing?.state === "Verified" &&
        (existing.authorityType !== input.authorityType || existing.name !== input.name)
      ) {
        saved.state = "Unverified";
        saved.verifiedBy = null;
        saved.verifiedAt = null;
      }
      const list = existing
        ? contacts.map((c) => (c.id === existing.id ? saved : others.find((o) => o.id === c.id)!))
        : [...others, saved];
      await clients.updateOne({ _id: id }, { $set: { contacts: list } });
      await audit(
        admin,
        `${existing ? "Updated" : "Added"} contact ${saved.name} (${saved.role})${
          primaryFor.length ? `; primary for ${primaryFor.join(", ")}` : ""
        }${replaced.length ? `; replaces ${replaced.join(", ")} as primary` : ""}`,
        id,
      );
      if (replaced.length) result.warning = `Primary changed from ${replaced.join(", ")}.`;
      break;
    }
    case "contact-verify": {
      const c = contacts.find((x) => x.id === action.id);
      if (!c) throw new UserFacingError("Contact not found.", 404);
      if (c.state === "Revoked")
        throw new UserFacingError("Revoked contacts can't be verified.", 409);
      await clients.updateOne(
        { _id: id, "contacts.id": action.id },
        {
          $set: {
            "contacts.$.state": "Verified",
            "contacts.$.verifiedBy": admin.name,
            "contacts.$.verifiedAt": now,
            "contacts.$.authorityExpires": action.expires,
            "contacts.$.restrictions": c.restrictions,
          },
        },
      );
      await audit(
        admin,
        `Verified ${c.name} (${c.role}, ${c.authorityType} authority): ${action.evidence}${action.expires ? `; expires ${action.expires}` : ""}`,
        id,
      );
      break;
    }
    case "contact-revoke": {
      const c = contacts.find((x) => x.id === action.id);
      if (!c) throw new UserFacingError("Contact not found.", 404);
      await clients.updateOne(
        { _id: id, "contacts.id": action.id },
        {
          $set: {
            "contacts.$.state": "Revoked",
            "contacts.$.primaryFor": [],
            "contacts.$.revoked": { reason: action.reason, byName: admin.name, at: now },
          },
        },
      );
      await audit(admin, `Revoked ${c.name}'s access (${c.role}): ${action.reason}`, id);
      break;
    }
    case "consent": {
      const item = consentItems.find((i) => i.key === action.key)!;
      const current = client.consents!.find((c) => c.key === action.key);
      if (action.state === "Withdrawn" && current?.state !== "Given") {
        throw new UserFacingError("Only a consent that was given can be withdrawn.", 409);
      }
      if (action.key === "share-coordinator" && action.state === "Given" && !action.scope.length) {
        throw new UserFacingError("Choose what the support coordinator may receive.");
      }
      const entry = {
        state: action.state,
        respondent: action.respondent,
        recordedBy: admin.name,
        at: now,
        note: action.note,
      };
      const next: ConsentDoc = {
        key: action.key,
        state: action.state,
        version: "2026.1",
        respondent: action.respondent,
        recordedBy: admin.name,
        at: now,
        scope: action.state === "Given" ? action.scope : [],
        note: action.note,
        history: [...(current?.history ?? []), entry],
      };
      await clients.updateOne(
        { _id: id },
        {
          $set: {
            consents: [...client.consents!.filter((c) => c.key !== action.key), next],
          },
        },
      );
      await audit(
        admin,
        `${item.label}: ${current?.state ?? "Not asked"} → ${action.state} (${action.respondent})${
          next.scope.length ? `; shares ${next.scope.join(", ")}` : ""
        }`,
        id,
      );
      break;
    }
    case "close-service": {
      const need = client.needs.find((n) => n.id === action.needId);
      if (!need) throw new UserFacingError("Service not found.", 404);
      if (need.status === "completed")
        throw new UserFacingError("This service is already closed.", 409);
      const cancelled = await cancelFuture(id, `${need.support} closed`, admin.name, {
        needId: need.id,
      });
      await clients.updateOne(
        { _id: id, "needs.id": need.id },
        { $set: { "needs.$.status": "completed" } },
      );
      if (need.status === "assigned" && need.therapistId) {
        await therapists.updateOne({ _id: need.therapistId }, { $inc: { activeClients: -1 } });
      }
      await audit(
        admin,
        `Closed ${need.support}: ${action.reason}${cancelled ? `; ${cancelled} future visits cancelled` : ""}`,
        id,
      );
      const open = client.needs.filter((n) => n.id !== need.id && n.status !== "completed");
      result.warning = open.length
        ? `${need.support} is closed. ${open.length} other service${open.length === 1 ? " stays" : "s stay"} active.`
        : `${need.support} is closed. No services remain open: discharge the participant when appropriate.`;
      break;
    }
  }
  await publish(await adminIds(), "care", { clientId: id.toHexString() });
  return result;
}

/**
 * Whether a contact may see the participant's appointments, and why not (AT-24). Checked when the
 * link is made and again every time it's opened, so revoking, expiry or withdrawn consent ends it.
 */
export function appointmentAccess(client: ClientDoc, c: ContactDoc): string | null {
  if (c.state === "Revoked") return `${c.name}'s access was revoked.`;
  if (!c.contactAllowed) return `${c.name} is marked do not contact.`;
  if (c.role === "Participant") return "The participant uses their own patient app.";
  if (c.role === "Support Coordinator") {
    const share = client.consents?.find((x) => x.key === "share-coordinator");
    if (share?.state !== "Given" || !share.scope.includes("Appointment updates")) {
      return "Record consent to share appointment updates with the support coordinator first.";
    }
    return null;
  }
  if (c.state !== "Verified") return `Verify ${c.name}'s authority first.`;
  if (c.authorityExpires && c.authorityExpires < new Date().toISOString().slice(0, 10)) {
    return `${c.name}'s authority has expired.`;
  }
  if (!c.authorityScope.some((s) => s === "View" || s === "Schedule")) {
    return `${c.name}'s authority doesn't include viewing or scheduling.`;
  }
  return null;
}

/** Public: an authorised contact's view of the participant's upcoming appointments only. */
export async function contactAppointments(token: string) {
  const { clients, appointments, therapists } = await collections();
  const hash = createHash("sha256").update(token).digest("hex");
  const client = await clients.findOne({ "contacts.portal.hash": hash });
  const c = client?.contacts?.find((x) => x.portal?.hash === hash);
  if (!client || !c || !c.portal || c.portal.expiresAt < new Date()) {
    throw new UserFacingError(
      "This link isn't valid any more. Ask the care team for a new one.",
      404,
    );
  }
  const why = appointmentAccess(client, c);
  if (why)
    throw new UserFacingError(
      "Access to these appointments has ended. Contact the care team.",
      409,
    );
  const visits = await appointments
    .find({
      clientId: client._id,
      status: { $in: ["booked", "tentative"] },
      start: { $gte: new Date() },
    })
    .sort({ start: 1 })
    .limit(20)
    .toArray();
  const team = await therapists
    .find({ _id: { $in: visits.map((v) => v.therapistId) } }, { projection: { name: 1 } })
    .toArray();
  const name = new Map(team.map((t) => [t._id.toHexString(), t.name]));
  return {
    participant: client.name.split(" ")[0] ?? "",
    contact: c.name,
    role: c.role,
    canSchedule: c.authorityScope.includes("Schedule"),
    appointments: visits.map((v) => ({
      ref: v.ref ?? "",
      start: v.start.toISOString(),
      end: v.end.toISOString(),
      status: v.status === "booked" ? "Booked" : "Being arranged",
      clinician: name.get(v.therapistId.toHexString()) ?? "Clinician",
      service: client.needs.find((n) => n.id === v.needId)?.support ?? v.discipline,
      mode: v.modality === "Telehealth" ? "Video visit" : "In person",
      place: v.modality === "Telehealth" ? "Online" : client.suburb,
    })),
  };
}
