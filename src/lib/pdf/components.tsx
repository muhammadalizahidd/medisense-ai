import { Document, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { FONT, pdfColour as c, pdfSize as size } from "./theme";

/*
 * The building blocks of every Medisense PDF. A document is a few of these in order; the look
 * lives here, so changing it means changing one component.
 */

const s = StyleSheet.create({
  page: {
    fontFamily: FONT,
    fontSize: size.body,
    color: c.ink900,
    backgroundColor: c.white,
    paddingTop: size.page.top,
    paddingBottom: size.page.bottom,
    paddingHorizontal: size.page.side,
  },
  band: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 36,
    backgroundColor: c.navy,
    paddingHorizontal: size.page.side,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { color: c.white, fontSize: 10, fontWeight: 700, letterSpacing: 0.6 },
  bandNote: { color: c.navyMuted, fontSize: size.small, fontWeight: 500 },
  footerRule: {
    position: "absolute",
    bottom: 36,
    left: size.page.side,
    right: size.page.side,
    height: 0.75,
    backgroundColor: c.border,
  },
  footerLeft: {
    position: "absolute",
    bottom: 22,
    left: size.page.side,
    color: c.ink500,
    fontSize: size.tiny,
  },
  footerRight: {
    position: "absolute",
    bottom: 22,
    right: size.page.side,
    width: 100,
    textAlign: "right",
    color: c.ink500,
    fontSize: size.tiny,
  },
  title: { fontSize: size.title, fontWeight: 600, color: c.navy, lineHeight: 1.2 },
  subtitle: { marginTop: 4, fontSize: size.body, color: c.ink700, lineHeight: 1.4 },
  titleBlock: { marginBottom: 18 },
  section: { marginTop: 20 },
  sectionHead: { flexDirection: "column", marginBottom: 8 },
  rule: { width: 22, height: 2, backgroundColor: c.accent, marginBottom: 5 },
  sectionTitle: { fontSize: size.section, fontWeight: 600, color: c.navy },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, backgroundColor: c.mintSoft, borderRadius: 4, padding: 10 },
  tileLabel: { fontSize: size.small, color: c.ink700, fontWeight: 500 },
  tileValue: { marginTop: 4, fontSize: size.value, fontWeight: 600, color: c.navy },
  tileNote: { marginTop: 2, fontSize: size.tiny, color: c.ink500 },
  metaRow: { flexDirection: "row", gap: 24 },
  metaCol: { flex: 1 },
  metaItem: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: c.border,
  },
  metaKey: { width: 84, color: c.ink500, fontSize: size.small },
  metaValue: { flex: 1, fontWeight: 500, lineHeight: 1.4 },
  th: {
    flexDirection: "row",
    backgroundColor: c.navy,
    paddingVertical: 6,
    paddingHorizontal: 6,
  },
  thText: { color: c.white, fontSize: size.small, fontWeight: 600 },
  tr: { flexDirection: "row", paddingVertical: 5, paddingHorizontal: 6 },
  trAlt: { backgroundColor: c.mintSoft },
  tdText: { fontSize: size.small },
  callout: { padding: 10, borderLeftWidth: 3 },
  calloutTitle: { fontSize: size.small, fontWeight: 600, marginBottom: 2 },
  calloutBody: { fontSize: size.small, color: c.ink700, lineHeight: 1.4 },
  empty: {
    borderWidth: 0.75,
    borderColor: c.borderStrong,
    borderStyle: "dashed",
    borderRadius: 4,
    padding: 16,
    textAlign: "center",
    color: c.ink700,
  },
  bullet: { flexDirection: "row", marginBottom: 3 },
  bulletDot: { width: 10, color: c.accent, fontWeight: 700 },
  bulletText: { flex: 1, lineHeight: 1.4 },
  sign: { flexDirection: "row", gap: 24, marginTop: 8 },
  signBox: { flex: 1, paddingTop: 28, borderTopWidth: 0.75, borderTopColor: c.ink500 },
  signName: { fontWeight: 600 },
  signRole: { color: c.ink500, fontSize: size.small },
});

/* ------------------------------------------------------------------ document and page */

/** The file's own properties, so it opens with a proper title in a PDF viewer. */
export function Doc({
  title,
  author,
  children,
}: {
  title: string;
  author: string;
  children: ReactNode;
}) {
  return (
    <Document
      title={title}
      author={author}
      creator="Medisense"
      producer="Medisense"
      language="en-AU"
    >
      {children}
    </Document>
  );
}

/** A4 page with the navy band on top and a footer with the page number on every page. */
export function DocPage({
  kind,
  footer,
  children,
}: {
  /** What this is: "Report", "Invoice". Shown on the right of the band. */
  kind: string;
  /** Left side of the footer: when the data is from and who may see it. */
  footer: string;
  children: ReactNode;
}) {
  return (
    <Page size="A4" style={s.page}>
      <View style={s.band} fixed>
        <Text style={s.brand}>MEDISENSE</Text>
        <Text style={s.bandNote}>{kind}</Text>
      </View>
      {children}
      <View style={s.footerRule} fixed />
      <Text style={s.footerLeft} fixed>
        {footer}
      </Text>
      <Text
        style={s.footerRight}
        fixed
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </Page>
  );
}

/* ------------------------------------------------------------------ content */

/** The document's title and one line saying what it covers and who it is for. */
export function TitleBlock({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={s.titleBlock}>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

/** A heading with a short green rule. Keeps with the content that follows it. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHead} minPresenceAhead={60}>
        <View style={s.rule} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export type Tile = { label: string; value: string; note?: string };

/** Up to four headline numbers, side by side. */
export function StatTiles({ tiles }: { tiles: Tile[] }) {
  return (
    <View style={s.tiles} wrap={false}>
      {tiles.slice(0, 4).map((t) => (
        <View key={t.label} style={s.tile}>
          <Text style={s.tileLabel}>{t.label}</Text>
          <Text style={s.tileValue}>{t.value}</Text>
          {t.note ? <Text style={s.tileNote}>{t.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

/** Label and value pairs in two columns. */
export function MetaGrid({ items }: { items: [string, string][] }) {
  const half = Math.ceil(items.length / 2);
  const col = (list: [string, string][]) => (
    <View style={s.metaCol}>
      {list.map(([k, v]) => (
        <View key={k} style={s.metaItem} wrap={false}>
          <Text style={s.metaKey}>{k}</Text>
          <Text style={s.metaValue}>{v}</Text>
        </View>
      ))}
    </View>
  );
  return (
    <View style={s.metaRow}>
      {col(items.slice(0, half))}
      {col(items.slice(half))}
    </View>
  );
}

export type TableColumn = {
  key: string;
  label: string;
  align: "left" | "right";
  /** Relative width. Text columns default wider than number columns. */
  flex?: number;
};
export type TableRow = Record<string, string>;

const weight = (col: TableColumn) => col.flex ?? (col.align === "right" ? 1 : 1.6);

/** A table whose header repeats on every page and whose rows never split across pages. */
export function DataTable({ columns, rows }: { columns: TableColumn[]; rows: TableRow[] }) {
  const cell = (col: TableColumn) => ({
    flex: weight(col),
    textAlign: col.align,
    paddingRight: 6,
  });
  return (
    <View>
      <View style={s.th} fixed>
        {columns.map((col) => (
          <Text key={col.key} style={[s.thText, cell(col)]}>
            {col.label}
          </Text>
        ))}
      </View>
      {rows.map((row, i) => (
        <View key={i} style={[s.tr, i % 2 ? s.trAlt : {}]} wrap={false}>
          {columns.map((col) => (
            <Text key={col.key} style={[s.tdText, cell(col)]}>
              {row[col.key] ?? "—"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

const CALLOUT = {
  note: { bar: c.accent, bg: c.mintSoft, ink: c.navy },
  watch: { bar: c.watch, bg: c.watchBg, ink: c.watch },
  alert: { bar: c.over, bg: c.overBg, ink: c.over },
} as const;

/** A short note: how to read the figures, a precaution, or that a draft needs approval. */
export function Callout({
  tone = "note",
  title,
  children,
}: {
  tone?: keyof typeof CALLOUT;
  title: string;
  children: ReactNode;
}) {
  const t = CALLOUT[tone];
  return (
    <View style={[s.callout, { borderLeftColor: t.bar, backgroundColor: t.bg }]} wrap={false}>
      <Text style={[s.calloutTitle, { color: t.ink }]}>{title}</Text>
      <Text style={s.calloutBody}>{children}</Text>
    </View>
  );
}

/** Said once, plainly, where a table would otherwise be empty. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <View style={s.empty} wrap={false}>
      <Text>{children}</Text>
    </View>
  );
}

/** Where a person signs: their name, role and the date. */
export function SignatureBlock({ people }: { people: { name: string; role: string }[] }) {
  return (
    <View style={s.sign} wrap={false}>
      {people.map((p) => (
        <View key={p.name + p.role} style={s.signBox}>
          <Text style={s.signName}>{p.name}</Text>
          <Text style={s.signRole}>{p.role}</Text>
          <Text style={s.signRole}>Date</Text>
        </View>
      ))}
    </View>
  );
}

/** A short list, one point per line. */
export function BulletList({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((t) => (
        <View key={t} style={s.bullet} wrap={false}>
          <Text style={s.bulletDot}>•</Text>
          <Text style={s.bulletText}>{t}</Text>
        </View>
      ))}
    </View>
  );
}
