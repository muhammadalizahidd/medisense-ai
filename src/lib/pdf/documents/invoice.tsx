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
  type TableColumn,
} from "../components";

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
          subtitle={`${inv.participant} · ${inv.status}${inv.issuedAt ? ` · Issued ${day(inv.issuedAt)}` : ""}`}
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
              ...(inv.billTo.abn ? [["ABN", inv.billTo.abn] as [string, string]] : []),
              ...(inv.billTo.reference
                ? [["Reference", inv.billTo.reference] as [string, string]]
                : []),
            ]}
          />
        </Section>
        <Section title="Services">
          <DataTable columns={lineColumns} rows={lines} />
        </Section>
        <Section title="Amounts">
          <MetaGrid
            items={[
              ["Subtotal", aud(inv.subtotal)],
              ["GST", aud(inv.gst)],
              ["Total", aud(inv.total)],
              ["Paid", aud(inv.paid)],
              ["Credited", aud(inv.credited)],
              ["Balance due", aud(inv.balance)],
            ]}
          />
        </Section>
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
