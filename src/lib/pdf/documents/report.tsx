import { Text } from "@react-pdf/renderer";
import { pdfColour } from "../theme";
import { formatValue } from "@/lib/live/reports";
import { brisbane, type Snapshot } from "@/lib/live/report-files";
import {
  BarChart,
  Callout,
  DataTable,
  Doc,
  DocPage,
  EmptyNote,
  MetaGrid,
  Section,
  StatTiles,
  TitleBlock,
  space,
  type TableColumn,
  type TableRow,
} from "../components";

/** The most rows a PDF carries. Longer reports point to the CSV, which holds everything. */
export const PDF_ROW_LIMIT = 500;

type Cell = string | number | null | undefined;

function cell(value: Cell, kind: string, suppressed: boolean): string {
  if (value === null || value === undefined || value === "") return suppressed ? "Suppressed" : "—";
  if (kind === "money" && typeof value === "number") return formatValue(value, "AUD");
  if (kind === "pct" && typeof value === "number") return `${value.toFixed(1)}%`;
  if (kind === "number" && typeof value === "number")
    return new Intl.NumberFormat("en-AU").format(value);
  if (kind === "date" && typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return new Intl.DateTimeFormat("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value.slice(0, 10)}T00:00:00Z`));
  }
  return String(value);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y ?? 0, m: MONTHS[(m ?? 1) - 1] ?? "", d: d ?? 1 };
};

/** "2026-10-01 to 2026-12-31" reads as "1 Oct – 31 Dec 2026"; a lone ISO date as "1 Oct 2026". */
export function readableDates(text: string) {
  return text
    .replace(/(\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/g, (_, a: string, b: string) => {
      const x = parts(a);
      const y = parts(b);
      return x.y === y.y
        ? `${x.d} ${x.m} – ${y.d} ${y.m} ${y.y}`
        : `${x.d} ${x.m} ${x.y} – ${y.d} ${y.m} ${y.y}`;
    })
    .replace(/(\d{4}-\d{2}-\d{2})/g, (_, a: string) => {
      const x = parts(a);
      return `${x.d} ${x.m} ${x.y}`;
    });
}

/** The most bars the chart draws; the table below always has every row. */
const CHART_BARS = 16;

/** A report export as a PDF: the headline figures, a chart, the data, then how to read it. */
export function ReportDocument({ e, viewer }: { e: Snapshot; viewer: string }) {
  const [rawPeriod, ...rawFilters] = e.summary;
  const period = rawPeriod ? readableDates(rawPeriod) : undefined;
  const filters = rawFilters.map(readableDates);
  const columns: TableColumn[] = e.columns.map((c) => ({
    key: c.key,
    label: c.label,
    align: ["number", "money", "pct"].includes(c.kind) ? "right" : "left",
  }));
  const rows: TableRow[] = e.rows
    .slice(0, PDF_ROW_LIMIT)
    .map((r) =>
      Object.fromEntries(
        e.columns.map((c) => [c.key, cell(r[c.key], c.kind, Boolean(r._suppressed))]),
      ),
    );
  const [head, more] = [e.metrics.slice(0, 4), e.metrics.slice(4)];
  // A chart when the data has a label column and a figure column to draw.
  const labelCol = e.columns.find((col) => col.kind === "text" || col.kind === "date");
  const valueCol = e.columns.find((col) => ["number", "money", "pct"].includes(col.kind));
  const chartRows = e.rows.filter((r) => typeof (valueCol ? r[valueCol.key] : null) === "number");
  const chart =
    labelCol && valueCol && chartRows.length >= 2
      ? chartRows.slice(0, CHART_BARS).map((r) => ({
          label: cell(r[labelCol.key], labelCol.kind, false),
          value: Number(r[valueCol.key]),
          display: cell(r[valueCol.key], valueCol.kind, false),
        }))
      : null;
  const chartLabelWidth = chart
    ? Math.min(150, Math.max(48, ...chart.map((b) => b.label.length * 4.6 + 8)))
    : 0;
  const about: [string, string][] = [
    ["Period", period?.replace(/^[^:]+: /, "") ?? "—"],
    ...filters.map((f): [string, string] => {
      const at = f.indexOf(": ");
      return at < 0 ? ["Filter", f] : [f.slice(0, at), f.slice(at + 2)];
    }),
    ["Unit", e.unit || "As labelled"],
    ["Date basis", e.basis || "As labelled"],
    ["Contents", e.contents],
    ["Data as of", brisbane(e.freshness)],
    ["Export", e.ref],
  ];
  return (
    <Doc title={e.title} author={e.ownerName}>
      <DocPage kind="Report" footer={`Data as of ${brisbane(e.freshness)} · Confidential`}>
        <TitleBlock
          title={e.title}
          subtitle={`${period ?? ""} · Prepared by ${e.ownerName} for ${viewer} · ${brisbane(e.generatedAt)}`}
        />
        {head.length > 0 && (
          <StatTiles
            tiles={head.map((m) => ({
              label: m.label,
              value: m.value,
              note: m.unit === "%" ? undefined : m.unit,
            }))}
          />
        )}
        {more.length > 0 && (
          <Section title="More measures">
            <MetaGrid items={more.map((m): [string, string] => [m.label, m.value])} />
          </Section>
        )}
        {chart && valueCol && labelCol && (
          <Section title={`${valueCol.label} by ${labelCol.label.toLowerCase()}`}>
            <BarChart data={chart} labelWidth={chartLabelWidth} />
            {chartRows.length > CHART_BARS && (
              <Callout title={`The first ${CHART_BARS} of ${chartRows.length} rows are drawn`}>
                Every row is in the table below.
              </Callout>
            )}
          </Section>
        )}
        {columns.length > 0 && (
          <Section title="Report data">
            {rows.length ? (
              <DataTable columns={columns} rows={rows} />
            ) : (
              <EmptyNote>No records matched these filters.</EmptyNote>
            )}
            {e.rows.length > PDF_ROW_LIMIT && (
              <Callout
                tone="watch"
                title={`Showing the first ${PDF_ROW_LIMIT} of ${e.rows.length} rows`}
              >
                Download the CSV or Excel version for every row.
              </Callout>
            )}
          </Section>
        )}
        <Section title="About this report">
          <MetaGrid items={about} />
          <Text
            style={{ marginTop: space.sm, fontSize: 7, color: pdfColour.ink500, lineHeight: 1.4 }}
          >
            A snapshot: these figures were true when the export was made, and later changes to
            records are not reflected. A dash means there was no value; Suppressed means a small
            group was hidden to protect privacy.
          </Text>
        </Section>
      </DocPage>
    </Doc>
  );
}
