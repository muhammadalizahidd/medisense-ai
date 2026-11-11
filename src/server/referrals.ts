import "server-only";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import { Binary, ObjectId } from "mongodb";
import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  disciplines,
  DOCUMENT_MAX_BYTES,
  DOCUMENT_TYPES,
  documentKinds,
  regions,
  supportInfo,
  type Discipline,
  type DocumentKind,
  type Region,
} from "@/lib/live/catalogue";
import {
  canMove,
  completenessGaps,
  frequencyFor,
  isFinal,
  needsRiskReview,
  referralSchema,
  statusForSubmitter,
  supportLine,
  type ReferralInput,
  type ReferralStatus,
} from "@/lib/live/referral";
import type { PublicReferralDto, ReferralDetailDto, ReferralSummaryDto } from "@/lib/live/types";
import { brisbaneDay } from "@/lib/live/time";
import { newInviteCode } from "./auth";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { adminIds, notify, publish } from "./live";
import type { ClientDoc, ClientNeed, DocumentDoc, ReferralDoc, UserDoc } from "./models";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type IncomingFile = { kind: DocumentKind; name: string; type: string; bytes: Buffer };

export const MAX_FILES = 6;

/** Checks an uploaded file against the allowed types and size before anything is stored. */
export function checkFile(file: IncomingFile) {
  if (!(DOCUMENT_TYPES as readonly string[]).includes(file.type)) {
    throw new UserFacingError(`${file.name}: upload a PDF, JPG, PNG or Word document.`);
  }
  if (file.bytes.length > DOCUMENT_MAX_BYTES) {
    throw new UserFacingError(`${file.name} is larger than 5 MB.`);
  }
  if (!(documentKinds as readonly string[]).includes(file.kind)) {
    throw new UserFacingError("Choose what each document is.");
  }
}

/** Brisbane postcodes: the south side and Logan are Brisbane South; the rest of the metro, North. */
export function regionForPostcode(postcode: string): Region | null {
  const n = Number(postcode);
  if (n >= 4100 && n <= 4299) return "Brisbane South";
  if ((n >= 4000 && n <= 4099) || (n >= 4500 && n <= 4599)) return "Brisbane North";
  return null;
}

function newReference() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return `MSR-${Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("")}`;
}

const fullName = (r: ReferralInput) =>
  `${r.participant.firstName} ${r.participant.lastName}`.trim();
const norm = (v: string) => v.trim().toLowerCase();
const digits = (v: string) => v.replace(/\D/g, "");

/** Possible duplicates, by verified identifiers and close matches. A person always decides. */
async function findDuplicates(r: ReferralInput, selfId: ObjectId) {
  const { clients, referrals } = await collections();
  const name = norm(fullName(r));
  const email = norm(r.participant.email);
  const phone = digits(r.participant.phone);
  const dob = r.participant.dateOfBirth;
  const out: ReferralDoc["duplicates"] = [];

  for (const c of await clients
    .find({}, { projection: { name: 1, email: 1, phone: 1, dateOfBirth: 1 } })
    .toArray()) {
    const why: string[] = [];
    if (email && norm(c.email) === email) why.push("same email");
    if (phone.length >= 8 && c.phone && digits(c.phone) === phone) why.push("same phone");
    if (c.dateOfBirth === dob && norm(c.name) === name) why.push("same name and date of birth");
    else if (
      c.dateOfBirth === dob &&
      norm(c.name).split(" ").at(-1) === norm(r.participant.lastName)
    ) {
      why.push("same surname and date of birth");
    }
    if (why.length) {
      out.push({ kind: "patient", id: c._id.toHexString(), name: c.name, why: why.join(", ") });
    }
  }
  const open = await referrals
    .find({
      _id: { $ne: selfId },
      status: { $nin: ["Declined", "Withdrawn", "Closed", "Accepted"] },
    })
    .project<Pick<ReferralDoc, "_id" | "data" | "reference">>({ data: 1, reference: 1 })
    .toArray();
  for (const other of open) {
    const why: string[] = [];
    if (email && norm(other.data.participant.email) === email) why.push("same email");
    if (other.data.participant.dateOfBirth === dob && norm(fullName(other.data)) === name) {
      why.push("same name and date of birth");
    }
    if (why.length) {
      out.push({
        kind: "referral",
        id: other._id.toHexString(),
        name: `${fullName(other.data)} (${other.reference})`,
        why: why.join(", "),
      });
    }
  }
  return out;
}

async function storeFiles(
  files: IncomingFile[],
  owner: { referralId: ObjectId | null; clientId: ObjectId | null },
  uploadedBy: string,
) {
  if (!files.length) return [];
  const { documents } = await collections();
  const docs: DocumentDoc[] = files.map((f) => ({
    _id: new ObjectId(),
    ...owner,
    kind: f.kind,
    name: f.name.slice(0, 160),
    mime: f.type,
    size: f.bytes.length,
    data: new Binary(f.bytes),
    uploadedBy,
    at: new Date(),
  }));
  await documents.insertMany(docs);
  return docs;
}

async function log(actor: string, actorId: ObjectId | null, action: string, referral: ReferralDoc) {
  const { audit } = await collections();
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: actorId ?? new ObjectId("000000000000000000000000"),
    actorName: actor,
    action,
    clientId: referral.clientId,
    referralId: referral._id,
    at: new Date(),
  });
}

async function tellAdmins(referralId: ObjectId, note?: { title: string; body: string }) {
  const admins = await adminIds();
  if (note) await notify(admins, { ...note, href: `/care/referrals/${referralId.toHexString()}` });
  await publish(admins, "care", { referralId: referralId.toHexString() });
}

/**
 * Lifecycle phases 1–2: a referral arrives (from anyone, no account needed), gets a reference and
 * a private tracking link, and the completeness and duplicate checks run straight away.
 */
export async function submitReferral(raw: unknown, files: IncomingFile[], staff: UserDoc | null) {
  const input = referralSchema.parse(raw);
  if (input.participant.dateOfBirth > brisbaneDay(new Date()).toISOString().slice(0, 10)) {
    throw new UserFacingError("The date of birth can't be in the future.");
  }
  if (files.length > MAX_FILES) throw new UserFacingError(`Attach up to ${MAX_FILES} files.`);
  files.forEach(checkFile);

  const { referrals } = await collections();
  const _id = new ObjectId();
  const token = randomBytes(24).toString("base64url");
  const now = new Date();
  const stored = await storeFiles(files, { referralId: _id, clientId: null }, input.submitter.name);
  const gaps = completenessGaps(input, stored);
  const duplicates = await findDuplicates(input, _id);
  const by = staff?.name ?? input.submitter.name;
  const doc: ReferralDoc = {
    _id,
    reference: newReference(),
    trackingHash: sha256(token),
    status: "Under Admin Review",
    data: input,
    region: regionForPostcode(
      input.location.type !== "Telehealth" && !input.location.sameAsHome
        ? input.location.address.postcode
        : input.participant.address.postcode,
    ),
    gaps,
    infoRequests: [],
    duplicates,
    duplicateDecision: null,
    owner: staff ? { id: staff._id, name: staff.name } : null,
    triage: null,
    fundingReview: null,
    outcome: null,
    clientId: null,
    submittedBy: staff ? "staff" : "public",
    createdBy: staff?._id ?? null,
    history: [
      { status: "Submitted", byName: by, note: "", at: now },
      {
        status: "Under Admin Review",
        byName: "Completeness check",
        note: gaps.length
          ? `${gaps.length} item${gaps.length === 1 ? "" : "s"} to confirm`
          : "Nothing missing",
        at: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };
  for (let attempt = 0; ; attempt += 1) {
    try {
      await referrals.insertOne(doc);
      break;
    } catch (error) {
      if (attempt < 3 && (error as { code?: number }).code === 11000) {
        doc.reference = newReference();
        continue;
      }
      throw error;
    }
  }
  await log(by, staff?._id ?? null, staff ? "Entered a referral" : "Sent a referral", doc);
  await tellAdmins(_id, {
    title: `New referral ${doc.reference}`,
    body: `${input.supports.length} support${input.supports.length === 1 ? "" : "s"} requested. ${
      gaps.length ? `${gaps.length} to confirm.` : "Complete."
    }${duplicates.length ? " Possible duplicate." : ""}`,
  });
  return { id: _id.toHexString(), reference: doc.reference, trackingToken: token };
}

async function byToken(token: string) {
  const { referrals } = await collections();
  const referral = await referrals.findOne({ trackingHash: sha256(token) });
  if (!referral) throw new UserFacingError("This tracking link isn't valid.", 404);
  return referral;
}

/** What the tracking link shows: the status and anything asked for, never the referral's content. */
export async function trackReferral(token: string): Promise<PublicReferralDto> {
  const r = await byToken(token);
  const open = r.infoRequests.find((q) => !q.answeredAt);
  return {
    reference: r.reference,
    status: r.status,
    statusText: statusForSubmitter[r.status],
    submittedAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    participantInitials: `${r.data.participant.firstName[0] ?? ""}${r.data.participant.lastName[0] ?? ""}`,
    openRequest: open
      ? { id: open.id, items: open.items, message: open.message, at: open.at.toISOString() }
      : null,
    canWithdraw: !isFinal(r.status) && r.status !== "Accepted",
  };
}

async function setStatus(
  referral: ReferralDoc,
  to: ReferralStatus,
  byName: string,
  note: string,
  extra: Partial<ReferralDoc> = {},
) {
  if (!canMove(referral.status, to)) {
    throw new UserFacingError(`A referral that is ${referral.status} can't move to ${to}.`, 409);
  }
  const { referrals } = await collections();
  const now = new Date();
  const result = await referrals.updateOne(
    { _id: referral._id, status: referral.status },
    {
      $set: { ...extra, status: to, updatedAt: now },
      $push: { history: { status: to, byName, note, at: now } },
    },
  );
  if (result.modifiedCount !== 1) {
    throw new UserFacingError(
      "Someone else just changed this referral. Refresh and try again.",
      409,
    );
  }
  return { ...referral, ...extra, status: to };
}

/** The submitter answers a request for information through their secure link. */
export async function answerInfoRequest(token: string, answer: string, files: IncomingFile[]) {
  const referral = await byToken(token);
  const open = referral.infoRequests.find((q) => !q.answeredAt);
  if (!open || referral.status !== "Needs Information") {
    throw new UserFacingError("There's nothing waiting for an answer.", 409);
  }
  const text = answer.trim().slice(0, 3000);
  if (!text && !files.length) throw new UserFacingError("Write an answer or attach a document.");
  if (files.length > MAX_FILES) throw new UserFacingError(`Attach up to ${MAX_FILES} files.`);
  files.forEach(checkFile);
  const stored = await storeFiles(
    files,
    { referralId: referral._id, clientId: referral.clientId },
    referral.data.submitter.name,
  );
  const { referrals, documents } = await collections();
  const allDocs = await documents
    .find({ referralId: referral._id }, { projection: { kind: 1 } })
    .toArray();
  const now = new Date();
  await referrals.updateOne(
    { _id: referral._id, "infoRequests.id": open.id },
    {
      $set: {
        "infoRequests.$.answer": text,
        "infoRequests.$.answeredAt": now,
        gaps: completenessGaps(referral.data, allDocs).filter(
          // A written answer covers the fields it was asked about; intake checks it.
          (g) => !text || !open.items.some((i) => i.field === g.field),
        ),
      },
    },
  );
  // Back to whoever asked: triage and funding questions return there, the rest to intake.
  const askedFrom = referral.history.at(-2)?.status;
  const updated = await setStatus(
    referral,
    askedFrom === "Clinical Triage" || askedFrom === "Funding Review"
      ? askedFrom
      : "Under Admin Review",
    referral.data.submitter.name,
    `Answered${stored.length ? ` with ${stored.length} document${stored.length === 1 ? "" : "s"}` : ""}`,
  );
  await log(referral.data.submitter.name, null, "Answered the request for information", updated);
  await tellAdmins(referral._id, {
    title: `Information received for ${referral.reference}`,
    body: "The request for information has been answered.",
  });
}

export async function withdrawByToken(token: string) {
  const referral = await byToken(token);
  const updated = await setStatus(
    referral,
    "Withdrawn",
    referral.data.submitter.name,
    "By the submitter",
    {
      outcome: {
        reason: "Withdrawn by the submitter",
        byName: referral.data.submitter.name,
        at: new Date(),
      },
    },
  );
  await log(referral.data.submitter.name, null, "Withdrew the referral", updated);
  await tellAdmins(referral._id, {
    title: `Referral ${referral.reference} withdrawn`,
    body: "The submitter withdrew it through their tracking link.",
  });
}

function summary(r: ReferralDoc): ReferralSummaryDto {
  return {
    id: r._id.toHexString(),
    reference: r.reference,
    name: fullName(r.data),
    dateOfBirth: r.data.participant.dateOfBirth,
    suburb: r.data.participant.address.suburb,
    region: r.region,
    status: r.status,
    funding: r.data.funding.source,
    supports: r.data.supports.map(supportLine),
    risk: needsRiskReview(r.data),
    gaps: r.gaps.length,
    duplicates: r.duplicateDecision ? 0 : r.duplicates.length,
    owner: r.owner?.name ?? null,
    submitterRole: r.data.submitter.role,
    submittedBy: r.submittedBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listReferrals() {
  const { referrals } = await collections();
  const rows = await referrals.find().sort({ updatedAt: -1 }).limit(300).toArray();
  return rows.map(summary);
}

const isClinical = (user: UserDoc) =>
  Boolean(user.staffRoles?.some((r) => r === "Clinical Lead" || r === "Super Admin"));

async function loadReferral(id: ObjectId) {
  const { referrals } = await collections();
  const referral = await referrals.findOne({ _id: id });
  if (!referral) throw new UserFacingError("Referral not found.", 404);
  return referral;
}

export async function referralDetail(id: ObjectId, viewer: UserDoc): Promise<ReferralDetailDto> {
  const { documents, audit } = await collections();
  const r = await loadReferral(id);
  const [docs, activity] = await Promise.all([
    documents
      .find({ referralId: id }, { projection: { data: 0 } })
      .sort({ at: 1 })
      .toArray(),
    audit.find({ referralId: id }).sort({ at: -1 }).limit(50).toArray(),
  ]);
  return {
    ...summary(r),
    data: r.data,
    gapsList: r.gaps,
    duplicatesList: r.duplicateDecision ? [] : r.duplicates,
    duplicateDecision: r.duplicateDecision
      ? {
          clientId: r.duplicateDecision.clientId?.toHexString() ?? null,
          byName: r.duplicateDecision.byName,
          at: r.duplicateDecision.at.toISOString(),
        }
      : null,
    infoRequests: r.infoRequests.map((q) => ({
      id: q.id,
      items: q.items,
      message: q.message,
      requestedBy: q.requestedBy,
      at: q.at.toISOString(),
      answer: q.answer,
      answeredAt: q.answeredAt?.toISOString() ?? null,
    })),
    triage: r.triage ? { ...r.triage, at: r.triage.at.toISOString() } : null,
    fundingReview: r.fundingReview
      ? { ...r.fundingReview, at: r.fundingReview.at.toISOString() }
      : null,
    outcome: r.outcome ? { ...r.outcome, at: r.outcome.at.toISOString() } : null,
    clientId: r.clientId?.toHexString() ?? null,
    documents: docs.map((d) => ({
      id: d._id.toHexString(),
      kind: d.kind,
      name: d.name,
      size: d.size,
      uploadedBy: d.uploadedBy,
      at: d.at.toISOString(),
    })),
    history: r.history.map((h) => ({ ...h, at: h.at.toISOString() })),
    activity: activity.map((a) => ({
      id: a._id.toHexString(),
      action: a.action,
      actor: a.actorName,
      at: a.at.toISOString(),
    })),
    canTriage: isClinical(viewer),
  };
}

const gapSchema = z.object({ field: z.string().max(80), label: z.string().max(200) });

export const referralActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("take-ownership") }),
  z.object({ type: z.literal("set-region"), region: z.enum(regions) }),
  z.object({
    type: z.literal("request-info"),
    items: z.array(gapSchema).max(20),
    message: z.string().trim().max(2000),
  }),
  z.object({
    type: z.literal("duplicate"),
    clientId: z.string().nullable(),
  }),
  z.object({ type: z.literal("to-triage"), note: z.string().trim().max(1000) }),
  z.object({
    type: z.literal("triage"),
    decision: z.enum(["Accepted", "Waitlisted", "Declined", "More information"]),
    notes: z.string().trim().min(1, "Write the clinical review notes").max(3000),
    riskAction: z.string().trim().max(2000),
    precaution: z.string().trim().max(1000),
  }),
  z.object({
    type: z.literal("funding"),
    verification: z.enum(["Verified", "Exception"]),
    exceptionReason: z.string().trim().max(1000),
    agreement: z.enum(["Signed", "Sent", "Not required"]),
    consentRecorded: z.boolean(),
    notes: z.string().trim().max(2000),
  }),
  z.object({
    type: z.literal("accept"),
    /** Who delivers each "Other" support, by its position in the referral. */
    otherDisciplines: z.record(z.string(), z.enum(disciplines)).default({}),
  }),
  z.object({
    type: z.literal("waitlist"),
    reason: z.string().trim().min(1, "Give a reason").max(500),
  }),
  z.object({ type: z.literal("resume") }),
  z.object({
    type: z.literal("decline"),
    reason: z.string().trim().min(1, "Give a reason").max(1000),
  }),
  z.object({
    type: z.literal("withdraw"),
    reason: z.string().trim().min(1, "Give a reason").max(500),
  }),
]);
export type ReferralAction = z.infer<typeof referralActionSchema>;

/** Intake, triage and funding decisions (lifecycle phases 3–5). Each is audited. */
export async function referralAction(admin: UserDoc, id: ObjectId, action: ReferralAction) {
  const { referrals } = await collections();
  let r = await loadReferral(id);
  const result: { inviteCode?: string; inviteExpires?: Date; clientId?: string } = {};

  switch (action.type) {
    case "take-ownership": {
      await referrals.updateOne(
        { _id: id },
        { $set: { owner: { id: admin._id, name: admin.name }, updatedAt: new Date() } },
      );
      await log(admin.name, admin._id, "Took ownership", r);
      break;
    }
    case "set-region": {
      await referrals.updateOne(
        { _id: id },
        { $set: { region: action.region, updatedAt: new Date() } },
      );
      await log(admin.name, admin._id, `Set the region to ${action.region}`, r);
      break;
    }
    case "duplicate": {
      let clientId: ObjectId | null = null;
      if (action.clientId) {
        if (!r.duplicates.some((d) => d.kind === "patient" && d.id === action.clientId)) {
          throw new UserFacingError("Choose one of the possible matches.");
        }
        clientId = new ObjectId(action.clientId);
      }
      await referrals.updateOne(
        { _id: id },
        {
          $set: {
            duplicateDecision: { clientId, byName: admin.name, at: new Date() },
            updatedAt: new Date(),
          },
        },
      );
      await log(
        admin.name,
        admin._id,
        clientId
          ? "Confirmed this is an existing patient; services will be added to their record"
          : "Confirmed this is a new person",
        r,
      );
      break;
    }
    case "request-info": {
      if (!action.items.length && !action.message) {
        throw new UserFacingError("Choose what's missing or write a message.");
      }
      r = await setStatus(
        r,
        "Needs Information",
        admin.name,
        action.items.map((i) => i.label).join("; "),
        {
          infoRequests: [
            ...r.infoRequests,
            {
              id: randomUUID(),
              items: action.items,
              message: action.message,
              requestedBy: admin.name,
              at: new Date(),
              answer: null,
              answeredAt: null,
            },
          ],
        },
      );
      await log(
        admin.name,
        admin._id,
        `Requested information: ${action.items.map((i) => i.label).join(", ") || action.message}`,
        r,
      );
      break;
    }
    case "to-triage": {
      if (r.duplicates.length && !r.duplicateDecision) {
        throw new UserFacingError("Decide on the possible duplicate first.");
      }
      r = await setStatus(r, "Clinical Triage", admin.name, action.note);
      await log(admin.name, admin._id, "Sent to clinical triage", r);
      const { users } = await collections();
      const leads = await users
        .find(
          { role: "admin", staffRoles: { $in: ["Clinical Lead", "Super Admin"] } },
          { projection: { _id: 1 } },
        )
        .toArray();
      await notify(
        leads.map((l) => l._id),
        {
          title: `Clinical triage: ${r.reference}`,
          // No clinical details in the notification itself (section 15).
          body: needsRiskReview(r.data)
            ? "Includes a reported risk to review."
            : "Ready for clinical review.",
          href: `/care/referrals/${id.toHexString()}`,
        },
      );
      break;
    }
    case "triage": {
      if (!isClinical(admin)) {
        throw new UserFacingError(
          "Only a Clinical Lead can make the clinical triage decision.",
          409,
        );
      }
      if (r.status !== "Clinical Triage")
        throw new UserFacingError("This referral isn't in clinical triage.", 409);
      if (action.decision === "Accepted" && needsRiskReview(r.data)) {
        if (!action.riskAction)
          throw new UserFacingError("Record how the reported risk will be managed.");
        if (!action.precaution)
          throw new UserFacingError(
            "Write the precaution every therapist will see before visiting.",
          );
      }
      const triage = { ...action, at: new Date(), byName: admin.name };
      const to: ReferralStatus =
        action.decision === "Accepted"
          ? "Funding Review"
          : action.decision === "Waitlisted"
            ? "Waitlisted"
            : action.decision === "Declined"
              ? "Declined"
              : "Needs Information";
      const extra: Partial<ReferralDoc> = {
        triage: {
          decision: triage.decision,
          notes: triage.notes,
          riskAction: triage.riskAction,
          precaution: triage.precaution,
          byName: triage.byName,
          at: triage.at,
        },
      };
      if (to === "Declined")
        extra.outcome = { reason: action.notes, byName: admin.name, at: new Date() };
      if (to === "Needs Information") {
        extra.infoRequests = [
          ...r.infoRequests,
          {
            id: randomUUID(),
            items: [],
            message: action.notes,
            requestedBy: admin.name,
            at: new Date(),
            answer: null,
            answeredAt: null,
          },
        ];
      }
      r = await setStatus(r, to, admin.name, `Clinical decision: ${action.decision}`, extra);
      await log(admin.name, admin._id, `Clinical triage: ${action.decision}`, r);
      break;
    }
    case "funding": {
      if (r.status !== "Funding Review")
        throw new UserFacingError("This referral isn't in funding review.", 409);
      if (action.verification === "Exception" && !action.exceptionReason) {
        throw new UserFacingError("Document the funding exception.");
      }
      await referrals.updateOne(
        { _id: id },
        {
          $set: {
            fundingReview: { ...action, byName: admin.name, at: new Date() },
            updatedAt: new Date(),
          },
        },
      );
      await log(
        admin.name,
        admin._id,
        `Funding ${action.verification === "Verified" ? "verified" : "exception documented"}; agreement ${action.agreement.toLowerCase()}; consent ${action.consentRecorded ? "recorded" : "not yet recorded"}`,
        r,
      );
      break;
    }
    case "accept": {
      Object.assign(result, await accept(admin, r, action.otherDisciplines));
      break;
    }
    case "waitlist": {
      r = await setStatus(r, "Waitlisted", admin.name, action.reason);
      await log(admin.name, admin._id, `Waitlisted: ${action.reason}`, r);
      break;
    }
    case "resume": {
      if (r.status !== "Waitlisted")
        throw new UserFacingError("Only a waitlisted referral can resume.", 409);
      const before = [...r.history].reverse().find((h) => h.status !== "Waitlisted")?.status;
      const to: ReferralStatus =
        before === "Clinical Triage" || before === "Funding Review" ? before : "Under Admin Review";
      r = await setStatus(r, to, admin.name, "Off the waitlist");
      await log(admin.name, admin._id, `Taken off the waitlist into ${to}`, r);
      break;
    }
    case "decline": {
      r = await setStatus(r, "Declined", admin.name, action.reason, {
        outcome: { reason: action.reason, byName: admin.name, at: new Date() },
      });
      await log(admin.name, admin._id, `Declined: ${action.reason}`, r);
      break;
    }
    case "withdraw": {
      r = await setStatus(r, "Withdrawn", admin.name, action.reason, {
        outcome: { reason: action.reason, byName: admin.name, at: new Date() },
      });
      await log(admin.name, admin._id, `Withdrawn: ${action.reason}`, r);
      break;
    }
  }
  await tellAdmins(id);
  return result;
}

/** Who the invoices go to, from the referral's funding answers. */
function fundingDetailsOf(input: ReferralInput) {
  const f = input.funding;
  const payer =
    f.source !== "NDIS"
      ? f.otherDetails.split(/[,;\n]/)[0]?.trim() || f.source
      : f.planType === "Plan Managed"
        ? f.planManagerCompany || "Plan manager"
        : f.planType === "Agency Managed"
          ? "NDIA"
          : `${input.signatory.name || fullName(input)} (self-managed)`;
  return {
    payer,
    payerEmail: f.planType === "Plan Managed" ? f.planManagerEmail : input.signatory.email,
    ndisNumber: f.ndisNumber,
    planEndDate: f.planEndDate,
    planType: f.planType,
  };
}

/** Why a referral can't be accepted yet, or an empty list when it can. */
export function acceptBlockers(r: ReferralDoc): string[] {
  const out: string[] = [];
  if (r.status !== "Funding Review") out.push("It must be in funding review.");
  if (r.triage?.decision !== "Accepted") out.push("Clinical triage hasn't accepted it.");
  if (!r.fundingReview) out.push("Record the funding review.");
  else {
    if (!r.fundingReview.consentRecorded) out.push("Record the participant's consent.");
    if (r.fundingReview.agreement === "Sent") out.push("The service agreement isn't signed yet.");
  }
  if (!r.region) out.push("Set the service region for matching.");
  if (r.duplicates.length && !r.duplicateDecision) out.push("Decide on the possible duplicate.");
  return out;
}

/**
 * Lifecycle phase 5 → 6: the referral is ready for booking. One participant record (new, or the
 * existing one intake confirmed), with a separate service request for each support asked for.
 */
async function accept(
  admin: UserDoc,
  r: ReferralDoc,
  otherDisciplines: Record<string, Discipline>,
) {
  const blockers = acceptBlockers(r);
  if (blockers.length) throw new UserFacingError(blockers.join(" "), 409);
  const db = await collections();
  const input = r.data;

  const needs: ClientNeed[] = input.supports.map((s, i) => {
    const info = supportInfo(s.support);
    const discipline = info.discipline ?? otherDisciplines[String(i)];
    if (!discipline) throw new UserFacingError(`Choose who delivers "${s.details || "Other"}".`);
    const details = [
      s.nursingType && s.nursingType !== "Other" ? s.nursingType : "",
      s.details,
      s.frequency === "Other" ? s.frequencyOther : "",
    ]
      .filter(Boolean)
      .join(" · ");
    return {
      id: randomUUID(),
      support: s.support,
      discipline,
      frequency: frequencyFor(s),
      details,
      location: input.location.type,
      status: "needs-therapist",
      therapistId: null,
      referralId: r._id,
    };
  });

  const precaution = r.triage?.precaution ?? "";
  const notes = [
    input.clinical.diagnosis && `Diagnosis (reported): ${input.clinical.diagnosis}`,
    input.goals && `Goals: ${input.goals}`,
    input.comments && `Comments: ${input.comments}`,
    input.clinical.personPresent && `Must be present: ${input.clinical.personPresentDetails}`,
  ]
    .filter(Boolean)
    .join("\n");

  const result: { inviteCode?: string; inviteExpires?: Date; clientId?: string } = {};
  let clientId: ObjectId;
  const existingId = r.duplicateDecision?.clientId ?? null;

  if (existingId) {
    const existing = await db.clients.findOne({ _id: existingId });
    if (!existing) throw new UserFacingError("The linked patient record no longer exists.", 409);
    // A discharged patient starts again; an active one keeps the services they already have.
    const already = new Set(existing.discharged ? [] : existing.needs.map((n) => n.support));
    const fresh = needs.filter((n) => !already.has(n.support));
    if (!fresh.length)
      throw new UserFacingError("The patient already has every support requested.", 409);
    await db.clients.updateOne(
      { _id: existingId },
      {
        $push: { needs: { $each: fresh } },
        $set: {
          discharged: null,
          ...(precaution
            ? { precautions: [existing.precautions, precaution].filter(Boolean).join("\n") }
            : {}),
        },
      },
    );
    clientId = existingId;
  } else {
    const email = (input.participant.email || input.booking.email).toLowerCase();
    if (await db.users.findOne({ email })) {
      throw new UserFacingError(
        "An account already uses this email. If it's the same person, link the referral to their record.",
        409,
      );
    }
    clientId = new ObjectId();
    const userId = new ObjectId();
    const { code, invite } = newInviteCode();
    const now = new Date();
    await db.users.insertOne({
      _id: userId,
      email,
      name: fullName(input),
      role: "client",
      passwordHash: null,
      invite,
      therapistId: null,
      clientId,
      createdAt: now,
    });
    const client: ClientDoc = {
      _id: clientId,
      name: fullName(input),
      dateOfBirth: input.participant.dateOfBirth,
      email,
      phone: input.participant.phone || input.booking.phone || null,
      suburb: input.participant.address.suburb,
      region: r.region!,
      funding: input.funding.source,
      needs,
      notes,
      precautions: precaution || null,
      fundingDetails: fundingDetailsOf(input),
      emergencyContact: null,
      userId,
      createdBy: admin._id,
      createdAt: now,
    };
    await db.clients.insertOne(client);
    result.inviteCode = code;
    result.inviteExpires = invite.expiresAt;
  }

  // Documents follow the participant, so the therapist sees them on the record.
  await db.documents.updateMany({ referralId: r._id }, { $set: { clientId } });
  const updated = await setStatus(
    r,
    "Accepted",
    admin.name,
    `${needs.length} service request${needs.length === 1 ? "" : "s"} created`,
    {
      clientId,
      outcome: { reason: "Ready for booking", byName: admin.name, at: new Date() },
    },
  );
  await log(
    admin.name,
    admin._id,
    `Accepted the referral; ${needs.length} service request${needs.length === 1 ? "" : "s"} ready for matching`,
    updated,
  );
  await db.audit.insertOne({
    _id: new ObjectId(),
    actorId: admin._id,
    actorName: admin.name,
    action: `Accepted referral ${r.reference}: ${input.supports.map((s) => s.support).join(", ")}`,
    clientId,
    referralId: r._id,
    at: new Date(),
  });
  await publish(await adminIds(), "care", { clientId: clientId.toHexString() });
  result.clientId = clientId.toHexString();
  return result;
}

/** A stored document, for staff who can see the referral or the patient. */
export async function documentFile(user: UserDoc, id: ObjectId) {
  const { documents, clients, audit } = await collections();
  const doc = await documents.findOne({ _id: id });
  if (!doc) throw new UserFacingError("Document not found.", 404);
  if (user.role === "therapist") {
    const client = doc.clientId ? await clients.findOne({ _id: doc.clientId }) : null;
    const mine = user.therapistId;
    if (
      !mine ||
      !client?.needs.some((n) => n.status === "assigned" && n.therapistId?.equals(mine))
    ) {
      throw new UserFacingError("Document not found.", 404);
    }
  } else if (user.role !== "admin") {
    throw new UserFacingError("Document not found.", 404);
  }
  // Every view of a clinical document is audited (section 2.1).
  await audit.insertOne({
    _id: new ObjectId(),
    actorId: user._id,
    actorName: user.name,
    action: `Opened document: ${doc.name}`,
    clientId: doc.clientId,
    referralId: doc.referralId,
    at: new Date(),
  });
  return doc;
}

/** AI referral completeness review: a missing-information checklist from the referral. Admin verifies. */
export async function aiReferralReview(id: ObjectId) {
  const { documents } = await collections();
  const r = await loadReferral(id);
  const docs = await documents
    .find({ referralId: id }, { projection: { kind: 1, name: 1 } })
    .toArray();
  try {
    const out = await generateJson("referral-review", {
      system:
        "You check allied health referrals for completeness before intake. List information intake will need that is missing, unclear or inconsistent (for example a plan end date already passed, a location needing a contact, supports that need documents). Never infer consent, risk clearance, diagnosis or eligibility. Each item names the field or document. An admin verifies every item.",
      user: JSON.stringify({
        referral: r.data,
        documents: docs.map((d) => ({ kind: d.kind, name: d.name })),
        today: new Date().toISOString().slice(0, 10),
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["field", "label", "why"],
              properties: {
                field: { type: "string" },
                label: { type: "string" },
                why: { type: "string" },
              },
            },
          },
        },
      },
      schemaName: "referral_review",
      maxTokens: 900,
    });
    return {
      ...(JSON.parse(out.text) as { items: { field: string; label: string; why: string }[] }),
      model: out.model,
    };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}
