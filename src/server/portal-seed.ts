import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { ObjectId, type Document } from "mongodb";
import { addDays, atBrisbane, brisbaneDay } from "@/lib/live/time";
import { collections } from "./db";

/**
 * Modules 18–22 scenario: Harper Nguyen's own history in the patient app. Records are cloned from
 * valid ones of the same kind, so every staff screen that lists them keeps working. Created once
 * (settings flag "m18Seed"); all values are fictional.
 */
export const PORTAL_MRN = "MRN-04092026-0001";

let inFlight: Promise<void> | null = null;

export function ensurePortalSeed() {
  inFlight ??= seedOnce().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function seedOnce() {
  const db = await collections();
  const raw = db.db;
  const flags = raw.collection<{ _id: string; at: Date }>("settings");
  if (await flags.findOne({ _id: "m18Seed" })) return;
  const c = await db.clients.findOne({ mrn: PORTAL_MRN });
  const need = c?.needs[0];
  if (!c || !need) return;
  const now = new Date();
  const today = brisbaneDay(now);
  const at = (days: number, minutes = 7 * 60 + 30) => atBrisbane(addDays(today, days), minutes);

  /* Module 20: eight weeks of visits around the one already booked. */
  const tpl = await db.appointments.findOne({ clientId: c._id });
  if (tpl) {
    const base = tpl as unknown as Document;
    const visits: Document[] = [];
    const add = (days: number, status: string, extra: Document = {}) => {
      const start = at(days);
      visits.push({
        ...base,
        _id: new ObjectId(),
        ref: `APT-18${String(visits.length + 1).padStart(2, "0")}`,
        start,
        end: new Date(start.getTime() + 60 * 60_000),
        status,
        holdsSlot: status === "booked",
        confirmedByPatient: status === "completed" ? addDays(start, -1) : null,
        cancellation: null,
        invoiceId: null,
        createdAt: addDays(start, -14),
        demo: true,
        ...extra,
      });
    };
    for (const d of [-49, -42, -35, -28, -21, -7]) add(d, "completed");
    add(-14, "cancelled", {
      cancellation: {
        reason: "Participant unwell",
        actorName: "Harper Nguyen",
        at: at(-15),
        lateNotice: false,
      },
    });
    add(9, "booked", { modality: "Telehealth", purpose: "Review home program" });
    add(16, "booked", { purpose: "Shower transfer practice" });
    add(23, "booked", {
      site: {
        location: "Day Program",
        siteName: "Northside Day Program",
        address: "14 Example Road, Chermside QLD 4032",
      },
    });
    await db.appointments.insertMany(visits as never[]);
  }

  /* Module 19: an active, verified NDIS plan and two people who can act for Harper. */
  await db.fundingPlans.updateOne(
    { clientId: c._id },
    { $set: { status: "Active", start: "2026-04-01", management: "Self-Managed" } },
  );
  const contact = (
    name: string,
    role: string,
    relationship: string,
    authorityType: string,
    state: string,
    expires: string,
    scope: string[],
  ) => ({
    id: randomUUID(),
    role,
    name,
    organisation: "",
    relationship,
    phone: "0400 555 181",
    email: `${name.split(" ")[0]?.toLowerCase()}@example.test`,
    responsibilities: ["General Communication"],
    primaryFor: [],
    authorityType,
    authorityScope: scope,
    authorityExpires: expires,
    restrictions: "",
    contactAllowed: true,
    state,
    verifiedBy: state === "Verified" ? "Jo Marsh" : null,
    verifiedAt: state === "Verified" ? at(-60) : null,
    revoked: null,
    source: "Patient app scenario",
    createdAt: at(-60),
  });
  await raw.collection("clients").updateOne(
    { _id: c._id },
    {
      $set: {
        emergencyContact: { name: "Linh Nguyen", relationship: "Daughter", phone: "0400 555 181" },
        contacts: [
          contact(
            "Linh Nguyen",
            "Plan nominee",
            "Daughter",
            "Plan Nominee",
            "Verified",
            "2027-09-04",
            ["Booking", "Plans and reports"],
          ),
          contact(
            "Riley Coordinator",
            "Support coordinator",
            "Support coordinator",
            "Consent to share",
            "Verified",
            "2026-10-31",
            ["Reports"],
          ),
        ],
      },
    },
  );

  /* Module 18: the referral that started Harper's care, and a second one waiting on information. */
  const accepted = await raw.collection("referrals").findOne({ status: "Accepted" });
  const waiting = await raw.collection("referrals").findOne({ status: "Needs Information" });
  const hour = 3_600_000;
  const asHarper = (
    r: Document,
    ref: string,
    created: Date,
    supports: string[],
    path: { status: string; note: string; after: number }[],
    ask: string | null,
  ) => ({
    ...r,
    _id: new ObjectId(),
    reference: ref,
    mrn: PORTAL_MRN,
    trackingHash: randomBytes(32).toString("hex"),
    access: null,
    clientId: c._id,
    duplicates: [],
    services: undefined,
    gaps: [],
    data: {
      ...r.data,
      participant: {
        ...r.data.participant,
        firstName: "Harper",
        lastName: "Nguyen",
        dateOfBirth: c.dateOfBirth ?? r.data.participant.dateOfBirth,
        email: c.email,
        phone: c.phone ?? r.data.participant.phone,
        address: c.profile?.address ?? r.data.participant.address,
      },
      funding: { ...r.data.funding, ndisNumber: "430771000", planType: "Self-Managed" },
      supports: supports.map((support, i) => ({
        ...(r.data.supports?.[0] ?? {}),
        support,
        frequency: i ? "Fortnightly" : "Weekly",
      })),
      goals: "Keep walking to the shops safely and manage my own lunches.",
      comments: "Prefers morning visits. Daughter Linh helps with bookings.",
    },
    infoRequests: ask
      ? [
          {
            id: randomUUID(),
            items: [],
            message: ask,
            requestedBy: "Jo Marsh",
            at: new Date(created.getTime() + 26 * hour),
            answer: null,
            answeredAt: null,
          },
        ]
      : [],
    history: path.map((h) => ({
      status: h.status,
      byName: h.status === "Submitted" ? "Riley Coordinator" : "Jo Marsh",
      note: h.note,
      at: new Date(created.getTime() + h.after * hour),
    })),
    createdAt: created,
    updatedAt: new Date(created.getTime() + (path.at(-1)?.after ?? 0) * hour),
    demo: true,
  });
  const refs: Document[] = [];
  if (accepted)
    refs.push(
      asHarper(
        accepted,
        `REF-${PORTAL_MRN}`,
        at(-75),
        ["Occupational Therapy"],
        [
          { status: "Submitted", note: "", after: 0 },
          { status: "Under Admin Review", note: "", after: 2 },
          { status: "Clinical Triage", note: "", after: 26 },
          { status: "Accepted", note: "", after: 74 },
        ],
        null,
      ),
    );
  if (waiting)
    refs.push(
      asHarper(
        waiting,
        `REF-${PORTAL_MRN}-2`,
        at(-3),
        ["Physiotherapy", "Exercise Physiology"],
        [
          { status: "Submitted", note: "", after: 0 },
          { status: "Under Admin Review", note: "", after: 2 },
          { status: "Needs Information", note: "Asked for a GP letter", after: 26 },
        ],
        "Please send a letter from your GP about your knee, so the physiotherapist knows what to look out for.",
      ),
    );
  if (refs.length) await raw.collection("referrals").insertMany(refs);

  /* Module 22: a signed service agreement and three invoices to pay or keep. */
  const agr = await raw.collection("agreements").findOne({ status: "Signed" });
  if (agr) {
    const plan = await db.fundingPlans.findOne({ clientId: c._id });
    // The copy names Harper wherever the source named its own participant or signer.
    const source = await db.clients.findOne(
      { _id: agr.clientId as ObjectId },
      { projection: { name: 1 } },
    );
    const others = [
      source?.name,
      (agr.acceptance as { name?: string } | undefined)?.name,
      (agr.signatory as { name?: string } | undefined)?.name,
    ].filter((x): x is string => Boolean(x) && x !== "Harper Nguyen");
    const asHarperText = <T>(v: T): T => {
      if (typeof v === "string")
        return others.reduce((t, name) => t.split(name).join("Harper Nguyen"), v as string) as T;
      if (Array.isArray(v)) return v.map(asHarperText) as T;
      if (v && typeof v === "object" && !(v instanceof Date) && !("_bsontype" in v))
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, asHarperText(x)])) as T;
      return v;
    };
    await raw.collection("agreements").insertOne({
      ...asHarperText(agr),
      _id: new ObjectId(),
      ref: "SA-01801",
      clientId: c._id,
      planId: plan?._id ?? agr.planId,
      signatory: { ...agr.signatory, name: "Harper Nguyen", authority: "Participant (self)" },
      updatedAt: at(-70),
      createdAt: at(-72),
      demo: true,
    });
  }
  let n = 0;
  for (const status of ["Paid", "Paid", "Part-Paid", "Issued"]) {
    const inv = await raw.collection("invoices").findOne({ status, demo: true }, { skip: n });
    if (!inv) continue;
    n += 1;
    await raw.collection("invoices").insertOne({
      ...inv,
      _id: new ObjectId(),
      number: `INV-018${String(n).padStart(2, "0")}`,
      clientId: c._id,
      agreementId: null,
      billTo: {
        type: "Participant",
        name: "Harper Nguyen",
        email: c.email,
        address: "",
        abn: "",
        reference: PORTAL_MRN,
      },
      issuedAt: at(-40 + n * 9),
      dueDate: at(-26 + n * 9),
      lines: (inv.lines as Document[]).map((l, k) => ({
        ...l,
        date: at(-44 + n * 9 + k * 2),
        description: "Occupational Therapy · Home visit",
        support: "Occupational Therapy",
      })),
      demo: true,
    });
  }

  /* Consents Harper gave at intake, if none are on file yet. */
  {
    const consent = (key: string, state: string, days: number) => ({
      key,
      state,
      version: "2026.1",
      respondent: "Harper Nguyen",
      recordedBy: "Jo Marsh",
      at: at(days),
      scope: key === "share-coordinator" ? ["Appointment updates", "Approved reports"] : [],
      note: "",
      history: [
        { state, respondent: "Harper Nguyen", recordedBy: "Jo Marsh", at: at(days), note: "" },
      ],
    });
    await raw.collection("clients").updateOne(
      { _id: c._id },
      {
        $set: {
          consents: [
            ...(c.consents ?? []).filter(
              (x) =>
                x.state !== "Not asked" &&
                ![
                  "general-care",
                  "privacy-notice",
                  "telehealth",
                  "recording",
                  "ai-scribe",
                ].includes(x.key),
            ),
            consent("general-care", "Given", -76),
            consent("privacy-notice", "Given", -76),
            consent("share-coordinator", "Given", -74),
            consent("telehealth", "Given", -60),
            consent("recording", "Refused", -60),
            consent("ai-scribe", "Given", -60),
          ],
        },
      },
    );
  }

  /* A message thread with her therapist. */
  const therapistUser = need.therapistId
    ? await db.users.findOne({ therapistId: need.therapistId })
    : null;
  const patientUser = await db.users.findOne({ clientId: c._id, role: "client" });
  if (therapistUser && patientUser && need.therapistId) {
    const convo = await db.conversations.findOneAndUpdate(
      { clientId: c._id, therapistId: need.therapistId },
      {
        $setOnInsert: {
          _id: new ObjectId(),
          memberIds: [patientUser._id, therapistUser._id],
          createdAt: at(-60),
        },
      },
      { upsert: true, returnDocument: "after" },
    );
    if (convo && !(await db.messages.findOne({ conversationId: convo._id }))) {
      const thread: [ObjectId, string, number][] = [
        [
          therapistUser._id,
          "Hi Harper, it's Sarah. I've shared your plan in the app; the lunch routine is the main one this month.",
          -9,
        ],
        [patientUser._id, "Thanks Sarah. Can Linh sit in on Wednesday's visit?", -8],
        [therapistUser._id, "Of course. See you both Wednesday at 7:30.", -8],
      ];
      await db.messages.insertMany(
        thread.map(([senderId, body, d], k) => ({
          _id: new ObjectId(),
          conversationId: convo._id,
          senderId,
          body,
          createdAt: at(d, 9 * 60 + k * 20),
          readBy: [patientUser._id, therapistUser._id],
        })),
      );
      const last = thread.at(-1);
      if (last)
        await db.conversations.updateOne(
          { _id: convo._id },
          {
            $set: {
              lastMessage: { body: last[1], senderId: last[0], at: at(last[2], 9 * 60 + 40) },
            },
          },
        );
    }
  }

  /* The patient's own logs, requests and check-ins. */
  const plan = await db.plans.findOne({ clientId: c._id }, { sort: { version: -1 } });
  const ext = plan ? await raw.collection("planExt").findOne({ _id: plan._id }) : null;
  const act = (ext?.interventions as { id: string; home: unknown }[] | undefined)?.find(
    (i) => i.home,
  );
  const planId = plan?._id.toHexString() ?? "";
  const logs = act
    ? [-20, -18, -16, -13, -11, -9, -6, -4, -2].map((d, i) => ({
        planId,
        activityId: act.id,
        status:
          i === 3 ? "Skipped" : i === 6 ? "Partially Completed" : i === 4 ? "Unable" : "Completed",
        reason: i === 4 ? "Knee sore after the weekend" : i === 3 ? "Away overnight" : "",
        at: at(d, 18 * 60),
        review: d < -10 ? "Reviewed by Sarah Thompson" : "Awaiting clinician review",
      }))
    : [];
  await raw.collection("portalExt").updateOne(
    { _id: c._id },
    {
      $set: {
        preferredName: "Harper",
        pronouns: "She/her",
        postal: "",
        postalSameAsHome: true,
        preferredLocation: "Home",
        pending: null,
        verified: { email: true, phone: true },
        prefs: {
          channel: "SMS",
          time: "Morning",
          language: "English",
          interpreter: "No",
          accessibility: ["Large text"],
          reminders: true,
        },
        requests: [
          {
            id: randomUUID(),
            field: "Legal first name",
            from: "Harpa",
            to: "Harper",
            kind: "Identity",
            status: "Approved",
            reason: "Spelling matched to ID",
            at: at(-50),
            decidedBy: "Jo Marsh",
          },
          {
            id: randomUUID(),
            field: "Health information",
            from: "",
            to: "My penicillin allergy is listed as severe; it was a mild rash as a child.",
            kind: "Medical record",
            status: "Pending",
            reason: "",
            at: at(-2),
            decidedBy: "",
          },
        ],
        acknowledgements: [],
        logs,
        questionnaires: [],
        bookings: [
          {
            id: randomUUID(),
            service: "Occupational Therapy",
            mode: "Day Program",
            window: "Wednesday mornings",
            purpose: "Practise transfers at the program",
            status: "Booked",
            at: at(-12),
          },
        ],
        changes: [],
        uploads: [
          {
            name: "NDIS-plan-2026.pdf",
            category: "NDIS Plan",
            status: "Received, waiting for review",
            at: at(-30),
          },
          {
            name: "GP-letter-knee.pdf",
            category: "Other",
            status: "Received, waiting for review",
            at: at(-5),
          },
        ],
        payments: [],
        read: [],
        ndisRevealedAt: null,
        activity: [
          { at: at(-30), text: "Uploaded NDIS-plan-2026.pdf" },
          { at: at(-12), text: "Requested an Occupational Therapy visit (Day Program)" },
          { at: at(-5), text: "Uploaded GP-letter-knee.pdf" },
          { at: at(-2), text: "Asked for a correction to your health information" },
        ],
      },
    },
    { upsert: true },
  );
  await flags.updateOne({ _id: "m18Seed" }, { $set: { at: now } }, { upsert: true });
}
