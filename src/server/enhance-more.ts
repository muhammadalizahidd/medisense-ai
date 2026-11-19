import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import {
  templateQuestions,
  type EnhanceAction,
  type EnhancePrefs,
  type FeedbackDto,
  type OversightDto,
  type Reporter,
} from "@/lib/live/enhance";
import { collections } from "./db";
import { col, forPatient, forTherapist, type Doc } from "./enhance";
import { UserFacingError } from "./http";
import { audit, notify, publish } from "./live";
import type { ClientDoc, UserDoc } from "./models";
import { careTask } from "./portal";
import { staffPasswordHash } from "./seed";

/*
 * The parts of AI Enhancements 01–07 that complete the specs: AI consent and language, answer
 * feedback, caregiver access set by the therapist, check-in templates and no-account links,
 * coach mode and translation, concern retraction, coordination follow-through, and the admin's
 * counts-only oversight view.
 */

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/* ------------------------------------------------------------------ prefs and consent */

export async function prefsOf(clientId: ObjectId): Promise<EnhancePrefs> {
  const d = await (await col()).findOne({ kind: "prefs", clientId });
  return {
    aiConsent: (d?.aiConsent as EnhancePrefs["aiConsent"]) ?? "Allowed",
    language: (d?.language as EnhancePrefs["language"]) ?? "English",
    checkinAuto: (d?.checkinAuto as EnhancePrefs["checkinAuto"]) ?? {
      hours: "Off",
      channel: "In app",
      template: "Therapy follow-up",
    },
    caregivers: (
      (d?.caregivers as (Omit<EnhancePrefs["caregivers"][number], "at"> & { at: unknown })[]) ?? []
    ).map((g) => ({ ...g, at: g.at instanceof Date ? g.at.toISOString() : String(g.at) })),
  };
}

/** AI is used on a patient's information only while they allow it. */
export async function aiAllowed(c: ClientDoc) {
  return (await prefsOf(c._id)).aiConsent === "Allowed";
}

/** Verified representatives the therapist hasn't revoked, with what they may do and until when. */
export function caregiverReporters(
  reps: { name: string; relationship: string; status: string }[],
  prefs: EnhancePrefs,
): Reporter[] {
  const today = new Date().toISOString().slice(0, 10);
  return reps
    .filter((r) => r.status === "Verified" || r.status === "Active")
    .flatMap((r) => {
      const g = prefs.caregivers.find((x) => x.name === r.name);
      if (g && (g.revoked || (g.until && g.until < today))) return [];
      return [
        {
          name: r.name,
          role: "Caregiver" as const,
          relationship: r.relationship,
          scope: g?.scope ?? ["Activities", "Appointments", "Concerns"],
          until: g?.until ?? null,
        },
      ];
    });
}

/** A caregiver can only answer where the therapist allowed it. */
export async function assertReporter(c: ClientDoc, r: Reporter, area: string) {
  if (r.role !== "Caregiver") return;
  const prefs = await prefsOf(c._id);
  const g = prefs.caregivers.find((x) => x.name === r.name);
  const today = new Date().toISOString().slice(0, 10);
  if (g?.revoked) throw new UserFacingError(`${r.name}'s caregiver access was withdrawn.`, 409);
  if (g?.until && g.until < today)
    throw new UserFacingError(`${r.name}'s caregiver access has expired.`, 409);
  const scope = g?.scope ?? ["Activities", "Appointments", "Concerns"];
  if (!scope.includes(area))
    throw new UserFacingError(
      `${r.name}'s caregiver access doesn't include ${area.toLowerCase()}.`,
      409,
    );
}

/* ------------------------------------------------------------------ feedback */

export const feedbackDto = (d: Doc): FeedbackDto => ({
  id: d._id.toHexString(),
  source: d.source as FeedbackDto["source"],
  rating: d.rating as FeedbackDto["rating"],
  note: String(d.note ?? ""),
  excerpt: String(d.excerpt ?? ""),
  by: String(d.by ?? ""),
  at: d.at.toISOString(),
  resolved: Boolean(d.resolved),
});

/* ------------------------------------------------------------------ admin oversight */

/** Counts only: an admin sees how the assistants are used, never clinical text. */
export async function oversight(u: UserDoc): Promise<OversightDto> {
  if (u.role !== "admin") throw new UserFacingError("Only admins see AI oversight.", 409);
  const docs = await (
    await col()
  )
    .find(
      {},
      {
        projection: {
          kind: 1,
          status: 1,
          category: 1,
          rating: 1,
          aiConsent: 1,
          caregivers: 1,
          review: 1,
          ref: 1,
          at: 1,
          actions: 1,
        },
      },
    )
    .toArray();
  const count = (kind: string, key: string) =>
    docs
      .filter((d) => d.kind === kind)
      .reduce<Record<string, number>>((m, d) => {
        const k = String(d[key] ?? "Unknown");
        m[k] = (m[k] ?? 0) + 1;
        return m;
      }, {});
  const checkins = docs
    .filter((d) => d.kind === "checkin")
    .reduce<Record<string, number>>((m, d) => {
      const k =
        d.status === "Submitted"
          ? d.review === "Reviewed"
            ? "Reviewed"
            : "Submitted"
          : String(d.status);
      m[k] = (m[k] ?? 0) + 1;
      return m;
    }, {});
  return {
    coach: count("coach", "status"),
    checkins,
    concerns: count("concern", "status"),
    categories: count("concern", "category"),
    insights: count("insight", "status"),
    feedback: count("feedback", "rating"),
    aiWithdrawn: docs.filter((d) => d.kind === "prefs" && d.aiConsent === "Withdrawn").length,
    caregiversActive: docs
      .filter((d) => d.kind === "prefs")
      .reduce(
        (n, d) =>
          n +
          ((d.caregivers as { revoked: boolean }[] | undefined) ?? []).filter((g) => !g.revoked)
            .length,
        0,
      ),
    followUps: await followUpQueue(),
    insightsWaiting: docs
      .filter((d) => d.kind === "insight" && d.status === "Draft")
      .map((d) => ({
        status: "Waiting for clinician review",
        days: Math.floor((Date.now() - d.at.getTime()) / 86_400_000),
      })),
    escalations: docs
      .filter((d) => d.kind === "concern" && d.category === "Safety escalation")
      .map((d) => {
        const acts = (d.actions as { by: string; action: string }[] | undefined) ?? [];
        return {
          ref: String(d.ref),
          status: String(d.status),
          category: String(d.category),
          at: d.at.toISOString(),
          reviewer: acts.length > 1 ? (acts.at(-1)?.by ?? "") : "Not yet reviewed",
        };
      }),
  };
}

/* ------------------------------------------------------------------ actions */

async function tell(c: ClientDoc, title: string) {
  const { users } = await collections();
  const need = c.needs.find((n) => n.therapistId);
  const t = need?.therapistId ? await users.findOne({ therapistId: need.therapistId }) : null;
  if (t) {
    await notify([t._id], { title, body: c.name, href: "/mobile/therapist" });
    await publish([t._id], "care");
  }
}
async function tellPatient(c: ClientDoc, title: string, body: string) {
  const { users } = await collections();
  const p = await users.findOne({ clientId: c._id });
  if (p) {
    await notify([p._id], { title, body, href: "/mobile/patient" });
    await publish([p._id], "care");
  }
}

type MoreAction = Extract<
  EnhanceAction,
  {
    type:
      | "prefs"
      | "feedback"
      | "feedback-resolve"
      | "coach-mode"
      | "translate"
      | "checkin-send"
      | "share-ack"
      | "suggestion-task"
      | "concern-retract"
      | "caregiver-access"
      | "chat-clear"
      | "checkin-auto"
      | "share-clarify"
      | "switch-participant";
  }
>;
export const moreTypes = new Set<string>([
  "checkin-auto",
  "share-clarify",
  "switch-participant",
  "prefs",
  "feedback",
  "feedback-resolve",
  "coach-mode",
  "translate",
  "checkin-send",
  "share-ack",
  "suggestion-task",
  "concern-retract",
  "caregiver-access",
  "chat-clear",
]);

export async function moreAction(u: UserDoc, a: MoreAction) {
  const k = await col();
  const now = new Date();
  const byId = async (docId: string, kind: string) => {
    if (!ObjectId.isValid(docId)) throw new UserFacingError("Not found.", 404);
    const d = await k.findOne({ _id: new ObjectId(docId), kind });
    if (!d) throw new UserFacingError("Not found.", 404);
    return d;
  };
  const clientFor = async (clientId: string) =>
    u.role === "client" ? forPatient(u) : forTherapist(u, clientId);

  switch (a.type) {
    case "prefs": {
      const c = await forPatient(u);
      await k.updateOne(
        { kind: "prefs", clientId: c._id },
        {
          $set: { aiConsent: a.aiConsent, language: a.language },
          $setOnInsert: {
            _id: new ObjectId(),
            kind: "prefs",
            clientId: c._id,
            at: now,
            caregivers: [],
          },
        },
        { upsert: true },
      );
      await audit(
        u,
        `AI assistance ${a.aiConsent === "Allowed" ? "allowed" : "withdrawn"}; language ${a.language}`,
        c._id,
      );
      if (a.aiConsent === "Withdrawn") await tell(c, "Patient turned off AI assistance");
      return { ok: true };
    }
    case "feedback": {
      const c = await clientFor(a.clientId);
      await k.insertOne({
        _id: new ObjectId(),
        kind: "feedback",
        clientId: c._id,
        at: now,
        source: a.source,
        rating: a.rating,
        note: a.note,
        excerpt: a.excerpt,
        by: u.name,
        resolved: a.rating === "Helpful",
      });
      if (a.rating === "Unsafe" || a.rating === "Inaccurate") {
        await careTask(
          c,
          "",
          "Clinical Follow-up",
          `AI answer flagged ${a.rating.toLowerCase()} (${a.source})`,
          a.rating === "Unsafe" ? "High" : "Normal",
        );
        await tell(c, `An AI answer was flagged ${a.rating.toLowerCase()}`);
      }
      return { ok: true };
    }
    case "feedback-resolve": {
      const d = await byId(a.feedbackId, "feedback");
      await forTherapist(u, d.clientId.toHexString());
      await k.updateOne({ _id: d._id }, { $set: { resolved: true, resolvedBy: u.name } });
      return { ok: true };
    }
    case "coach-mode": {
      const d = await byId(a.coachId, "coach");
      await forTherapist(u, d.clientId.toHexString());
      await k.updateOne(
        { _id: d._id },
        {
          $set: { mode: a.mode },
          $push: { history: { at: now, by: u.name, action: `Mode: ${a.mode}` } } as never,
        },
      );
      return { ok: true };
    }
    case "translate": {
      const d = await byId(a.coachId, "coach");
      const c =
        u.role === "client" ? await forPatient(u) : await forTherapist(u, d.clientId.toHexString());
      if (!d.clientId.equals(c._id)) throw new UserFacingError("Not found.", 404);
      const steps = d.steps as { text: string; source: string }[];
      if (a.language === "English") return { steps, note: "" };
      const cached = (
        d.translations as Record<string, { text: string; source: string }[]> | undefined
      )?.[a.language];
      if (cached)
        return {
          steps: cached,
          note: "AI-assisted translation · numbers and amounts copied unchanged",
        };
      if (!(await aiAllowed(c)))
        return {
          steps,
          note: "Translation needs AI, which is off at the patient's request. Showing the original.",
        };
      try {
        const out = await generateJson("coach-translate", {
          system: `Translate each step into ${a.language}. Keep every number, amount, time and unit exactly as written: always write numbers as digits (3, 20), never as words. Do not add, remove or soften anything. Return the same number of steps in the same order.`,
          user: steps.map((s, i) => `${i + 1}. ${s.text}`).join("\n"),
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["steps"],
            properties: { steps: { type: "array", items: { type: "string" } } },
          } as never,
          schemaName: "coach_translate",
          maxTokens: 900,
        });
        const t = (JSON.parse(out.text) as { steps: string[] }).steps;
        // A translation that drops or changes a number is not shown.
        const nums = (x: string) => (x.match(/\d+/g) ?? []).join(",");
        if (t.length !== steps.length || steps.some((s, i) => nums(s.text) !== nums(t[i] ?? "")))
          return {
            steps,
            note: "This translation couldn't be checked, so the original is shown. Ask your therapist if anything is unclear.",
          };
        const translated = steps.map((s, i) => ({ text: t[i] ?? s.text, source: s.source }));
        await k.updateOne({ _id: d._id }, { $set: { [`translations.${a.language}`]: translated } });
        return {
          steps: translated,
          note: "AI-assisted translation · numbers and amounts copied unchanged",
        };
      } catch {
        return { steps, note: "Translation isn't available right now. Showing the original." };
      }
    }
    case "checkin-send": {
      if (u.role !== "therapist" || !u.therapistId)
        throw new UserFacingError("Only the treating therapist sends check-ins.", 409);
      const { appointments, clients } = await collections();
      const appt = ObjectId.isValid(a.appointmentId)
        ? await appointments.findOne({ _id: new ObjectId(a.appointmentId) })
        : null;
      if (!appt || !appt.therapistId.equals(u.therapistId))
        throw new UserFacingError("Visit not found.", 404);
      const c = await clients.findOne({ _id: appt.clientId });
      if (!c) throw new UserFacingError("Patient not found.", 404);
      const token = randomBytes(18).toString("base64url");
      const existing = await k.findOne({
        kind: "checkin",
        clientId: c._id,
        appointmentId: a.appointmentId,
      });
      if (existing?.status === "Submitted")
        throw new UserFacingError("This check-in is already answered.", 409);
      const set = {
        template: a.template,
        extraQuestions: a.questions ?? templateQuestions[a.template],
        channel: a.channel ?? "In app",
        requestedBy: u.name,
        tokenHash: sha(token),
        sentAt: now,
      };
      if (existing) await k.updateOne({ _id: existing._id }, { $set: set });
      else
        await k.insertOne({
          _id: new ObjectId(),
          kind: "checkin",
          clientId: c._id,
          at: now,
          appointmentId: a.appointmentId,
          visitAt: appt.start,
          service:
            c.needs.find((n) => n.therapistId?.equals(appt.therapistId))?.support ??
            String(appt.discipline),
          status: "Sent",
          reporter: { name: c.name, role: "Patient", relationship: "Self" },
          answers: null,
          flags: [],
          submittedAt: null,
          brief: null,
          review: "Not Reviewed",
          reviewNote: "",
          reviewedBy: null,
          ...set,
        });
      await tellPatient(
        c,
        "Please complete your pre-visit check-in",
        `It takes two minutes and helps your therapist prepare.${a.channel && a.channel !== "In app" ? ` Also sent by ${a.channel.replace(" (simulated)", "").toLowerCase()} (simulated).` : ""}`,
      );
      await audit(u, `Pre-visit check-in sent (${a.template})`, c._id);
      return { ok: true, link: `/checkin/${token}` };
    }
    case "share-ack": {
      const d = await byId(a.coordId, "coord");
      await forTherapist(u, d.clientId.toHexString());
      const shares = ((d.shares as { id: string; status: string }[]) ?? []).map((s) =>
        s.id === a.shareId ? { ...s, status: "Acknowledged", ackBy: u.name, ackAt: now } : s,
      );
      await k.updateOne({ _id: d._id }, { $set: { shares } });
      return { ok: true };
    }
    case "suggestion-task": {
      const d = await byId(a.coordId, "coord");
      const c = await forTherapist(u, d.clientId.toHexString());
      const s = (
        (d.suggestions as {
          id: string;
          type: string;
          nextStep: string;
          decision: string;
          taskCreated?: boolean;
        }[]) ?? []
      ).find((x) => x.id === a.suggestionId);
      if (!s || s.decision !== "Accept")
        throw new UserFacingError("Accept the suggestion first.", 409);
      if (s.taskCreated) return { ok: true, duplicate: true };
      await careTask(
        c,
        "",
        "Clinical Follow-up",
        `Care-team: ${s.nextStep}`.slice(0, 150),
        "Normal",
      );
      const suggestions = (d.suggestions as { id: string }[]).map((x) =>
        x.id === a.suggestionId ? { ...x, taskCreated: true } : x,
      );
      await k.updateOne({ _id: d._id }, { $set: { suggestions } });
      return { ok: true };
    }
    case "concern-retract": {
      const d = await byId(a.concernId, "concern");
      const c = await forPatient(u);
      if (!d.clientId.equals(c._id)) throw new UserFacingError("Not found.", 404);
      if (["Resolved", "Closed - No Action"].includes(String(d.status)))
        throw new UserFacingError("This concern is already closed.", 409);
      // The original stays on record; the withdrawal is added to its history.
      await k.updateOne(
        { _id: d._id },
        {
          $set: { status: "Closed - No Action", retracted: true },
          $push: {
            actions: {
              at: now,
              by: u.name,
              action: "Withdrawn by the reporter",
              comment: a.reason,
            },
          } as never,
        },
      );
      await tell(c, `Concern ${String(d.ref)} withdrawn by the patient`);
      return { ok: true };
    }
    case "caregiver-access": {
      const c = await forTherapist(u, a.clientId);
      const prefs = await prefsOf(c._id);
      const rest = prefs.caregivers.filter((g) => g.name !== a.name);
      const entry = {
        name: a.name,
        relationship: a.relationship,
        scope: a.scope,
        until: a.until || null,
        revoked: a.revoked,
        by: u.name,
        at: now,
      };
      await k.updateOne(
        { kind: "prefs", clientId: c._id },
        {
          $set: { caregivers: [...rest, entry] },
          $setOnInsert: {
            _id: new ObjectId(),
            kind: "prefs",
            clientId: c._id,
            at: now,
            aiConsent: "Allowed",
            language: "English",
          },
        },
        { upsert: true },
      );
      await audit(u, `Caregiver access ${a.revoked ? "revoked" : "updated"}: ${a.name}`, c._id);
      await tellPatient(
        c,
        a.revoked
          ? `${a.name}'s caregiver access was withdrawn`
          : `${a.name}'s caregiver access was updated`,
        a.revoked
          ? "They can no longer answer for you in the app."
          : `Allowed: ${a.scope.join(", ") || "nothing"}.`,
      );
      return { ok: true };
    }
    case "checkin-auto": {
      const c = await forTherapist(u, a.clientId);
      await k.updateOne(
        { kind: "prefs", clientId: c._id },
        {
          $set: { checkinAuto: { hours: a.hours, channel: a.channel, template: a.template } },
          $setOnInsert: {
            _id: new ObjectId(),
            kind: "prefs",
            clientId: c._id,
            at: now,
            aiConsent: "Allowed",
            language: "English",
            caregivers: [],
          },
        },
        { upsert: true },
      );
      await audit(
        u,
        `Check-in automation: ${a.hours === "Off" ? "off" : `${a.hours} h before, ${a.channel}`}`,
        c._id,
      );
      await autoSendCheckins(c);
      return { ok: true };
    }
    case "share-clarify": {
      const d = await byId(a.coordId, "coord");
      const c = await forTherapist(u, d.clientId.toHexString());
      const shares = ((d.shares as { id: string; by: string }[]) ?? []).map((s2) =>
        s2.id === a.shareId
          ? { ...s2, status: "Clarification requested", note: `${u.name}: ${a.note}` }
          : s2,
      );
      await k.updateOne({ _id: d._id }, { $set: { shares } });
      const original = ((d.shares as { id: string; by: string }[]) ?? []).find(
        (x) => x.id === a.shareId,
      );
      const { users } = await collections();
      const author = original
        ? await users.findOne({ name: original.by, role: "therapist" })
        : null;
      if (author)
        await notify([author._id], {
          title: "Clarification requested on a shared update",
          body: c.name,
          href: "/mobile/therapist",
        });
      return { ok: true };
    }
    case "switch-participant": {
      const info = caregiverInfo(u);
      if (!info) throw new UserFacingError("Only caregiver accounts switch participants.", 409);
      if (!ObjectId.isValid(a.clientId) || !info.for.some((x) => x.toHexString() === a.clientId))
        throw new UserFacingError("You don't have caregiver access to that person.", 409);
      const { users } = await collections();
      await users.updateOne({ _id: u._id }, { $set: { clientId: new ObjectId(a.clientId) } });
      return { ok: true };
    }
    case "chat-clear": {
      const c = await clientFor(a.clientId);
      await k.deleteMany({
        kind: u.role === "client" ? "chat" : "copilot",
        clientId: c._id,
        userId: u._id,
      });
      await audit(u, "Assistant history deleted", c._id);
      return { ok: true };
    }
  }
}

/* ------------------------------------------------------------------ check-in by link (no account) */

async function byToken(token: string) {
  const d = await (await col()).findOne({ kind: "checkin", tokenHash: sha(token) });
  if (!d)
    throw new UserFacingError(
      "This check-in link isn't valid. Ask your care team for a new one.",
      404,
    );
  return d;
}

/** Without the date of birth, the link shows nothing about the patient. */
export async function checkinLink(token: string, dob: string | null) {
  const d = await byToken(token);
  const { clients, therapists } = await collections();
  const c = await clients.findOne({ _id: d.clientId });
  if (!c) throw new UserFacingError("This check-in link isn't valid.", 404);
  const verified = Boolean(dob && c.dateOfBirth && c.dateOfBirth.slice(0, 10) === dob);
  if (!verified) return { verified: false, submitted: d.status === "Submitted" };
  const need = c.needs.find((n) => n.therapistId);
  const t = need?.therapistId ? await therapists.findOne({ _id: need.therapistId }) : null;
  return {
    verified: true,
    submitted: d.status === "Submitted",
    firstName: c.name.split(" ")[0] ?? "",
    therapist: t?.name ?? "your therapist",
    visitAt: d.visitAt instanceof Date ? d.visitAt.toISOString() : String(d.visitAt),
    service: String(d.service),
    extraQuestions: (d.extraQuestions as string[]) ?? [],
  };
}

export async function checkinLinkSubmit(
  token: string,
  dob: string,
  answers: Record<string, unknown>,
  respondent: { name: string; relationship: string },
) {
  const d = await byToken(token);
  const { clients, users } = await collections();
  const c = await clients.findOne({ _id: d.clientId });
  if (!c || !c.dateOfBirth || c.dateOfBirth.slice(0, 10) !== dob)
    throw new UserFacingError("Those details don't match our records.", 409);
  if (d.status === "Submitted") throw new UserFacingError("This check-in was already sent.", 409);
  const self = respondent.relationship === "Self";
  const flags: string[] = [];
  if (answers.change === "Worse")
    flags.push(`Reported feeling worse: "${String(answers.changeDetail || "no detail")}"`);
  if (answers.newDifficulty === "Yes")
    flags.push(`New difficulty: "${String(answers.difficultyDetail || "no detail")}"`);
  if (Number(answers.pain) >= 7) flags.push(`Pain reported as ${String(answers.pain)}/10`);
  await (
    await col()
  ).updateOne(
    { _id: d._id },
    {
      $set: {
        answers,
        status: "Submitted",
        submittedAt: new Date(),
        flags,
        reporter: {
          name: respondent.name,
          role: self ? "Patient" : "Caregiver",
          relationship: respondent.relationship,
        },
        brief: {
          summary: "Answered through the secure link without an account. Original answers below.",
          reported: [
            `Reported: change since last visit: ${String(answers.change || "not answered")}`,
          ],
          context: [],
          concerns: flags,
          questions: answers.questions ? [String(answers.questions)] : [],
          missing: [],
          ai: false,
        },
        review: "Not Reviewed",
        viaLink: true,
      },
    },
  );
  const need = c.needs.find((n) => n.therapistId);
  const t = need?.therapistId ? await users.findOne({ therapistId: need.therapistId }) : null;
  if (t) {
    await notify([t._id], {
      title: "Pre-visit check-in submitted by link",
      body: c.name,
      href: "/mobile/therapist",
    });
    await publish([t._id], "care");
  }
  return { ok: true };
}

/* ------------------------------------------------------------------ visitor assistant (no account) */

const PUBLIC_FACTS = [
  "[Services] Medisense provides allied health at home in Brisbane: occupational therapy, physiotherapy, speech pathology, psychology, exercise physiology, dietetics, podiatry, nursing and behaviour support.",
  "[Referrals] Anyone can refer without an account using the online referral form; you get a reference number and a private link to follow it.",
  "[Documents] Helpful documents: GP or specialist letter, NDIS plan or funding approval, previous reports. You can upload them later.",
  "[Funding] Medisense works with NDIS (plan- and self-managed), aged care packages, Medicare plans and private payment.",
  "[Hours] Monday to Friday, 9:00 am to 5:00 pm Brisbane time. For emergencies call 000.",
  "[Privacy] The assistant can't see anyone's records. Signed-in patients use the patient app for their own details.",
];

export async function publicAssistant(text: string) {
  if (/\b(my|me|mine)\b.*\b(appointment|invoice|plan|record|referral|result)s?\b/i.test(text))
    return {
      text: "I can't see anyone's personal information here. Sign in to the patient app with your MRN to see your own appointments, plan and invoices.",
      outcome: "No authorised source",
      sources: ["[Privacy]"],
    };
  try {
    const out = await generateJson("public-assistant", {
      system:
        "You are Medisense's public help assistant. Answer ONLY from the facts given, in one to three plain sentences, and cite the bracketed labels used. You can't see any personal records. Never give medical advice. If the facts don't cover it, say so and suggest calling Medisense in business hours.",
      user: `Facts:\n${PUBLIC_FACTS.join("\n")}\n\nQuestion: ${text}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["answer", "sources"],
        properties: {
          answer: { type: "string" },
          sources: { type: "array", items: { type: "string" } },
        },
      } as never,
      schemaName: "public_assistant",
      maxTokens: 500,
    });
    const r = JSON.parse(out.text) as { answer: string; sources: string[] };
    return { text: r.answer, outcome: "Answered", sources: r.sources };
  } catch {
    return {
      text: "The assistant isn't available right now. You can still make a referral with the form on this page.",
      outcome: "No authorised source",
      sources: [],
    };
  }
}

/* ------------------------------------------------------------------ caregiver accounts (06) */

type CaregiverUser = UserDoc & { caregiverFor?: ObjectId[]; caregiverRelationship?: string };

/** A caregiver signs in on their own account; it holds who they care for. */
export function caregiverInfo(u: UserDoc) {
  const c = u as CaregiverUser;
  return c.role === "client" && c.caregiverFor?.length
    ? { for: c.caregiverFor, relationship: c.caregiverRelationship ?? "Caregiver" }
    : null;
}

/** The demo's verified caregiver: Linh Nguyen, Harper's daughter, with her own sign-in. */
export async function ensureCaregiverDemo() {
  const g = globalThis as { __caregiverDemo?: Promise<void> };
  g.__caregiverDemo ??= (async () => {
    const { users, clients } = await collections();
    if (await users.findOne({ email: "linh.nguyen@medisense.test" })) return;
    const harper = await clients.findOne({ mrn: "MRN-04092026-0001" } as never);
    const hash = await staffPasswordHash();
    if (!harper || !hash) return;
    await users.insertOne({
      _id: new ObjectId(),
      email: "linh.nguyen@medisense.test",
      name: "Linh Nguyen",
      role: "client",
      passwordHash: hash,
      invite: null,
      therapistId: null,
      clientId: harper._id,
      caregiverFor: [harper._id],
      caregiverRelationship: "Daughter",
    } as never);
  })().catch(() => {
    g.__caregiverDemo = undefined;
  });
  return g.__caregiverDemo;
}

/** The patient's "share with support coordinator" consent also governs shared care updates. */
export function sharingWithdrawn(c: ClientDoc) {
  const list = (c as ClientDoc & { consents?: { key: string; state: string }[] }).consents ?? [];
  return list.some(
    (x) => x.key === "share-coordinator" && /withdrawn|refused|declined/i.test(x.state),
  );
}

/** Check-ins the therapist set to go automatically: sent once a booked visit is inside the window. */
export async function autoSendCheckins(c: ClientDoc) {
  const prefs = await prefsOf(c._id);
  if (prefs.checkinAuto.hours === "Off") return;
  const { appointments } = await collections();
  const now = Date.now();
  const soon = await appointments
    .find({
      clientId: c._id,
      status: "booked",
      start: {
        $gt: new Date(now),
        $lte: new Date(now + Number(prefs.checkinAuto.hours) * 3_600_000),
      },
    })
    .toArray();
  if (!soon.length) return;
  const k = await col();
  for (const appt of soon) {
    const id = appt._id.toHexString();
    if (
      await k.findOne(
        { kind: "checkin", clientId: c._id, appointmentId: id },
        { projection: { _id: 1 } },
      )
    )
      continue;
    await k.insertOne({
      _id: new ObjectId(),
      kind: "checkin",
      clientId: c._id,
      at: new Date(),
      appointmentId: id,
      visitAt: appt.start,
      service:
        c.needs.find((n) => n.therapistId?.equals(appt.therapistId))?.support ??
        String(appt.discipline),
      status: "Sent",
      template: prefs.checkinAuto.template,
      extraQuestions: templateQuestions[prefs.checkinAuto.template],
      requestedBy: "Automation",
      channel: prefs.checkinAuto.channel,
      tokenHash: sha(randomBytes(18).toString("base64url")),
      sentAt: new Date(),
      reporter: { name: c.name, role: "Patient", relationship: "Self" },
      answers: null,
      flags: [],
      submittedAt: null,
      brief: null,
      review: "Not Reviewed",
      reviewNote: "",
      reviewedBy: null,
    });
    await tellPatient(
      c,
      "Please complete your pre-visit check-in",
      `Sent automatically ${prefs.checkinAuto.hours} hours before your visit.`,
    );
  }
}

/** Follow-up work the assistants created, minimal details only (AT-15: no clinical text). */
async function followUpQueue() {
  const { db } = await collections();
  const tasks = await db
    .collection("careTasks")
    .find(
      { source: "Automation", status: { $nin: ["Completed", "Cancelled"] } },
      { projection: { category: 1, priority: 1, status: 1, assigneeName: 1, dueAt: 1 } },
    )
    .sort({ dueAt: 1 })
    .limit(30)
    .toArray();
  return tasks.map((t) => ({
    category: String(t.category),
    priority: String(t.priority),
    status: String(t.status),
    owner: String(t.assigneeName ?? ""),
    due: t.dueAt instanceof Date ? t.dueAt.toISOString() : null,
  }));
}

/** An attachment must be the declared type and size, as a data URL. */
export function checkAttachment(
  a: { name: string; type: string; size: number; dataUrl: string } | null | undefined,
) {
  if (!a) return null;
  if (!a.dataUrl.startsWith(`data:${a.type};base64,`))
    throw new UserFacingError("That file couldn't be read. Try a PDF, JPG or PNG.");
  if (Math.floor((a.dataUrl.length - a.dataUrl.indexOf(",") - 1) * 0.75) > a.size + 4)
    throw new UserFacingError("That file is larger than it says.");
  return a;
}
