import "server-only";
import { can } from "./permissions";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import {
  RECORDING_RETENTION_DAYS,
  type RecordingStatus,
  type TelehealthDto,
} from "@/lib/live/telehealth";
import { slotLabel } from "@/lib/live/time";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, audit, notify, publish } from "./live";
import type { AppointmentDoc, TelehealthDoc, UserDoc } from "./models";
import { partiesOf, visitFor } from "./visits";

/**
 * Telehealth (functional requirements, section 12). The video itself is a simulator, labelled
 * DEMO ONLY, but every rule around it is real: one-time links, identity, separate consents,
 * admission by the clinician, recording off by default and audited review.
 */

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");
const LINK_OPENS_MIN = 60;
const LINK_CLOSES_MIN = 60;

async function load(visit: AppointmentDoc) {
  const { telehealth } = await collections();
  const existing = await telehealth.findOne({ appointmentId: visit._id });
  if (existing) return settle(existing);
  const doc: TelehealthDoc = {
    _id: new ObjectId(),
    appointmentId: visit._id,
    clientId: visit.clientId,
    therapistId: visit.therapistId,
    tokenHash: null,
    linkSentAt: null,
    suitability: null,
    guest: null,
    consents: { video: null, recording: null, transcription: null, sharing: null },
    device: null,
    state: "Not started",
    waitingSince: null,
    admittedAt: null,
    endedAt: null,
    participants: [],
    screenShare: false,
    recordingAllowed: false,
    recording: {
      status: "Off",
      segments: [],
      availableAt: null,
      durationSec: 0,
      retentionUntil: null,
      deleted: null,
      restricted: false,
    },
    transcript: [],
    accessLog: [],
    events: [],
  };
  await telehealth.insertOne(doc);
  return doc;
}

/** Processing finishes on the next read after a few seconds: the simulator's "upload". */
async function settle(doc: TelehealthDoc) {
  const last = doc.recording.segments.at(-1);
  if (doc.recording.status === "Processing" && last && Date.now() - last.end.getTime() > 4000) {
    const { telehealth } = await collections();
    const retentionUntil = new Date(Date.now() + RECORDING_RETENTION_DAYS * 86_400_000);
    await telehealth.updateOne(
      { _id: doc._id },
      {
        $set: {
          "recording.status": "Available",
          "recording.availableAt": new Date(),
          "recording.retentionUntil": retentionUntil,
        },
      },
    );
    return {
      ...doc,
      recording: {
        ...doc.recording,
        status: "Available" as RecordingStatus,
        availableAt: new Date(),
        retentionUntil,
      },
    };
  }
  return doc;
}

function recordingStatus(doc: TelehealthDoc): RecordingStatus {
  const r = doc.recording;
  if (r.deleted) return "Deleted per policy";
  if (r.restricted && r.status === "Available") return "Access Restricted";
  if (r.status !== "Off") return r.status;
  if (!doc.consents.recording?.given) return doc.guest ? "Consent Pending" : "Off";
  return doc.recordingAllowed ? "Ready" : "Off";
}

function toDto(
  doc: TelehealthDoc,
  visit: AppointmentDoc,
  names: { patient: string; therapist: string },
  viewer: "clinician" | "guest",
): TelehealthDto {
  return {
    visitId: visit._id.toHexString(),
    clientId: viewer === "clinician" ? visit.clientId.toHexString() : "",
    patient: names.patient,
    therapist: names.therapist,
    start: visit.start.toISOString(),
    end: visit.end.toISOString(),
    visitStatus: visit.status,
    state: doc.state,
    linkSent: Boolean(doc.linkSentAt),
    suitability: doc.suitability
      ? { ok: doc.suitability.ok, notes: doc.suitability.notes, byName: doc.suitability.byName }
      : null,
    guest: doc.guest
      ? { name: doc.guest.name, relationship: doc.guest.relationship, verified: doc.guest.verified }
      : null,
    consents: Object.fromEntries(
      (["video", "recording", "transcription", "sharing"] as const).map((k) => [
        k,
        doc.consents[k]
          ? {
              given: doc.consents[k]!.given,
              by: doc.consents[k]!.by,
              at: doc.consents[k]!.at.toISOString(),
            }
          : null,
      ]),
    ) as TelehealthDto["consents"],
    device: doc.device,
    waitingSince: doc.waitingSince?.toISOString() ?? null,
    admittedAt: doc.admittedAt?.toISOString() ?? null,
    participants: doc.participants.map((p) => ({ ...p, joinedAt: p.joinedAt.toISOString() })),
    screenShare: doc.screenShare,
    recordingAllowed: doc.recordingAllowed,
    recording: {
      status: recordingStatus(doc),
      durationSec: doc.recording.durationSec,
      retentionUntil: doc.recording.retentionUntil?.toISOString() ?? null,
    },
    transcript:
      viewer === "clinician" ? doc.transcript.map((t) => ({ ...t, at: t.at.toISOString() })) : [],
    events:
      viewer === "clinician"
        ? doc.events.slice(-12).map((e) => ({ ...e, at: e.at.toISOString() }))
        : [],
  };
}

async function push(doc: TelehealthDoc, extra: ObjectId[] = []) {
  const { therapists } = await collections();
  const t = await therapists.findOne({ _id: doc.therapistId }, { projection: { userId: 1 } });
  await publish([...(t ? [t.userId] : []), ...extra], "care", {
    visitId: doc.appointmentId.toHexString(),
    clientId: doc.clientId.toHexString(),
  });
}

const event = (text: string) => ({ at: new Date(), text });

/* ----------------------------------------------------------- clinician */

async function clinicianVisit(user: UserDoc, visitId: ObjectId) {
  const { visit, actsFor } = await visitFor(user, visitId);
  if (actsFor !== "therapist")
    throw new UserFacingError("Only the visit's clinician hosts the call.", 404);
  if ((visit.modality ?? "In person") !== "Telehealth")
    throw new UserFacingError("This visit is in person. Switch it to telehealth first.", 409);
  return visit;
}

export async function clinicianView(user: UserDoc, visitId: ObjectId) {
  const visit = await clinicianVisit(user, visitId);
  const doc = await load(visit);
  const { client, therapist } = await partiesOf(visit);
  return toDto(doc, visit, { patient: client.name, therapist: therapist.name }, "clinician");
}

export const hostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("suitability"),
    ok: z.boolean(),
    notes: z.string().trim().max(1000),
  }),
  z.object({ action: z.literal("send-link") }),
  z.object({ action: z.literal("admit") }),
  z.object({
    action: z.literal("add-participant"),
    name: z.string().trim().min(2).max(80),
    role: z.enum(["Support person", "Interpreter"]),
  }),
  z.object({ action: z.literal("screen-share"), on: z.boolean() }),
  z.object({ action: z.literal("allow-recording"), on: z.boolean() }),
  z.object({ action: z.literal("record"), command: z.enum(["start", "pause", "resume", "stop"]) }),
  z.object({
    action: z.literal("transcript"),
    text: z.string().trim().min(1).max(1000),
    speaker: z.enum(["Clinician", "Participant"]),
  }),
  z.object({ action: z.literal("connection"), kind: z.enum(["retry", "phone", "rebook"]) }),
  z.object({ action: z.literal("safety"), text: z.string().trim().min(3).max(1000) }),
  z.object({ action: z.literal("end") }),
]);

export async function host(user: UserDoc, visitId: ObjectId, input: z.infer<typeof hostSchema>) {
  const db = await collections();
  const visit = await clinicianVisit(user, visitId);
  const doc = await load(visit);
  const { client } = await partiesOf(visit);
  const set = (fields: Record<string, unknown>, text?: string) =>
    db.telehealth.updateOne(
      { _id: doc._id },
      { $set: fields, ...(text ? { $push: { events: event(text) } } : {}) },
    );
  const inCall = doc.state === "In call";
  let result: Record<string, unknown> = {};

  switch (input.action) {
    case "suitability":
      if (!input.ok && !input.notes)
        throw new UserFacingError("Say why telehealth isn't suitable.");
      await set(
        { suitability: { ok: input.ok, notes: input.notes, byName: user.name, at: new Date() } },
        `Clinical suitability: ${input.ok ? "suitable" : "not suitable"}`,
      );
      await audit(
        user,
        `Telehealth ${input.ok ? "judged suitable" : "judged not suitable"} for ${slotLabel(visit.start)}`,
        client._id,
      );
      break;
    case "send-link": {
      if (!doc.suitability?.ok)
        throw new UserFacingError("Confirm telehealth is clinically suitable first.", 409);
      assertWindowOpen(visit);
      const token = randomBytes(24).toString("base64url");
      await set(
        { tokenHash: sha256(token), linkSentAt: new Date() },
        "Join link created (earlier links stop working)",
      );
      await notify([client.userId], {
        title: "Your video visit link",
        body: `Join your telehealth visit, ${slotLabel(visit.start)}, from the app or the link your care team sent.`,
        href: "/mobile/patient",
      });
      await audit(user, `Sent the telehealth join link for ${slotLabel(visit.start)}`, client._id);
      result = { link: `/join/${token}` };
      break;
    }
    case "admit": {
      if (doc.state !== "Waiting") throw new UserFacingError("Nobody is waiting.", 409);
      if (!doc.guest?.verified || !doc.consents.video?.given)
        throw new UserFacingError("The participant must verify and consent to video first.", 409);
      const now = new Date();
      await set(
        {
          state: "In call",
          admittedAt: now,
          participants: [
            {
              name: doc.guest.name,
              role: doc.guest.relationship === "Participant" ? "Participant" : "Support person",
              joinedAt: now,
            },
          ],
        },
        `${doc.guest.name} admitted`,
      );
      // Arrival for a telehealth visit is admission to the call.
      await db.appointments.updateOne(
        { _id: visit._id, checkIn: { $in: [null, undefined] } },
        {
          $set: {
            checkIn: {
              at: now,
              attendees: `${doc.guest.name} (${doc.guest.relationship}), by video`,
              safe: true,
              notes: "Telehealth",
              byName: user.name,
            },
          },
        },
      );
      await audit(user, `Admitted ${doc.guest.name} to the telehealth visit`, client._id);
      break;
    }
    case "add-participant":
      if (!inCall) throw new UserFacingError("Start the call first.", 409);
      await db.telehealth.updateOne(
        { _id: doc._id },
        {
          $push: {
            participants: { name: input.name, role: input.role, joinedAt: new Date() },
            events: event(`${input.role} ${input.name} joined`),
          },
        },
      );
      await audit(
        user,
        `Added ${input.role.toLowerCase()} ${input.name} to the telehealth visit`,
        client._id,
      );
      break;
    case "screen-share":
      await set(
        { screenShare: input.on },
        input.on ? "Screen sharing started" : "Screen sharing stopped",
      );
      break;
    case "allow-recording":
      if (doc.recording.status === "Recording" || doc.recording.status === "Paused")
        throw new UserFacingError("Stop the recording first.", 409);
      await set(
        { recordingAllowed: input.on },
        `Clinician ${input.on ? "allowed" : "withdrew permission for"} recording`,
      );
      await audit(user, `${input.on ? "Allowed" : "Withdrew"} recording permission`, client._id);
      break;
    case "record": {
      const r = doc.recording;
      const now = new Date();
      if (input.command === "start") {
        if (!inCall) throw new UserFacingError("Recording is only possible during the call.", 409);
        if (!doc.consents.recording?.given)
          throw new UserFacingError("Recording is blocked: the participant hasn't consented.", 409);
        if (!doc.recordingAllowed)
          throw new UserFacingError("Recording is blocked: allow it as the clinician first.", 409);
        if (r.status !== "Off") throw new UserFacingError("Already recorded for this visit.", 409);
        await set(
          { "recording.status": "Recording", "recording.segments": [{ start: now, end: now }] },
          "Recording started (visible to everyone)",
        );
      } else if (input.command === "pause") {
        if (r.status !== "Recording") throw new UserFacingError("Not recording.", 409);
        const segs = r.segments.map((s, i) =>
          i === r.segments.length - 1 ? { ...s, end: now } : s,
        );
        await set({ "recording.status": "Paused", "recording.segments": segs }, "Recording paused");
      } else if (input.command === "resume") {
        if (r.status !== "Paused") throw new UserFacingError("Not paused.", 409);
        await set(
          {
            "recording.status": "Recording",
            "recording.segments": [...r.segments, { start: now, end: now }],
          },
          "Recording resumed",
        );
      } else {
        if (r.status !== "Recording" && r.status !== "Paused")
          throw new UserFacingError("Not recording.", 409);
        const segs = r.segments.map((s, i) =>
          i === r.segments.length - 1 && r.status === "Recording" ? { ...s, end: now } : s,
        );
        const durationSec = Math.round(
          segs.reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()), 0) / 1000,
        );
        await set(
          {
            "recording.status": "Processing",
            "recording.segments": segs,
            "recording.durationSec": durationSec,
          },
          "Recording stopped; processing",
        );
      }
      await audit(user, `Recording ${input.command}`, client._id);
      break;
    }
    case "transcript":
      if (!doc.consents.transcription?.given)
        throw new UserFacingError(
          "AI transcription needs the participant's separate consent.",
          409,
        );
      if (!inCall) throw new UserFacingError("Transcription runs during the call.", 409);
      await db.telehealth.updateOne(
        { _id: doc._id },
        { $push: { transcript: { at: new Date(), speaker: input.speaker, text: input.text } } },
      );
      break;
    case "connection": {
      const text =
        input.kind === "retry"
          ? "Connection dropped; reconnecting"
          : input.kind === "phone"
            ? "Switched to a phone call (clinically suitable)"
            : "Connection failed; visit to be rebooked";
      await set({}, text);
      if (input.kind === "rebook") {
        await db.appointments.updateOne(
          { _id: visit._id, status: "booked" },
          {
            $set: {
              status: "aborted",
              holdsSlot: false,
              aborted: {
                reason: "Telehealth connection failed",
                remaining: "Whole session",
                byName: user.name,
                at: new Date(),
              },
            },
          },
        );
        await db.telehealth.updateOne(
          { _id: doc._id },
          { $set: { state: "Ended", endedAt: new Date() } },
        );
        await notify(await adminIds(), {
          title: `Rebook: ${client.name}`,
          body: `The telehealth visit on ${slotLabel(visit.start)} failed to connect.`,
          href: `/care/${client._id.toHexString()}`,
        });
      }
      await audit(user, text, client._id);
      break;
    }
    case "safety": {
      const { users } = db;
      const leads = await users
        .find(
          { role: "admin", staffRoles: { $in: ["Clinical Lead", "Super Admin"] } },
          { projection: { _id: 1 } },
        )
        .toArray();
      // No clinical details in the alert itself (section 15).
      await notify(
        leads.map((l) => l._id),
        {
          title: "Safety escalation during telehealth",
          body: `${user.name} raised a safety concern for a visit today. Open the record for details.`,
          href: `/care/${client._id.toHexString()}`,
        },
      );
      await set({}, "Safety concern escalated to the Clinical Lead");
      await audit(user, `Safety escalation during telehealth: ${input.text}`, client._id);
      break;
    }
    case "end": {
      if (!inCall) throw new UserFacingError("The call hasn't started.", 409);
      const now = new Date();
      const fields: Record<string, unknown> = { state: "Ended", endedAt: now };
      if (doc.recording.status === "Recording" || doc.recording.status === "Paused") {
        const segs = doc.recording.segments.map((s, i) =>
          i === doc.recording.segments.length - 1 && doc.recording.status === "Recording"
            ? { ...s, end: now }
            : s,
        );
        fields["recording.status"] = "Processing";
        fields["recording.segments"] = segs;
        fields["recording.durationSec"] = Math.round(
          segs.reduce((sum, s) => sum + (s.end.getTime() - s.start.getTime()), 0) / 1000,
        );
      }
      await set(fields, "Call ended");
      const minutes = Math.max(
        5,
        Math.round((now.getTime() - (doc.admittedAt ?? now).getTime()) / 60_000),
      );
      await db.appointments.updateOne(
        { _id: visit._id, status: "booked" },
        { $set: { status: "completed", checkOut: { at: now, minutes, byName: user.name } } },
      );
      await audit(user, `Ended the telehealth visit: ${minutes} minutes`, client._id);
      result = { minutes };
      break;
    }
  }
  await push(doc);
  return result;
}

/** A link can't be made once the visit's video window has closed: move the visit first. */
function assertWindowOpen(visit: { start: Date; end: Date }) {
  if (Date.now() > visit.end.getTime() + LINK_CLOSES_MIN * 60_000) {
    throw new UserFacingError(
      `This visit was ${slotLabel(visit.start)} and its video window has closed. Move the visit to a new time, then create a link.`,
      409,
    );
  }
}

/* --------------------------------------------------------------- guest */

/**
 * `viewEnded` lets the guest page read a call that ended within the last hour, so the patient sees
 * "The visit has ended" instead of a frozen call. Actions through the link stay blocked.
 */
async function byToken(token: string, viewEnded = false) {
  const { telehealth, appointments } = await collections();
  const doc = await telehealth.findOne({ tokenHash: sha256(token) });
  const visit = doc ? await appointments.findOne({ _id: doc.appointmentId }) : null;
  if (!doc || !visit)
    throw new UserFacingError(
      "This video link isn't valid. Ask your care team for a new one.",
      404,
    );
  const now = Date.now();
  if (doc.state === "Ended" || visit.status !== "booked") {
    const endedAt = doc.state === "Ended" ? doc.endedAt : null;
    if (viewEnded && endedAt && now - endedAt.getTime() < LINK_CLOSES_MIN * 60_000)
      return { doc: await settle(doc), visit };
    throw new UserFacingError("This video visit has finished. The link no longer works.", 404);
  }
  if (now < visit.start.getTime() - LINK_OPENS_MIN * 60_000) {
    throw new UserFacingError(
      `This link opens an hour before your visit, ${slotLabel(visit.start)}.`,
      409,
    );
  }
  if (now > visit.end.getTime() + LINK_CLOSES_MIN * 60_000 && doc.state !== "In call") {
    throw new UserFacingError("This link has expired. Ask your care team to rebook.", 404);
  }
  return { doc: await settle(doc), visit };
}

export async function guestView(token: string) {
  const { doc, visit } = await byToken(token, true);
  const { client, therapist } = await partiesOf(visit);
  return toDto(
    doc,
    visit,
    { patient: client.name.split(" ")[0] ?? "", therapist: therapist.name },
    "guest",
  );
}

const consent = z.boolean();
export const guestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("verify"),
    name: z.string().trim().min(2, "Enter your name").max(80),
    relationship: z.enum([
      "Participant",
      "Parent or guardian",
      "Authorised representative",
      "Support person",
    ]),
    dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter the participant's date of birth"),
    authority: z.boolean(),
  }),
  z.object({
    action: z.literal("consent"),
    video: consent,
    recording: consent,
    transcription: consent,
    sharing: consent,
  }),
  z.object({
    action: z.literal("device"),
    camera: z.boolean(),
    microphone: z.boolean(),
    network: z.enum(["good", "poor"]),
  }),
  z.object({ action: z.literal("wait") }),
  z.object({ action: z.literal("trouble"), kind: z.enum(["retry", "phone", "rebook"]) }),
  z.object({ action: z.literal("leave") }),
]);

export async function guestAction(token: string, input: z.infer<typeof guestSchema>) {
  const db = await collections();
  const { doc, visit } = await byToken(token);
  const client = await db.clients.findOne({ _id: visit.clientId });
  if (!client) throw new UserFacingError("This video link isn't valid.", 404);
  const set = (fields: Record<string, unknown>, text: string) =>
    db.telehealth.updateOne({ _id: doc._id }, { $set: fields, $push: { events: event(text) } });

  switch (input.action) {
    case "verify":
      // Identity: the participant's date of birth; authority: declared for anyone else.
      if (input.dateOfBirth !== client.dateOfBirth)
        throw new UserFacingError(
          "Those details don't match our records. Check the date of birth.",
        );
      if (input.relationship !== "Participant" && !input.authority)
        throw new UserFacingError("Confirm you're authorised to attend for the participant.");
      await set(
        {
          guest: {
            name: input.name,
            relationship: input.relationship,
            verified: true,
            at: new Date(),
          },
        },
        `${input.name} (${input.relationship}) verified`,
      );
      break;
    case "consent": {
      if (!doc.guest?.verified) throw new UserFacingError("Verify your details first.", 409);
      if (!input.video)
        throw new UserFacingError(
          "A video visit needs consent to the video consultation. Choose a phone call or in-person visit instead.",
        );
      const by = doc.guest.name;
      const at = new Date();
      const c = (given: boolean) => ({ given, by, at });
      await set(
        {
          consents: {
            video: c(input.video),
            recording: c(input.recording),
            transcription: c(input.transcription),
            sharing: c(input.sharing),
          },
        },
        `Consents: video yes, recording ${input.recording ? "yes" : "no"}, AI transcription ${input.transcription ? "yes" : "no"}, sharing ${input.sharing ? "yes" : "no"}`,
      );
      await audit(
        { _id: client.userId, name: by } as UserDoc,
        `Telehealth consents recorded (recording ${input.recording ? "yes" : "no"}, transcription ${input.transcription ? "yes" : "no"})`,
        client._id,
      );
      break;
    }
    case "device":
      await set(
        { device: { camera: input.camera, microphone: input.microphone, network: input.network } },
        `Device check: camera ${input.camera ? "ok" : "off"}, microphone ${input.microphone ? "ok" : "off"}, network ${input.network}`,
      );
      break;
    case "wait":
      if (!doc.guest?.verified || !doc.consents.video?.given)
        throw new UserFacingError("Verify and consent first.", 409);
      if (doc.state === "Not started") {
        await set(
          { state: "Waiting", waitingSince: new Date() },
          `${doc.guest.name} is in the waiting room`,
        );
        const t = await db.therapists.findOne({ _id: doc.therapistId });
        if (t)
          await notify([t.userId], {
            title: `${client.name.split(" ")[0]} is waiting`,
            body: "Your telehealth participant is in the waiting room.",
            href: `/telehealth/room/${visit._id.toHexString()}`,
          });
      }
      break;
    case "trouble":
      await set(
        {},
        input.kind === "retry"
          ? "Participant reconnecting"
          : input.kind === "phone"
            ? "Participant asked for a phone call instead"
            : "Participant asked to rebook",
      );
      if (input.kind === "rebook")
        await notify(await adminIds(), {
          title: `Rebook request: ${client.name}`,
          body: `Couldn't connect to the telehealth visit on ${slotLabel(visit.start)}.`,
          href: `/care/${client._id.toHexString()}`,
        });
      break;
    case "leave":
      await set({}, `${doc.guest?.name ?? "Participant"} left the call`);
      break;
  }
  await push(doc, [client.userId]);
}

/** A registered patient joins from the app: a fresh one-time link (earlier ones stop working). */
export async function patientJoinLink(user: UserDoc, visitId: ObjectId) {
  const { visit, actsFor } = await visitFor(user, visitId);
  if (actsFor !== "client") throw new UserFacingError("Visit not found.", 404);
  if ((visit.modality ?? "In person") !== "Telehealth")
    throw new UserFacingError("This is an in-person visit.", 409);
  const doc = await load(visit);
  if (!doc.suitability?.ok)
    throw new UserFacingError("Your clinician hasn't opened the video visit yet.", 409);
  assertWindowOpen(visit);
  const token = randomBytes(24).toString("base64url");
  const { telehealth } = await collections();
  await telehealth.updateOne(
    { _id: doc._id },
    { $set: { tokenHash: sha256(token), linkSentAt: doc.linkSentAt ?? new Date() } },
  );
  return { link: `/join/${token}` };
}

/* ------------------------------------------------------ recording review */

/** Sees every recording and manages restricted ones: the recordings.manage permission. */
const isLead = (u: UserDoc) => can(u, "recordings.manage");

/** Recordings the viewer may see: their own visits' (therapist) or all (Clinical Lead). */
export async function listRecordings(user: UserDoc) {
  const db = await collections();
  const filter =
    user.role === "therapist" ? { therapistId: user.therapistId! } : isLead(user) ? {} : null;
  if (!filter) throw new UserFacingError("Recordings are limited to clinicians.", 404);
  const rows = await db.telehealth
    .find({ ...filter, "recording.status": { $ne: "Off" } })
    .sort({ _id: -1 })
    .limit(100)
    .toArray();
  const settled = await Promise.all(rows.map(settle));
  const [visits, clients, therapists] = await Promise.all([
    db.appointments.find({ _id: { $in: rows.map((r) => r.appointmentId) } }).toArray(),
    db.clients
      .find({ _id: { $in: rows.map((r) => r.clientId) } }, { projection: { name: 1 } })
      .toArray(),
    db.therapists
      .find({ _id: { $in: rows.map((r) => r.therapistId) } }, { projection: { name: 1 } })
      .toArray(),
  ]);
  return settled.map((d) => {
    const v = visits.find((x) => x._id.equals(d.appointmentId));
    return {
      id: d._id.toHexString(),
      visitId: d.appointmentId.toHexString(),
      patient: clients.find((c) => c._id.equals(d.clientId))?.name ?? "Patient",
      therapist: therapists.find((t) => t._id.equals(d.therapistId))?.name ?? "Clinician",
      at: v?.start.toISOString() ?? "",
      status: recordingStatus(d),
      durationSec: d.recording.durationSec,
      retentionUntil: d.recording.retentionUntil?.toISOString() ?? null,
      deleted: d.recording.deleted
        ? {
            reason: d.recording.deleted.reason,
            byName: d.recording.deleted.byName,
            at: d.recording.deleted.at.toISOString(),
          }
        : null,
      accessLog: d.accessLog.map((a) => ({ ...a, at: a.at.toISOString() })),
      canManage: isLead(user),
      discipline: v?.discipline ?? "",
      modality: v?.modality ?? "Telehealth",
      transcript: d.transcript.map((t) => ({ speaker: t.speaker, text: t.text })),
      hasVideo: Boolean(d.recording.media?.video),
      hasAudio: Boolean(d.recording.media?.audio),
    };
  });
}

export const recordingActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("view"),
    purpose: z.string().trim().min(5, "State the purpose of this review").max(300),
  }),
  z.object({ action: z.literal("restrict"), on: z.boolean() }),
  z.object({
    action: z.literal("delete"),
    reason: z.string().trim().min(5, "Give the reason").max(300),
  }),
]);

export async function recordingAction(
  user: UserDoc,
  id: ObjectId,
  input: z.infer<typeof recordingActionSchema>,
) {
  const db = await collections();
  const doc = await db.telehealth.findOne({ _id: id });
  if (!doc) throw new UserFacingError("Recording not found.", 404);
  const own = user.role === "therapist" && user.therapistId?.equals(doc.therapistId);
  if (!own && !isLead(user)) throw new UserFacingError("Recording not found.", 404);
  const status = recordingStatus(await settle(doc));
  const now = new Date();
  if (input.action === "view") {
    if (status === "Deleted per policy")
      throw new UserFacingError("This recording was deleted.", 409);
    if (status === "Access Restricted" && !isLead(user))
      throw new UserFacingError("Access to this recording is restricted.", 409);
    if (status !== "Available" && status !== "Access Restricted")
      throw new UserFacingError("The recording isn't available yet.", 409);
    await db.telehealth.updateOne(
      { _id: id },
      {
        $push: {
          accessLog: { byName: user.name, purpose: input.purpose, action: "Viewed", at: now },
        },
      },
    );
    await audit(user, `Reviewed a telehealth recording: ${input.purpose}`, doc.clientId);
    return {
      playback: {
        label: "Recorded visit",
        durationSec: doc.recording.durationSec,
        download: false,
        video: doc.recording.media?.video ?? null,
        audio: doc.recording.media?.audio ?? null,
      },
    };
  }
  if (!isLead(user))
    throw new UserFacingError("Only a Clinical Lead can change access or delete recordings.", 409);
  if (input.action === "restrict") {
    await db.telehealth.updateOne(
      { _id: id },
      {
        $set: { "recording.restricted": input.on },
        $push: {
          accessLog: {
            byName: user.name,
            purpose: "",
            action: input.on ? "Restricted access" : "Restored access",
            at: now,
          },
        },
      },
    );
    await audit(
      user,
      `${input.on ? "Restricted" : "Restored"} access to a telehealth recording`,
      doc.clientId,
    );
  } else {
    await db.telehealth.updateOne(
      { _id: id },
      {
        $set: {
          "recording.deleted": { reason: input.reason, byName: user.name, at: now },
          "recording.segments": [],
        },
        $push: {
          accessLog: {
            byName: user.name,
            purpose: input.reason,
            action: "Deleted per policy",
            at: now,
          },
        },
      },
    );
    await audit(user, `Deleted a telehealth recording per policy: ${input.reason}`, doc.clientId);
  }
  return {};
}
