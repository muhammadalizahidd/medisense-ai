import { describe, expect, it } from "vitest";
import {
  ageBucket,
  blankSpec,
  builderCategories,
  categories,
  reports,
  rowLimits,
  runReport,
  runSpec,
  specErrors,
  suppress,
  toCsv,
  type BuilderCategory,
  type Row,
} from "./report-catalogue";
import {
  blankFilters,
  compareModes,
  compareRange,
  datePresets,
  domains,
  emptyFacts,
  formatValue,
  metrics,
  presetRange,
  rangeError,
  runMetric,
  shareScopes,
  type AppointmentFact,
  type ReportFacts,
  type ReportScope,
} from "./reports";

/* Every report, metric, builder category and date preset runs through the same checks, so a new
   one added to the catalogue is covered without a new test. */

const today = "2026-11-14";
const now = "2026-11-14T02:00:00.000Z";
const ctx = { today, now, earliest: "2020-01-01" };
const names = new Map<string, string>([["t1", "Emma Clarke"]]);

const fullScope: ReportScope = {
  label: "Director (clinical scope)",
  domains: [...domains],
  detail: [...domains],
  clinicalDetail: true,
  share: [...shareScopes],
  schedule: true,
  teams: ["Intake", "Scheduling", "Clinical", "Finance", "Operations"],
};
const aggregateScope: ReportScope = {
  ...fullScope,
  detail: [],
  clinicalDetail: false,
  share: ["Private"],
  schedule: false,
};
const noScope: ReportScope = { ...fullScope, domains: [], detail: [], clinicalDetail: false };

const appt = (p: Partial<AppointmentFact> = {}): AppointmentFact => ({
  id: "a1",
  ref: "APT-1",
  participantId: "p1",
  label: "P",
  therapistId: "t1",
  discipline: "Occupational Therapy",
  support: "Occupational Therapy",
  start: "2026-11-05T00:00:00.000Z",
  status: "completed",
  mode: "Home",
  settings: ["NDIS"],
  scheduledMinutes: 60,
  deliveredMinutes: 60,
  verified: true,
  confirmed: true,
  cancelledAt: null,
  cancelReason: null,
  cancelledBy: null,
  late: false,
  movedFrom: null,
  travelBooked: 20,
  travelRecorded: 25,
  travelCharge: "Charged",
  noteStatus: "Final",
  noteDue: "2026-11-07T00:00:00.000Z",
  noteSignedAt: null,
  restricted: false,
  ...p,
});

/** A small but realistic period: delivered, cancelled, did-not-attend and an unsigned note. */
const populated = (): ReportFacts => ({
  ...emptyFacts(),
  appointments: [
    appt({ id: "a1" }),
    appt({ id: "a2", status: "no-show", deliveredMinutes: 0, verified: false, late: true }),
    appt({
      id: "a3",
      status: "cancelled",
      deliveredMinutes: 0,
      verified: false,
      cancelledAt: "2026-11-04T00:00:00.000Z",
      cancelledBy: "client",
      cancelReason: "Unwell",
      noteStatus: "Draft",
      noteSignedAt: null,
    }),
    appt({ id: "a4", therapistId: "t1", start: "2026-11-10T01:00:00.000Z", mode: "Telehealth" }),
  ],
});

const filters = {
  ...blankFilters(today),
  preset: "Custom" as const,
  from: "2026-11-01",
  to: "2026-11-30",
};
const isPlainCell = (v: unknown) =>
  v === null || typeof v === "string" || (typeof v === "number" && Number.isFinite(v));

describe("every report", () => {
  describe.each(reports.map((r) => [r.id, r] as const))("%s", (_id, def) => {
    it("runs over an empty period and returns finite, plain cells", () => {
      const res = runReport(def, emptyFacts(), filters, ctx, names, fullScope);
      expect(res.allowed).toBe(true);
      if (!res.allowed) return;
      for (const row of res.rows)
        for (const v of Object.values(row)) expect(isPlainCell(v)).toBe(true);
    });

    it("runs over a populated period and returns finite, plain cells", () => {
      const res = runReport(def, populated(), filters, ctx, names, fullScope);
      expect(res.allowed).toBe(true);
      if (!res.allowed) return;
      for (const row of res.rows)
        for (const v of Object.values(row)) expect(isPlainCell(v)).toBe(true);
    });

    it("is blocked, with a reason, for a domain the person cannot read", () => {
      const res = runReport(def, populated(), filters, ctx, names, noScope);
      expect(res.allowed).toBe(false);
      if (res.allowed) return;
      expect(res.reason).toMatch(/can't open this report/);
    });

    it("keeps record-level reports from aggregate-only scopes", () => {
      const res = runReport(def, populated(), filters, ctx, names, aggregateScope);
      expect(res.allowed).toBe(!def.detail);
    });

    it("declares labelled, unique columns", () => {
      const keys = def.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const c of def.columns) expect(c.label.trim().length).toBeGreaterThan(0);
    });
  });
});

describe("every metric", () => {
  describe.each(metrics.map((m) => [m.id, m] as const))("%s", (id, def) => {
    it("belongs to a known domain", () => {
      expect(domains).toContain(def.domain);
    });

    it("returns N/A or a finite number over an empty period", () => {
      const r = runMetric(id, emptyFacts(), filters, ctx);
      expect(r.value === null || Number.isFinite(r.value)).toBe(true);
    });

    it("returns a finite number or N/A over a populated period", () => {
      const r = runMetric(id, populated(), filters, ctx);
      expect(r.value === null || Number.isFinite(r.value)).toBe(true);
    });

    it.each(compareModes)("handles the comparison mode %s without throwing", (compare) => {
      const r = runMetric(
        id,
        populated(),
        { ...filters, compare },
        { ...ctx, earliest: "2020-01-01" },
      );
      expect(r).toBeTruthy();
    });

    it("gives N/A, not zero, for a comparison before the first record", () => {
      const r = runMetric(id, populated(), filters, { ...ctx, earliest: "2026-11-01" });
      expect(r.previous).toBeNull();
      expect(r.compareNote).not.toBeNull();
    });
  });
});

describe("date presets", () => {
  describe.each(datePresets.filter((p) => p !== "Custom").map((p) => [p] as const))("%s", (p) => {
    it("gives a valid range that rangeError accepts", () => {
      const r = presetRange(p, today);
      expect(r.from <= r.to).toBe(true);
      expect(rangeError(r.from, r.to, "2020-01-01", today)).toBeNull();
    });
  });

  it("works out the calendar ranges in mid-quarter", () => {
    expect(presetRange("Last 7 Days", today)).toEqual({ from: "2026-11-08", to: "2026-11-14" });
    expect(presetRange("Last Month", today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(presetRange("This Quarter", today)).toEqual({ from: "2026-10-01", to: "2026-12-31" });
    expect(presetRange("Last Quarter", today)).toEqual({ from: "2026-07-01", to: "2026-09-30" });
  });

  it("wraps across the year in January", () => {
    const jan = "2026-01-05";
    expect(presetRange("Last Month", jan)).toEqual({ from: "2025-12-01", to: "2025-12-31" });
    expect(presetRange("Last Quarter", jan)).toEqual({ from: "2025-10-01", to: "2025-12-31" });
  });
});

describe("custom range checks", () => {
  const earliest = "2026-07-01";
  it("asks for both dates", () => {
    expect(rangeError("", "2026-11-01", earliest, today)).toBe("Enter both dates.");
  });
  it("blocks a range that runs backwards", () => {
    expect(rangeError("2026-11-10", "2026-11-01", earliest, today)).toMatch(/start date/);
  });
  it("blocks a range that ends before the records start", () => {
    expect(rangeError("2026-01-01", "2026-06-30", earliest, today)).toMatch(/Records start/);
  });
  it("blocks dates more than 90 days ahead", () => {
    expect(rangeError("2027-06-01", "2027-06-10", earliest, today)).toMatch(/90 days/);
  });
  it("blocks a range longer than two years", () => {
    expect(rangeError("2024-01-01", "2026-06-01", "2020-01-01", today)).toMatch(/two years/);
  });
  it("accepts a range inside the history", () => {
    expect(rangeError("2026-11-01", "2026-11-30", earliest, today)).toBeNull();
  });
});

describe("comparison ranges", () => {
  it("covers the same length of time just before the period", () => {
    expect(compareRange("Previous equivalent period", "2026-11-01", "2026-11-30")).toEqual({
      from: "2026-10-02",
      to: "2026-10-31",
    });
  });
  it("moves back exactly one year for same period last year", () => {
    expect(compareRange("Same period last year", "2026-11-01", "2026-11-30")).toEqual({
      from: "2025-11-01",
      to: "2025-11-30",
    });
  });
  it("returns nothing when no comparison is asked for", () => {
    expect(compareRange("No comparison", "2026-11-01", "2026-11-30")).toBeNull();
  });
});

describe("confidential suppression (AT-43)", () => {
  it("hides a count of one or two, and only for confidential disciplines", () => {
    const rows: Row[] = [
      { discipline: "Psychology", count: 2 },
      { discipline: "Psychology", count: 1 },
      { discipline: "Trauma Therapy", count: 0 },
      { discipline: "Occupational Therapy", count: 2 },
    ];
    const out = suppress(rows, aggregateScope);
    expect(out[0]?.count).toBeNull();
    expect(out[0]?._suppressed).toBeTruthy();
    expect(out[1]?.count).toBeNull();
    expect(out[2]?.count).toBe(0);
    expect(out[3]?.count).toBe(2);
  });

  it("shows every count to a clinical scope", () => {
    const rows: Row[] = [{ discipline: "Psychology", count: 2 }];
    expect(suppress(rows, fullScope)).toEqual(rows);
  });

  it("hides a suppressed row's detail values from the export as Suppressed", () => {
    const csv = toCsv(
      [
        { key: "discipline", label: "Discipline" },
        { key: "count", label: "Count" },
      ],
      suppress([{ discipline: "Psychology", count: 2 }], aggregateScope),
      [],
    );
    expect(csv).toContain("Psychology,Suppressed");
  });
});

describe("CSV export", () => {
  const cols = [{ key: "a", label: "A" }];

  it("writes metadata rows first, then a header, then the rows, with CRLF line endings", () => {
    const csv = toCsv(cols, [{ a: "x" }], [["Unit", "bookings"]]);
    expect(csv.split("\r\n")).toEqual(["# Unit,bookings", "", "A", "x"]);
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(toCsv(cols, [{ a: 'say "hi", now\nbye' }], [])).toContain('"say ""hi"", now\nbye"');
  });

  it("neutralises formula cells so a spreadsheet will not run them", () => {
    for (const bad of ["=SUM(1)", "+1", "-1", "@cmd"]) {
      const csv = toCsv(cols, [{ a: bad }], []);
      const cell = csv.split("\r\n").at(-1) ?? "";
      expect(cell.startsWith("'") || cell.startsWith("\"'")).toBe(true);
    }
  });

  it("leaves ordinary numbers and text alone", () => {
    expect(
      toCsv(cols, [{ a: 42 }], [])
        .split("\r\n")
        .at(-1),
    ).toBe("42");
  });
});

describe("builder categories", () => {
  describe.each(builderCategories.map((c) => [c] as const))("%s", (cat: BuilderCategory) => {
    const c = categories[cat];

    it("starts from a blank spec with no errors on a full scope", () => {
      expect(specErrors(blankSpec(cat), fullScope)).toEqual([]);
    });

    it("refuses a category the person cannot report on", () => {
      expect(specErrors(blankSpec(cat), { ...fullScope, domains: [] })).toContain(
        `Your role can't report on ${cat}.`,
      );
    });

    it("runs an empty period to zero rows", () => {
      const out = runSpec(blankSpec(cat), emptyFacts(), filters, names);
      expect(out.total).toBe(0);
      expect(out.rows).toEqual([]);
    });

    it.each(c.measures.map((m) => [m.key, m.label] as const))(
      "runs the measure %s alone over populated facts",
      (key) => {
        const spec = { ...blankSpec(cat), measures: [key], dimensions: [], grain: "" as const };
        expect(specErrors(spec, fullScope)).toEqual([]);
        const out = runSpec(spec, populated(), filters, names);
        for (const row of out.rows)
          for (const v of Object.values(row)) expect(isPlainCell(v)).toBe(true);
      },
    );

    it("keeps detail rows away from an aggregate-only scope", () => {
      const spec = { ...blankSpec(cat), view: "Detail" as const };
      expect(specErrors(spec, aggregateScope)).toContain(
        "Your role can see aggregate figures here, not record detail.",
      );
    });

    it("rejects an unknown measure, grouping and more than two groupings", () => {
      const spec = blankSpec(cat);
      expect(specErrors({ ...spec, measures: ["nope"] }, fullScope)[0]).toMatch(/isn't a measure/);
      expect(specErrors({ ...spec, dimensions: ["nope"] }, fullScope)[0]).toMatch(
        /isn't a grouping/,
      );
      const three = c.dims.slice(0, 3).map((d) => d.key);
      if (three.length === 3)
        expect(specErrors({ ...spec, dimensions: three }, fullScope)).toContain(
          "Group by up to two fields.",
        );
    });
  });
});

describe("builder rules", () => {
  it("refuses a time series without a time basis", () => {
    const spec = { ...blankSpec("Scheduling"), grain: "Week" as const, basis: "nope" };
    expect(specErrors(spec, fullScope)).toContain("A time series needs a time basis.");
  });

  it("refuses to mix rates with counts or amounts", () => {
    const pct = categories["Scheduling"].measures.find((m) => m.unit === "%");
    const count = categories["Scheduling"].measures.find((m) => m.unit !== "%");
    if (!pct || !count) throw new Error("Scheduling needs a rate and a count to test this");
    const spec = { ...blankSpec("Scheduling"), measures: [pct.key, count.key], dimensions: [] };
    expect(specErrors(spec, fullScope).join(" ")).toMatch(/Rates can't be shown/);
  });

  it("requires the fields a detail row needs to open", () => {
    const cat = categories["Scheduling"];
    const required = cat.columns.find((c) => c.required);
    if (!required) return;
    const spec = {
      ...blankSpec("Scheduling"),
      view: "Detail" as const,
      columns: cat.columns.filter((c) => c.key !== required.key).map((c) => c.key),
    };
    expect(specErrors(spec, fullScope)).toContain(`${required.label} is needed to open each row.`);
  });

  it("caps the rows a builder run returns at the chosen limit", () => {
    const spec = { ...blankSpec("Scheduling"), dimensions: ["status"], limit: rowLimits[0] };
    expect(runSpec(spec, populated(), filters, names).rows.length).toBeLessThanOrEqual(
      rowLimits[0],
    );
  });

  it("sorts grouped rows by a measure", () => {
    const cat = categories["Scheduling"];
    const measure = cat.measures.find((m) => m.unit !== "%");
    if (!measure) return;
    const spec = {
      ...blankSpec("Scheduling"),
      measures: [measure.key],
      dimensions: ["status"],
      sort: { key: measure.key, dir: "desc" as const },
    };
    const values = runSpec(spec, populated(), filters, names).rows.map((r) =>
      Number(r[measure.key]),
    );
    expect(values).toEqual([...values].sort((a, b) => b - a));
  });
});

describe("age buckets for overdue balances", () => {
  it("settles a zero balance and flags a missing due date", () => {
    expect(ageBucket("2026-10-01", 0, today)).toBe("Settled");
    expect(ageBucket(null, 50, today)).toBe("No due date");
  });
  it("places a balance by days past due", () => {
    expect(ageBucket("2026-11-20", 50, today)).toBe("Not yet due");
    expect(ageBucket("2026-10-20", 50, today)).toBe("1–30 days");
    expect(ageBucket("2026-09-30", 50, today)).toBe("31–60 days");
    expect(ageBucket("2026-08-20", 50, today)).toBe("61–90 days");
    expect(ageBucket("2026-01-01", 50, today)).toBe("90+ days");
  });
});

describe("formatting", () => {
  it("shows N/A for a missing value", () => {
    expect(formatValue(null, "%")).toBe("N/A");
  });
  it("formats rates to one decimal place and money in AUD", () => {
    expect(formatValue(12.345, "%")).toBe("12.3%");
    expect(formatValue(1234.5, "AUD")).toContain("1,234.50");
  });
});
