import "server-only";
import { can } from "./permissions";
import { z } from "zod";
import { collections } from "./db";
import { UserFacingError } from "./http";
import { audit } from "./live";
import type { UserDoc } from "./models";
import { reportScope } from "./reports";

/**
 * Section 15: alert thresholds are operational configuration and clinical backlog deadlines are
 * clinical rules. Both are edited by the right people, with a change history.
 */
export const thresholdsSchema = z.object({
  referralSpike: z.number().min(1).max(5),
  referralSpikeMin: z.number().int().min(1).max(100),
  capacityRatio: z.number().min(0.5).max(1.5),
  documentationMin: z.number().int().min(1).max(100),
  cancellationRate: z.number().min(1).max(100),
  cancellationMin: z.number().int().min(1).max(100),
  fundingCluster: z.number().int().min(1).max(100),
  telehealthFailure: z.number().min(1).max(100),
  telehealthMin: z.number().int().min(1).max(100),
  revenueVariance: z.number().min(1).max(500),
});
export type Thresholds = z.infer<typeof thresholdsSchema>;

export const deadlinesSchema = z.object({
  noteDueHours: z.number().int().min(4).max(240),
  reportDueDays: z.number().int().min(1).max(90),
});
export type Deadlines = z.infer<typeof deadlinesSchema>;

export type ReportSettings = {
  thresholds: Thresholds;
  deadlines: Deadlines;
  history: { at: string; by: string; what: string }[];
};

export const defaultThresholds: Thresholds = {
  referralSpike: 1.5,
  referralSpikeMin: 3,
  capacityRatio: 0.9,
  documentationMin: 3,
  cancellationRate: 25,
  cancellationMin: 5,
  fundingCluster: 3,
  telehealthFailure: 20,
  telehealthMin: 4,
  revenueVariance: 40,
};
export const defaultDeadlines: Deadlines = { noteDueHours: 48, reportDueDays: 21 };

type Doc = {
  _id: string;
  thresholds: Thresholds;
  deadlines: Deadlines;
  history: { at: Date; by: string; what: string }[];
};
const ID = "report-settings";

export async function reportSettings(): Promise<ReportSettings> {
  const db = await collections();
  const doc = await db.db.collection<Doc>("settings").findOne({ _id: ID });
  return {
    thresholds: { ...defaultThresholds, ...doc?.thresholds },
    deadlines: { ...defaultDeadlines, ...doc?.deadlines },
    history: (doc?.history ?? []).map((h) => ({ ...h, at: h.at.toISOString() })).reverse(),
  };
}

const changes = (from: Record<string, number>, to: Record<string, number>) =>
  Object.keys(to)
    .filter((k) => from[k] !== to[k])
    .map((k) => `${k} ${from[k]} → ${to[k]}`);

export const settingsInputSchema = z.object({
  thresholds: thresholdsSchema.optional(),
  deadlines: deadlinesSchema.optional(),
  reason: z.string().trim().min(3, "Say why the change is being made").max(300),
});

export async function saveReportSettings(u: UserDoc, input: z.infer<typeof settingsInputSchema>) {
  const s = reportScope(u);
  const cur = await reportSettings();
  const lines: string[] = [];
  const set: Partial<Doc> = {};
  if (input.thresholds) {
    // Alert thresholds are organisation-wide, so they need organisation-wide reporting authority.
    if (!can(u, "reports.share.organisation"))
      throw new UserFacingError(
        "Only a Director or Operations Manager can change alert thresholds.",
        409,
      );
    lines.push(...changes(cur.thresholds, input.thresholds));
    set.thresholds = input.thresholds;
  }
  if (input.deadlines) {
    if (u.role !== "admin" || !s.clinicalDetail)
      throw new UserFacingError(
        "Clinical deadlines are approved by clinical leadership (Clinical Lead).",
        409,
      );
    lines.push(...changes(cur.deadlines, input.deadlines));
    set.deadlines = input.deadlines;
  }
  if (!lines.length) throw new UserFacingError("Nothing changed.");
  const db = await collections();
  await db.db.collection<Doc>("settings").updateOne(
    { _id: ID },
    {
      $set: { thresholds: cur.thresholds, deadlines: cur.deadlines, ...set },
      $push: {
        history: {
          at: new Date(),
          by: u.name,
          what: `${lines.join("; ")}. Reason: ${input.reason}`,
        },
      },
    },
    { upsert: true },
  );
  await audit(u, `Reports: settings changed: ${lines.join("; ")}`, null);
  return { ok: true };
}
