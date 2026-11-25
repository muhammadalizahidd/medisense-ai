import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { ObjectId } from "mongodb";
import { z } from "zod";
import { generateJson } from "@/lib/ai/engine";
import { AiError } from "@/lib/ai/types";
import {
  distributionGroups,
  type ExportDto,
  type ExportInput,
  type InsightDto,
  type ReportsHubDto,
  type ScheduleDto,
  type ScheduleInput,
  type ViewDto,
  type viewInputSchema,
} from "@/lib/live/report-dto";
import { reportById, runReport, runSpec, specErrors, type Row } from "@/lib/live/report-catalogue";
import {
  blankFilters,
  dayKey,
  filterSummary,
  formatValue,
  metrics,
  presetRange,
  rangeError,
  runMetric,
  scopeFromPermissions,
  scoped,
  type DatePreset,
  type ReportFilters,
  type ReportScope,
} from "@/lib/live/reports";
import { collections } from "./db";
import { nextRef } from "./finance";
import { UserFacingError } from "./http";
import { audit, notify } from "./live";
import type {
  ReportEvent,
  ReportExportDoc,
  ReportInsightDoc,
  ReportScheduleDoc,
  ReportViewDoc,
  UserDoc,
} from "./models";
import { insertTask } from "./operations";
import { effectivePermissions } from "@/lib/permissions/can";
import { can, loadPermissions } from "./permissions";
import { loadRoles } from "./roles";
import { loadFacts, reportScope, type LoadedFacts } from "./reports";
import { computeInsights } from "./report-insights";

const ev = (by: UserDoc | string, action: string): ReportEvent => ({
  at: new Date(),
  by: typeof by === "string" ? by : by.name,
  action,
});
const EXPORT_DAYS = 7;

function mustStaff(u: UserDoc) {
  const s = reportScope(u);
  if (!s.domains.length) throw new UserFacingError("Reports are for admin staff.", 409);
  return s;
}

/* ------------------------------------------------------------------ views (section 6, AT-31/32/44) */

function canSeeView(v: ReportViewDoc, u: UserDoc, s: ReportScope) {
  if (v.ownerId.equals(u._id)) return true;
  const domain = v.spec?.category ?? (v.reportId ? reportById.get(v.reportId)?.domain : null);
  if (domain && !(s.domains as string[]).includes(domain)) return false;
  if (v.scope === "Organisation") return true;
  if (v.scope === "Team") return Boolean(v.team && s.teams.includes(v.team));
  return false;
}

const viewDto = (v: ReportViewDoc, u: UserDoc): ViewDto => ({
  id: v._id.toHexString(),
  name: v.name,
  description: v.description,
  owner: v.ownerName,
  mine: v.ownerId.equals(u._id),
  scope: v.scope,
  team: v.team,
  reportId: v.reportId,
  spec: v.spec,
  filters: v.filters,
  status: v.status,
  version: v.version,
  updatedAt: v.updatedAt.toISOString(),
  history: v.history.map((h) => ({ ...h, at: h.at.toISOString() })),
});

export async function saveView(u: UserDoc, input: z.infer<typeof viewInputSchema>) {
  const s = mustStaff(u);
  const db = await collections();
  if (!s.share.includes(input.scope))
    throw new UserFacingError(
      `Your role can share views as ${s.share.join(" or ").toLowerCase()} only.`,
    );
  if (!input.reportId && !input.spec)
    throw new UserFacingError("Choose a report or build one first.");
  if (input.spec) {
    const errs = specErrors(input.spec, s);
    if (errs.length) throw new UserFacingError(errs[0] as string);
    if (input.spec.view === "Detail" && input.scope === "Organisation")
      throw new UserFacingError(
        "Views with record detail can be private or team only, never organisation-wide.",
      );
  }
  if (input.reportId) {
    const def = reportById.get(input.reportId);
    if (!def || !(s.domains as string[]).includes(def.domain))
      throw new UserFacingError("Your role can't open that report.");
  }
  const now = new Date();
  const team = input.scope === "Team" ? (s.teams[0] ?? null) : null;
  const same = await db.reportViews.findOne({
    ownerId: u._id,
    name: input.name,
    status: "Active",
    ...(input.id ? { _id: { $ne: new ObjectId(input.id) } } : {}),
  });
  if (same && !input.overwrite)
    throw new UserFacingError(
      `You already have a view called "${input.name}". Save again with Overwrite ticked to replace it.`,
      409,
    );
  if (input.id || same) {
    const target =
      same && input.overwrite
        ? same
        : await db.reportViews.findOne({ _id: new ObjectId(input.id) });
    if (!target) throw new UserFacingError("View not found.", 404);
    if (!target.ownerId.equals(u._id))
      throw new UserFacingError(
        "Only the owner can change a saved view. Clone it to make your own.",
        409,
      );
    if (target.status === "Archived")
      throw new UserFacingError("Archived views can't be edited. Restore or clone it first.", 409);
    await db.reportViews.updateOne(
      { _id: target._id },
      {
        $set: {
          name: input.name,
          description: input.description,
          scope: input.scope,
          team,
          reportId: input.reportId,
          spec: input.spec,
          filters: input.filters,
          updatedAt: now,
        },
        $inc: { version: 1 },
        $push: { history: ev(u, same && input.overwrite ? "Overwritten" : "Saved changes") },
      },
    );
    await audit(u, `Reports: view "${input.name}" saved (${input.scope})`, null);
    return { id: target._id.toHexString() };
  }
  const doc: ReportViewDoc = {
    _id: new ObjectId(),
    name: input.name,
    description: input.description,
    ownerId: u._id,
    ownerName: u.name,
    team,
    scope: input.scope,
    reportId: input.reportId,
    spec: input.spec,
    filters: input.filters,
    status: "Active",
    version: 1,
    history: [ev(u, "Created")],
    createdAt: now,
    updatedAt: now,
  };
  await db.reportViews.insertOne(doc);
  await audit(u, `Reports: view "${input.name}" created (${input.scope})`, null);
  return { id: doc._id.toHexString() };
}

export const viewActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("clone"), name: z.string().trim().min(3).max(80) }),
  z.object({ type: z.literal("rename"), name: z.string().trim().min(3).max(80) }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("restore") }),
]);

export async function viewAction(
  u: UserDoc,
  id: ObjectId,
  action: z.infer<typeof viewActionSchema>,
) {
  const s = mustStaff(u);
  const db = await collections();
  const v = await db.reportViews.findOne({ _id: id });
  if (!v || !canSeeView(v, u, s)) throw new UserFacingError("View not found.", 404);
  if (action.type === "clone") {
    const _id = new ObjectId();
    await db.reportViews.insertOne({
      ...v,
      _id,
      demo: undefined,
      name: action.name,
      ownerId: u._id,
      ownerName: u.name,
      scope: "Private",
      team: null,
      status: "Active",
      version: 1,
      history: [ev(u, `Cloned from "${v.name}" v${v.version}`)],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await audit(u, `Reports: view "${v.name}" cloned as "${action.name}"`, null);
    return { id: _id.toHexString() };
  }
  if (!v.ownerId.equals(u._id) && !s.label.startsWith("Director"))
    throw new UserFacingError("Only the owner can change a saved view.", 409);
  if (action.type === "rename") {
    if (v.status === "Archived")
      throw new UserFacingError("Archived views can't be edited. Restore or clone it first.", 409);
    await db.reportViews.updateOne(
      { _id: id },
      {
        $set: { name: action.name, updatedAt: new Date() },
        $push: { history: ev(u, `Renamed from "${v.name}"`) },
      },
    );
  } else {
    const status = action.type === "archive" ? "Archived" : "Active";
    await db.reportViews.updateOne(
      { _id: id },
      {
        $set: { status, updatedAt: new Date() },
        $push: { history: ev(u, action.type === "archive" ? "Archived" : "Restored") },
      },
    );
  }
  await audit(u, `Reports: view "${v.name}" ${action.type}d`, null);
  return { id: id.toHexString() };
}

/* ------------------------------------------------------------------ exports (section 7) */

type Built = Omit<
  ReportExportDoc,
  | "_id"
  | "ref"
  | "idemKey"
  | "ownerId"
  | "ownerName"
  | "recipientIds"
  | "scheduleId"
  | "downloads"
  | "status"
  | "revoked"
  | "expiresAt"
>;

/** Exports run the same report code as the screen, on the owner's scope at this moment (AT-29). */
export function buildExport(
  loaded: LoadedFacts,
  input: ExportInput & { spec: ExportInput["spec"] },
): Built {
  const s = loaded.scope;
  const err = rangeError(input.filters.from, input.filters.to, loaded.earliest, loaded.today);
  if (err) throw new UserFacingError(err);
  const names = new Map(Object.entries(loaded.names));
  const facts = scoped(loaded.facts, input.filters, names);
  const ctx = { today: loaded.today, now: loaded.now, earliest: loaded.earliest };
  const summary = filterSummary(input.filters);
  if (input.spec) {
    const errs = specErrors(input.spec, s);
    if (errs.length) throw new UserFacingError(errs[0] as string);
    if (
      input.contents === "Permitted detail rows" &&
      !(s.detail as string[]).includes(input.spec.category)
    )
      throw new UserFacingError("Your role can't export record detail for this area.");
    const out = runSpec(input.spec, facts, input.filters, names);
    return {
      reportId: "BUILDER",
      title: input.spec.name || `${input.spec.category} report`,
      domain: input.spec.category,
      format: input.format,
      contents: input.contents,
      filters: input.filters,
      summary: [...summary, `Time basis: ${input.spec.basis}`, `View: ${input.spec.view}`],
      unit:
        [...new Set(out.columns.map((c) => /\((.+)\)$/.exec(c.label)?.[1]).filter(Boolean))].join(
          "; ",
        ) || "records",
      basis: input.spec.basis,
      columns: input.contents === "Summary only" ? [] : out.columns,
      rows:
        input.contents === "Summary only"
          ? []
          : (out.rows as Record<string, string | number | null>[]),
      metrics: [{ label: "Rows", value: String(out.total), unit: "rows" }],
      generatedAt: new Date(),
      freshness: new Date(loaded.freshness),
    };
  }
  const def = input.reportId ? reportById.get(input.reportId) : undefined;
  if (!def) throw new UserFacingError("Choose a report.");
  if (!(s.domains as string[]).includes(def.domain))
    throw new UserFacingError("Your role can't open this report.", 409);
  if (input.contents === "Permitted detail rows" && !(s.detail as string[]).includes(def.domain))
    throw new UserFacingError(
      "Your role can't export record detail for this area. Export a summary instead.",
    );
  if (input.contents === "Aggregate with chart data" && def.detail)
    throw new UserFacingError(
      "This report lists records. Export the summary, or permitted detail rows.",
    );
  const run = runReport(def, facts, input.filters, ctx, names, s);
  if (!run.allowed && input.contents !== "Summary only") throw new UserFacingError(run.reason, 409);
  const m = metrics
    .filter((x) => x.domain === def.domain || (def.domain === "Staff" && x.domain === "Staff"))
    .map((x) => runMetric(x.id, facts, input.filters, ctx));
  return {
    reportId: def.id,
    title: `${def.id} ${def.title}`,
    domain: def.domain,
    format: input.format,
    contents: input.contents,
    filters: input.filters,
    summary,
    unit: def.unit,
    basis: def.basis,
    columns: input.contents === "Summary only" ? [] : def.columns,
    rows:
      input.contents === "Summary only" || !run.allowed
        ? []
        : (run.rows as Record<string, string | number | null>[]),
    metrics: m.map((r) => ({
      label: r.def.label,
      value: formatValue(r.value, r.def.unit),
      unit: r.def.unit,
    })),
    generatedAt: new Date(),
    freshness: new Date(loaded.freshness),
  };
}

export async function createExport(u: UserDoc, input: ExportInput) {
  mustStaff(u);
  const db = await collections();
  let spec = input.spec;
  if (input.viewId) {
    const v = ObjectId.isValid(input.viewId)
      ? await db.reportViews.findOne({ _id: new ObjectId(input.viewId) })
      : null;
    if (!v || !canSeeView(v, u, reportScope(u))) throw new UserFacingError("View not found.", 404);
    spec = v.spec;
  }
  const idemKey = createHash("sha256")
    .update(
      JSON.stringify([
        u._id.toHexString(),
        input.reportId,
        input.viewId,
        spec,
        input.filters,
        input.format,
        input.contents,
      ]),
    )
    .digest("hex");
  const dup = await db.reportExports.findOne({
    idemKey,
    status: "Ready",
    generatedAt: { $gt: new Date(Date.now() - 120_000) },
  });
  if (dup) return { id: dup._id.toHexString(), ref: dup.ref, duplicate: true };
  const loaded = await loadFacts(u);
  const built = buildExport(loaded, { ...input, spec });
  const doc: ReportExportDoc = {
    ...built,
    _id: new ObjectId(),
    ref: await nextRef(db.db, "reportExport", "EXP", 5),
    idemKey,
    ownerId: u._id,
    ownerName: u.name,
    recipientIds: [u._id],
    scheduleId: null,
    status: "Ready",
    revoked: null,
    expiresAt: new Date(Date.now() + EXPORT_DAYS * 86_400_000),
    downloads: [],
  };
  await db.reportExports.insertOne(doc);
  await audit(
    u,
    `Reports: export ${doc.ref} ${doc.title} (${doc.format}, ${doc.contents}) generated`,
    null,
  );
  return { id: doc._id.toHexString(), ref: doc.ref, duplicate: false };
}

/** Every open checks the person's rights now, not when the link was made (section 7, AT-47). */
export async function openExport(u: UserDoc, id: ObjectId, format: string | null) {
  const db = await collections();
  const e = await db.reportExports.findOne({ _id: id });
  if (!e) throw new UserFacingError("Export not found.", 404);
  const s = reportScope(u);
  const log = async (outcome: string) => {
    await db.reportExports.updateOne(
      { _id: id },
      { $push: { downloads: { by: u.name, at: new Date(), format: format ?? e.format, outcome } } },
    );
    await audit(
      u,
      `Reports: export ${e.ref} download ${outcome === "Downloaded" ? "completed" : `denied (${outcome})`}`,
      null,
    );
  };
  if (!e.recipientIds.some((r) => r.equals(u._id)) && !e.ownerId.equals(u._id)) {
    await log("not a recipient");
    throw new UserFacingError("This export wasn't shared with you.", 409);
  }
  if (e.status === "Revoked") {
    await log("link revoked");
    throw new UserFacingError("This link was revoked.", 409);
  }
  if (e.expiresAt < new Date()) {
    await log("link expired");
    throw new UserFacingError("This link has expired. Run the report again.", 409);
  }
  const allowed = e.domain === "BUILDER" || (s.domains as string[]).includes(e.domain);
  const detailOk =
    e.contents !== "Permitted detail rows" || (s.detail as string[]).includes(e.domain);
  if (!allowed || !detailOk) {
    await log("access no longer allowed");
    throw new UserFacingError(
      "Your current role no longer covers this report, so the link can't be opened.",
      409,
    );
  }
  await log("Downloaded");
  return e;
}

export async function revokeExport(u: UserDoc, id: ObjectId, reason: string) {
  mustStaff(u);
  const db = await collections();
  const e = await db.reportExports.findOne({ _id: id });
  if (!e) throw new UserFacingError("Export not found.", 404);
  // The owner, or someone with organisation-wide reporting authority, can revoke a link.
  if (!e.ownerId.equals(u._id) && !can(u, "reports.share.organisation"))
    throw new UserFacingError("Only the owner or a manager can revoke this link.", 409);
  await db.reportExports.updateOne(
    { _id: id },
    { $set: { status: "Revoked", revoked: { by: u.name, at: new Date(), reason } } },
  );
  await audit(u, `Reports: export ${e.ref} link revoked: ${reason}`, null);
  return { ok: true };
}

const exportDto = (e: ReportExportDoc, u: UserDoc, s: ReportScope): ExportDto => ({
  id: e._id.toHexString(),
  ref: e.ref,
  reportId: e.reportId,
  title: e.title,
  owner: e.ownerName,
  mine: e.ownerId.equals(u._id),
  format: e.format,
  contents: e.contents,
  summary: e.summary,
  unit: e.unit,
  basis: e.basis,
  rowCount: e.rows.length,
  generatedAt: e.generatedAt.toISOString(),
  expiresAt: e.expiresAt.toISOString(),
  status: e.status === "Ready" && e.expiresAt < new Date() ? "Expired" : e.status,
  revoked: e.revoked ? { ...e.revoked, at: e.revoked.at.toISOString() } : null,
  scheduled: Boolean(e.scheduleId),
  canOpen:
    e.status === "Ready" &&
    e.expiresAt > new Date() &&
    (s.domains as string[]).includes(e.domain) &&
    (e.contents !== "Permitted detail rows" || (s.detail as string[]).includes(e.domain)),
  downloads: e.downloads.map((d) => ({ ...d, at: d.at.toISOString() })),
});

/* ------------------------------------------------------------------ schedules (section 7) */

const OFFSET = 10 * 3_600_000;
function lastBusinessDay(y: number, m: number) {
  for (let d = new Date(Date.UTC(y, m, 0)).getUTCDate(); d > 0; d--) {
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (wd !== 0 && wd !== 6) return d;
  }
  return 28;
}
/** The next run after a moment, in Brisbane time (no daylight saving, AT-42). */
export function nextRunAt(
  s: Pick<ReportScheduleDoc, "frequency" | "weekday" | "monthDay" | "oneTimeDate" | "time">,
  after: Date,
): Date | null {
  const [hh, mm] = s.time.split(":").map(Number) as [number, number];
  const at = (key: string) =>
    new Date(Date.parse(`${key}T00:00:00Z`) + (hh * 60 + mm) * 60_000 - OFFSET);
  if (s.frequency === "One-time")
    return s.oneTimeDate && at(s.oneTimeDate) > after ? at(s.oneTimeDate) : null;
  const start = new Date(after.getTime() + OFFSET);
  for (let i = 0; i < 70; i++) {
    const d = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i),
    );
    const key = d.toISOString().slice(0, 10);
    const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    const ok =
      s.frequency === "Daily" ||
      (s.frequency === "Weekly" && wd === (s.weekday ?? 1)) ||
      (s.frequency === "Monthly" &&
        d.getUTCDate() ===
          (s.monthDay === "Last business day"
            ? lastBusinessDay(d.getUTCFullYear(), d.getUTCMonth() + 1)
            : (s.monthDay ?? 1)));
    if (ok && at(key) > after) return at(key);
  }
  return null;
}

async function resolveRecipients(list: ReportScheduleDoc["recipients"], owner: UserDoc) {
  const db = await collections();
  const admins = await db.users.find({ role: "admin", disabled: { $ne: true } }).toArray();
  const out = new Map<string, UserDoc>();
  for (const r of list) {
    if (r.kind === "self") out.set(owner._id.toHexString(), owner);
    if (r.kind === "user") {
      const x = admins.find((a) => a._id.toHexString() === r.id);
      if (x) out.set(r.id, x);
    }
    if (r.kind === "group") {
      const g = distributionGroups.find((x) => x.id === r.id);
      for (const a of admins)
        if (g && a.staffRoles?.some((role) => (g.roles as readonly string[]).includes(role)))
          out.set(a._id.toHexString(), a);
    }
  }
  return [...out.values()];
}

export async function saveSchedule(u: UserDoc, input: ScheduleInput) {
  const s = mustStaff(u);
  if (!s.schedule)
    throw new UserFacingError(
      "Your role can run reports but not schedule them. Ask an Operations Manager.",
      409,
    );
  const def = reportById.get(input.reportId);
  if (!def || !(s.domains as string[]).includes(def.domain))
    throw new UserFacingError("Your role can't schedule that report.", 409);
  if (input.contents === "Permitted detail rows" && !(s.detail as string[]).includes(def.domain))
    throw new UserFacingError("Your role can't schedule record detail for this report.");
  if (input.contents === "Aggregate with chart data" && def.detail)
    throw new UserFacingError(
      "This report lists records. Schedule the summary or permitted detail rows.",
    );
  const db = await collections();
  const internal = new Set(
    (await db.users.find({ role: "admin" }, { projection: { email: 1 } }).toArray()).map((x) =>
      x.email.toLowerCase(),
    ),
  );
  const recipients: ReportScheduleDoc["recipients"] = [];
  for (const r of input.recipients) {
    if (r.kind === "email") {
      if (!internal.has(r.id.toLowerCase()))
        throw new UserFacingError(
          `${r.id} isn't an approved internal user. External addresses can't receive reports.`,
        );
      const x = await db.users.findOne({ email: r.id.toLowerCase() });
      if (x) recipients.push({ kind: "user", id: x._id.toHexString(), name: x.name });
    } else
      recipients.push({
        kind: r.kind,
        id: r.kind === "self" ? u._id.toHexString() : r.id,
        name: r.name,
      });
  }
  if (input.frequency === "Weekly" && !input.weekday)
    throw new UserFacingError("Choose the day of the week.");
  if (input.frequency === "Monthly" && !input.monthDay)
    throw new UserFacingError("Choose a day from 1 to 28, or the last business day.");
  if (input.frequency === "One-time" && !input.oneTimeDate)
    throw new UserFacingError("Choose the date to run it.");
  const plan = {
    frequency: input.frequency,
    weekday: input.frequency === "Weekly" ? input.weekday : null,
    monthDay: input.frequency === "Monthly" ? input.monthDay : null,
    oneTimeDate: input.frequency === "One-time" ? input.oneTimeDate : null,
    time: input.time,
  };
  const next = nextRunAt(plan, new Date());
  if (input.frequency === "One-time" && !next)
    throw new UserFacingError("Choose a time in the future.");
  const now = new Date();
  const fields = {
    name: input.name,
    reportId: input.reportId,
    viewId: null,
    preset: input.preset,
    filters: input.filters,
    ...plan,
    recipients,
    delivery: input.delivery,
    format: input.format,
    contents: input.contents,
    updatedAt: now,
  };
  if (input.id) {
    const cur = await db.reportSchedules.findOne({ _id: new ObjectId(input.id) });
    if (!cur || !cur.ownerId.equals(u._id))
      throw new UserFacingError("Only the owner can edit this schedule.", 409);
    if (cur.status === "Archived")
      throw new UserFacingError("Archived schedules can't be edited.", 409);
    const status = input.activate ? "Active" : cur.status;
    await db.reportSchedules.updateOne(
      { _id: cur._id },
      {
        $set: { ...fields, status, nextRun: status === "Active" ? next : null },
        $push: { history: ev(u, "Edited") },
      },
    );
    await audit(u, `Reports: schedule ${cur.ref} edited`, null);
    return { id: cur._id.toHexString() };
  }
  const doc: ReportScheduleDoc = {
    _id: new ObjectId(),
    ref: await nextRef(db.db, "reportSchedule", "SCH", 4),
    ...fields,
    timezone: "Australia/Brisbane",
    status: input.activate ? "Active" : "Draft",
    ownerId: u._id,
    ownerName: u.name,
    nextRun: input.activate ? next : null,
    runs: [],
    history: [ev(u, input.activate ? "Created and activated" : "Created as draft")],
    createdAt: now,
  };
  await db.reportSchedules.insertOne(doc);
  await audit(u, `Reports: schedule ${doc.ref} "${doc.name}" created`, null);
  return { id: doc._id.toHexString() };
}

/** Each run re-checks the owner and every recipient against their rights today (AT-30). */
export async function runSchedule(id: ObjectId, by: UserDoc | "Scheduler", retry = false) {
  const db = await collections();
  const sch = await db.reportSchedules.findOne({ _id: id });
  if (!sch) throw new UserFacingError("Schedule not found.", 404);
  if (by !== "Scheduler" && !sch.ownerId.equals(by._id))
    throw new UserFacingError("Only the owner can run this schedule.", 409);
  if (sch.status === "Paused" || sch.status === "Archived")
    throw new UserFacingError(
      `A ${sch.status.toLowerCase()} schedule doesn't run. Resume it first.`,
      409,
    );
  const owner = await db.users.findOne({ _id: sch.ownerId });
  const def = reportById.get(sch.reportId);
  const attempt = (sch.runs[0]?.attempt ?? 0) + 1;
  const queuedAt = new Date();
  const record = async (
    outcome: "Delivered" | "Failed",
    detail: string,
    exportId: ObjectId | null,
    delivered: string[],
    excluded: string[],
  ) => {
    const status =
      outcome === "Failed" ? "Failed" : sch.frequency === "One-time" ? "Archived" : "Active";
    const run = {
      id: randomUUID(),
      at: new Date(),
      outcome,
      detail,
      exportId,
      delivered,
      excluded,
      attempt: retry ? attempt : 1,
      steps: [
        { state: "Queued", at: queuedAt },
        { state: "Processing", at: new Date(queuedAt.getTime() + 1) },
        { state: outcome, at: new Date() },
      ],
    };
    await db.reportSchedules.updateOne(
      { _id: id },
      {
        $set: {
          status,
          nextRun: status === "Active" ? nextRunAt(sch, new Date()) : null,
          updatedAt: new Date(),
        },
        $push: {
          runs: { $each: [run], $position: 0, $slice: 30 },
          history: ev(
            by === "Scheduler" ? "Scheduler" : by,
            `${retry ? "Retried" : "Ran"}: ${outcome}`,
          ),
        },
      },
    );
    return run;
  };
  if (!owner || owner.disabled || !def)
    return record("Failed", "The schedule owner no longer has an active account.", null, [], []);
  // A scheduled run acts as the schedule's owner, so load what their roles allow first.
  await loadPermissions(owner);
  const os = reportScope(owner);
  if (!(os.domains as string[]).includes(def.domain)) {
    return record(
      "Failed",
      `${owner.name} no longer has access to ${def.domain} reports, so nothing was generated.`,
      null,
      [],
      [],
    );
  }
  const recipients = await resolveRecipients(sch.recipients, owner);
  const ok: UserDoc[] = [];
  const excluded: string[] = [];
  const roles = await loadRoles();
  for (const r of recipients) {
    const rs = scopeFromPermissions(
      effectivePermissions(r.staffRoles, roles),
      r.role,
      r.staffRoles ?? [],
    );
    if (!(rs.domains as string[]).includes(def.domain))
      excluded.push(`${r.name}: no access to ${def.domain}`);
    else if (
      sch.contents === "Permitted detail rows" &&
      !(rs.detail as string[]).includes(def.domain)
    )
      excluded.push(`${r.name}: aggregate access only`);
    else ok.push(r);
  }
  if (!ok.length)
    return record("Failed", "No recipient is entitled to this report today.", null, [], excluded);
  try {
    const loaded = await loadFacts(owner);
    const today = loaded.today;
    const filters: ReportFilters = {
      ...blankFilters(today),
      ...sch.filters,
      preset: sch.preset as DatePreset,
      ...presetRange(sch.preset as DatePreset, today),
    };
    const built = buildExport(loaded, {
      reportId: sch.reportId,
      viewId: null,
      spec: null,
      filters,
      format: sch.format,
      contents: sch.contents,
    });
    const _id = new ObjectId();
    await db.reportExports.insertOne({
      ...built,
      _id,
      ref: await nextRef(db.db, "reportExport", "EXP", 5),
      idemKey: `schedule:${id.toHexString()}:${Date.now()}`,
      ownerId: owner._id,
      ownerName: owner.name,
      recipientIds: ok.map((r) => r._id),
      scheduleId: id,
      status: "Ready",
      revoked: null,
      expiresAt: new Date(Date.now() + EXPORT_DAYS * 86_400_000),
      downloads: [],
    });
    await notify(
      ok.map((r) => r._id),
      {
        title: `Scheduled report ready: ${def.title}`,
        body: `${sch.name} · ${dayKey(new Date())}${sch.delivery === "Email link" ? " · secure link emailed (simulated)" : ""}`,
        href: "/care/reports?tab=exports",
      },
    );
    await audit(
      owner,
      `Reports: schedule ${sch.ref} delivered to ${ok.length} recipient(s)${excluded.length ? `, ${excluded.length} excluded` : ""}`,
      null,
    );
    return record(
      "Delivered",
      `Generated with ${built.rows.length} rows; ${sch.delivery === "Email link" ? "secure link sent by email (simulated) and in-app" : "in-app notification sent"}.`,
      _id,
      ok.map((r) => r.name),
      excluded,
    );
  } catch (error) {
    const msg =
      error instanceof UserFacingError ? error.message : "The report couldn't be generated.";
    return record("Failed", msg, null, [], excluded);
  }
}

export const scheduleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("activate") }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("delete") }),
  z.object({ type: z.literal("run") }),
  z.object({ type: z.literal("retry") }),
]);

export async function scheduleAction(
  u: UserDoc,
  id: ObjectId,
  action: z.infer<typeof scheduleActionSchema>,
) {
  mustStaff(u);
  const db = await collections();
  const sch = await db.reportSchedules.findOne({ _id: id });
  if (!sch || !sch.ownerId.equals(u._id))
    throw new UserFacingError("Only the owner can change this schedule.", 409);
  if (action.type === "run" || action.type === "retry") {
    if (action.type === "retry" && sch.status !== "Failed")
      throw new UserFacingError("Only a failed schedule can be retried.", 409);
    if (action.type === "retry")
      await db.reportSchedules.updateOne({ _id: id }, { $set: { status: "Active" } });
    return { run: await runSchedule(id, u, action.type === "retry") };
  }
  if (action.type === "delete") {
    if (sch.status === "Active")
      throw new UserFacingError("Pause the schedule before deleting it.", 409);
    await db.reportSchedules.deleteOne({ _id: id });
    await audit(u, `Reports: schedule ${sch.ref} deleted`, null);
    return { ok: true };
  }
  const status =
    action.type === "pause" ? "Paused" : action.type === "archive" ? "Archived" : "Active";
  if (sch.status === "Archived")
    throw new UserFacingError("An archived schedule can't change.", 409);
  await db.reportSchedules.updateOne(
    { _id: id },
    {
      $set: {
        status,
        nextRun: status === "Active" ? nextRunAt(sch, new Date()) : null,
        updatedAt: new Date(),
      },
      $push: {
        history: ev(
          u,
          status === "Paused"
            ? "Paused: no further runs"
            : status === "Archived"
              ? "Archived"
              : action.type === "activate"
                ? "Activated"
                : "Resumed",
        ),
      },
    },
  );
  // Pausing or archiving cancels the run that was queued next, and says so in the run history.
  if (status !== "Active" && sch.status === "Active" && sch.nextRun) {
    const at = new Date();
    await db.reportSchedules.updateOne(
      { _id: id },
      {
        $push: {
          runs: {
            $each: [
              {
                id: randomUUID(),
                at,
                outcome: "Cancelled" as const,
                detail: `The run due ${dayKey(sch.nextRun)} was cancelled: schedule ${status.toLowerCase()} by ${u.name}.`,
                exportId: null,
                delivered: [],
                excluded: [],
                attempt: 1,
                steps: [
                  { state: "Queued", at: sch.updatedAt },
                  { state: "Cancelled", at },
                ],
              },
            ],
            $position: 0,
            $slice: 30,
          },
        },
      },
    );
  }
  await audit(u, `Reports: schedule ${sch.ref} ${status.toLowerCase()}`, null);
  return { ok: true };
}

/** R03 action: send a referral with missing information to the intake work queue (M08). */
export async function referralTask(u: UserDoc, referralId: ObjectId) {
  const s = mustStaff(u);
  if (!s.detail.includes("Referrals"))
    throw new UserFacingError("Your role can't act on referrals.", 409);
  const db = await collections();
  const r = await db.referrals.findOne(
    { _id: referralId },
    { projection: { reference: 1, gaps: 1, status: 1, data: 1 } },
  );
  if (!r) throw new UserFacingError("Referral not found.", 404);
  const missing = r.gaps.map((g) => g.label);
  const due = new Date(Date.now() + 86_400_000);
  const { task, created } = await insertTask(u, {
    title: `Request missing information: ${r.reference}`,
    category: "Referral",
    status: "New",
    priority: "High",
    urgentReason: "",
    team: "Intake",
    assigneeId: null,
    assigneeName: null,
    related: {
      kind: "Referral",
      ref: r.reference,
      label: r.reference,
      href: `/care/referrals/${referralId.toHexString()}`,
    },
    clientId: null,
    referralId,
    appointmentId: null,
    participant: `${r.data.participant.firstName} ${r.data.participant.lastName.slice(0, 1)}.`,
    service: r.data.supports.map((x) => x.support).join(", "),
    discipline: null,
    locationType: null,
    dueAt: due,
    sla: "Standard",
    visibility: "Team Only",
    source: "Manual",
    ruleCode: null,
    ruleVersion: null,
    idemKey: `report-referral-missing:${referralId.toHexString()}`,
    suggestion: false,
    scenario: null,
    restrictedNote: null,
    recordingHref: null,
    checklist: missing.map((label) => ({ label: `Get: ${label}` })),
    note: missing.length ? `Missing: ${missing.join("; ")}` : undefined,
    historyNote: `Created from report R03 by ${u.name}`,
  });
  if (created && task)
    await audit(u, `Reports: task ${task.ref} created for referral ${r.reference}`, null);
  return { ref: task?.ref ?? null, id: task?._id.toHexString() ?? null, created };
}

/** Runs due schedules when someone opens Reports: the prototype has no background scheduler. */
async function runDue() {
  const db = await collections();
  const due = await db.reportSchedules
    .find({ status: "Active", nextRun: { $lte: new Date() } })
    .limit(5)
    .toArray();
  for (const s of due) await runSchedule(s._id, "Scheduler").catch(() => null);
}

const scheduleDto = (s: ReportScheduleDoc, u: UserDoc): ScheduleDto => ({
  id: s._id.toHexString(),
  ref: s.ref,
  name: s.name,
  reportId: s.reportId,
  preset: s.preset,
  filters: s.filters,
  frequency: s.frequency,
  weekday: s.weekday,
  monthDay: s.monthDay,
  oneTimeDate: s.oneTimeDate,
  time: s.time,
  timezone: s.timezone,
  recipients: s.recipients,
  delivery: s.delivery,
  format: s.format,
  contents: s.contents,
  status: s.status,
  owner: s.ownerName,
  mine: s.ownerId.equals(u._id),
  nextRun: s.nextRun?.toISOString() ?? null,
  runs: s.runs.map((r) => ({
    ...r,
    steps: (r.steps ?? [{ state: r.outcome, at: r.at }]).map((x) => ({
      ...x,
      at: x.at.toISOString(),
    })),
    at: r.at.toISOString(),
    exportId: r.exportId?.toHexString() ?? null,
  })),
  history: s.history.map((h) => ({ ...h, at: h.at.toISOString() })),
});

/* ------------------------------------------------------------------ insights (section 9) */

const insightDto = (i: ReportInsightDoc, taskRefs: Map<string, string>): InsightDto => ({
  id: i._id,
  type: i.type,
  title: i.title,
  category: i.category,
  severity: i.severity,
  period: i.period,
  source: i.source,
  evidenceCount: i.evidenceCount,
  evidence: i.evidence,
  threshold: i.threshold,
  rule: i.rule,
  suggestion: i.suggestion,
  href: i.href,
  generatedAt: i.generatedAt.toISOString(),
  owner: i.owner,
  status: i.status,
  taskRef: i.taskId ? (taskRefs.get(i.taskId.toHexString()) ?? null) : null,
  taskHref: i.taskId ? `/care/operations/tasks/${i.taskId.toHexString()}` : null,
  smallSample: i.evidenceCount < 5,
  ai: i.ai ? { ...i.ai, at: i.ai.at.toISOString() } : null,
  history: i.history.map((h) => ({ ...h, at: h.at.toISOString() })),
});

/** A dismissed insight stays dismissed until its evidence changes (AT-39). */
async function syncInsights(loaded: LoadedFacts) {
  const db = await collections();
  const found = computeInsights(loaded);
  const existing = new Map(
    (await db.reportInsights.find({ _id: { $in: found.map((c) => c.id) } }).toArray()).map((x) => [
      x._id,
      x,
    ]),
  );
  const writes = found.map(async (c) => {
    const cur = existing.get(c.id);
    if (!cur) {
      await db.reportInsights.insertOne({
        _id: c.id,
        ...c.doc,
        status: "New",
        taskId: null,
        ai: null,
        history: [{ at: new Date(), by: "Rule", action: `Raised: ${c.doc.rule}` }],
      });
    } else if (cur.evidenceHash !== c.doc.evidenceHash) {
      const reopen = cur.status === "Dismissed" || cur.status === "Acknowledged";
      await db.reportInsights.updateOne(
        { _id: c.id },
        {
          $set: { ...c.doc, ...(reopen ? { status: "New" as const } : {}), ai: null },
          $push: {
            history: {
              at: new Date(),
              by: "Rule",
              action: reopen ? "Reopened: new evidence since it was closed" : "Evidence updated",
            },
          },
        },
      );
    }
  });
  await Promise.all(writes);
  return found.map((c) => c.id);
}

export const insightActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("review") }),
  z.object({ type: z.literal("acknowledge") }),
  z.object({
    type: z.literal("dismiss"),
    reason: z.string().trim().min(3, "Say why it's dismissed").max(300),
  }),
  z.object({ type: z.literal("task") }),
  z.object({ type: z.literal("explain") }),
]);

export async function insightAction(
  u: UserDoc,
  id: string,
  action: z.infer<typeof insightActionSchema>,
) {
  mustStaff(u);
  const db = await collections();
  const i = await db.reportInsights.findOne({ _id: id });
  if (!i) throw new UserFacingError("Insight not found.", 404);
  if (action.type === "task") {
    if (i.taskId) return { taskId: i.taskId.toHexString() };
    const team =
      i.category === "Finance"
        ? "Finance"
        : i.category === "Clinical Operations"
          ? "Clinical"
          : i.category === "Referrals"
            ? "Intake"
            : i.category === "Scheduling" || i.category === "Telehealth"
              ? "Scheduling"
              : "Operations";
    const due = new Date(Date.now() + (i.severity === "Urgent Operational" ? 1 : 3) * 86_400_000);
    const { task } = await insertTask(u, {
      title: `Review: ${i.title}`,
      category:
        team === "Finance"
          ? "Billing"
          : team === "Clinical"
            ? "Clinical Review"
            : team === "Intake"
              ? "Referral"
              : "Other",
      status: "New",
      priority:
        i.severity === "Urgent Operational"
          ? "Urgent"
          : i.severity === "Review"
            ? "High"
            : "Normal",
      urgentReason:
        i.severity === "Urgent Operational" ? "Urgent operational insight from Reports" : "",
      team,
      assigneeId: null,
      assigneeName: null,
      related: { kind: "Rule", ref: i._id, label: i.title, href: "/care/reports?tab=automation" },
      clientId: null,
      referralId: null,
      appointmentId: null,
      participant: null,
      service: null,
      discipline: null,
      locationType: null,
      dueAt: due,
      sla: i.severity === "Urgent Operational" ? "Expedited" : "Standard",
      visibility: team === "Clinical" ? "Team Only" : "Internal",
      source: "AI Proposed",
      ruleCode: null,
      ruleVersion: null,
      idemKey: `insight:${i._id}:${i.evidenceHash}`,
      suggestion: false,
      scenario: null,
      restrictedNote: null,
      recordingHref: null,
      note: `${i.suggestion}\n\nEvidence: ${i.evidence.map((e) => `${e.label} ${e.value}`).join("; ")}. Rule: ${i.rule}.`,
      historyNote: `Created from report insight by ${u.name}`,
    });
    if (task)
      await db.reportInsights.updateOne(
        { _id: id },
        {
          $set: { taskId: task._id, status: i.status === "New" ? "Reviewed" : i.status },
          $push: {
            history: ev(u, `Task ${task.ref} created for the ${team} team, due ${dayKey(due)}`),
          },
        },
      );
    await audit(u, `Reports: insight "${i.title}" sent to work queue as ${task?.ref}`, null);
    return { taskId: task?._id.toHexString() ?? null };
  }
  if (action.type === "explain") return { text: await explainInsight(u, i) };
  const status =
    action.type === "review"
      ? "Reviewed"
      : action.type === "acknowledge"
        ? "Acknowledged"
        : "Dismissed";
  await db.reportInsights.updateOne(
    { _id: id },
    {
      $set: { status },
      $push: { history: ev(u, action.type === "dismiss" ? `Dismissed: ${action.reason}` : status) },
    },
  );
  await audit(u, `Reports: insight "${i.title}" marked ${status.toLowerCase()}`, null);
  return { ok: true };
}

/** AI writes the explanation only; every number it uses must be one of the evidence figures. */
async function explainInsight(u: UserDoc, i: ReportInsightDoc) {
  const db = await collections();
  const allowed = new Set(
    [
      i.evidenceCount,
      ...i.evidence.flatMap((e) => e.value.match(/\d+(?:\.\d+)?/g) ?? []),
      ...(i.threshold.match(/\d+(?:\.\d+)?/g) ?? []),
    ].map((n) => String(Number(n))),
  );
  try {
    const out = await generateJson("report-insight", {
      system:
        "You explain an operational report insight to a manager at an Australian allied health provider. Write 2 or 3 plain sentences: what the figures show, why the rule flagged it, and one sensible next step for a person to consider. Use only the figures given and no others. Never diagnose, never describe any patient's clinical risk, never say an action was taken. It is a suggestion for review.",
      user: JSON.stringify({
        title: i.title,
        period: i.period,
        evidence: i.evidence,
        threshold: i.threshold,
        rule: i.rule,
        suggestion: i.suggestion,
      }),
      schema: {
        type: "object",
        additionalProperties: false,
        required: ["text"],
        properties: { text: { type: "string" } },
      },
      schemaName: "insight_explain",
      maxTokens: 400,
    });
    const text = (JSON.parse(out.text) as { text: string }).text.trim();
    const stray = (text.match(/\d+(?:\.\d+)?/g) ?? []).filter(
      (n) => !allowed.has(String(Number(n))) && Number(n) > 1,
    );
    if (stray.length)
      throw new UserFacingError(
        "The AI explanation used figures that don't match the report, so it wasn't shown. Try again.",
        409,
      );
    await db.reportInsights.updateOne(
      { _id: i._id },
      {
        $set: { ai: { text, at: new Date(), by: u.name } },
        $push: { history: ev(u, "AI explanation drafted (needs review)") },
      },
    );
    await audit(u, `Reports: AI explanation drafted for insight "${i.title}"`, null);
    return text;
  } catch (error) {
    if (error instanceof UserFacingError) throw error;
    if (error instanceof AiError)
      throw new UserFacingError(`AI isn't available right now: ${error.message}`, 409);
    throw new UserFacingError("The AI answer couldn't be read. Try again.", 409);
  }
}

/* ------------------------------------------------------------------ hub */

/** The one-time history seed has run in this server process. */
let seeded = false;

export async function reportsHub(u: UserDoc): Promise<ReportsHubDto> {
  mustStaff(u);
  if (!seeded) {
    const demo = await import("./reports-demo");
    await demo.seedSharedHistory();
    await demo.seedHistoryExtras();
    seeded = true;
  }
  const db = await collections();
  const s = reportScope(u);
  // Independent reads run together; schedules are read after due runs have been recorded.
  const lists = runDue().then(() =>
    Promise.all([
      db.reportViews.find({}).sort({ updatedAt: -1 }).limit(200).toArray(),
      db.reportSchedules
        .find(
          s.label.startsWith("Director")
            ? {}
            : { $or: [{ ownerId: u._id }, { "recipients.id": u._id.toHexString() }] },
        )
        .sort({ createdAt: -1 })
        .toArray(),
      db.reportExports
        .find({ $or: [{ ownerId: u._id }, { recipientIds: u._id }] })
        .sort({ generatedAt: -1 })
        .limit(60)
        .toArray(),
      db.users
        .find(
          { role: "admin", disabled: { $ne: true } },
          { projection: { name: 1, staffRoles: 1, role: 1 } },
        )
        .toArray(),
    ]),
  );
  const loaded = await loadFacts(u);
  const allRoles = await loadRoles();
  const ids = u.role === "therapist" ? [] : await syncInsights(loaded);
  const [[views, schedules, exports, people], insights] = await Promise.all([
    lists,
    db.reportInsights.find({ _id: { $in: ids } }).toArray(),
  ]);
  const taskIds = insights.flatMap((i) => (i.taskId ? [i.taskId] : []));
  const tasks = taskIds.length
    ? await db.opsTasks.find({ _id: { $in: taskIds } }, { projection: { ref: 1 } }).toArray()
    : [];
  const taskRefs = new Map(tasks.map((t) => [t._id.toHexString(), t.ref]));
  const domainOfInsight = (c: string) => c as (typeof s.domains)[number];
  return {
    scope: s,
    me: { id: u._id.toHexString(), name: u.name },
    today: loaded.today,
    now: loaded.now,
    earliest: loaded.earliest,
    latest: loaded.latest,
    freshness: loaded.freshness,
    settings: loaded.settings,
    facts: loaded.facts,
    names: loaded.names,
    views: views.filter((v) => canSeeView(v, u, s)).map((v) => viewDto(v, u)),
    schedules: schedules.map((x) => scheduleDto(x, u)),
    exports: exports.map((e) => exportDto(e, u, s)),
    insights: insights
      .filter((i) => s.domains.includes(domainOfInsight(i.category)))
      .sort((a, b) => sev(b.severity) - sev(a.severity))
      .map((i) => insightDto(i, taskRefs)),
    people: people.map((p) => {
      const ps = scopeFromPermissions(
        effectivePermissions(p.staffRoles, allRoles),
        p.role,
        p.staffRoles ?? [],
      );
      return {
        id: p._id.toHexString(),
        name: p.name,
        roles: p.staffRoles ?? [],
        scopeLabel: ps.label,
        domains: ps.domains,
      };
    }),
  };
}
const sev = (x: string) => (x === "Urgent Operational" ? 3 : x === "Review" ? 2 : 1);

export const exportRows = (e: ReportExportDoc) => e.rows as Row[];
