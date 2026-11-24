import { formatValue } from "@/lib/live/reports";
import { brisbane, type Snapshot } from "@/lib/live/report-files";
import {
  Callout,
  DataTable,
  Doc,
  DocPage,
  EmptyNote,
  MetaGrid,
  Section,
  StatTiles,
  TitleBlock,
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

/** A report export as a PDF: what it says, then the figures, then the data. */
export function ReportDocument({ e, viewer }: { e: Snapshot; viewer: string }) {
  const [period, ...filters] = e.summary;
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
        <Section title="About this report">
          <MetaGrid items={about} />
        </Section>
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
        <Section title="Reading this report">
          <Callout title="A snapshot">
            These figures were true when the export was made. Later changes to records are not
            reflected. A dash means there was no value; Suppressed means a small group was hidden to
            protect privacy.
          </Callout>
        </Section>
      </DocPage>
    </Doc>
  );
}
