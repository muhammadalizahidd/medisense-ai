import "server-only";
import { can } from "./permissions";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  contextDomains,
  essentialDomains,
  instruments,
  templateById,
  templatesFor,
  type AssessAction,
  type AssessDto,
  type AssessRow,
  type AssessStatus,
  type Domain,
  type MeasurementDto,
  type ObservationDto,
  type Outcome,
  type ReportDto,
  type ScoreDto,
} from "@/lib/live/assess";
import { restrictedDisciplines } from "@/lib/live/records";
import { startPlan } from "./clinical";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, publish } from "./live";
import { insertTask } from "./operations";
import type { AssessmentDoc, ClientDoc, UserDoc } from "./models";

/* ------------------------------------------------------------------ storage */

type Stamp = { by: string; at: Date };
type Obs = Omit<ObservationDto, "date"> & { date: Date };
type Meas = Omit<MeasurementDto, "date"> & { date: Date };
type Score = Omit<ScoreDto, "date"> & { date: Date };

export interface AssessExtDoc {
  _id: ObjectId;
  ref: string;
  caseCode: string | null;
  purpose: string;
  purposeOther: string;
  templateId: string;
  mode: string;
  modeOther: string;
  respondents: { id: string; name: string; role: string; permission: string }[];
  consent: string;
  photoConsent: string;
  risk: string;
  riskNote: string;
  excluded: string[];
  unable: Record<string, { reason: string; note: string; by: string; at: Date }>;
  custom: {
    id: string;
    title: string;
    fields: { label: string; type: string; unit: string; options: string[]; value: string }[];
  }[];
  observations: Obs[];
  measurements: Meas[];
  scores: Score[];
  evidence: {
    id: string;
    type: string;
    caption: string;
    date: string;
    sensitivity: string;
    sharing: string;
    consent: string;
    author: string;
    domain: string;
  }[];
  visits: {
    id: string;
    date: Date;
    location: string;
    author: string;
    summary: string;
    paused: string;
    outstanding: string[];
  }[];
  report: (Omit<ReportDto, "at"> & { at: Date }) | null;
  outcome: Outcome | "";
  outcomeNote: string;
  submitted: Stamp | null;
  coSign: Stamp | null;
  release: {
    state: AssessDto["release"]["state"];
    recipients: string[];
    scope: string[];
    by: string | null;
    at: Date | null;
  };
  history: { at: Date; by: string; action: string; reason: string }[];
  dueAt: Date | null;
}

async function exts() {
  const { db } = await collections();
  return db.collection<AssessExtDoc>("assessExt");
}

async function nextRef() {
  const { db } = await collections();
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "assess" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `ASM-${String(c?.seq ?? 1).padStart(5, "0")}`;
}

export function blankExt(
  id: ObjectId,
  a: Pick<AssessmentDoc, "kind" | "support" | "discipline" | "consent">,
  ref: string,
): AssessExtDoc {
  const tpl = templatesFor(a.discipline, a.support)[0];
  return {
    _id: id,
    ref,
    caseCode: null,
    purpose: a.kind === "Reassessment" ? "Reassessment" : "Initial",
    purposeOther: "",
    templateId: tpl?.id ?? "custom",
    mode: "Home",
    modeOther: "",
    respondents: [],
    consent: a.consent.obtained ? "Obtained" : "Pending",
    photoConsent: "Pending",
    risk: "Unknown",
    riskNote: "",
    excluded: [],
    unable: {},
    custom: [],
    observations: [],
    measurements: [],
    scores: [],
    evidence: [],
    visits: [],
    report: null,
    outcome: "",
    outcomeNote: "",
    submitted: null,
    coSign: null,
    release: { state: "Not released", recipients: [], scope: [], by: null, at: null },
    history: [],
    dueAt: null,
  };
}

async function extFor(a: AssessmentDoc) {
  const col = await exts();
  const found = await col.findOne({ _id: a._id });
  if (found) return found;
  const fresh = blankExt(a._id, a, await nextRef());
  await col.insertOne(fresh).catch(() => undefined);
  return (await col.findOne({ _id: a._id })) ?? fresh;
}

/* ------------------------------------------------------------------ access (section 2) */

/** The clinical view of assessments, and co-signing: the assessments.view and assessments.cosign permissions. */
const canView = (u: UserDoc) => u.role === "admin" && can(u, "assessments.view");
const canCoSign = (u: UserDoc) => u.role === "admin" && can(u, "assessments.cosign");

function viewOf(
  u: UserDoc,
  a: AssessmentDoc,
): { view: "clinical" | "status" | "none"; edit: boolean } {
  if (u.role === "therapist") {
    if (u.therapistId?.equals(a.therapistId)) return { view: "clinical", edit: true };
    return { view: "none", edit: false };
  }
  if (u.role !== "admin") return { view: "none", edit: false };
  if (canView(u)) return { view: "clinical", edit: false };
  return { view: "status", edit: false };
}

/* ------------------------------------------------------------------ derived state */

function domainsOf(e: AssessExtDoc): Domain[] {
  const tpl = templateById(e.templateId);
  const ctx = contextDomains.filter((c) => c.when === e.mode);
  return [...essentialDomains, ...ctx, ...(tpl?.domains ?? [])];
}

function domainState(e: AssessExtDoc, key: string) {
  if (e.unable[key]) return "Unable to assess" as const;
  const obs = e.observations.filter((o) => o.domain === key && o.accepted);
  if (!obs.length) {
    // Essential sections are satisfied by the configuration itself.
    if (key === "identity" && e.respondents.length) return "Complete" as const;
    if (key === "consent" && e.consent !== "Pending") return "Complete" as const;
    if (key === "safety" && e.risk !== "Unknown") return "Complete" as const;
    return "Not started" as const;
  }
  const d = domainsOf(e).find((x) => x.key === key);
  const covered = new Set(obs.map((o) => o.item));
  return d && covered.size >= Math.min(2, d.items.length)
    ? ("Complete" as const)
    : ("Partial" as const);
}

function statusOf(a: AssessmentDoc, e: AssessExtDoc, coSignRequired: boolean): AssessStatus {
  if (a.status === "Cancelled") return "Cancelled";
  if (a.status === "Amended") return "Amended";
  if (a.status === "Signed") return coSignRequired && !e.coSign ? "Pending Review" : "Finalised";
  if (e.submitted) return "Pending Signature";
  if (e.visits.at(-1)?.paused) return "Paused";
  if (e.observations.length || e.measurements.length || e.scores.length) return "In Progress";
  if (e.respondents.length || e.risk !== "Unknown") return "Ready";
  return "Requested";
}

function blockersOf(e: AssessExtDoc, a: AssessmentDoc) {
  const out: string[] = [];
  if (e.consent === "Pending" || e.consent === "Declined")
    out.push(`Consent is ${e.consent.toLowerCase()}: record it before finalising.`);
  if (e.risk === "Unknown") out.push("Complete the risk and safety review.");
  if (e.risk === "Concern") out.push("A safety concern is open: escalate it or record the review.");
  const included = domainsOf(e).filter((d) => d.essential || !e.excluded.includes(d.key));
  for (const d of included) {
    if (domainState(e, d.key) === "Not started")
      out.push(`${d.title}: record findings or mark Unable to assess with a reason.`);
  }
  if (e.observations.some((o) => o.aiSuggested && !o.accepted))
    out.push("Review the AI-suggested observations: accept or discard each one.");
  if (!e.outcome) out.push("Choose the assessment outcome.");
  if (!e.report?.reviewedBy) out.push("Review the report draft before signing.");
  if (a.status !== "Draft" && a.status !== "In Progress") return [];
  return out;
}

async function load(id: ObjectId) {
  const db = await collections();
  const a = await db.assessments.findOne({ _id: id });
  if (!a) throw new UserFacingError("Assessment not found.", 404);
  const client = await db.clients.findOne({ _id: a.clientId });
  if (!client) throw new UserFacingError("Assessment not found.", 404);
  return { db, a, client };
}

async function coSignRequired(a: AssessmentDoc) {
  if (restrictedDisciplines.includes(a.discipline)) return true;
  const { therapists } = await collections();
  const t = await therapists.findOne({ _id: a.therapistId }, { projection: { seniority: 1 } });
  return t?.seniority === "Graduate";
}

/* ------------------------------------------------------------------ DTO */

export async function assessDetail(u: UserDoc, id: ObjectId): Promise<AssessDto> {
  const { db, a, client } = await load(id);
  const access = viewOf(u, a);
  if (access.view === "none") throw new UserFacingError("Assessment not found.", 404);
  const e = await extFor(a);
  const restricted = restrictedDisciplines.includes(a.discipline);
  const clinical = access.view === "clinical";
  const cs = await coSignRequired(a);
  const status = statusOf(a, e, cs);
  const domains = domainsOf(e).map((d) => ({
    ...d,
    included: Boolean(d.essential) || !e.excluded.includes(d.key),
    state: domainState(e, d.key),
    reason: e.unable[d.key]
      ? `${e.unable[d.key]!.reason}${e.unable[d.key]!.note ? `: ${e.unable[d.key]!.note}` : ""}`
      : "",
  }));
  const prev = await db.assessments.findOne(
    {
      _id: { $ne: a._id },
      clientId: a.clientId,
      support: a.support,
      status: { $in: ["Signed", "Amended"] },
      createdAt: { $lt: a.createdAt },
    },
    { sort: { createdAt: -1 } },
  );
  const prevExt = prev ? await (await exts()).findOne({ _id: prev._id }) : null;
  const next = await db.appointments.findOne(
    { clientId: a.clientId, needId: a.needId, status: "booked", start: { $gte: new Date() } },
    { sort: { start: 1 } },
  );
  const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
  return {
    id: a._id.toHexString(),
    ref: e.caseCode ? `${e.ref} · ${e.caseCode}` : e.ref,
    clientId: client._id.toHexString(),
    participant: client.name,
    participantId: client.mrn ?? "",
    support: a.support,
    discipline: a.discipline,
    clinician: a.therapistName,
    status,
    legacyStatus: a.status,
    purpose: e.purpose,
    purposeOther: e.purposeOther,
    templateId: e.templateId,
    templateTitle: templateById(e.templateId)?.title ?? "Custom",
    templateVersion: templateById(e.templateId)?.version ?? "1.0",
    mode: e.mode,
    modeOther: e.modeOther,
    respondents: clinical ? e.respondents : [],
    consent: e.consent,
    photoConsent: e.photoConsent,
    risk: clinical ? e.risk : e.risk === "Unknown" ? "Unknown" : "Reviewed",
    riskNote: clinical ? e.riskNote : "",
    domains: clinical ? domains : domains.map((d) => ({ ...d, items: [], reason: "" })),
    custom: clinical ? e.custom : [],
    observations: clinical ? e.observations.map((o) => ({ ...o, date: o.date.toISOString() })) : [],
    measurements: clinical ? e.measurements.map((m) => ({ ...m, date: m.date.toISOString() })) : [],
    scores: clinical ? e.scores.map((s) => ({ ...s, date: s.date.toISOString() })) : [],
    evidence: clinical ? e.evidence : [],
    visits: e.visits.map((v) => ({
      ...v,
      date: v.date.toISOString(),
      summary: clinical ? v.summary : "",
    })),
    report: clinical && e.report ? { ...e.report, at: e.report.at.toISOString() } : null,
    outcome: e.outcome,
    outcomeNote: clinical ? e.outcomeNote : "",
    coSign: { required: cs, by: e.coSign?.by ?? null, at: iso(e.coSign?.at) },
    release: { ...e.release, at: iso(e.release.at) },
    signed: a.signed ? { by: a.signed.byName, at: a.signed.at.toISOString() } : null,
    amendments: clinical
      ? a.amendments.map((m) => ({
          reason: m.reason,
          text: m.text,
          by: m.byName,
          at: m.at.toISOString(),
        }))
      : [],
    history: e.history
      .map((h) => ({ ...h, at: h.at.toISOString(), reason: clinical ? h.reason : "" }))
      .reverse(),
    blockers: blockersOf(e, a),
    baseline:
      clinical && prev && prevExt
        ? {
            ref: prevExt.ref,
            date: prev.createdAt.toISOString(),
            measurements: prevExt.measurements.map((m) => ({ ...m, date: m.date.toISOString() })),
            scores: prevExt.scores.map((s) => ({ ...s, date: s.date.toISOString() })),
          }
        : null,
    restricted,
    canEdit:
      access.edit && !["Finalised", "Amended", "Cancelled", "Pending Review"].includes(status),
    canCoSign: canCoSign(u) && cs && Boolean(a.signed) && !e.coSign,
    view: clinical ? "clinical" : "status",
    nextVisit: iso(next?.start),
    contacts: (client.contacts ?? [])
      .filter((c) => c.state === "Verified" && c.contactAllowed)
      .map((c) => `${c.name} (${c.role})`),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}

export async function assessQueue(
  u: UserDoc,
  clientId: ObjectId | null = null,
): Promise<AssessRow[]> {
  const db = await collections();
  const filter = {
    ...(u.role === "therapist" ? { therapistId: u.therapistId ?? new ObjectId() } : {}),
    ...(clientId ? { clientId } : {}),
  };
  const list = await db.assessments.find(filter).sort({ updatedAt: -1 }).limit(400).toArray();
  // The queue needs counts and states only; reports, histories and free text stay in the database.
  const extMap = new Map(
    (
      await (
        await exts()
      )
        .find(
          { _id: { $in: list.map((a) => a._id) } },
          {
            projection: {
              caseCode: 1,
              ref: 1,
              purpose: 1,
              mode: 1,
              risk: 1,
              dueAt: 1,
              outcome: 1,
              templateId: 1,
              excluded: 1,
              unable: 1,
              consent: 1,
              coSign: 1,
              submitted: 1,
              respondents: 1,
              // Only how many there are; an element keeps its place even without the field.
              "measurements.id": 1,
              "scores.id": 1,
              custom: 1,
              "observations.domain": 1,
              "observations.item": 1,
              "observations.accepted": 1,
              "observations.aiSuggested": 1,
              "visits.id": 1,
              "visits.paused": 1,
            },
          },
        )
        .toArray()
    ).map((e) => [e._id.toHexString(), e]),
  );
  const clients = new Map(
    (
      await db.clients
        .find({ _id: { $in: list.map((a) => a.clientId) } }, { projection: { name: 1, mrn: 1 } })
        .toArray()
    ).map((c) => [c._id.toHexString(), c]),
  );
  const rows: AssessRow[] = [];
  for (const a of list) {
    if (viewOf(u, a).view === "none") continue;
    let e = extMap.get(a._id.toHexString());
    if (!e) e = await extFor(a);
    const domains = domainsOf(e).filter((d) => d.essential || !e.excluded.includes(d.key));
    const done = domains.filter((d) =>
      ["Complete", "Unable to assess"].includes(domainState(e, d.key)),
    ).length;
    const c = clients.get(a.clientId.toHexString());
    rows.push({
      id: a._id.toHexString(),
      ref: e.caseCode ? `${e.ref} · ${e.caseCode}` : e.ref,
      participant: c?.name ?? "Participant",
      participantId: c?.mrn ?? "",
      clientId: a.clientId.toHexString(),
      support: a.support,
      discipline: a.discipline,
      clinician: a.therapistName,
      status: statusOf(a, e, restrictedDisciplines.includes(a.discipline)),
      purpose: e.purpose,
      mode: e.mode,
      risk: e.risk,
      due: e.dueAt?.toISOString() ?? null,
      progress: domains.length ? Math.round((done / domains.length) * 100) : 0,
      visits: e.visits.length,
      outcome: e.outcome,
      restricted: restrictedDisciplines.includes(a.discipline),
      updatedAt: a.updatedAt.toISOString(),
    });
  }
  return rows;
}

/** M12-001, M12-002: a new assessment episode from an accepted service, without duplicating the participant. */
export async function createAssess(
  u: UserDoc,
  clientId: ObjectId,
  needId: string,
  kind: "Initial" | "Reassessment",
) {
  const db = await collections();
  if (u.role !== "therapist" || !u.therapistId)
    throw new UserFacingError("Only the assigned therapist starts an assessment.", 409);
  const client = await db.clients.findOne({ _id: clientId });
  const need = client?.needs.find((n) => n.id === needId);
  if (!client || !need || !need.therapistId?.equals(u.therapistId))
    throw new UserFacingError("This service isn't assigned to you.", 409);
  const open = await db.assessments.findOne({
    clientId,
    needId,
    status: { $in: ["Draft", "In Progress"] },
  });
  if (open) return { id: open._id.toHexString() };
  const t = await db.therapists.findOne({ _id: u.therapistId });
  const now = new Date();
  const doc: AssessmentDoc = {
    _id: new ObjectId(),
    clientId,
    needId,
    therapistId: u.therapistId,
    therapistName: t?.name ?? u.name,
    support: need.support,
    discipline: need.discipline,
    kind,
    status: "Draft",
    consent: { obtained: false, notes: "" },
    sections: {},
    activities: [],
    findings: "",
    limitations: "",
    recommendation: { decision: "", notes: "" },
    released: null,
    signed: null,
    amendments: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.assessments.insertOne(doc);
  const e = blankExt(doc._id, doc, await nextRef());
  e.mode = (need.location as string) ?? "Home";
  e.history.push({ at: now, by: u.name, action: `Assessment started (${kind})`, reason: "" });
  await (await exts()).insertOne(e);
  await audit(u, `Started ${kind.toLowerCase()} ${need.support} assessment`, clientId);
  return { id: doc._id.toHexString() };
}

/* ------------------------------------------------------------------ actions */

export async function assessAction(u: UserDoc, id: ObjectId, action: AssessAction) {
  const { db, a, client } = await load(id);
  const access = viewOf(u, a);
  const e = await extFor(a);
  const col = await exts();
  const now = new Date();
  const set: Partial<AssessExtDoc> = {};
  let note = "";
  let reason = "";
  const cs = await coSignRequired(a);
  const status = statusOf(a, e, cs);

  if (action.type === "co-sign") {
    if (!canCoSign(u)) throw new UserFacingError("Only a Clinical Lead co-signs.", 409);
    if (!a.signed || e.coSign) throw new UserFacingError("Nothing to co-sign.", 409);
    set.coSign = { by: u.name, at: now };
    note = `Co-signed by ${u.name}`;
    reason = action.note;
  } else {
    if (!access.edit)
      throw new UserFacingError("Only the assessing therapist can change this assessment.", 409);
    const locked = ["Finalised", "Amended", "Cancelled", "Pending Review"].includes(status);
    const afterSign = ["release", "amend"].includes(action.type);
    if (locked && !afterSign)
      throw new UserFacingError("A signed assessment changes only by amendment.", 409);
    switch (action.type) {
      case "configure": {
        if (action.purpose === "Other" && action.purposeOther.length < 3)
          throw new UserFacingError("Explain the Other purpose.");
        if (action.mode === "Other" && action.modeOther.length < 3)
          throw new UserFacingError("Describe the Other location.");
        if (!templateById(action.templateId)) throw new UserFacingError("Choose a template.");
        Object.assign(set, {
          purpose: action.purpose,
          purposeOther: action.purposeOther,
          templateId: action.templateId,
          mode: action.mode,
          modeOther: action.modeOther,
          consent: action.consent,
          photoConsent: action.photoConsent,
          risk: action.risk,
          riskNote: action.riskNote,
        });
        note = `Plan set: ${action.purpose}, ${templateById(action.templateId)?.title}, ${action.mode}; consent ${action.consent}; risk ${action.risk}`;
        if ((action.risk === "Concern" || action.risk === "Escalated") && e.risk !== action.risk)
          await escalate(
            u,
            client,
            a,
            action.riskNote || "Safety concern recorded during assessment",
          );
        break;
      }
      case "respondent":
        set.respondents = [
          ...e.respondents,
          { id: randomUUID(), name: action.name, role: action.role, permission: action.permission },
        ];
        note = `Respondent added: ${action.name} (${action.role})`;
        break;
      case "domain": {
        const d = domainsOf(e).find((x) => x.key === action.key);
        if (d?.essential && !action.included)
          throw new UserFacingError(
            "Identity, consent, safety and the clinical summary can't be removed.",
            409,
          );
        set.excluded = action.included
          ? e.excluded.filter((k) => k !== action.key)
          : [...new Set([...e.excluded, action.key])];
        note = `${d?.title ?? action.key} ${action.included ? "included" : "removed from this assessment (data kept)"}`;
        break;
      }
      case "unable":
        if (action.reason === "Other" && action.note.length < 3)
          throw new UserFacingError("Explain why it couldn't be assessed.");
        if (action.note.length < 3 && action.reason !== "Not applicable")
          throw new UserFacingError("Add a short explanation.");
        set.unable = {
          ...e.unable,
          [action.key]: { reason: action.reason, note: action.note, by: u.name, at: now },
        };
        note = `Marked unable to assess: ${action.key} (${action.reason})`;
        reason = action.note;
        break;
      case "custom":
        set.custom = [
          ...e.custom,
          {
            id: randomUUID(),
            title: action.title,
            fields: action.fields.map((f) => ({ ...f, value: "" })),
          },
        ];
        note = `Custom section added: ${action.title}`;
        break;
      case "observe": {
        if (
          (action.result === "Not attempted" ||
            action.result === "Unable to assess" ||
            action.performance === "Not assessed") &&
          action.reason.length < 3
        ) {
          throw new UserFacingError("Give the reason it wasn't attempted or assessed.");
        }
        if (
          e.mode === "Telehealth" &&
          action.source === "Direct observation" &&
          !/remote|video/i.test(action.notes)
        ) {
          throw new UserFacingError(
            "This is a telehealth assessment: label the observation as remote (add 'remote' or 'video' to the note).",
          );
        }
        set.observations = [
          ...e.observations,
          {
            id: randomUUID(),
            domain: action.domain,
            item: action.item,
            source: action.source,
            performance: action.performance,
            context: action.context,
            frequency: action.frequency,
            result: action.result,
            quality: action.quality,
            notes: action.notes,
            reason: action.reason,
            date: now,
            author: u.name,
            visitId: e.visits.at(-1)?.id ?? null,
            aiSuggested: false,
            accepted: true,
          },
        ];
        note = `Observation: ${action.item} · ${action.performance} (${action.source})`;
        break;
      }
      case "measure": {
        // M12-024: a number needs its unit and method.
        if (/^-?\d+(\.\d+)?$/.test(action.value) && (!action.unit || !action.method)) {
          throw new UserFacingError("A numeric value needs its unit and the test method.");
        }
        set.measurements = [
          ...e.measurements,
          {
            id: randomUUID(),
            parameter: action.parameter,
            value: action.value,
            unit: action.unit,
            method: action.method,
            side: action.side,
            device: action.device,
            conditions: action.conditions,
            date: now,
            author: u.name,
            reported: action.reported,
          },
        ];
        note = `Measurement: ${action.parameter} ${action.value} ${action.unit} (${action.reported ? "reported" : "measured"})`;
        break;
      }
      case "score": {
        const tool = instruments.find((i) => i.id === action.instrument);
        if (!tool) throw new UserFacingError("Choose an instrument from the registry.");
        if (tool.licence === "Unknown")
          throw new UserFacingError(
            `${tool.name} is restricted for scoring until its licence is confirmed.`,
            409,
          );
        set.scores = [
          ...e.scores,
          {
            id: randomUUID(),
            instrument: tool.name,
            version: action.version || tool.edition,
            score: action.score,
            domain: action.domain,
            assessor: u.name,
            date: now,
            notes: action.notes,
            restricted: false,
          },
        ];
        note = `Score: ${tool.name} ${action.score} (manual entry; no automatic interpretation)`;
        break;
      }
      case "evidence": {
        if (action.evidenceType === "Photo" && e.photoConsent !== "Obtained")
          throw new UserFacingError(
            "Photo capture isn't available: photo consent isn't obtained.",
            409,
          );
        set.evidence = [
          ...e.evidence,
          {
            id: randomUUID(),
            type: action.evidenceType,
            caption: action.caption,
            date: action.date,
            sensitivity: action.sensitivity,
            sharing: action.sharing,
            consent: action.evidenceType === "Photo" ? "Obtained" : "Not required",
            author: u.name,
            domain: action.domain,
          },
        ];
        note = `Evidence: ${action.evidenceType} · ${action.caption}`;
        break;
      }
      case "visit": {
        set.visits = [
          ...e.visits,
          {
            id: randomUUID(),
            date: now,
            location: action.location,
            author: u.name,
            summary: action.summary,
            paused: action.paused,
            outstanding: action.outstanding,
          },
        ];
        note = action.paused ? `Visit saved and paused: ${action.paused}` : "Visit recorded";
        if (action.outstanding.length) {
          // M12-048: continuation becomes a booking task, never a false completion.
          await continuation(u, client, a, action.outstanding);
        }
        break;
      }
      case "accept-observation":
        set.observations = e.observations.map((o) =>
          o.id === action.id
            ? { ...o, accepted: true, author: `${u.name} (accepted AI suggestion)` }
            : o,
        );
        note = "Accepted an AI-suggested observation";
        break;
      case "discard-observation": {
        const o = e.observations.find((x) => x.id === action.id);
        if (!o?.aiSuggested || o.accepted)
          throw new UserFacingError("Only an unaccepted AI suggestion can be discarded.", 409);
        set.observations = e.observations.filter((x) => x.id !== action.id);
        note = `Discarded an AI suggestion: ${o.item}`;
        break;
      }
      case "ai-report": {
        const out = await aiReport(e, a, client.name);
        set.report = {
          text: out.text,
          sections: out.sections,
          at: now,
          aiDrafted: true,
          reviewedBy: null,
          aiDisclosure: true,
        };
        if (out.suggested.length) {
          set.observations = [
            ...e.observations,
            ...out.suggested.map((s) => ({
              id: randomUUID(),
              domain: s.domain,
              item: s.item,
              source: "Other",
              performance: "Not assessed",
              context: e.mode === "Telehealth" ? "Telehealth" : "Home",
              frequency: "Unknown",
              result: "Unable to assess",
              quality: "Documented historical",
              notes: s.note,
              reason: "Suggested from visit notes; needs clinician acceptance",
              date: now,
              author: "AI suggestion",
              visitId: null,
              aiSuggested: true,
              accepted: false,
            })),
          ];
        }
        note = "AI report draft prepared (needs review)";
        break;
      }
      case "review-report":
        set.report = {
          ...(e.report ?? { sections: [], aiDrafted: false, aiDisclosure: false }),
          text: action.text,
          at: now,
          reviewedBy: u.name,
        };
        note = "Report reviewed and edited by the clinician";
        break;
      case "outcome":
        set.outcome = action.outcome;
        set.outcomeNote = action.note;
        note = `Outcome: ${action.outcome}`;
        reason = action.note;
        break;
      case "submit": {
        const blockers = blockersOf(e, a);
        if (blockers.length)
          throw new UserFacingError(`Before signing: ${blockers.slice(0, 3).join(" ")}`, 409);
        set.submitted = { by: u.name, at: now };
        note = "Ready for signature";
        break;
      }
      case "sign": {
        const blockers = blockersOf(e, a);
        if (blockers.length)
          throw new UserFacingError(`Before signing: ${blockers.slice(0, 3).join(" ")}`, 409);
        const decision = (
          {
            "Report only": "Report only",
            "Treatment recommendation": "Treatment",
            "Further assessment": "Further assessment",
            "Referral onward": "Referral to another service",
            "No further service": "Report only",
            "Pause / not suitable": "Further assessment",
            Discharge: "Discharge",
          } as const
        )[e.outcome as Outcome];
        await db.assessments.updateOne(
          { _id: a._id },
          {
            $set: {
              status: "Signed",
              signed: { byName: u.name, at: now },
              consent: { obtained: e.consent === "Obtained", notes: e.consent },
              findings: e.report?.text ?? "",
              recommendation: { decision, notes: e.outcomeNote },
              updatedAt: now,
            },
          },
        );
        await routeOutcome(u, client, a, e.outcome as Outcome);
        note = `Signed by ${u.name}${cs ? " (co-sign required)" : ""}; outcome ${e.outcome}`;
        break;
      }
      case "release": {
        if (!a.signed) throw new UserFacingError("Sign the assessment before releasing it.", 409);
        if (cs && !e.coSign)
          throw new UserFacingError("Waiting for the Clinical Lead's co-signature.", 409);
        if (action.state === "Shared" && !action.recipients.length)
          throw new UserFacingError("Choose at least one authorised recipient.");
        set.release = {
          state: action.state,
          recipients: action.recipients,
          scope: action.scope,
          by: u.name,
          at: now,
        };
        if (action.state === "Shared") {
          await db.assessments.updateOne(
            { _id: a._id },
            {
              $set: {
                released: { summary: e.report?.text.slice(0, 1200) ?? "", byName: u.name, at: now },
              },
            },
          );
        }
        note = `Report ${action.state.toLowerCase()}${action.recipients.length ? `: ${action.recipients.join(", ")}` : ""}`;
        break;
      }
      case "amend": {
        if (!a.signed)
          throw new UserFacingError(
            "Edit the draft directly; amendments are for signed assessments.",
            409,
          );
        await db.assessments.updateOne(
          { _id: a._id },
          {
            $set: { status: "Amended", updatedAt: now },
            $push: {
              amendments: { reason: action.reason, text: action.text, byName: u.name, at: now },
            },
          },
        );
        note = `Addendum: ${action.reason}`;
        reason = action.reason;
        break;
      }
      case "cancel": {
        if (a.signed)
          throw new UserFacingError(
            "A signed assessment can't be cancelled; add an addendum instead.",
            409,
          );
        await db.assessments.updateOne(
          { _id: a._id },
          { $set: { status: "Cancelled", updatedAt: now } },
        );
        note = "Assessment cancelled (no completed-service billing)";
        reason = action.reason;
        break;
      }
    }
  }
  await col.updateOne(
    { _id: a._id },
    { $set: set, $push: { history: { at: now, by: u.name, action: note, reason } } },
  );
  if (action.type !== "sign" && action.type !== "amend" && action.type !== "cancel") {
    await db.assessments.updateOne(
      { _id: a._id },
      { $set: { updatedAt: now, ...(a.status === "Draft" ? { status: "In Progress" } : {}) } },
    );
  }
  await audit(u, `Assessment ${e.ref}: ${note}`, client._id);
  const { users } = await collections();
  const ids = (
    await users
      .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
      .toArray()
  ).map((x) => x._id);
  await publish(ids, "care", {
    clientId: client._id.toHexString(),
    assessment: a._id.toHexString(),
  });
  return { ok: true };
}

/* ------------------------------------------------------------------ hand-offs (sections 12 and 15) */

async function leadUser() {
  const { users } = await collections();
  return (
    (await users.findOne({
      role: "admin",
      staffRoles: { $all: ["Clinical Lead"], $nin: ["Super Admin"] },
    })) ?? (await users.findOne({ role: "admin", staffRoles: "Clinical Lead" }))
  );
}

function taskBase(client: ClientDoc, a: AssessmentDoc) {
  return {
    urgentReason: "",
    related: {
      kind: "Assessment" as const,
      ref: `${a.support}`,
      label: client.name,
      href: `/care/assessments/${a._id.toHexString()}`,
    },
    clientId: client._id,
    referralId: null,
    appointmentId: null,
    participant: client.name,
    service: a.support,
    discipline: a.discipline,
    locationType: null,
    sla: "Standard" as const,
    source: "Rule" as const,
    ruleCode: "AUT-12",
    ruleVersion: 1,
    idemKey: null,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
  };
}

async function escalate(u: UserDoc, client: ClientDoc, a: AssessmentDoc, detail: string) {
  const lead = await leadUser();
  await insertTask(u, {
    ...taskBase(client, a),
    title: `Assessment safety review: ${client.name} (${a.support})`,
    category: "Clinical Review",
    status: lead ? "Assigned" : "New",
    priority: "High",
    team: "Clinical",
    assigneeId: lead?._id ?? null,
    assigneeName: lead?.name ?? null,
    dueAt: new Date(Date.now() + 4 * 3_600_000),
    sla: "Clinical Escalation",
    visibility: "Clinical Restricted",
    restrictedNote: detail,
    source: "Manual",
    ruleCode: null,
    ruleVersion: null,
    checklist: [
      { label: "Review the safety finding" },
      { label: "Record the decision before the assessment is finalised" },
    ],
    historyNote: "Raised from the assessment workspace",
  });
}

async function continuation(
  u: UserDoc,
  client: ClientDoc,
  a: AssessmentDoc,
  outstanding: string[],
) {
  await insertTask(u, {
    ...taskBase(client, a),
    title: `Book assessment continuation: ${client.name} (${a.support})`,
    category: "Scheduling",
    status: "New",
    priority: "Normal",
    team: "Scheduling",
    assigneeId: null,
    assigneeName: null,
    dueAt: new Date(Date.now() + 2 * 86_400_000),
    visibility: "Internal",
    checklist: [{ label: "Offer a continuation visit" }],
    note: `Outstanding: ${outstanding.join(", ")}`,
    historyNote: "Assessment paused with outstanding sections",
  });
}

async function routeOutcome(u: UserDoc, client: ClientDoc, a: AssessmentDoc, outcome: Outcome) {
  const db = await collections();
  if (outcome === "Report only" || outcome === "No further service") {
    await db.clients.updateOne(
      { _id: client._id, "needs.id": a.needId },
      { $set: { "needs.$.status": "completed" } },
    );
    await insertTask(u, {
      ...taskBase(client, a),
      title: `Release ${a.support} report and confirm billing: ${client.name}`,
      category: "Documentation",
      status: "New",
      priority: "Normal",
      team: "Intake",
      assigneeId: null,
      assigneeName: null,
      dueAt: new Date(Date.now() + 2 * 86_400_000),
      visibility: "Internal",
      checklist: [
        { label: "Confirm the release decision" },
        { label: "Confirm the completed service is ready for billing" },
      ],
      historyNote: "Assessment-only service closed",
    });
  } else if (outcome === "Treatment recommendation") {
    // M12-049: a proposed plan, never automatically active.
    await startPlan(u, { clientId: client._id, needId: a.needId }).catch(() => undefined);
  } else if (outcome === "Further assessment") {
    await continuation(u, client, a, ["Further assessment visit"]);
  } else if (outcome === "Referral onward") {
    await insertTask(u, {
      ...taskBase(client, a),
      title: `Refer onward: ${client.name} (${a.support})`,
      category: "Care Coordination",
      status: "New",
      priority: "Normal",
      team: "Operations",
      assigneeId: null,
      assigneeName: null,
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      visibility: "Internal",
      checklist: [
        { label: "Confirm sharing consent" },
        { label: "Send the authorised summary to the receiving service" },
      ],
      historyNote: "Referral onward from assessment",
    });
  } else if (outcome === "Pause / not suitable" || outcome === "Discharge") {
    await insertTask(u, {
      ...taskBase(client, a),
      title: `${outcome}: ${client.name} (${a.support})`,
      category: "Care Coordination",
      status: "New",
      priority: "Normal",
      team: "Intake",
      assigneeId: null,
      assigneeName: null,
      dueAt: new Date(Date.now() + 3 * 86_400_000),
      visibility: "Internal",
      checklist: [{ label: "Tell the participant (operational status only)" }],
      historyNote: "Outcome from assessment",
    });
  }
}

/* ------------------------------------------------------------------ AI (section 13) */

async function aiReport(e: AssessExtDoc, a: AssessmentDoc, name: string) {
  const facts = [
    `Purpose: ${e.purpose}; location ${e.mode}; consent ${e.consent}; risk review ${e.risk}`,
    ...e.observations
      .filter((o) => o.accepted)
      .map(
        (o, i) =>
          `[O${i + 1}] ${o.domain} · ${o.item}: ${o.performance}, ${o.result}, source ${o.source}, context ${o.context}. ${o.notes}`,
      ),
    ...e.measurements.map(
      (m, i) =>
        `[M${i + 1}] ${m.parameter} ${m.value} ${m.unit}, method ${m.method}${m.reported ? " (reported, not measured)" : ""}`,
    ),
    ...e.scores.map(
      (s, i) =>
        `[S${i + 1}] ${s.instrument} ${s.version}: ${s.score} (manual entry, no interpretation)`,
    ),
    ...e.visits.map(
      (v, i) =>
        `[V${i + 1}] Visit ${v.location}: ${v.summary}${v.paused ? ` Paused: ${v.paused}` : ""}`,
    ),
    ...Object.entries(e.unable).map(([k, v]) => `[U:${k}] Unable to assess: ${v.reason} ${v.note}`),
  ];
  try {
    const out = await generateJson("assessment-report", {
      system:
        "You draft an allied health assessment report for the treating clinician to review. Use only the documented facts; cite the bracketed tag for every statement. Keep participant reports distinct from direct observation. State limitations. Never diagnose, never interpret scores beyond what is written, never recommend food or fluid textures, never assign risk severity. Also list up to three observations that the visit notes mention but that are not yet recorded as observations; these become suggestions the clinician must accept.",
      user: `Participant: ${name}. Service: ${a.support} (${a.discipline}).\n${facts.join("\n")}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text", "sections", "suggested"],
        properties: {
          text: { type: "string" },
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["heading", "body", "cites"],
              properties: {
                heading: { type: "string" },
                body: { type: "string" },
                cites: { type: "array", items: { type: "string" } },
              },
            },
          },
          suggested: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["domain", "item", "note"],
              properties: {
                domain: { type: "string" },
                item: { type: "string" },
                note: { type: "string" },
              },
            },
          },
        },
      },
      schemaName: "assessment_report",
      maxTokens: 1600,
    });
    const parsed = JSON.parse(out.text) as {
      text: string;
      sections: ReportDto["sections"];
      suggested: { domain: string; item: string; note: string }[];
    };
    return {
      text: parsed.text,
      sections: parsed.sections.slice(0, 8),
      suggested: parsed.suggested.slice(0, 3),
    };
  } catch (error) {
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

export type { MeasurementDto, ScoreDto };
