import { z } from "zod";
import { builderCategories, type BuilderSpec } from "./report-catalogue";
import {
  appointmentModes,
  compareModes,
  datePresets,
  managementModes,
  serviceSettings,
  shareScopes,
  timeGrains,
  type ReportFacts,
  type ReportFilters,
  type ReportScope,
  type ShareScope,
} from "./reports";

export const exportFormats = ["CSV", "XLSX", "PDF summary"] as const;

/** What people read. The stored name stays "PDF summary" so older exports keep opening. */
export const formatLabel = (format: string) => (format === "PDF summary" ? "PDF" : format);
export type ExportFormat = (typeof exportFormats)[number];
export const exportContents = [
  "Summary only",
  "Aggregate with chart data",
  "Permitted detail rows",
] as const;
export type ExportContents = (typeof exportContents)[number];
export const frequencies = ["One-time", "Daily", "Weekly", "Monthly"] as const;
export const deliveryModes = ["In-app", "Email link"] as const;
export const scheduleStatuses = ["Draft", "Active", "Paused", "Failed", "Archived"] as const;
export type ScheduleStatus = (typeof scheduleStatuses)[number];
export const insightStatuses = ["New", "Reviewed", "Acknowledged", "Dismissed"] as const;

/** Distribution groups are internal teams; members are re-checked at every run. */
export const distributionGroups = [
  { id: "finance-team", name: "Finance team", roles: ["Finance", "Finance Manager"] },
  {
    id: "ops-leadership",
    name: "Operations leadership",
    roles: ["Super Admin", "Operations Manager"],
  },
  { id: "clinical-leads", name: "Clinical leads", roles: ["Clinical Lead"] },
  {
    id: "intake-scheduling",
    name: "Intake and scheduling",
    roles: ["Intake Officer", "Scheduler"],
  },
] as const;

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a date");
export const filtersSchema = z.object({
  preset: z.enum(datePresets),
  from: day,
  to: day,
  setting: z.union([z.literal(""), z.enum(serviceSettings)]),
  discipline: z.string().max(60),
  support: z.string().max(80),
  mode: z.union([z.literal(""), z.enum(appointmentModes)]),
  region: z.string().max(60),
  therapist: z.string().max(120),
  patient: z.string().max(40),
  management: z.union([z.literal(""), z.enum(managementModes)]),
  status: z.string().max(60),
  search: z.string().max(80),
  compare: z.enum(compareModes),
  grain: z.enum(timeGrains),
}) satisfies z.ZodType<ReportFilters>;

export const specSchema = z.object({
  name: z.string().max(80),
  category: z.enum(builderCategories),
  measures: z.array(z.string().max(40)).max(6),
  dimensions: z.array(z.string().max(40)).max(4),
  grain: z.union([z.literal(""), z.enum(timeGrains)]),
  basis: z.string().max(40),
  statuses: z.array(z.string().max(60)).max(20),
  columns: z.array(z.string().max(40)).max(20),
  sort: z.object({ key: z.string().max(40), dir: z.enum(["asc", "desc"]) }),
  limit: z.number().int().min(1).max(500),
  view: z.enum(["Aggregate", "Detail"]),
  description: z.string().max(500),
}) satisfies z.ZodType<BuilderSpec>;

export const viewInputSchema = z.object({
  id: z.string().max(40).optional(),
  name: z
    .string()
    .trim()
    .min(3, "A report name has 3 to 80 characters")
    .max(80, "A report name has 3 to 80 characters"),
  description: z.string().max(500, "The description can be up to 500 characters").default(""),
  scope: z.enum(shareScopes),
  reportId: z.string().max(10).nullable(),
  spec: specSchema.nullable(),
  filters: filtersSchema,
  overwrite: z.boolean().default(false),
});

export const scheduleInputSchema = z.object({
  id: z.string().max(40).optional(),
  name: z.string().trim().min(3, "A schedule name has 3 to 80 characters").max(80),
  reportId: z.string().regex(/^R\d\d$/, "Choose a report"),
  preset: z
    .enum(datePresets)
    .refine((p) => p !== "Custom", "Scheduled reports use a relative date range"),
  filters: filtersSchema.partial().default({}),
  frequency: z.enum(frequencies),
  weekday: z.number().int().min(1).max(7).nullable().default(null),
  monthDay: z
    .union([
      z.number().int().min(1, "Choose a day from 1 to 28").max(28, "Choose a day from 1 to 28"),
      z.literal("Last business day"),
    ])
    .nullable()
    .default(null),
  oneTimeDate: day.nullable().default(null),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter the time as HH:MM"),
  recipients: z
    .array(
      z.object({
        kind: z.enum(["self", "user", "group", "email"]),
        id: z.string().max(160),
        name: z.string().max(160),
      }),
    )
    .min(1, "Add at least one recipient")
    .max(20),
  delivery: z.enum(deliveryModes),
  format: z.enum(exportFormats),
  contents: z.enum(exportContents),
  activate: z.boolean().default(false),
});
export type ScheduleInput = z.infer<typeof scheduleInputSchema>;

export const exportInputSchema = z.object({
  reportId: z
    .string()
    .regex(/^R\d\d$/)
    .nullable(),
  viewId: z.string().max(40).nullable(),
  spec: specSchema.nullable(),
  filters: filtersSchema,
  format: z.enum(exportFormats),
  contents: z.enum(exportContents),
});
export type ExportInput = z.infer<typeof exportInputSchema>;

export type ViewDto = {
  id: string;
  name: string;
  description: string;
  owner: string;
  mine: boolean;
  scope: ShareScope;
  team: string | null;
  reportId: string | null;
  spec: BuilderSpec | null;
  filters: ReportFilters;
  status: "Active" | "Archived";
  version: number;
  updatedAt: string;
  history: { at: string; by: string; action: string }[];
};

export type RunDto = {
  id: string;
  at: string;
  outcome: string;
  detail: string;
  exportId: string | null;
  delivered: string[];
  excluded: string[];
  attempt: number;
  steps: { state: string; at: string }[];
};

export type ScheduleDto = {
  id: string;
  ref: string;
  name: string;
  reportId: string;
  preset: string;
  filters: Partial<ReportFilters>;
  frequency: string;
  weekday: number | null;
  monthDay: number | "Last business day" | null;
  oneTimeDate: string | null;
  time: string;
  timezone: string;
  recipients: { kind: string; id: string; name: string }[];
  delivery: string;
  format: ExportFormat;
  contents: ExportContents;
  status: ScheduleStatus;
  owner: string;
  mine: boolean;
  nextRun: string | null;
  runs: RunDto[];
  history: { at: string; by: string; action: string }[];
};

export type ExportDto = {
  id: string;
  ref: string;
  reportId: string;
  title: string;
  owner: string;
  mine: boolean;
  format: ExportFormat;
  contents: ExportContents;
  summary: string[];
  unit: string;
  basis: string;
  rowCount: number;
  generatedAt: string;
  expiresAt: string;
  status: string;
  revoked: { by: string; at: string; reason: string } | null;
  scheduled: boolean;
  /** False when the viewer's current role no longer covers it (link can't bypass rights). */
  canOpen: boolean;
  downloads: { by: string; at: string; format: string; outcome: string }[];
};

export type InsightDto = {
  id: string;
  type: string;
  title: string;
  category: string;
  severity: "Info" | "Review" | "Urgent Operational";
  period: string;
  source: string;
  evidenceCount: number;
  evidence: { label: string; value: string }[];
  threshold: string;
  rule: string;
  suggestion: string;
  href: string;
  generatedAt: string;
  owner: string;
  status: (typeof insightStatuses)[number];
  taskRef: string | null;
  taskHref: string | null;
  smallSample: boolean;
  ai: { text: string; at: string; by: string } | null;
  history: { at: string; by: string; action: string }[];
};

export type PersonDto = {
  id: string;
  name: string;
  roles: string[];
  scopeLabel: string;
  domains: string[];
};

export type ReportsHubDto = {
  scope: ReportScope;
  me: { id: string; name: string };
  today: string;
  now: string;
  earliest: string;
  latest: string;
  freshness: string;
  settings: {
    thresholds: Record<string, number>;
    deadlines: { noteDueHours: number; reportDueDays: number };
    history: { at: string; by: string; what: string }[];
  };
  facts: ReportFacts;
  names: Record<string, string>;
  views: ViewDto[];
  schedules: ScheduleDto[];
  exports: ExportDto[];
  insights: InsightDto[];
  people: PersonDto[];
};

/** One therapist's reports: the same facts and filters as the hub, cut to that therapist. */
export type TherapistHubDto = {
  hub: ReportsHubDto;
  subject: { id: string; name: string; discipline: string; region: string };
  /** True when a therapist is looking at their own reports. */
  self: boolean;
};
