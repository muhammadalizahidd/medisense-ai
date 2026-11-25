import "server-only";
import { can } from "./permissions";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError, rethrowDisabled } from "@/lib/ai/types";
import { consentItems } from "@/lib/live/participant";
import {
  accessLabel,
  historySections,
  restrictedDisciplines,
  type AccessLevel,
  type AiSummaryDto,
  type AllergyState,
  type ConditionDto,
  type EntryDto,
  type EpisodeDto,
  type EpisodeStatus,
  type ExceptionDto,
  type HistoryDto,
  type HistorySectionId,
  type MedicationDto,
  type RecordAction,
  type RecordDto,
  type RecordListItem,
  type RiskDto,
  type TimelineEvent,
  type AllergyDto,
} from "@/lib/live/records";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, publish } from "./live";
import { insertTask, requestApproval } from "./operations";
import type { AssessmentDoc, ClientDoc, PlanDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ storage */

type Stamp = { by: string; at: Date };
type HistoryCell = {
  state: HistoryDto[HistorySectionId]["state"];
  text: string;
  source: string;
  by: string | null;
  at: Date | null;
};

export interface ClinicalRecordDoc {
  _id: ObjectId;
  history: Partial<Record<HistorySectionId, HistoryCell>>;
  historyReview: { by: string; at: Date; sources: string[] } | null;
  conditions: (Omit<ConditionDto, "at"> & { at: Date })[];
  medications: (Omit<MedicationDto, "reviewedAt"> & { reviewedAt: Date | null })[];
  allergyState: AllergyState;
  allergyStateSource: { source: string; by: string; at: Date } | null;
  allergies: (Omit<AllergyDto, "at"> & { at: Date })[];
  risks: (Omit<RiskDto, "at" | "reviewer"> & {
    at: Date;
    reviewer: string | null;
    reviewNote: string;
  })[];
  entries: (Omit<
    EntryDto,
    "hidden" | "createdAt" | "signedAt" | "addenda" | "voided" | "episodeLabel"
  > & {
    authorId: ObjectId;
    createdAt: Date;
    updatedAt: Date;
    signedAt: Date | null;
    addenda: { text: string; reason: string; by: string; at: Date }[];
    voided: { reason: string; by: string; at: Date } | null;
  })[];
  docMeta: Record<
    string,
    {
      category: string;
      episodeId: string | null;
      restricted: boolean;
      reviewedBy: string | null;
      shares: {
        recipient: string;
        expires: string | null;
        revoked: boolean;
        by: string;
        at: Date;
      }[];
    }
  >;
  resolved: Record<string, { by: string; at: Date; note: string }>;
  accessLog: {
    at: Date;
    by: string;
    userId: ObjectId;
    role: string;
    action: string;
    purpose: string;
  }[];
  grants: { userId: ObjectId; name: string; purpose: string; until: Date }[];
  requests: {
    id: string;
    userId: ObjectId;
    name: string;
    reason: string;
    at: Date;
    status: "Pending" | "Granted" | "Declined";
    until: Date | null;
  }[];
  ai: Partial<
    Record<
      AiSummaryDto["kind"],
      { text: string; points: AiSummaryDto["points"]; at: Date; approved: Stamp | null }
    >
  >;
  updated: Stamp;
  scenario?: string | null;
}

async function records() {
  const { db } = await collections();
  return db.collection<ClinicalRecordDoc>("clinicalRecords");
}

export function blankRecord(clientId: ObjectId, by = "Record created"): ClinicalRecordDoc {
  return {
    _id: clientId,
    history: {},
    historyReview: null,
    conditions: [],
    medications: [],
    allergyState: "Not assessed",
    allergyStateSource: null,
    allergies: [],
    risks: [],
    entries: [],
    docMeta: {},
    resolved: {},
    accessLog: [],
    grants: [],
    requests: [],
    ai: {},
    updated: { by, at: new Date() },
  };
}

async function loadRecord(clientId: ObjectId) {
  const col = await records();
  const found = await col.findOne({ _id: clientId });
  if (found) return found;
  const fresh = blankRecord(clientId);
  await col.insertOne(fresh).catch(() => undefined);
  return (await col.findOne({ _id: clientId })) ?? fresh;
}

/* ------------------------------------------------------------------ access (section 2, section 12) */

/** Opens the full clinical record (after recording a purpose): the records.view.clinical permission. */
export const isLead = (u: UserDoc) => u.role === "admin" && can(u, "records.view.clinical");
/** Grants record access and records an access purpose: the records.grant-access permission. */
const canGrantAccess = (u: UserDoc) => u.role === "admin" && can(u, "records.grant-access");
/** Reviews risks reported on a record: the records.review-risks permission. */
const canReviewRisks = (u: UserDoc) => u.role === "admin" && can(u, "records.review-risks");

type Access = { level: AccessLevel; note: string; disciplines: string[]; needsPurpose: boolean };

export async function accessFor(
  u: UserDoc,
  client: ClientDoc,
  rec: ClinicalRecordDoc | null,
): Promise<Access> {
  const now = Date.now();
  if (u.role === "therapist" && u.therapistId) {
    const mine = client.needs.filter((n) => n.therapistId?.equals(u.therapistId ?? new ObjectId()));
    const me = await myDiscipline(u.therapistId);
    if (mine.length) {
      return {
        level: "treating",
        note: `Assigned: ${mine.map((n) => n.support).join(", ")}`,
        disciplines: [...new Set(mine.map((n) => n.discipline))],
        needsPurpose: false,
      };
    }
    const grant = rec?.grants.find((g) => g.userId.equals(u._id) && g.until.getTime() > now);
    if (grant) {
      return {
        level: "treating",
        note: `Consultation access until ${grant.until.toLocaleDateString("en-AU")} (${grant.purpose})`,
        disciplines: me ? [me.discipline] : [],
        needsPurpose: false,
      };
    }
    return {
      level: "none",
      note: "You aren't assigned to this participant.",
      disciplines: [],
      needsPurpose: false,
    };
  }
  if (u.role !== "admin") return { level: "none", note: "", disciplines: [], needsPurpose: false };
  if (isLead(u)) {
    const purpose = rec?.grants.find((g) => g.userId.equals(u._id) && g.until.getTime() > now);
    return {
      level: "clinical-lead",
      note: purpose
        ? `Authorised access · ${purpose.purpose}`
        : "Record a purpose to open the full clinical record.",
      disciplines: [],
      needsPurpose: !purpose,
    };
  }
  // A person holding several views gets the widest. The views are nested (intake shows everything
  // scheduling shows, which shows everything finance shows), so that is the union of them.
  if (u.role === "admin" && can(u, "records.view.intake"))
    return { level: "intake", note: accessLabel.intake, disciplines: [], needsPurpose: false };
  if (u.role === "admin" && can(u, "records.view.scheduling"))
    return {
      level: "scheduler",
      note: accessLabel.scheduler,
      disciplines: [],
      needsPurpose: false,
    };
  if (u.role === "admin" && can(u, "records.view.finance"))
    return { level: "finance", note: accessLabel.finance, disciplines: [], needsPurpose: false };
  return { level: "none", note: "", disciplines: [], needsPurpose: false };
}

const clinicalView = (a: Access) =>
  a.level === "treating" || (a.level === "clinical-lead" && !a.needsPurpose);

/** Psychology and trauma content stays with that discipline unless explicitly shared (AC-10, AC-11). */
function canReadRestricted(a: Access, discipline: string, authorId?: ObjectId, viewer?: UserDoc) {
  if (a.level === "clinical-lead" && !a.needsPurpose) return true;
  if (authorId && viewer && authorId.equals(viewer._id)) return true;
  return a.level === "treating" && a.disciplines.includes(discipline);
}

/* ------------------------------------------------------------------ helpers */

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
const ageOf = (dob: string | null) => {
  if (!dob) return null;
  const years = Math.floor((Date.now() - Date.parse(dob)) / (365.25 * 86_400_000));
  return years < 2
    ? `${Math.max(0, Math.floor((Date.now() - Date.parse(dob)) / (30.4 * 86_400_000)))} months`
    : `${years}`;
};

function episodeStatus(
  client: ClientDoc,
  n: ClientDoc["needs"][number],
  a?: AssessmentDoc,
  p?: PlanDoc,
  activity = false,
): EpisodeStatus {
  if (client.discharged) return "Discharged";
  if (n.status === "completed") return "Closed";
  if (n.status !== "assigned") return "Awaiting assessment";
  if (p && p.status === "Active") return "Active";
  if (a && ["Signed", "Amended"].includes(a.status)) return "Active";
  // Delivered visits or signed entries mean care is under way.
  if (activity) return "Active";
  if (p && p.status === "Under Review") return "On hold";
  return "Awaiting assessment";
}

async function load(clientId: ObjectId) {
  const db = await collections();
  const client = await db.clients.findOne({ _id: clientId });
  if (!client) throw new UserFacingError("Participant not found.", 404);
  return { db, client };
}

/* ------------------------------------------------------------------ the record (CR-02 to CR-12) */

export async function recordFor(u: UserDoc, clientId: ObjectId, log = true): Promise<RecordDto> {
  const { db, client } = await load(clientId);
  const rec = await loadRecord(clientId);
  const a = await accessFor(u, client, rec);
  if (a.level === "none") {
    throw new UserFacingError(
      "You don't have access to this clinical record. Request access from the record list.",
      404,
    );
  }
  const clinical = clinicalView(a);
  const [assessments, plans, visits, therapists, referral, docs, telehealth] = await Promise.all([
    db.assessments.find({ clientId }).sort({ createdAt: -1 }).toArray(),
    db.plans.find({ clientId }).sort({ createdAt: -1 }).toArray(),
    db.appointments.find({ clientId }).sort({ start: 1 }).toArray(),
    db.therapists.find({}, { projection: { name: 1, discipline: 1 } }).toArray(),
    db.referrals.findOne({
      $or: [
        { clientId },
        {
          _id: {
            $in: client.needs.map((n) => n.referralId).filter((x): x is ObjectId => Boolean(x)),
          },
        },
      ],
    }),
    db.documents
      .find(
        {
          $or: [
            { clientId },
            ...(client.needs[0]?.referralId ? [{ referralId: client.needs[0].referralId }] : []),
          ],
        },
        { projection: { data: 0 } },
      )
      .toArray(),
    db.telehealth.find({ clientId }).toArray(),
  ]);
  const tName = (id: ObjectId | null | undefined) =>
    id ? (therapists.find((t) => t._id.equals(id))?.name ?? null) : null;
  const now = Date.now();
  const episodes: EpisodeDto[] = client.needs.map((n) => {
    const as = assessments.find((x) => x.needId === n.id);
    const pl = plans.find((x) => x.needId === n.id);
    const mine =
      a.level === "treating" && a.disciplines.includes(n.discipline) && Boolean(n.therapistId);
    return {
      id: n.id,
      support: n.support,
      discipline: n.discipline,
      status: episodeStatus(
        client,
        n,
        as,
        pl,
        visits.some((v) => v.needId === n.id && v.status === "completed") ||
          rec.entries.some((e) => e.episodeId === n.id && e.status === "Signed"),
      ),
      clinician: tName(n.therapistId),
      mine,
      restricted: restrictedDisciplines.includes(n.discipline),
      location: n.location ?? "Home",
      assessment: as
        ? {
            id: as._id.toHexString(),
            status: as.status,
            href: `/therapist/assessments/${as._id.toHexString()}`,
          }
        : null,
      plan: pl
        ? {
            id: pl._id.toHexString(),
            status: pl.status,
            reviewDate: pl.reviewDate,
            href: `/therapist/plans/${pl._id.toHexString()}`,
          }
        : null,
    };
  });
  const episodeLabel = (id: string | null) => {
    const e = episodes.find((x) => x.id === id);
    return e ? `${e.support} · ${e.clinician ?? "unassigned"}` : "Whole record";
  };

  const history = clinical
    ? (Object.fromEntries(
        historySections.map((s) => {
          const c = rec.history[s.id];
          return [
            s.id,
            {
              state: c?.state ?? "Not reported",
              text: c?.text ?? "",
              source: c?.source ?? "",
              by: c?.by ?? null,
              at: iso(c?.at),
            },
          ];
        }),
      ) as HistoryDto)
    : null;

  const entries: EntryDto[] = clinical
    ? rec.entries
        .map((e) => {
          const readable = !e.restricted || canReadRestricted(a, e.discipline, e.authorId, u);
          return {
            id: e.id,
            type: e.type,
            episodeId: e.episodeId,
            episodeLabel: episodeLabel(e.episodeId),
            discipline: e.discipline,
            title: readable ? e.title : `Restricted ${e.discipline} entry`,
            text: readable ? e.text : "",
            informant: e.informant,
            status: e.status,
            restricted: e.restricted,
            hidden: !readable,
            missing: readable ? e.missing : [],
            author: e.author,
            createdAt: e.createdAt.toISOString(),
            signedAt: iso(e.signedAt),
            addenda: readable ? e.addenda.map((x) => ({ ...x, at: x.at.toISOString() })) : [],
            voided: e.voided ? { ...e.voided, at: e.voided.at.toISOString() } : null,
            offline: e.offline,
          };
        })
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
    : [];

  /* timeline (CR-08) */
  const timeline: TimelineEvent[] = [];
  const hideFor = (discipline: string | null) =>
    Boolean(
      discipline && restrictedDisciplines.includes(discipline) && !canReadRestricted(a, discipline),
    );
  if (referral) {
    timeline.push({
      id: `ref:${referral._id.toHexString()}`,
      at: referral.createdAt.toISOString(),
      kind: "Referral",
      title: `Referral ${referral.reference} received`,
      detail: `${referral.data.supports.map((s) => s.support).join(", ")} · from ${referral.data.submitter.role.toLowerCase()} ${referral.data.submitter.name}`,
      discipline: null,
      by: referral.data.submitter.name,
      href: u.role === "admin" ? `/care/referrals/${referral._id.toHexString()}` : null,
      restricted: false,
    });
  }
  if (clinical) {
    for (const x of assessments) {
      const r = hideFor(x.discipline);
      timeline.push({
        id: `as:${x._id.toHexString()}`,
        at: (x.signed?.at ?? x.createdAt).toISOString(),
        kind: "Assessment",
        title: r ? `Restricted ${x.discipline} assessment` : `${x.kind} ${x.support} · ${x.status}`,
        detail: r ? "" : x.findings.slice(0, 180) || "Findings not yet written",
        discipline: x.discipline,
        by: x.therapistName,
        href: r ? null : `/therapist/assessments/${x._id.toHexString()}`,
        restricted: r,
      });
      for (const am of x.amendments)
        timeline.push({
          id: `asam:${x._id.toHexString()}:${am.at.getTime()}`,
          at: am.at.toISOString(),
          kind: "Amendment",
          title: `Assessment amended: ${r ? "restricted" : am.reason}`,
          detail: "",
          discipline: x.discipline,
          by: am.byName,
          href: null,
          restricted: r,
        });
    }
    for (const p of plans) {
      const r = hideFor(null);
      timeline.push({
        id: `pl:${p._id.toHexString()}`,
        at: (p.approved?.at ?? p.createdAt).toISOString(),
        kind: "Treatment plan",
        title: `${p.support} plan v${p.version} · ${p.status}`,
        detail: `${p.goals.length} goal${p.goals.length === 1 ? "" : "s"} · review ${p.reviewDate}`,
        discipline: null,
        by: p.therapistName,
        href: `/therapist/plans/${p._id.toHexString()}`,
        restricted: r,
      });
      for (const g of p.goals)
        for (const h of g.history.slice(-2))
          timeline.push({
            id: `oc:${p._id.toHexString()}:${g.id}:${h.at.getTime()}`,
            at: h.at.toISOString(),
            kind: "Outcome",
            title: `${g.description.slice(0, 60)}: ${h.value}`,
            detail: h.note,
            discipline: null,
            by: h.byName,
            href: null,
            restricted: false,
          });
    }
    for (const v of visits) {
      if (!["completed", "no-show", "late-cancelled", "aborted"].includes(v.status)) continue;
      const r = hideFor(v.discipline);
      timeline.push({
        id: `vi:${v._id.toHexString()}`,
        at: v.start.toISOString(),
        kind: "Visit",
        title: `${v.modality === "Telehealth" ? "Telehealth" : (v.site?.location ?? "Home")} visit · ${v.status === "completed" ? "attended" : v.status}`,
        detail: r
          ? "Restricted session note"
          : v.note
            ? `Note ${v.note.status ?? "Final"}${v.note.text ? `: ${v.note.text.slice(0, 140)}` : ""}`
            : "No note yet",
        discipline: v.discipline,
        by: tName(v.therapistId),
        href: null,
        restricted: r,
      });
      for (const am of v.note?.amendments ?? [])
        timeline.push({
          id: `vam:${v._id.toHexString()}:${am.at.getTime()}`,
          at: am.at.toISOString(),
          kind: "Amendment",
          title: r ? "Restricted note amended" : `Note amended: ${am.reason}`,
          detail: "",
          discipline: v.discipline,
          by: am.byName,
          href: null,
          restricted: r,
        });
    }
    for (const t of telehealth) {
      if (!t.recording.availableAt) continue;
      timeline.push({
        id: `rec:${t._id.toHexString()}`,
        at: t.recording.availableAt.toISOString(),
        kind: "Recording",
        title: `Telehealth recording ${t.recording.status}`,
        detail: "Restricted: playback asks for a purpose and is logged",
        discipline: null,
        by: tName(t.therapistId),
        href: "/telehealth/recordings",
        restricted: true,
      });
    }
    for (const e of rec.entries) {
      if (e.status === "Draft") continue;
      const r = e.restricted && !canReadRestricted(a, e.discipline, e.authorId, u);
      timeline.push({
        id: `en:${e.id}`,
        at: (e.signedAt ?? e.createdAt).toISOString(),
        kind: "Entry",
        title: r ? `Restricted ${e.discipline} entry` : `${e.type}: ${e.title}`,
        detail: r ? "" : e.text.slice(0, 160),
        discipline: e.discipline,
        by: e.author,
        href: null,
        restricted: r,
      });
      for (const ad of e.addenda)
        timeline.push({
          id: `ad:${e.id}:${ad.at.getTime()}`,
          at: ad.at.toISOString(),
          kind: "Amendment",
          title: r ? "Restricted addendum" : `Addendum: ${ad.reason}`,
          detail: r ? "" : ad.text.slice(0, 140),
          discipline: e.discipline,
          by: ad.by,
          href: null,
          restricted: r,
        });
    }
    for (const rk of rec.risks)
      timeline.push({
        id: `rk:${rk.id}`,
        at: rk.at.toISOString(),
        kind: "Risk",
        title: `${rk.types.join(", ")} risk recorded · ${rk.severity}`,
        detail: rk.description.slice(0, 140),
        discipline: null,
        by: rk.by,
        href: null,
        restricted: false,
      });
  }
  for (const c of client.consents ?? []) {
    for (const h of c.history.length
      ? c.history
      : c.at
        ? [
            {
              state: c.state,
              respondent: c.respondent,
              recordedBy: c.recordedBy,
              at: c.at,
              note: c.note,
            },
          ]
        : []) {
      timeline.push({
        id: `co:${c.key}:${h.at.getTime()}`,
        at: h.at.toISOString(),
        kind: "Consent",
        title: `${consentItems.find((i) => i.key === c.key)?.label ?? c.key}: ${h.state}`,
        detail: h.note,
        discipline: null,
        by: h.recordedBy,
        href: null,
        restricted: false,
      });
    }
  }
  if (client.discharged)
    timeline.push({
      id: "dc",
      at: client.discharged.at.toISOString(),
      kind: "Discharge",
      title: "Discharged",
      detail: client.discharged.reason,
      discipline: null,
      by: client.discharged.byName,
      href: null,
      restricted: false,
    });
  timeline.sort((x, y) => y.at.localeCompare(x.at));

  /* documents (CR-09) */
  const documents = docs
    .filter((d) => d.area !== "funding" || a.level === "finance" || a.level === "clinical-lead")
    .map((d) => {
      const meta = rec.docMeta[d._id.toHexString()];
      const restricted = meta?.restricted ?? false;
      const hidden = restricted && !clinical;
      return {
        id: d._id.toHexString(),
        name: hidden ? "Restricted document" : d.name,
        kind: d.kind,
        category:
          meta?.category ??
          (d.kind === "NDIS plan" || d.kind === "Referral letter"
            ? "Referral letter / NDIS excerpt"
            : d.kind === "Report"
              ? "FCA / home modification / AT report"
              : "Patient-shared document"),
        episodeId: meta?.episodeId ?? null,
        source: d.referralId ? "Referral" : "Uploaded to record",
        author: d.uploadedBy,
        receivedAt: d.at.toISOString(),
        version: d.version ?? 1,
        restricted,
        hidden,
        reviewedBy: meta?.reviewedBy ?? null,
        shares: (meta?.shares ?? []).map((s) => ({ ...s, at: s.at.toISOString() })),
        href: hidden ? null : `/api/documents/${d._id.toHexString()}`,
      };
    });

  /* consent register (CR-10) */
  const consents = consentItems.map((item) => {
    const c = client.consents?.find((x) => x.key === item.key);
    return {
      key: item.key,
      label: item.label,
      state: c?.state ?? "Not asked",
      respondent: c?.respondent ?? "",
      recordedBy: c?.recordedBy ?? "",
      at: iso(c?.at),
      scope: c?.scope ?? [],
      note: c?.note ?? "",
      history: (c?.history ?? []).map((h) => ({
        state: h.state,
        by: h.recordedBy,
        at: h.at.toISOString(),
        note: h.note,
      })),
    };
  });

  /* care team (CR-07) */
  const careTeam = {
    clinicians: episodes
      .filter((e) => e.clinician)
      .map((e) => ({
        name: e.clinician ?? "",
        discipline: e.discipline,
        episode: e.support,
        status: e.status,
      })),
    contacts: (client.contacts ?? []).map((c) => ({
      name: c.name,
      role: c.role,
      relationship: c.relationship,
      authority: c.authorityType,
      verified: c.state === "Verified",
      contactAllowed: c.contactAllowed,
      sharing: c.authorityScope.join(", ") || "None",
    })),
  };

  /* exceptions (CR-12) */
  const exceptions: ExceptionDto[] = [];
  const add = (x: Omit<ExceptionDto, "resolved">) => {
    const r = rec.resolved[x.id];
    exceptions.push({
      ...x,
      resolved: r ? { by: r.by, note: r.note, at: r.at.toISOString() } : null,
    });
  };
  if (clinical) {
    if (rec.allergyState === "No known allergies reported" && rec.allergies.length)
      add({
        id: "conflict:allergy",
        kind: "Conflict",
        title: "Allergy state disagrees with recorded allergies",
        detail:
          "“No known allergies” is recorded, but specific allergies are also listed. Both sources are kept until a clinician reconciles them.",
        sources: [
          rec.allergyStateSource?.source ?? "Unknown",
          ...rec.allergies.map((x) => `${x.substance} (${x.source})`),
        ],
      });
    const diag = referral?.data.clinical.diagnosis;
    if (diag && !rec.conditions.some((c) => c.status === "Confirmed by clinician"))
      add({
        id: "verify:diagnosis",
        kind: "Pending verification",
        title: "Referral-reported diagnosis not yet clinician-confirmed",
        detail: `Referral says: “${diag}”. Shown as reported until a clinician confirms or revises it.`,
        sources: [`Referral ${referral?.reference}`],
      });
    for (const s of ["presenting", "functional", "communication"] as HistorySectionId[]) {
      if (!rec.history[s] || rec.history[s]?.state === "Not reported")
        add({
          id: `missing:${s}`,
          kind: "Missing history",
          title: `${historySections.find((h) => h.id === s)?.label} not documented`,
          detail: "Ask at the next contact or record Unknown. A blank is never treated as no.",
          sources: [],
        });
    }
    for (const m of rec.medications.filter(
      (x) => x.verification === "Unverified" && x.status === "Current",
    ))
      add({
        id: `verify:med:${m.id}`,
        kind: "Pending verification",
        title: `${m.name} is unverified`,
        detail: `Source: ${m.source}. Reconcile against an external document or the participant.`,
        sources: [m.source],
      });
    for (const e of rec.entries.filter((x) => x.offline && x.status === "Draft"))
      add({
        id: `offline:${e.id}`,
        kind: "Unsynchronised draft",
        title: `Offline draft: ${e.title}`,
        detail:
          "Saved on a device without a connection. Review before signing; it never overwrites a newer signed entry.",
        sources: [e.author],
      });
  }
  if (referral?.duplicates.length && !referral.duplicateDecision)
    add({
      id: "duplicate",
      kind: "Possible duplicate",
      title: "Possible duplicate participant",
      detail: referral.duplicates.map((d) => `${d.name}: ${d.why}`).join("; "),
      sources: [`Referral ${referral.reference}`],
    });

  const risks: RiskDto[] = rec.risks.map((r) => ({ ...r, at: r.at.toISOString() }));
  const openRisks = risks.filter((r) => r.review !== "Retired");
  const safetySummary = [
    ...(client.precautions ? [client.precautions] : []),
    ...openRisks.filter((r) => r.mitigation).map((r) => `${r.types.join(", ")}: ${r.mitigation}`),
  ];
  const alerts: RecordDto["alerts"] = [
    ...openRisks
      .filter((r) => r.severity === "High" || r.severity === "Critical")
      .map((r) => ({
        tone: "over" as const,
        text: `${r.severity} risk · ${r.types.join(", ")}${r.review === "Pending" ? " · awaiting qualified review" : ""}`,
      })),
    ...(clinical && rec.allergies.length
      ? [
          {
            tone: "over" as const,
            text: `Allergies: ${rec.allergies.map((x) => x.substance).join(", ")}`,
          },
        ]
      : []),
    ...(clinical && rec.allergyState === "Unknown"
      ? [{ tone: "watch" as const, text: "Allergy status unknown" }]
      : []),
    ...(consents.find((c) => c.key === "recording")?.state === "Refused"
      ? [{ tone: "watch" as const, text: "Recording consent refused: consult without recording" }]
      : []),
  ];

  const nextVisit = visits.find((v) => v.status === "booked" && v.start.getTime() > now);
  const lastVisit = [...visits].reverse().find((v) => v.status === "completed");
  const missingCount = exceptions.filter((x) => !x.resolved && x.kind === "Missing history").length;
  const completeness: RecordDto["completeness"] =
    rec.historyReview && !missingCount
      ? "Verified"
      : missingCount >= 2 || !Object.keys(rec.history).length
        ? "Missing"
        : "Needs review";
  const primary =
    client.contacts?.find((c) => ["Parent", "Guardian", "Nominee"].includes(c.role)) ?? null;
  const myDiscipline = a.disciplines[0] ?? "";

  if (log) await logAccess(u, clientId, a, "Viewed record");

  const plansActive = plans.filter((p) => p.status === "Active");
  return {
    clientId: client._id.toHexString(),
    participantId: client.mrn ?? client._id.toHexString().slice(-6).toUpperCase(),
    name: client.name,
    dateOfBirth: a.level === "finance" ? null : client.dateOfBirth,
    pronouns: client.profile?.pronouns ?? "",
    preferredName: client.profile?.preferredName ?? "",
    suburb: client.suburb,
    region: client.region,
    funding: client.funding,
    referral: referral
      ? {
          id: referral._id.toHexString(),
          reference: referral.reference,
          source: referral.data.submitter.role,
          submittedAt: referral.createdAt.toISOString(),
          href: u.role === "admin" ? `/care/referrals/${referral._id.toHexString()}` : "",
        }
      : null,
    primaryContact: primary
      ? {
          name: primary.name,
          relationship: primary.relationship || primary.role,
          verified: primary.state === "Verified",
        }
      : null,
    nextAppointment: nextVisit
      ? {
          at: nextVisit.start.toISOString(),
          location:
            nextVisit.modality === "Telehealth"
              ? "Telehealth"
              : (nextVisit.site?.location ?? "Home"),
          status: nextVisit.confirmedByPatient ? "Confirmed" : "Booked",
          ref: nextVisit.ref ?? "",
        }
      : null,
    lastVisit: lastVisit
      ? {
          at: lastVisit.start.toISOString(),
          clinician: tName(lastVisit.therapistId) ?? "",
          signed: lastVisit.note?.status === "Final" || lastVisit.note?.status === "Amended",
        }
      : null,
    lastUpdated: { at: rec.updated.at.toISOString(), by: rec.updated.by },
    completeness,
    access: a.level,
    accessNote: a.note,
    needsPurpose: a.needsPurpose,
    accessRequests:
      canGrantAccess(u) || a.level === "treating"
        ? rec.requests.map((r) => ({
            id: r.id,
            name: r.name,
            reason: r.reason,
            at: r.at.toISOString(),
            status: r.status,
            until: iso(r.until),
          }))
        : [],
    canGrant: canGrantAccess(u),
    canWrite: clinical,
    canSign: a.level === "treating" || (a.level === "clinical-lead" && !a.needsPurpose),
    precautions: client.precautions ?? null,
    alerts,
    episodes:
      a.level === "finance"
        ? episodes.map((e) => ({ ...e, assessment: null, plan: null }))
        : episodes,
    history,
    historyReview:
      clinical && rec.historyReview
        ? { ...rec.historyReview, at: rec.historyReview.at.toISOString() }
        : null,
    conditions: clinical ? rec.conditions.map((c) => ({ ...c, at: c.at.toISOString() })) : [],
    medications: clinical
      ? rec.medications.map((m) => ({ ...m, reviewedAt: iso(m.reviewedAt) }))
      : [],
    medicationsReadOnly: !(myDiscipline === "Nursing" || a.level === "clinical-lead"),
    allergyState: clinical ? rec.allergyState : "Not assessed",
    allergyStateSource:
      clinical && rec.allergyStateSource
        ? { ...rec.allergyStateSource, at: rec.allergyStateSource.at.toISOString() }
        : null,
    allergies: clinical ? rec.allergies.map((x) => ({ ...x, at: x.at.toISOString() })) : [],
    risks: clinical
      ? risks
      : a.level === "scheduler" || a.level === "intake"
        ? risks
            .filter((r) => r.sharing === "Operational safety summary")
            .map((r) => ({ ...r, description: "Operational summary only", escalation: "" }))
        : [],
    safetySummary: a.level === "finance" ? [] : safetySummary,
    entries,
    timeline:
      a.level === "finance"
        ? []
        : clinical
          ? timeline
          : timeline.filter((x) => x.kind === "Referral" || x.kind === "Consent"),
    documents: a.level === "scheduler" || a.level === "finance" ? [] : documents,
    consents: a.level === "finance" ? [] : consents,
    careTeam,
    exceptions,
    accessLog:
      clinical || isLead(u)
        ? rec.accessLog
            .slice(-60)
            .reverse()
            .map((l) => ({
              at: l.at.toISOString(),
              by: l.by,
              role: l.role,
              action: l.action,
              purpose: l.purpose,
            }))
        : [],
    ai: clinical
      ? (
          Object.entries(rec.ai) as [
            AiSummaryDto["kind"],
            NonNullable<ClinicalRecordDoc["ai"]["summary"]>,
          ][]
        ).map(([kind, v]) => ({
          kind,
          text: v.text,
          points: v.points,
          at: v.at.toISOString(),
          approved: v.approved ? { by: v.approved.by, at: v.approved.at.toISOString() } : null,
        }))
      : [],
    goals: clinical
      ? plansActive.flatMap((p) =>
          p.goals.map((g) => ({
            description: g.description,
            current: g.current || g.baseline,
            target: g.target,
            status: g.status,
            shared: true,
          })),
        )
      : [],
    discharged: client.discharged
      ? { at: client.discharged.at.toISOString(), reason: client.discharged.reason }
      : null,
  };
}

async function logAccess(
  u: UserDoc,
  clientId: ObjectId,
  a: Access,
  action: string,
  purpose?: string,
) {
  const col = await records();
  const rec = await col.findOne({ _id: clientId }, { projection: { accessLog: { $slice: -1 } } });
  const last = rec?.accessLog?.[0];
  // One "Viewed" line per person per ten minutes keeps the audit readable.
  if (
    action === "Viewed record" &&
    last &&
    last.userId.equals(u._id) &&
    last.action === action &&
    Date.now() - last.at.getTime() < 600_000
  )
    return;
  await col.updateOne(
    { _id: clientId },
    {
      $push: {
        accessLog: {
          $each: [
            {
              at: new Date(),
              by: u.name,
              userId: u._id,
              role: accessLabel[a.level],
              action,
              purpose: purpose ?? (a.level === "treating" ? "Treating care" : a.note),
            },
          ],
          $slice: -400,
        },
      },
    },
  );
}

/* ------------------------------------------------------------------ CR-01 list */

async function loadDiscipline(id: ObjectId) {
  const { therapists } = await collections();
  return therapists.findOne({ _id: id }, { projection: { discipline: 1 } });
}
/** A therapist's discipline, remembered for a minute: the record list checks it once per patient. */
const disciplineCache = new Map<
  string,
  { at: number; doc: Awaited<ReturnType<typeof loadDiscipline>> }
>();
async function myDiscipline(id: ObjectId) {
  const key = id.toHexString();
  const hit = disciplineCache.get(key);
  if (hit && Date.now() - hit.at < 60_000) return hit.doc;
  const doc = await loadDiscipline(id);
  disciplineCache.set(key, { at: Date.now(), doc });
  return doc;
}

export async function recordList(u: UserDoc): Promise<RecordListItem[]> {
  const db = await collections();
  const col = await records();
  const all = await db.clients.find({}).sort({ name: 1 }).limit(400).toArray();
  // Independent reads run together; appointments bring only the two fields this list uses.
  const [recList, therapists, next] = await Promise.all([
    col
      .find({ _id: { $in: all.map((c) => c._id) } }, { projection: { accessLog: 0, ai: 0 } })
      .toArray(),
    db.therapists.find({}, { projection: { name: 1 } }).toArray(),
    db.appointments
      .find(
        { status: "booked", start: { $gte: new Date() } },
        { projection: { clientId: 1, start: 1 } },
      )
      .sort({ start: 1 })
      .toArray(),
  ]);
  const recs = new Map(recList.map((r) => [r._id.toHexString(), r]));
  const out: RecordListItem[] = [];
  for (const c of all) {
    const rec = recs.get(c._id.toHexString()) ?? null;
    const a = await accessFor(u, c, rec);
    if (u.role === "therapist" && a.level === "none" && !c.needs.length) continue;
    const risks = rec?.risks.filter((r) => r.review !== "Retired") ?? [];
    const missing = rec
      ? historySections.filter(
          (s) =>
            ["presenting", "functional", "communication"].includes(s.id) &&
            (!rec.history[s.id] || rec.history[s.id]?.state === "Not reported"),
        ).length
      : 3;
    const nv = next.find((v) => v.clientId.equals(c._id));
    out.push({
      clientId: c._id.toHexString(),
      participantId: c.mrn ?? "",
      name: c.name,
      age: a.level === "none" ? null : ageOf(c.dateOfBirth),
      suburb: c.suburb,
      episodes: c.needs.map((n) => ({
        support: n.support,
        discipline: n.discipline,
        status: episodeStatus(
          c,
          n,
          undefined,
          undefined,
          Boolean(rec?.entries.some((e) => e.episodeId === n.id && e.status === "Signed")),
        ),
        clinician: n.therapistId
          ? (therapists.find((t) => t._id.equals(n.therapistId ?? new ObjectId()))?.name ?? null)
          : null,
        mine: Boolean(u.therapistId && n.therapistId?.equals(u.therapistId)),
      })),
      access: a.level,
      nextAppointment: a.level === "none" ? null : (nv?.start.toISOString() ?? null),
      openRisks: a.level === "none" ? 0 : risks.length,
      highRisk:
        a.level !== "none" && risks.some((r) => r.severity === "High" || r.severity === "Critical"),
      completeness:
        rec?.historyReview && !missing ? "Verified" : missing >= 2 ? "Missing" : "Needs review",
      unsigned:
        a.level === "treating" || a.level === "clinical-lead"
          ? (rec?.entries.filter((e) => e.status === "Draft").length ?? 0)
          : 0,
      exceptions: missing,
      lastUpdated: (rec?.updated.at ?? c.createdAt).toISOString(),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ actions */

function must(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new UserFacingError(msg, 409);
}

export async function recordAction(u: UserDoc, clientId: ObjectId, action: RecordAction) {
  const { db, client } = await load(clientId);
  const col = await records();
  const rec = await loadRecord(clientId);
  const a = await accessFor(u, client, rec);
  const now = new Date();
  const set: Record<string, unknown> = {};
  let note = "";

  if (action.type === "request-access") {
    must(
      u.role === "therapist" && a.level === "none",
      "Only an unassigned clinician requests access.",
    );
    const id = randomUUID();
    await col.updateOne(
      { _id: clientId },
      {
        $push: {
          requests: {
            id,
            userId: u._id,
            name: u.name,
            reason: action.reason,
            at: now,
            status: "Pending",
            until: null,
          },
        },
      },
    );
    await requestApproval({
      key: `record-access:${clientId.toHexString()}:${id}`,
      workflow: "Sensitive document distribution",
      title: `${u.name} asks for access to ${client.name}'s clinical record`,
      reason: action.reason,
      initiator: u.name,
      related: {
        label: `Clinical record ${client.mrn ?? ""}`,
        href: `/care/records/${clientId.toHexString()}?tab=access`,
      },
      taskId: null,
      ruleId: null,
      restricted: true,
      slaHours: 8,
    });
    await audit(u, `Clinical record: requested access to ${client.name}`, clientId);
    await changed(clientId);
    return { ok: true };
  }
  if (action.type === "grant") {
    must(canGrantAccess(u), "Only a Clinical Lead grants record access.");
    const r = rec.requests.find((x) => x.id === action.requestId);
    must(Boolean(r && r.status === "Pending"), "That request is no longer pending.");
    const until = new Date(now.getTime() + 7 * 86_400_000);
    await col.updateOne(
      { _id: clientId, "requests.id": action.requestId },
      {
        $set: {
          "requests.$.status": action.approve ? "Granted" : "Declined",
          "requests.$.until": action.approve ? until : null,
        },
        ...(action.approve && r
          ? {
              $push: {
                grants: {
                  userId: r.userId,
                  name: r.name,
                  purpose: `Consultation: ${action.note || r.reason}`,
                  until,
                },
              },
            }
          : {}),
      },
    );
    await logAccess(
      u,
      clientId,
      a,
      `${action.approve ? "Granted" : "Declined"} access for ${r?.name}`,
      action.note,
    );
    await changed(clientId);
    return { ok: true };
  }
  if (action.type === "open") {
    must(canGrantAccess(u), "Only a Clinical Lead records an access purpose.");
    await col.updateOne(
      { _id: clientId },
      {
        $push: {
          grants: {
            userId: u._id,
            name: u.name,
            purpose: action.purpose,
            until: new Date(now.getTime() + 12 * 3_600_000),
          },
        },
      },
    );
    await logAccess(u, clientId, a, "Opened full record", action.purpose);
    await audit(u, `Clinical record: ${client.name} opened for ${action.purpose}`, clientId);
    return { ok: true };
  }

  must(
    clinicalView(a),
    a.level === "clinical-lead"
      ? "Record your purpose first."
      : "Only the treating clinician or an authorised Clinical Lead can change the clinical record.",
  );
  const myDiscipline = a.disciplines[0] ?? (isLead(u) ? "Clinical Lead" : "");

  switch (action.type) {
    case "history": {
      must(
        action.state !== "Recorded" || action.text.length > 1,
        "Write what was recorded, or choose Unknown or Not assessed.",
      );
      set[`history.${action.section}`] = {
        state: action.state,
        text: action.state === "Recorded" ? action.text : action.text,
        source: action.source,
        by: u.name,
        at: now,
      };
      note = `History: ${action.section} ${action.state}`;
      break;
    }
    case "history-reviewed": {
      set.historyReview = { by: u.name, at: now, sources: action.sources };
      note = `History reviewed (${action.sources.join(", ")})`;
      break;
    }
    case "condition": {
      const c = {
        id: action.id ?? randomUUID(),
        label: action.label,
        status: action.status,
        source: action.source,
        onset: action.onset,
        evidence: action.evidence,
        by: u.name,
        at: now,
      };
      set.conditions = action.id
        ? rec.conditions.map((x) => (x.id === action.id ? c : x))
        : [...rec.conditions, c];
      note = `Condition ${c.label}: ${c.status}`;
      break;
    }
    case "medication": {
      must(
        !(myDiscipline !== "Nursing" && !isLead(u)),
        "Medication history is read-only for your discipline. Ask nursing or the Clinical Lead to reconcile it.",
      );
      const m = {
        id: action.id ?? randomUUID(),
        name: action.name,
        strength: action.strength,
        route: action.route,
        frequency: action.frequency,
        indication: action.indication,
        status: action.status,
        verification: action.verification,
        source: action.source,
        reviewedAt: now,
        by: u.name,
      };
      set.medications = action.id
        ? rec.medications.map((x) => (x.id === action.id ? m : x))
        : [...rec.medications, m];
      note = `Medication ${m.name}: ${m.status}, ${m.verification}`;
      break;
    }
    case "allergy-state": {
      must(
        !(action.state === "Specific allergies recorded" && !rec.allergies.length),
        "Add the allergy first.",
      );
      set.allergyState = action.state;
      set.allergyStateSource = { source: action.source, by: u.name, at: now };
      note = `Allergy status: ${action.state}`;
      break;
    }
    case "allergy": {
      set.allergies = [
        ...rec.allergies,
        {
          id: randomUUID(),
          substance: action.substance,
          reaction: action.reaction,
          severity: action.severity,
          source: action.source,
          confirmed: action.source === "Treating clinician",
          by: u.name,
          at: now,
        },
      ];
      set.allergyState = "Specific allergies recorded";
      set.allergyStateSource = { source: action.source, by: u.name, at: now };
      note = `Allergy recorded: ${action.substance}`;
      // A material new allergy flags the treating clinicians for review (section 6).
      await flagReview(u, client, `New allergy recorded: ${action.substance}`, "High");
      break;
    }
    case "risk": {
      const r = {
        id: action.id ?? randomUUID(),
        types: action.types,
        origin: action.origin,
        severity: action.severity,
        description: action.description,
        mitigation: action.mitigation,
        escalation: action.escalation,
        review: "Pending" as const,
        reviewDue: action.reviewDue,
        reviewer: null,
        reviewNote: "",
        sharing: action.sharing,
        by: u.name,
        at: now,
      };
      set.risks = action.id
        ? rec.risks.map((x) => (x.id === action.id ? r : x))
        : [...rec.risks, r];
      note = `Risk recorded: ${r.types.join(", ")} (${r.severity})`;
      if (r.severity === "High" || r.severity === "Critical") {
        // AC-06: a qualified review task and a visit safety flag, never a silent plan change.
        await flagReview(
          u,
          client,
          `${r.severity} risk recorded: ${r.types.join(", ")}`,
          r.severity === "Critical" ? "Urgent" : "High",
          r.description,
        );
      }
      break;
    }
    case "risk-review": {
      must(
        canReviewRisks(u) || a.level === "treating",
        "Only a qualified clinician reviews risks.",
      );
      set.risks = rec.risks.map((x) =>
        x.id === action.id
          ? { ...x, review: action.state, reviewer: u.name, reviewNote: action.note }
          : x,
      );
      note = `Risk review: ${action.state}`;
      break;
    }
    case "entry": {
      const ep = client.needs.find((n) => n.id === action.episodeId);
      const discipline = ep?.discipline ?? myDiscipline;
      if (action.id) {
        const e = rec.entries.find((x) => x.id === action.id);
        must(Boolean(e), "Entry not found.");
        must(e?.status === "Draft", "A signed entry changes only by addendum.");
        must(Boolean(e?.authorId.equals(u._id)), "You can only edit your own draft.");
        // A newer save from elsewhere is shown as a conflict, never overwritten (AC-36).
        if (action.baseAt && e && e.updatedAt.toISOString() !== action.baseAt) {
          throw new UserFacingError(
            `This draft was changed at ${e.updatedAt.toLocaleTimeString("en-AU", { timeZone: "Australia/Brisbane", hour: "numeric", minute: "2-digit" })}. Reload it before saving.`,
            409,
          );
        }
        set.entries = rec.entries.map((x) =>
          x.id === action.id
            ? {
                ...x,
                type: action.entryType,
                title: action.title,
                text: action.text,
                informant: action.informant,
                missing: action.missing,
                offline: action.offline,
                updatedAt: now,
              }
            : x,
        );
      } else {
        set.entries = [
          ...rec.entries,
          {
            id: randomUUID(),
            type: action.entryType,
            episodeId: action.episodeId,
            discipline,
            title: action.title,
            text: action.text,
            informant: action.informant,
            status: "Draft" as const,
            restricted: restrictedDisciplines.includes(discipline),
            missing: action.missing,
            author: u.name,
            authorId: u._id,
            createdAt: now,
            updatedAt: now,
            signedAt: null,
            addenda: [],
            voided: null,
            offline: action.offline,
          },
        ];
      }
      note = `Entry saved as draft: ${action.title}`;
      break;
    }
    case "sign": {
      const e = rec.entries.find((x) => x.id === action.id);
      must(Boolean(e), "Entry not found.");
      must(e?.status === "Draft", "Already signed.");
      must(Boolean(e?.authorId.equals(u._id)), "Only the author signs their own entry.");
      must(
        !e?.missing.length,
        `Complete or remove the missing items first: ${e?.missing.join(", ")}.`,
      );
      must(Boolean(e?.text.trim()), "Write the entry before signing.");
      set.entries = rec.entries.map((x) =>
        x.id === action.id
          ? { ...x, status: "Signed" as const, signedAt: now, offline: false, updatedAt: now }
          : x,
      );
      note = `Signed: ${e?.title}`;
      break;
    }
    case "addendum": {
      const e = rec.entries.find((x) => x.id === action.id);
      must(e?.status === "Signed", "Addenda go on signed entries; edit a draft directly.");
      must(
        !e?.restricted || canReadRestricted(a, e.discipline, e.authorId, u),
        "You can't amend a restricted entry.",
      );
      set.entries = rec.entries.map((x) =>
        x.id === action.id
          ? {
              ...x,
              addenda: [
                ...x.addenda,
                { text: action.text, reason: action.reason, by: u.name, at: now },
              ],
              updatedAt: now,
            }
          : x,
      );
      note = `Addendum to ${e?.title}: ${action.reason}`;
      break;
    }
    case "void": {
      const e = rec.entries.find((x) => x.id === action.id);
      must(Boolean(e), "Entry not found.");
      must(
        Boolean(e?.authorId.equals(u._id)) || isLead(u),
        "Only the author or the Clinical Lead voids an entry.",
      );
      set.entries = rec.entries.map((x) =>
        x.id === action.id
          ? {
              ...x,
              status: "Voided" as const,
              voided: { reason: action.reason, by: u.name, at: now },
              updatedAt: now,
            }
          : x,
      );
      note = `Voided (kept in history): ${e?.title}`;
      break;
    }
    case "document": {
      const cur = rec.docMeta[action.documentId];
      set[`docMeta.${action.documentId}`] = {
        category: action.category,
        episodeId: action.episodeId,
        restricted: action.restricted,
        reviewedBy: action.reviewed ? u.name : (cur?.reviewedBy ?? null),
        shares: cur?.shares ?? [],
      };
      note = `Document classified as ${action.category}${action.restricted ? " (restricted)" : ""}`;
      break;
    }
    case "share": {
      const consent = client.consents?.find((c) => c.key === "share-coordinator");
      const contact = client.contacts?.find(
        (c) => c.name.toLowerCase() === action.recipient.toLowerCase(),
      );
      // AC-19: information sharing needs consent and an authorised recipient.
      must(
        consent?.state === "Given",
        "Information-sharing consent isn't recorded as Given. Record consent before sharing.",
      );
      must(
        Boolean(contact && contact.state === "Verified" && contact.contactAllowed),
        `${action.recipient} isn't a verified, authorised contact for this participant.`,
      );
      const meta = rec.docMeta[action.documentId];
      must(!meta?.restricted, "Restricted documents can't be shared from here.");
      const shares = [
        ...(meta?.shares ?? []).filter((s) => s.recipient !== action.recipient),
        {
          recipient: action.recipient,
          expires: action.expires,
          revoked: false,
          by: u.name,
          at: now,
        },
      ];
      set[`docMeta.${action.documentId}`] = {
        category: meta?.category ?? "Patient-shared document",
        episodeId: meta?.episodeId ?? null,
        restricted: false,
        reviewedBy: meta?.reviewedBy ?? null,
        shares,
      };
      note = `Document shared with ${action.recipient}${action.expires ? ` until ${action.expires}` : ""}`;
      break;
    }
    case "revoke": {
      const meta = rec.docMeta[action.documentId];
      must(Boolean(meta), "Nothing to revoke.");
      set[`docMeta.${action.documentId}.shares`] = (meta?.shares ?? []).map((s) =>
        s.recipient === action.recipient ? { ...s, revoked: true } : s,
      );
      note = `Sharing revoked for ${action.recipient} (no new access; history kept)`;
      break;
    }
    case "resolve": {
      set[`resolved.${action.id}`] = { by: u.name, at: now, note: action.note };
      note = `Reconciled: ${action.id}`;
      break;
    }
    case "ai": {
      const out = await aiDraft(u, clientId, action.kind);
      set[`ai.${action.kind}`] = { ...out, at: now, approved: null };
      note = `AI ${action.kind} drafted (needs review)`;
      break;
    }
    case "ai-approve": {
      must(Boolean(rec.ai[action.kind]), "Nothing to approve.");
      set[`ai.${action.kind}.approved`] = { by: u.name, at: now };
      note = `AI ${action.kind} approved by ${u.name}`;
      break;
    }
  }
  set.updated = { by: u.name, at: now };
  await col.updateOne({ _id: clientId }, { $set: set });
  await logAccess(u, clientId, a, note || action.type);
  await audit(u, `Clinical record: ${client.name} · ${note}`, clientId);
  await changed(clientId);
  void db;
  return { ok: true };
}

async function changed(clientId: ObjectId) {
  const { users } = await collections();
  const ids = (
    await users
      .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
      .toArray()
  ).map((x) => x._id);
  await publish(ids, "care", { clientId: clientId.toHexString(), record: true });
}

async function flagReview(
  u: UserDoc,
  client: ClientDoc,
  title: string,
  priority: "High" | "Urgent",
  detail = "",
) {
  const { users } = await collections();
  const lead =
    (await users.findOne({
      role: "admin",
      staffRoles: { $all: ["Clinical Lead"], $nin: ["Super Admin"] },
    })) ?? (await users.findOne({ role: "admin", staffRoles: "Clinical Lead" }));
  await insertTask(u, {
    title: `Qualified review: ${title} · ${client.name}`,
    category: "Clinical Review",
    status: lead ? "Assigned" : "New",
    priority,
    urgentReason: priority === "Urgent" ? "Critical risk recorded on the clinical record" : "",
    team: "Clinical",
    assigneeId: lead?._id ?? null,
    assigneeName: lead?.name ?? null,
    related: {
      kind: "Participant",
      ref: client.mrn ?? client.name,
      label: client.name,
      href: `/care/records/${client._id.toHexString()}?tab=risks`,
    },
    clientId: client._id,
    referralId: null,
    appointmentId: null,
    participant: client.name,
    service: client.needs[0]?.support ?? null,
    discipline: client.needs[0]?.discipline ?? null,
    locationType: client.needs[0]?.location ?? null,
    dueAt: new Date(Date.now() + 4 * 3_600_000),
    sla: "Clinical Escalation",
    visibility: "Clinical Restricted",
    source: "Manual",
    ruleCode: null,
    ruleVersion: null,
    idemKey: null,
    restrictedNote: detail || null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: [
      { label: "Review the new information" },
      { label: "Confirm or update the safe visit plan before the next visit" },
    ],
    historyNote: "Created from the clinical record",
  });
}

/* ------------------------------------------------------------------ AI (section 13) */

async function aiDraft(u: UserDoc, clientId: ObjectId, kind: AiSummaryDto["kind"]) {
  // The model only sees what this person may see, with every fact tagged by its source.
  const dto = await recordFor(u, clientId, false);
  const facts = [
    ...(dto.referral
      ? [`[REF] Referral ${dto.referral.reference} from ${dto.referral.source}`]
      : []),
    ...dto.episodes.map(
      (e, i) =>
        `[EP${i + 1}] ${e.support} (${e.discipline}) · ${e.status} · ${e.clinician ?? "unassigned"}`,
    ),
    ...dto.conditions.map((c, i) => `[CON${i + 1}] ${c.label} · ${c.status} · source ${c.source}`),
    ...dto.medications.map(
      (m, i) =>
        `[MED${i + 1}] ${m.name} ${m.strength} ${m.frequency} · ${m.status} · ${m.verification}`,
    ),
    `[ALG] Allergy status: ${dto.allergyState}${dto.allergies.length ? ` (${dto.allergies.map((x) => x.substance).join(", ")})` : ""}`,
    ...dto.risks.map(
      (r, i) =>
        `[RSK${i + 1}] ${r.types.join(", ")} · ${r.severity} · review ${r.review}: ${r.description}`,
    ),
    ...Object.entries(dto.history ?? {}).map(
      ([k, v]) => `[HIS:${k}] ${v.state}${v.text ? `: ${v.text}` : ""}`,
    ),
    ...dto.timeline
      .filter((t) => !t.restricted)
      .slice(0, 25)
      .map((t) => `[${t.id}] ${t.at.slice(0, 10)} ${t.kind}: ${t.title}. ${t.detail}`),
  ];
  const ask = {
    summary: "Write a concise clinical case summary for the treating clinician.",
    gaps: "List missing, unclear or undated history, medication or allergy details the clinician should confirm. Unknown is a valid answer; never invent facts.",
    handover:
      "Draft a care-team handover summary for another treating clinician, using only these permissioned facts.",
  }[kind];
  try {
    const out = await generateJson(`record-${kind}`, {
      system:
        "You assist an allied health clinician with a participant record. Use only the facts given; each has a source tag in brackets. Every point must cite one source tag. Mark a point uncertain when its source is reported, unverified or unknown. Never diagnose, never assign risk severity, never invent medications, allergies or history. Plain Australian English.",
      user: `${ask}\n\nFacts:\n${facts.join("\n")}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text", "points"],
        properties: {
          text: { type: "string" },
          points: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["text", "source", "uncertain"],
              properties: {
                text: { type: "string" },
                source: { type: "string" },
                uncertain: { type: "boolean" },
              },
            },
          },
        },
      },
      schemaName: `record_${kind}`,
      maxTokens: 1100,
    });
    const parsed = JSON.parse(out.text) as { text: string; points: AiSummaryDto["points"] };
    return {
      text: parsed.text,
      points: parsed.points
        .slice(0, 14)
        .map((p) => ({ ...p, uncertain: p.uncertain || !p.source })),
    };
  } catch (error) {
    rethrowDisabled(error);
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

export type { ClientDoc };
