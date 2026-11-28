import { describe, expect, it, vi } from "vitest";
import { reports } from "@/lib/live/report-catalogue";
import {
  blankFilters,
  domains,
  emptyFacts,
  shareScopes,
  type ReportScope,
} from "@/lib/live/reports";
import type { ExportInput } from "@/lib/live/report-dto";
import { exportFile } from "@/lib/live/report-files";
import { defaultThresholds } from "./report-settings";
import type { LoadedFacts } from "./reports";

vi.mock("./db", () => ({ collections: async () => ({}) }));
vi.mock("./log", () => ({ serverLog: () => undefined }));

const { buildExport, nextRunAt } = await import("./report-actions");

const today = "2026-11-14";
const fullScope: ReportScope = {
  label: "Director (clinical scope)",
  domains: [...domains],
  detail: [...domains],
  clinicalDetail: true,
  share: [...shareScopes],
  schedule: true,
  teams: [],
};
const aggregateScope: ReportScope = { ...fullScope, detail: [], clinicalDetail: false };

const loaded = (scope: ReportScope): LoadedFacts => ({
  scope,
  facts: emptyFacts(),
  names: {} as Record<string, string>,
  today,
  now: `${today}T02:00:00.000Z`,
  earliest: "2026-07-01",
  latest: today,
  freshness: `${today}T02:00:00.000Z`,
  settings: {
    thresholds: defaultThresholds,
    deadlines: { noteDueHours: 48, reportDueDays: 21 },
    history: [],
  },
});

const base = (over: Partial<ExportInput> = {}): ExportInput => ({
  reportId: "R01",
  viewId: null,
  spec: null,
  filters: { ...blankFilters(today), preset: "Custom", from: "2026-11-01", to: "2026-11-30" },
  format: "CSV",
  contents: "Aggregate with chart data",
  ...over,
});

const detailReport = reports.find((r) => r.detail);
const aggregateReport = reports.find((r) => !r.detail);

describe("building an export", () => {
  it("refuses when no report is chosen", () => {
    expect(() => buildExport(loaded(fullScope), base({ reportId: null }))).toThrow(
      "Choose a report.",
    );
  });

  it("refuses a range that runs backwards", () => {
    const input = base({
      filters: { ...base().filters, from: "2026-11-30", to: "2026-11-01" },
    });
    expect(() => buildExport(loaded(fullScope), input)).toThrow(/start date/);
  });

  it("refuses a report from a domain the person cannot read", () => {
    const scope = { ...fullScope, domains: [] };
    expect(() => buildExport(loaded(scope), base())).toThrow(/can't open this report/);
  });

  it("refuses record detail for an aggregate-only scope", () => {
    if (!detailReport) return;
    const input = base({ reportId: detailReport.id, contents: "Permitted detail rows" });
    expect(() => buildExport(loaded(aggregateScope), input)).toThrow(/can't export record detail/);
  });

  it("refuses a chart summary of a record-level report", () => {
    if (!detailReport) return;
    const input = base({ reportId: detailReport.id, contents: "Aggregate with chart data" });
    expect(() => buildExport(loaded(fullScope), input)).toThrow(/lists records/);
  });

  it("gives a summary only, with no rows, when asked for it", () => {
    if (!aggregateReport) return;
    const out = buildExport(
      loaded(fullScope),
      base({ reportId: aggregateReport.id, contents: "Summary only" }),
    );
    expect(out.rows).toEqual([]);
    expect(out.columns).toEqual([]);
    expect(out.metrics.length).toBeGreaterThanOrEqual(0);
  });

  it("builds a report with its filters, basis and freshness", () => {
    if (!aggregateReport) return;
    const out = buildExport(loaded(fullScope), base({ reportId: aggregateReport.id }));
    expect(out.reportId).toBe(aggregateReport.id);
    expect(out.summary[0]).toBe("Custom: 1 Nov – 30 Nov 2026");
    expect(out.basis).toBe(aggregateReport.basis);
  });

  it("refuses an invalid builder spec with the first reason", () => {
    const spec = {
      name: "Bad",
      category: "Finance" as const,
      measures: ["nope"],
      dimensions: [],
      grain: "" as const,
      basis: "",
      statuses: [],
      columns: [],
      sort: { key: "", dir: "desc" as const },
      limit: 50,
      view: "Aggregate" as const,
      description: "",
    };
    expect(() => buildExport(loaded(fullScope), base({ reportId: null, spec }))).toThrow(
      /isn't a measure/,
    );
  });
});

describe("next run of a schedule", () => {
  const at = (iso: string) => new Date(iso);
  // Brisbane is UTC+10 with no daylight saving, so 08:00 Brisbane is 22:00 UTC the day before.

  it("runs a daily schedule at the next Brisbane time", () => {
    const next = nextRunAt(
      { frequency: "Daily", weekday: null, monthDay: null, oneTimeDate: null, time: "08:00" },
      at("2026-11-14T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-11-14T22:00:00.000Z");
  });

  it("runs a weekly schedule on its weekday", () => {
    // 2026-11-14 is a Saturday; weekday 1 is Monday, so the next Monday is 16 November.
    const next = nextRunAt(
      { frequency: "Weekly", weekday: 1, monthDay: null, oneTimeDate: null, time: "08:00" },
      at("2026-11-14T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-11-15T22:00:00.000Z");
  });

  it("runs a monthly schedule on its day", () => {
    const next = nextRunAt(
      { frequency: "Monthly", weekday: null, monthDay: 1, oneTimeDate: null, time: "08:00" },
      at("2026-11-14T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });

  it("runs on the last business day of the month", () => {
    // 30 November 2026 is a Monday, the last business day, so the run is 08:00 Brisbane on 30 Nov,
    // which is 22:00 UTC on 29 Nov.
    const next = nextRunAt(
      {
        frequency: "Monthly",
        weekday: null,
        monthDay: "Last business day",
        oneTimeDate: null,
        time: "08:00",
      },
      at("2026-11-14T00:00:00.000Z"),
    );
    expect(next?.toISOString()).toBe("2026-11-29T22:00:00.000Z");
  });

  it("runs a one-time schedule once, and never again after it has passed", () => {
    const sched = {
      frequency: "One-time" as const,
      weekday: null,
      monthDay: null,
      oneTimeDate: "2026-11-20",
      time: "08:00",
    };
    expect(nextRunAt(sched, at("2026-11-14T00:00:00.000Z"))?.toISOString()).toBe(
      "2026-11-19T22:00:00.000Z",
    );
    expect(nextRunAt(sched, at("2026-11-20T00:00:00.000Z"))).toBeNull();
  });
});

describe("export files", () => {
  const snapshot = {
    ref: "EXP-1",
    reportId: "R01",
    title: "Referrals <b>overview</b>",
    ownerName: "Neil",
    generatedAt: new Date("2026-11-14T02:00:00.000Z"),
    freshness: new Date("2026-11-14T02:00:00.000Z"),
    contents: "Summary only",
    summary: ["Custom: 1 Nov – 30 Nov 2026"],
    unit: "referrals",
    basis: "Submitted date",
    columns: [{ key: "a", label: "A", kind: "text" }],
    rows: [{ a: "<script>x</script>" }],
    metrics: [{ label: "Total", value: "4", unit: "referrals" }],
  };

  it("names CSV and Excel files by their export ref and report", () => {
    expect(exportFile(snapshot, "CSV", "Neil").name).toBe("exp-1-r01.csv");
    expect(exportFile(snapshot, "XLSX", "Neil").name).toBe("exp-1-r01.xls");
  });

  it("opens CSV and Excel as downloads", () => {
    expect(exportFile(snapshot, "CSV", "Neil").inline).toBe(false);
    expect(exportFile(snapshot, "XLSX", "Neil").inline).toBe(false);
  });

  it("carries the report ID, owner, freshness and filters on every format", () => {
    for (const format of ["CSV", "XLSX"]) {
      const body = exportFile(snapshot, format, "Neil").body;
      expect(body).toContain("EXP-1");
      expect(body).toContain("Neil");
      expect(body).toContain("Custom: 1 Nov – 30 Nov 2026");
    }
  });
});
