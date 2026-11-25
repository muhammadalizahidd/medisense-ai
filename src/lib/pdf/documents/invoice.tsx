import { StyleSheet, Text, View } from "@react-pdf/renderer";
import type { InvoiceDto07 } from "@/lib/live/finance";
import {
  Callout,
  DataTable,
  Doc,
  DocPage,
  MetaGrid,
  Section,
  StatTiles,
  TitleBlock,
  figure,
  space,
  type TableColumn,
} from "../components";
import { pdfColour as c, pdfSize as size } from "../theme";

const aud = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

const day = (iso: string | null) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Brisbane",
      }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+10:00` : iso))
    : "—";

/** "12345678901" reads as "12 345 678 901", the way an ABN is printed. */
const abn = (v: string) => {
  const d = v.replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : v;
};

const t = StyleSheet.create({
  totals: { marginTop: space.md, marginLeft: "auto", width: 230 },
  row: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  label: { fontSize: size.small, color: c.ink700 },
  value: { fontSize: size.small, fontWeight: 500 },
  due: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: space.xs,
    paddingTop: space.sm,
    borderTopWidth: 1,
    borderTopColor: c.navy,
  },
  dueText: { fontSize: size.section, fontWeight: 700, color: c.navy },
});

/** The sums under the lines, right-aligned like a printed invoice, ending in what is owed. */
function Totals({ rows, due }: { rows: [string, string][]; due: [string, string] }) {
  return (
    <View style={t.totals} wrap={false}>
      {rows.map(([k, v]) => (
        <View key={k} style={t.row}>
          <Text style={t.label}>{k}</Text>
          <Text style={[t.value, figure(v)]}>{v}</Text>
        </View>
      ))}
      <View style={t.due}>
        <Text style={t.dueText}>{due[0]}</Text>
        <Text style={[t.dueText, figure(due[1])]}>{due[1]}</Text>
      </View>
    </View>
  );
}

const lineColumns: TableColumn[] = [
  { key: "date", label: "Date", align: "left", flex: 0.9 },
  { key: "description", label: "Description", align: "left", flex: 3 },
  { key: "quantity", label: "Qty", align: "right", flex: 0.8 },
  { key: "rate", label: "Rate", align: "right", flex: 1 },
  { key: "gst", label: "GST", align: "right", flex: 0.8 },
  { key: "total", label: "Total", align: "right", flex: 1 },
];

/** An invoice as a PDF: who it is for, what it covers, the lines and what is owed. */
export function InvoiceDocument({ inv }: { inv: InvoiceDto07 }) {
  const draft = ["Draft", "Pending Approval", "Approved"].includes(inv.status);
  const lines = inv.lines.map((l) => ({
    date: day(l.date),
    description: l.description,
    quantity: `${l.quantity} ${l.unit}`,
    rate: aud(l.rate),
    gst: aud(l.gst),
    total: aud(l.total),
  }));
  return (
    <Doc title={`Invoice ${inv.number}`} author="Medisense">
      <DocPage kind="Invoice" footer={`Invoice ${inv.number} · Confidential`}>
        <TitleBlock
          title={`Invoice ${inv.number}`}
          subtitle={
            inv.issuedAt
              ? `${inv.participant} · Issued ${day(inv.issuedAt)} · Due ${day(inv.dueDate)}`
              : `${inv.participant} · ${inv.status}`
          }
        />
        {draft && (
          <Callout tone="watch" title="Not yet issued">
            This invoice is {inv.status.toLowerCase()}. It is not a request for payment until it is
            issued.
          </Callout>
        )}
        <StatTiles
          tiles={[
            { label: "Total", value: aud(inv.total) },
            { label: "Paid", value: aud(inv.paid) },
            { label: "Credited", value: aud(inv.credited) },
            {
              label: "Balance due",
              value: aud(inv.balance),
              note: inv.overdue ? "Overdue" : undefined,
            },
          ]}
        />
        <Section title="Details">
          <MetaGrid
            items={[
              ["Participant", inv.participant],
              ["Bill to", inv.billTo.name],
              ["Funding", String(inv.path)],
              ["Payer", inv.payer],
              ["Issued", day(inv.issuedAt)],
              ["Due", day(inv.dueDate)],
              ["Terms", inv.terms],
              ...(inv.billTo.abn ? [["ABN", abn(inv.billTo.abn)] as [string, string]] : []),
              ...(inv.billTo.reference
                ? [["Reference", inv.billTo.reference] as [string, string]]
                : []),
            ]}
          />
        </Section>
        <Section title="Services">
          <DataTable columns={lineColumns} rows={lines} />
        </Section>
        <Totals
          rows={[
            ["Subtotal", aud(inv.subtotal)],
            ["GST", aud(inv.gst)],
            ["Total", aud(inv.total)],
            ...(inv.paid ? [["Paid", `− ${aud(inv.paid)}`] as [string, string]] : []),
            ...(inv.credited ? [["Credited", `− ${aud(inv.credited)}`] as [string, string]] : []),
          ]}
          due={["Balance due", aud(inv.balance)]}
        />
        {inv.allocations.length > 0 && (
          <Section title="Payments received">
            <DataTable
              columns={[
                { key: "at", label: "Date", align: "left" },
                { key: "ref", label: "Receipt", align: "left" },
                { key: "amount", label: "Amount", align: "right" },
              ]}
              rows={inv.allocations.map((a) => ({
                at: day(a.at),
                ref: a.paymentRef,
                amount: aud(a.amount),
              }))}
            />
          </Section>
        )}
        {inv.credits.length > 0 && (
          <Section title="Credit notes">
            <DataTable
              columns={[
                { key: "at", label: "Date", align: "left" },
                { key: "ref", label: "Credit note", align: "left" },
                { key: "reason", label: "Reason", align: "left" },
                { key: "amount", label: "Amount", align: "right" },
              ]}
              rows={inv.credits.map((c) => ({
                at: day(c.at),
                ref: c.ref,
                reason: c.reason,
                amount: aud(c.amount),
              }))}
            />
          </Section>
        )}
        {inv.note ? (
          <Section title="Note">
            <Callout title="From Medisense">{inv.note}</Callout>
          </Section>
        ) : null}
      </DocPage>
    </Doc>
  );
}
