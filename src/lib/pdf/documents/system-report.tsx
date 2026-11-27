import { Text, View } from "@react-pdf/renderer";
import type { SystemReportTable } from "@/lib/live/system-reports";
import { pdfColour } from "../theme";
import {
  Callout,
  DataTable,
  Doc,
  DocPage,
  EmptyNote,
  LANDSCAPE_TABLE_WIDTH,
  MetaGrid,
  Section,
  StatTiles,
  TitleBlock,
  space,
  type TableColumn,
  type TableRow,
} from "../components";

/** The most rows a PDF carries; the CSV always holds every row. */
export const SYSTEM_PDF_ROW_LIMIT = 1000;

const generated = (iso: string) =>
  `${new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))} AEST`;

const numberCell = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 1 });
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const dayCell = (iso: string) =>
  new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));

function text(value: string | number) {
  if (typeof value === "number") return numberCell.format(value);
  if (DAY.test(value)) return dayCell(value);
  return value === "" ? "—" : value;
}

/**
 * A system report as a branded PDF: the navy band with the Medisense mark, the headline figures,
 * then every row in a table whose header repeats on each page. Landscape, so wide reports keep
 * every column readable.
 */
export function SystemReportDocument({
  table,
  preparedBy,
}: {
  table: SystemReportTable;
  preparedBy: string;
}) {
  const columns: TableColumn[] = table.columns.map((c, i) => ({
    key: String(i),
    label: c.label,
    align: c.numeric ? "right" : "left",
    bold: c.strong,
  }));
  const rows: TableRow[] = table.rows
    .slice(0, SYSTEM_PDF_ROW_LIMIT)
    .map((r) => Object.fromEntries(r.map((v, i) => [String(i), text(v)])));
  const when = generated(table.generatedAt);
  return (
    <Doc title={`${table.title} · ${table.period}`} author={preparedBy}>
      <DocPage
        kind="System report"
        orientation="landscape"
        footer={`${table.title} · ${table.period} · Generated ${when} · Confidential`}
      >
        <TitleBlock
          title={table.title}
          subtitle={`${table.period} · ${table.type} · Prepared by ${preparedBy} · ${when}`}
        />
        <StatTiles tiles={table.totals.slice(0, 4)} plain />
        <Section title="Report data">
          {rows.length ? (
            <DataTable
              columns={columns}
              rows={rows}
              width={LANDSCAPE_TABLE_WIDTH}
              striped={false}
            />
          ) : (
            <EmptyNote>No records in this period.</EmptyNote>
          )}
          {table.rows.length > SYSTEM_PDF_ROW_LIMIT && (
            <Callout
              tone="watch"
              title={`Showing the first ${SYSTEM_PDF_ROW_LIMIT} of ${table.rows.length} rows`}
            >
              Download the Excel (CSV) version for every row.
            </Callout>
          )}
        </Section>
        <View wrap={false}>
          <Section title="About this report">
            <MetaGrid
              items={[
                ["Report", table.title],
                ["What it shows", table.description],
                ["Period", table.period],
                ["Appointment type", table.type],
                ["Rows", numberCell.format(table.rows.length)],
                ["Prepared by", preparedBy],
                ["Generated", when],
              ]}
            />
            <Text
              style={{
                marginTop: space.sm,
                fontSize: 7,
                color: pdfColour.ink500,
                lineHeight: 1.4,
              }}
            >
              Counted from the live records at the time shown; later changes are not reflected.
              Dates and times are Brisbane time. A dash means there was no value.
            </Text>
          </Section>
        </View>
      </DocPage>
    </Doc>
  );
}
