import "server-only";
import { randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  measuresIn,
  templates,
  type DocAction,
  type DocFull,
  type DocOption,
  type DocRow,
  type DocSection,
  type DocStatus,
  type NoteType,
  type SourceItem,
  type TranscriptSeg,
  type Warning,
} from "@/lib/live/docs";
import { restrictedDisciplines } from "@/lib/live/records";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit, publish } from "./live";
import type { AppointmentDoc, ClientDoc, UserDoc } from "./models";
import { insertTask } from "./operations";

/* ------------------------------------------------------------------ storage */

export interface ClinicalDocDoc {
  _id: ObjectId;
  ref: string;
  clientId: ObjectId;
  needId: string;
  therapistId: ObjectId;
  discipline: string;
  appointmentId: ObjectId | null;
  unlinkedReason: string;
  noteType: NoteType;
  capture: string;
  mode: string;
  encounterAt: Date;
  status: DocStatus;
  observations: string;
  dictation: { seconds: number; language: string };
  transcript: TranscriptSeg[];
  consents: { recording: string; ai: string; sharing: string };
  selected: string[];
  sections: DocSection[];
  warnings: Warning[];
  reviewedAck: boolean;
  signed: { by: string; at: Date } | null;
  supervised: boolean;
  coSign: {
    status: "Not required" | "Pending" | "Changes requested" | "Approved";
    note: string;
    by: string;
    at: Date | null;
  };
  addenda: { reason: string; text: string; by: string; at: Date }[];
  shares: { recipient: string; summary: string; by: string; at: Date }[];
  offline: {
    state: "Synced" | "Unsynced draft" | "Conflict";
    conflict: { section: string; mobile: string; web: string } | null;
  };
  /** Extra source text a scenario carries (an earlier measure, a draft claim) for the review flow. */
  extraSources: SourceItem[];
  aiAt: Date | null;
  timeline: { at: Date; by: string; action: string; reason: string }[];
  createdAt: Date;
  seeded?: boolean;
}

export async function docCol() {
  const { db } = await collections();
  return db.collection<ClinicalDocDoc>("clinicalDocs");
}

export async function nextDocRef() {
  const { db } = await collections();
  const c = await db
    .collection<{ _id: string; seq: number }>("counters")
    .findOneAndUpdate(
      { _id: "clinicalDoc" },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
  return `DOC-${String(c?.seq ?? 1).padStart(5, "0")}`;
}

export function blankSections(type: NoteType): DocSection[] {
  return templates[type].map((s) => ({
    ...s,
    text: "",
    origin: "clinician",
    state: "clinician",
    cites: [],
  }));
}

/* ------------------------------------------------------------------ access */

const has = (u: UserDoc, ...roles: string[]) =>
  Boolean(u.staffRoles?.some((r) => roles.includes(r)));
const isLead = (u: UserDoc) => u.role === "admin" && has(u, "Clinical Lead", "Super Admin");
const SUPERVISOR = "Helen Brooks";

function viewOf(u: UserDoc, d: ClinicalDocDoc): DocFull["view"] | "none" {
  if (u.role === "therapist") return u.therapistId?.equals(d.therapistId) ? "edit" : "none";
  if (u.role !== "admin") return "none";
  // Supervisors review supervised notes; nobody gets blanket access to psychology or trauma notes.
  if (isLead(u) && (d.supervised || !restrictedDisciplines.includes(d.discipline)))
    return "supervisor";
  return "status";
}

const overdueOf = (d: Pick<ClinicalDocDoc, "status" | "encounterAt">) =>
  !["Signed", "Addendum"].includes(d.status) &&
  Date.now() - d.encounterAt.getTime() > 2 * 86_400_000;

function priorityOf(d: ClinicalDocDoc): DocRow["priority"] {
  if (d.warnings.some((w) => w.kind === "Risk" && !w.resolved)) return "Escalated";
  if (overdueOf(d)) return "Overdue";
  if (
    !["Signed", "Addendum"].includes(d.status) &&
    Date.now() - d.encounterAt.getTime() > 86_400_000
  )
    return "Due Soon";
  return "Routine";
}

/* ------------------------------------------------------------------ list and wizard */

export async function docList(u: UserDoc): Promise<DocRow[]> {
  const db = await collections();
  const col = await docCol();
  const q = u.role === "therapist" ? { therapistId: u.therapistId ?? new ObjectId() } : {};
  if (u.role !== "therapist" && u.role !== "admin") return [];
  const docs = await col.find(q).sort({ encounterAt: -1 }).limit(600).toArray();
  const clients = await db.clients
    .find({ _id: { $in: docs.map((d) => d.clientId) } }, { projection: { name: 1, mrn: 1 } })
    .toArray();
  const ther = await db.therapists.find({}, { projection: { name: 1 } }).toArray();
  return docs
    .filter((d) => viewOf(u, d) !== "none")
    .map((d) => {
      const c = clients.find((x) => x._id.equals(d.clientId));
      return {
        id: d._id.toHexString(),
        ref: d.ref,
        participant: c?.name ?? "Participant",
        participantId: c?.mrn ?? "",
        discipline: d.discipline,
        clinician: ther.find((t) => t._id.equals(d.therapistId))?.name ?? "",
        noteType: d.noteType,
        capture: d.capture,
        mode: d.mode,
        status: d.status,
        encounterAt: d.encounterAt.toISOString(),
        overdue: overdueOf(d),
        priority: priorityOf(d),
        restricted: restrictedDisciplines.includes(d.discipline),
        warnings: d.warnings.filter((w) => !w.resolved).length,
        aiUsed: d.sections.some((s) => s.origin === "ai"),
        supervised: d.supervised,
      };
    });
}

export async function docOptions(u: UserDoc): Promise<DocOption[]> {
  if (u.role !== "therapist" || !u.therapistId) return [];
  const db = await collections();
  const tid = u.therapistId;
  const clients = await db.clients.find({ "needs.therapistId": tid }).toArray();
  const appts = await db.appointments
    .find({
      therapistId: tid,
      start: {
        $gte: new Date(Date.now() - 21 * 86_400_000),
        $lte: new Date(Date.now() + 86_400_000),
      },
      status: { $in: ["completed", "booked"] },
    })
    .sort({ start: -1 })
    .toArray();
  return clients.flatMap((c) =>
    c.needs
      .filter((n) => n.therapistId?.equals(tid))
      .map((n) => ({
        clientId: c._id.toHexString(),
        participant: c.name,
        participantId: c.mrn ?? "",
        needId: n.id,
        discipline: n.discipline,
        appointments: appts
          .filter((a) => a.clientId.equals(c._id) && (!a.needId || a.needId === n.id))
          .slice(0, 6)
          .map((a) => ({
            id: a._id.toHexString(),
            ref: a.ref ?? "",
            when: a.start.toISOString(),
            mode: a.modality === "Telehealth" ? "Telehealth" : (a.site?.location ?? "Home"),
          })),
      })),
  );
}

function modeOfAppt(a: AppointmentDoc | null): string {
  if (!a) return "Other";
  if (a.modality === "Telehealth") return "Telehealth";
  const l = a.site?.location ?? "Home";
  return l === "Other community location" ? "Community" : l;
}

export async function createDoc(
  u: UserDoc,
  input: {
    clientId: string;
    needId: string;
    appointmentId: string;
    unlinkedReason: string;
    noteType: NoteType;
    capture: string;
  },
) {
  if (u.role !== "therapist" || !u.therapistId)
    throw new UserFacingError("Only a treating therapist creates notes.", 409);
  const db = await collections();
  const client = await db.clients.findOne({ _id: new ObjectId(input.clientId) });
  const need = client?.needs.find((n) => n.id === input.needId);
  if (!client || !need || !need.therapistId?.equals(u.therapistId))
    throw new UserFacingError("Choose one of your assigned participants.", 409);
  let appt: AppointmentDoc | null = null;
  if (input.appointmentId) {
    appt = await db.appointments.findOne({ _id: new ObjectId(input.appointmentId) });
    // Patient, episode and appointment must agree before anything is written (AT-05).
    if (!appt || !appt.clientId.equals(client._id) || (appt.needId && appt.needId !== need.id))
      throw new UserFacingError(
        "That appointment belongs to another participant or service. Check the selection.",
        409,
      );
  } else if (input.unlinkedReason.length < 5 && input.noteType !== "Discharge summary draft") {
    throw new UserFacingError("Choose the appointment, or say why this note isn't linked to one.");
  }
  const now = new Date();
  const doc: ClinicalDocDoc = {
    _id: new ObjectId(),
    ref: await nextDocRef(),
    clientId: client._id,
    needId: need.id,
    therapistId: u.therapistId,
    discipline: need.discipline,
    appointmentId: appt?._id ?? null,
    unlinkedReason: input.unlinkedReason,
    noteType: input.noteType,
    capture: input.capture,
    mode: modeOfAppt(appt),
    encounterAt: appt?.start ?? now,
    status: "Capturing",
    observations: "",
    dictation: { seconds: 0, language: "English (Australia)" },
    transcript: [],
    consents: {
      recording: modeOfAppt(appt) === "Telehealth" ? "Pending" : "Not required",
      ai: "Pending",
      sharing: "Pending",
    },
    selected: [],
    sections: blankSections(input.noteType),
    warnings: [],
    reviewedAck: false,
    signed: null,
    supervised: false,
    coSign: { status: "Not required", note: "", by: "", at: null },
    addenda: [],
    shares: [],
    offline: { state: "Synced", conflict: null },
    extraSources: [],
    aiAt: null,
    timeline: [
      {
        at: now,
        by: u.name,
        action: `Note created: ${input.noteType}, ${input.capture.toLowerCase()}`,
        reason: "",
      },
    ],
    createdAt: now,
  };
  await (await docCol()).insertOne(doc);
  await audit(u, `Started ${doc.ref} (${input.noteType})`, client._id);
  return { id: doc._id.toHexString() };
}

/* ------------------------------------------------------------------ sources */

async function sourcesFor(d: ClinicalDocDoc, client: ClientDoc): Promise<SourceItem[]> {
  const db = await collections();
  const out: SourceItem[] = [];
  const day = (x: Date) => x.toISOString();
  if (d.observations.trim())
    out.push({
      id: "obs",
      kind: "Observation",
      label: "Your typed observations",
      text: d.observations,
      date: day(d.encounterAt),
      reported: "Observed",
    });
  for (const s of d.transcript)
    out.push({
      id: `tr:${s.id}`,
      kind: "Transcript",
      label: `Transcript ${Math.floor(s.at / 60)}:${String(s.at % 60).padStart(2, "0")} · ${s.speaker}`,
      text: s.uncertain && !s.corrected ? `${s.text} [uncertain]` : s.text,
      date: day(d.encounterAt),
      reported:
        s.speaker === "Clinician"
          ? "Observed"
          : s.speaker === "Participant"
            ? "Participant-reported"
            : "Carer or teacher-reported",
    });
  if (d.appointmentId) {
    const ext = await db.db
      .collection<{
        _id: ObjectId;
        interventions: {
          id: string;
          activity: string;
          result: string;
          unit: string;
          method: string;
          support: string;
          response: string;
          narrative: string;
          source: string;
          at: Date;
        }[];
      }>("sessionExt")
      .findOne({ _id: d.appointmentId });
    for (const i of ext?.interventions ?? [])
      out.push({
        id: `act:${i.id}`,
        kind: "Session activity",
        label: i.activity,
        text: `${i.result ? `${i.result} ${i.unit}`.trim() + "; " : ""}${i.method ? i.method + "; " : ""}${i.support ? i.support + "; " : ""}response ${i.response}. ${i.narrative}`,
        date: day(i.at),
        reported:
          i.source === "Observed"
            ? "Observed"
            : i.source === "Patient-reported"
              ? "Participant-reported"
              : "Carer or teacher-reported",
      });
  }
  const prev = await db.appointments
    .find({
      clientId: d.clientId,
      discipline: d.discipline as AppointmentDoc["discipline"],
      "note.signedAt": { $ne: null },
      start: { $lt: d.encounterAt },
    })
    .sort({ start: -1 })
    .limit(2)
    .toArray();
  for (const p of prev)
    if (p.note?.text)
      out.push({
        id: `note:${p._id.toHexString()}`,
        kind: "Signed note",
        label: `Signed note, ${p.start.toISOString().slice(0, 10)}`,
        text: p.note.text.slice(0, 700),
        date: day(p.start),
        reported: "Recorded",
      });
  const assess = await db.assessments
    .find({ clientId: d.clientId, needId: d.needId })
    .sort({ createdAt: -1 })
    .limit(1)
    .toArray();
  if (assess[0]) {
    const ax = await db.db
      .collection<{
        _id: ObjectId;
        measurements: {
          id: string;
          parameter: string;
          value: string;
          unit: string;
          method: string;
          date: Date;
          reported: boolean;
        }[];
      }>("assessExt")
      .findOne({ _id: assess[0]._id });
    for (const m of ax?.measurements ?? [])
      out.push({
        id: `meas:${m.id}`,
        kind: "Assessment value",
        label: m.parameter,
        text: `${m.parameter}: ${m.value} ${m.unit} (${m.method})`,
        date: day(m.date),
        reported: m.reported ? "Participant-reported" : "Observed",
      });
  }
  void client;
  return [...out, ...d.extraSources];
}

/** Rules that check the sources and the draft; AI never resolves them. */
function ruleWarnings(d: ClinicalDocDoc, sources: SourceItem[]): Warning[] {
  const selected = sources.filter((s) => d.selected.includes(s.id));
  const keep = (id: string) => d.warnings.find((w) => w.id === id);
  const out: Warning[] = [];
  // Contradictory measures in the chosen sources (scenario 6, AT-18).
  const byUnit = new Map<string, { value: number; label: string }[]>();
  for (const s of selected)
    for (const m of measuresIn(s.text)) {
      if (["min", "s"].includes(m.unit)) continue;
      const list = byUnit.get(m.unit) ?? [];
      list.push({ value: m.value, label: s.label });
      byUnit.set(m.unit, list);
    }
  for (const [unit, list] of byUnit) {
    const values = [...new Set(list.map((x) => x.value))];
    if (values.length > 1 && unit === "m") {
      const id = `conflict:${unit}:${values.sort().join("-")}`;
      out.push(
        keep(id) ?? {
          id,
          kind: "Conflict",
          text: `Sources disagree: ${list.map((x) => `${x.value} ${unit} (${x.label})`).join(" vs ")}. Choose which is correct before signing.`,
          resolved: false,
          resolution: "",
        },
      );
    }
  }
  // Uncertain transcript wording is never turned into certainty (AT-19).
  for (const s of d.transcript.filter((x) => x.uncertain && !x.corrected)) {
    const id = `uncertain:${s.id}`;
    out.push(
      keep(id) ?? {
        id,
        kind: "Uncertain",
        text: `Uncertain transcript at ${Math.floor(s.at / 60)}:${String(s.at % 60).padStart(2, "0")}: "${s.text}". Correct or confirm it.`,
        resolved: false,
        resolution: "",
      },
    );
  }
  // Diagnoses or risk words in the draft that no chosen source contains (scenario 9).
  const src = selected.map((s) => s.text.toLowerCase()).join(" ");
  for (const sec of d.sections.filter((x) => x.origin === "ai" && x.state !== "rejected")) {
    for (const term of sec.text.match(
      /\b(diagnos\w*|disorder|syndrome|dementia|depression|autism|adhd|stroke|fracture)\b/gi,
    ) ?? []) {
      if (src.includes(term.toLowerCase())) continue;
      const id = `unsupported:${sec.key}:${term.toLowerCase()}`;
      out.push(
        keep(id) ?? {
          id,
          kind: "Unsupported",
          text: `"${term}" in ${sec.title} isn't in any chosen source. Delete it or add the source.`,
          resolved: false,
          resolution: "",
        },
      );
    }
  }
  if (/self.?harm|suicid|abuse|fall(s|en)? (at|in)|choking/i.test(src)) {
    const id = "risk:mentioned";
    out.push(
      keep(id) ?? {
        id,
        kind: "Risk",
        text: "A clinical risk is mentioned in the sources. Review and escalate if needed; nothing is resolved automatically.",
        resolved: false,
        resolution: "",
      },
    );
  }
  return [
    ...out,
    ...d.warnings.filter((w) => w.kind === "Mismatch" && !out.some((o) => o.id === w.id)),
  ];
}

function blockersOf(d: ClinicalDocDoc): string[] {
  const out: string[] = [];
  for (const s of d.sections)
    if (s.required && s.state !== "rejected" && s.text.trim().length < 3)
      out.push(`${s.title} is required`);
  for (const s of d.sections.filter((x) => x.origin === "ai" && x.state === "pending"))
    out.push(`Accept, edit or reject the AI ${s.title} section`);
  for (const w of d.warnings.filter((x) => !x.resolved))
    out.push(`${w.kind}: resolve before signing`);
  if (d.offline.state === "Conflict") out.push("Resolve the edit conflict between phone and web");
  if (!d.reviewedAck) out.push("Confirm you reviewed and verified this note");
  return [...new Set(out)];
}

/* ------------------------------------------------------------------ detail */

async function load(id: ObjectId) {
  const db = await collections();
  const d = await (await docCol()).findOne({ _id: id });
  if (!d) throw new UserFacingError("Note not found.", 404);
  const client = await db.clients.findOne({ _id: d.clientId });
  if (!client) throw new UserFacingError("Note not found.", 404);
  const t = await db.therapists.findOne({ _id: d.therapistId }, { projection: { name: 1 } });
  const appt = d.appointmentId ? await db.appointments.findOne({ _id: d.appointmentId }) : null;
  return { db, d, client, clinician: t?.name ?? "Treating clinician", appt };
}

export async function docDetail(u: UserDoc, id: ObjectId): Promise<DocFull> {
  const { d, client, clinician, appt } = await load(id);
  const v = viewOf(u, d);
  if (v === "none") throw new UserFacingError("Note not found.", 404);
  const clinical = v !== "status";
  const sources = clinical ? await sourcesFor(d, client) : [];
  return {
    id: d._id.toHexString(),
    ref: d.ref,
    view: v,
    participant: client.name,
    participantId: client.mrn ?? "",
    discipline: d.discipline,
    clinician,
    noteType: d.noteType,
    capture: d.capture,
    mode: d.mode,
    encounterAt: d.encounterAt.toISOString(),
    appointment: appt
      ? { id: appt._id.toHexString(), ref: appt.ref ?? "", when: appt.start.toISOString() }
      : null,
    unlinkedReason: d.unlinkedReason,
    status: d.status,
    overdue: overdueOf(d),
    restricted: restrictedDisciplines.includes(d.discipline),
    observations: clinical ? d.observations : "",
    dictation: d.dictation,
    transcript: clinical ? d.transcript : [],
    consents: d.consents,
    sources,
    selected: d.selected,
    sections: clinical ? d.sections : d.sections.map((s) => ({ ...s, text: "", cites: [] })),
    warnings: clinical ? d.warnings : [],
    reviewedAck: d.reviewedAck,
    signed: d.signed ? { by: d.signed.by, at: d.signed.at.toISOString() } : null,
    coSign: {
      required: d.supervised,
      supervisor: SUPERVISOR,
      status: d.coSign.status,
      note: clinical ? d.coSign.note : "",
      at: d.coSign.at?.toISOString() ?? null,
    },
    addenda: clinical ? d.addenda.map((a) => ({ ...a, at: a.at.toISOString() })) : [],
    shares: d.shares.map((s) => ({
      ...s,
      summary: clinical ? s.summary : "",
      at: s.at.toISOString(),
    })),
    offline: clinical ? d.offline : { state: d.offline.state, conflict: null },
    aiAt: d.aiAt?.toISOString() ?? null,
    blockers: v === "edit" ? blockersOf(d) : [],
    timeline: d.timeline
      .map((h) => ({
        at: h.at.toISOString(),
        by: h.by,
        action: h.action,
        reason: clinical ? h.reason : "",
      }))
      .reverse(),
    canEdit: v === "edit" && !["Signed", "Addendum", "Awaiting Co-sign"].includes(d.status),
    canSupervise: v === "supervisor" && d.supervised && d.coSign.status === "Pending",
  };
}

/* ------------------------------------------------------------------ actions */

/** Fictional transcript bank for simulated dictation (section 6); never real audio. */
function dictationSample(d: ClinicalDocDoc, seconds: number): TranscriptSeg[] {
  const lines: Record<string, [TranscriptSeg["speaker"], string, boolean][]> = {
    "Occupational Therapy": [
      [
        "Clinician",
        "Dressing observed in the bedroom. Upper body independent with set-up, lower body needed physical help with socks.",
        false,
      ],
      ["Clinician", "Transfer bed to chair with stand-by supervision, used the bed stick.", false],
      ["Participant", "I get tired by the time I do my shoes, maybe after ten minutes.", true],
      ["Clinician", "Recommend a long-handled shoe horn trial; review next visit.", false],
    ],
    Physiotherapy: [
      ["Clinician", "Walked 200 m with the four-wheeled walker, two rests.", false],
      ["Participant", "My knee was sore, maybe a four out of ten.", true],
      ["Clinician", "Sit to stand three sets of eight from a standard chair.", false],
    ],
    "Speech Pathology": [
      ["Clinician", "Two-word requests with visual cues, seven of ten prompted.", false],
      ["Carer", "At home she's using more words at dinner.", false],
      ["Clinician", "Unprompted requests were, possibly, three.", true],
    ],
  };
  const bank = lines[d.discipline] ?? [
    ["Clinician", "Session goals reviewed and activities completed as planned.", false],
    ["Participant", "I've been feeling a bit better this week.", true],
    ["Clinician", "Plan to continue the current program and review in two weeks.", false],
  ];
  const step = Math.max(8, Math.floor(seconds / bank.length));
  return bank.map(([speaker, text, uncertain], i) => ({
    id: randomUUID(),
    speaker,
    at: i * step,
    text,
    original: text,
    uncertain,
    corrected: false,
  }));
}

export async function docAction(u: UserDoc, id: ObjectId, action: DocAction) {
  const { d, client } = await load(id);
  const v = viewOf(u, d);
  if (v === "none") throw new UserFacingError("Note not found.", 404);
  const col = await docCol();
  const now = new Date();
  const set: Partial<ClinicalDocDoc> = {};
  let note = "";
  let reason = "";
  const locked = ["Signed", "Addendum"].includes(d.status);

  if (action.type === "co-sign") {
    if (v !== "supervisor" || !d.supervised)
      throw new UserFacingError("Only the assigned supervisor reviews this note.", 409);
    if (d.coSign.status !== "Pending")
      throw new UserFacingError("Nothing is waiting for your review.", 409);
    if (action.decision === "Approve") {
      set.coSign = { status: "Approved", note: action.note, by: u.name, at: now };
      set.status = "Signed";
      note = `Supervisor approved and co-signed`;
    } else {
      if (action.note.length < 5) throw new UserFacingError("Say what needs correcting.");
      set.coSign = { status: "Changes requested", note: action.note, by: u.name, at: now };
      set.status = "Needs Review";
      set.signed = null;
      set.reviewedAck = false;
      note = "Supervisor requested changes";
      reason = action.note;
      await docTask(u, d, client, `Correct ${d.ref} after supervisor review`, "Clinical", null);
    }
  } else {
    if (v !== "edit")
      throw new UserFacingError("Only the treating clinician changes this note.", 409);
    const editable = !locked && d.status !== "Awaiting Co-sign";
    const needEdit = () => {
      if (!editable)
        throw new UserFacingError(
          locked
            ? "This note is signed. Add an addendum instead."
            : "The note is with the supervisor.",
          409,
        );
    };
    switch (action.type) {
      case "observations":
        needEdit();
        set.observations = action.text;
        if (d.status === "Capturing" && action.text.length > 10) set.status = "Editing";
        note = "Observations saved";
        break;
      case "dictation": {
        needEdit();
        const segs = dictationSample(d, action.seconds);
        set.transcript = [...d.transcript, ...segs];
        set.dictation = {
          seconds: d.dictation.seconds + action.seconds,
          language: action.language,
        };
        set.capture = "Dictated";
        note = `Dictation captured (${action.seconds}s, simulated transcript, ${segs.filter((s) => s.uncertain).length} uncertain)`;
        break;
      }
      case "segment": {
        needEdit();
        const seg = d.transcript.find((s) => s.id === action.id);
        if (!seg) throw new UserFacingError("Transcript segment not found.", 404);
        set.transcript = d.transcript.map((s) =>
          s.id === action.id
            ? {
                ...s,
                text: action.text,
                speaker: action.speaker,
                corrected: action.confirm || action.text !== s.original,
              }
            : s,
        );
        note =
          action.text !== seg.original
            ? "Transcript corrected; original kept"
            : "Transcript segment confirmed";
        break;
      }
      case "redact":
        needEdit();
        set.transcript = d.transcript.map((s) =>
          s.id === action.id ? { ...s, text: "[redacted]", corrected: true } : s,
        );
        note = "Transcript segment redacted";
        break;
      case "sources":
        needEdit();
        set.selected = action.selected;
        note = `${action.selected.length} source(s) chosen for the draft`;
        break;
      case "consent":
        d.consents[action.which] = action.state;
        set.consents = d.consents;
        note = `${action.which === "ai" ? "AI processing" : action.which === "recording" ? "Recording" : "Sharing"} consent: ${action.state}`;
        break;
      case "generate": {
        needEdit();
        // Nothing goes to AI until consent for that purpose is recorded (section 6).
        if (!["Granted", "Not required"].includes(d.consents.ai))
          throw new UserFacingError(
            d.consents.ai === "Pending"
              ? "Record the participant's consent to AI processing first, or write the note manually."
              : "AI processing consent isn't in place. Write the note manually.",
            409,
          );
        const sources = (await sourcesFor(d, client)).filter((s) => d.selected.includes(s.id));
        if (!sources.length) throw new UserFacingError("Choose at least one source first.", 409);
        const drafted = await aiDraft(d, sources);
        set.sections = d.sections.map((s) => {
          const x = drafted.find((y) => y.key === s.key);
          return x ? { ...s, text: x.text, cites: x.cites, origin: "ai", state: "pending" } : s;
        });
        set.status = "AI Draft";
        set.aiAt = now;
        note = `AI drafted ${drafted.length} section(s) from ${sources.length} chosen source(s); not clinically verified`;
        break;
      }
      case "section": {
        needEdit();
        set.sections = d.sections.map((s) =>
          s.key === action.key
            ? {
                ...s,
                text: action.state === "rejected" ? "" : action.text,
                state: action.state,
                origin: action.state === "clinician" ? "clinician" : s.origin,
              }
            : s,
        );
        const sec = d.sections.find((s) => s.key === action.key);
        note = `${sec?.title ?? "Section"}: ${action.state === "clinician" ? "edited" : action.state}`;
        if (d.status === "AI Draft" || d.status === "Capturing") set.status = "Editing";
        break;
      }
      case "resolve":
        set.warnings = d.warnings.map((w) =>
          w.id === action.id ? { ...w, resolved: true, resolution: action.resolution } : w,
        );
        note = "Review warning resolved";
        reason = action.resolution;
        break;
      case "review":
        needEdit();
        set.reviewedAck = action.ack;
        note = action.ack
          ? "Clinician confirmed: I reviewed and verified this note"
          : "Review confirmation withdrawn";
        break;
      case "submit":
        needEdit();
        set.status = "Needs Review";
        note = "Marked ready for signature";
        break;
      case "sign": {
        needEdit();
        const fresh = { ...d, ...set } as ClinicalDocDoc;
        const blockers = blockersOf(fresh);
        if (blockers.length)
          throw new UserFacingError(`Not ready to sign: ${blockers.slice(0, 3).join("; ")}.`, 409);
        set.signed = { by: u.name, at: now };
        if (d.supervised) {
          set.status = "Awaiting Co-sign";
          set.coSign = { status: "Pending", note: "", by: "", at: null };
          await docTask(u, d, client, `Co-sign ${d.ref} for ${u.name}`, "Clinical", SUPERVISOR);
          note = "Author signed; sent to the supervisor for co-signature";
        } else {
          set.status = "Signed";
          note = "Signed and locked";
        }
        if (/follow.?up|review next|book/i.test(d.sections.map((s) => s.text).join(" ")))
          await docTask(
            u,
            d,
            client,
            `Propose a follow-up booking for ${client.name}`,
            "Scheduling",
            null,
          );
        break;
      }
      case "addendum":
        if (!locked) throw new UserFacingError("Sign the note before adding an addendum.", 409);
        set.addenda = [
          ...d.addenda,
          { reason: action.reason, text: action.text, by: u.name, at: now },
        ];
        set.status = "Addendum";
        note = `Addendum added (${action.reason}); the signed note is unchanged`;
        break;
      case "share":
        if (!locked) throw new UserFacingError("Share only from a signed note.", 409);
        if (!action.authorityChecked)
          throw new UserFacingError("Confirm the recipient is authorised before sharing.", 409);
        if (
          ["General practitioner", "Support coordinator"].includes(action.recipient) &&
          d.consents.sharing !== "Granted"
        )
          throw new UserFacingError(
            "Sharing consent isn't granted for third parties. Record consent first.",
            409,
          );
        set.shares = [
          ...d.shares,
          { recipient: action.recipient, summary: action.summary, by: u.name, at: now },
        ];
        note = `Shared an approved summary with ${action.recipient}`;
        break;
      case "resolve-sync": {
        if (!d.offline.conflict) throw new UserFacingError("There is no conflict to resolve.", 409);
        const c = d.offline.conflict;
        const value = action.keep === "mobile" ? c.mobile : c.web;
        set.sections = d.sections.map((s) => (s.title === c.section ? { ...s, text: value } : s));
        set.offline = { state: "Synced", conflict: null };
        note = `Sync conflict resolved: kept the ${action.keep === "mobile" ? "phone" : "web"} version`;
        break;
      }
    }
  }

  // Rules re-check the note after every change.
  const merged = { ...d, ...set } as ClinicalDocDoc;
  if (!["Signed", "Addendum"].includes(merged.status))
    set.warnings = ruleWarnings(merged, await sourcesFor(merged, client));
  await col.updateOne(
    { _id: d._id },
    { $set: set, $push: { timeline: { at: now, by: u.name, action: note, reason } } },
  );
  await audit(u, `${d.ref}: ${note}`, client._id);
  const { users } = await collections();
  await publish(
    (
      await users
        .find({ role: { $in: ["admin", "therapist"] } }, { projection: { _id: 1 } })
        .toArray()
    ).map((x) => x._id),
    "care",
    { clientId: client._id.toHexString(), doc: d._id.toHexString() },
  );
  return { ok: true };
}

async function docTask(
  u: UserDoc,
  d: ClinicalDocDoc,
  client: ClientDoc,
  title: string,
  team: "Clinical" | "Scheduling",
  assignee: string | null,
) {
  const { users } = await collections();
  const sup = assignee ? await users.findOne({ name: assignee }, { projection: { _id: 1 } }) : null;
  await insertTask(u, {
    title,
    category: team === "Clinical" ? "Clinical Review" : "Scheduling",
    status: "New",
    priority: "Normal",
    urgentReason: "",
    team,
    assigneeId: sup?._id ?? null,
    assigneeName: assignee,
    related: {
      kind: "Participant",
      ref: client.mrn ?? client.name,
      label: client.name,
      href: `/care/documentation/${d._id.toHexString()}`,
    },
    clientId: client._id,
    referralId: null,
    appointmentId: d.appointmentId,
    participant: client.name,
    service: d.discipline,
    discipline: d.discipline,
    locationType: d.mode,
    dueAt: new Date(Date.now() + 2 * 86_400_000),
    sla: "Standard",
    visibility: team === "Clinical" ? "Team Only" : "Internal",
    source: "Rule",
    ruleCode: "DOC-15",
    ruleVersion: 1,
    idemKey: `doc:${d._id.toHexString()}:${title}`,
    restrictedNote: null,
    recordingHref: null,
    suggestion: false,
    scenario: null,
    checklist: [],
    historyNote: `Raised from ${d.ref}`,
  });
}

/* ------------------------------------------------------------------ AI */

async function aiDraft(d: ClinicalDocDoc, sources: SourceItem[]) {
  const tagged = sources.map(
    (s, i) =>
      `[S${i + 1}] (${s.kind}; ${s.reported}; ${s.date.slice(0, 10)}) ${s.label}: ${s.text}`,
  );
  const sections = templates[d.noteType];
  try {
    const out = await generateJson("clinical-doc-draft", {
      system:
        "You draft clinical documentation for an allied health clinician from the chosen sources only. For each section, write concise clinical prose and cite the bracketed source tags you used. Keep therapist-observed, participant-reported and carer- or teacher-reported information visibly separate. Never add a measurement, diagnosis, medication, dosage, funding eligibility or risk rating that is not in the sources. If a source says 'possibly' or is marked [uncertain], keep that uncertainty. If sources conflict, say so in the section rather than choosing. If there is nothing for a section, write 'Not documented in the chosen sources.' Call the person 'the participant', never 'client'. The clinician reviews every section.",
      user: `Note type: ${d.noteType}. Discipline: ${d.discipline}. Mode: ${d.mode}.\nSections: ${sections.map((s) => `${s.key}=${s.title}`).join(", ")}\nSources:\n${tagged.join("\n")}`,
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["sections"],
        properties: {
          sections: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["key", "text", "cites"],
              properties: {
                key: { type: "string" },
                text: { type: "string" },
                cites: { type: "array", items: { type: "string" } },
              },
            },
          },
        },
      },
      schemaName: "clinical_doc",
      maxTokens: 1600,
    });
    const parsed = JSON.parse(out.text) as {
      sections: { key: string; text: string; cites: string[] }[];
    };
    // Models sometimes answer with the section title instead of its key: accept either.
    const norm = (v: string) => v.trim().toLowerCase();
    const matched = parsed.sections
      .map((s) => {
        const match = sections.find(
          (x) => norm(x.key) === norm(s.key) || norm(x.title) === norm(s.key),
        );
        return match
          ? { key: match.key, text: s.text.slice(0, 4000), cites: s.cites.slice(0, 8) }
          : null;
      })
      .filter((s): s is { key: string; text: string; cites: string[] } =>
        Boolean(s && s.text.trim()),
      );
    if (!matched.length)
      throw new UserFacingError(
        "The AI draft didn't match this template. Try again, or write the note yourself.",
        409,
      );
    return matched;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    // The clinician's work is already saved; the manual path stays open (AT-55).
    if (error instanceof AiError)
      throw new UserFacingError(
        `AI isn't available right now: ${error.message}. Your work is saved; write the note manually or try again.`,
        409,
      );
    throw new UserFacingError("The AI draft couldn't be read. Your work is saved; try again.", 409);
  }
}
