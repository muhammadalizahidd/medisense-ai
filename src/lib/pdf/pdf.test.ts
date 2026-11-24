import { readFileSync } from "node:fs";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { extractText, getDocumentProxy } from "unpdf";
import type { Snapshot } from "@/lib/live/report-files";
import type { InvoiceDto07 } from "@/lib/live/finance";
import type { AgreementDto } from "@/lib/live/funding";
import { AgreementDocument } from "./documents/agreement";
import { InvoiceDocument } from "./documents/invoice";
import { PDF_ROW_LIMIT, ReportDocument } from "./documents/report";
import { renderPdf } from "./render";
import { parity, pdfColour } from "./theme";

const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
  ref: "EXP-1",
  reportId: "R01",
  title: "Referral volume",
  ownerName: "Neil Hensley",
  generatedAt: new Date("2026-11-14T02:00:00.000Z"),
  freshness: new Date("2026-11-14T02:00:00.000Z"),
  contents: "Aggregate with chart data",
  summary: ["This Quarter: 2026-10-01 to 2026-12-31", "Discipline: Occupational Therapy"],
  unit: "referrals",
  basis: "Submitted date",
  columns: [
    { key: "week", label: "Week", kind: "text" },
    { key: "referrals", label: "Referrals", kind: "number" },
    { key: "value", label: "Revenue", kind: "money" },
  ],
  rows: [
    { week: "2 Nov", referrals: 4, value: 1200 },
    { week: "9 Nov", referrals: 7, value: 2100.5 },
  ],
  metrics: [
    { label: "New referrals", value: "11", unit: "parent referrals" },
    { label: "Median intake time", value: "28.0", unit: "hours" },
  ],
  ...over,
});

async function pages(e: Snapshot) {
  const bytes = await renderPdf(createElement(ReportDocument, { e, viewer: "Jo Marsh" }));
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  return { totalPages, text };
}

describe("report PDF", () => {
  it("shows the title, who it was prepared for, the headline figures and the data", async () => {
    const { text } = await pages(snapshot());
    const all = text.join(" ");
    expect(all).toContain("Referral volume");
    expect(all).toContain("Prepared by Neil Hensley for Jo Marsh");
    expect(all).toContain("New referrals");
    expect(all).toContain("$2,100.50");
    expect(all).toContain("Occupational Therapy");
    expect(all).toContain("MEDISENSE");
  });

  it("numbers every page in the footer", async () => {
    const { totalPages, text } = await pages(snapshot());
    expect(text[0]).toContain(`Page 1 of ${totalPages}`);
  });

  it("repeats the table header on each page of a long report", async () => {
    const rows = Array.from({ length: 160 }, (_, i) => ({
      week: `Row ${i}`,
      referrals: i,
      value: i,
    }));
    const { totalPages, text } = await pages(snapshot({ rows }));
    expect(totalPages).toBeGreaterThan(2);
    for (const page of text.slice(1)) expect(page).toContain("Referrals");
  });

  it("keeps a small group hidden, as Suppressed", async () => {
    const rows = [
      { week: "Psychology", referrals: null, value: null, _suppressed: "Suppressed: fewer than 3" },
    ];
    const { text } = await pages(snapshot({ rows }));
    expect(text.join(" ")).toContain("Suppressed");
  });

  it("says so when no records matched, and leaves out the data for a summary only", async () => {
    expect((await pages(snapshot({ rows: [] }))).text.join(" ")).toContain("No records matched");
    const summary = await pages(snapshot({ rows: [], columns: [], contents: "Summary only" }));
    expect(summary.text.join(" ")).not.toContain("Report data");
  });

  it("stops at the row limit and points to the CSV", { timeout: 60_000 }, async () => {
    const rows = Array.from({ length: PDF_ROW_LIMIT + 5 }, (_, i) => ({
      week: `W${i}`,
      referrals: i,
      value: i,
    }));
    const { text } = await pages(snapshot({ rows }));
    expect(text.join(" ")).toContain(`first ${PDF_ROW_LIMIT} of ${PDF_ROW_LIMIT + 5}`);
  });
});

describe("PDF colours", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = [...css.matchAll(/:root\[data-theme="navy-rail"\]\s*\{([^}]*)\}/g)]
    .map((m) => m[1])
    .join(" ");
  const token = (name: string) =>
    new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block)?.[1]?.toLowerCase();

  it("match the Navy rail theme in the platform", () => {
    for (const [key, name] of Object.entries(parity)) {
      if (!name) continue;
      expect(token(name), `${key} (${name})`).toBe(pdfColour[key as keyof typeof pdfColour]);
    }
  });
});

const invoice = (over: Partial<InvoiceDto07> = {}): InvoiceDto07 => ({
  id: "i1",
  number: "INV-2041",
  version: 1,
  clientId: "c1",
  participant: "Emily Carter",
  path: "Plan Managed",
  payer: "Plan Partners",
  billTo: {
    type: "Plan Manager",
    name: "Plan Partners Pty Ltd",
    email: "",
    address: "",
    abn: "12345678901",
    reference: "PO-77",
  },
  status: "Issued",
  overdue: false,
  ageing: null,
  issuedAt: "2026-11-03T00:00:00.000Z",
  dueDate: "2026-11-17",
  terms: "14 days",
  delivery: "Email",
  note: "",
  agreement: null,
  lines: [
    {
      id: "l1",
      billableId: null,
      date: "2026-11-02",
      description: "Occupational therapy, home visit",
      discipline: "OT",
      itemCode: "15_056",
      quantity: 1,
      unit: "hr",
      rate: 193.99,
      tax: "GST-free",
      subtotal: 193.99,
      gst: 0,
      total: 193.99,
      kind: "service",
      held: false,
    },
  ],
  subtotal: 193.99,
  gst: 0,
  total: 193.99,
  paid: 100,
  credited: 0,
  balance: 93.99,
  arithmetic: [],
  blockers: [],
  warnings: [],
  allocations: [{ paymentRef: "PAY-9", amount: 100, at: "2026-11-10T00:00:00.000Z", by: "Jo" }],
  credits: [],
  comms: [],
  versions: [],
  history: [],
  dispute: null,
  needsManager: false,
  createdAt: "2026-11-02T00:00:00.000Z",
  updatedAt: "2026-11-10T00:00:00.000Z",
  ...over,
});

async function invoicePages(inv: InvoiceDto07) {
  const bytes = await renderPdf(createElement(InvoiceDocument, { inv }));
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: false })).text.join(" ");
}

describe("invoice PDF", () => {
  it("shows who it is for, the lines and what is still owed", async () => {
    const text = await invoicePages(invoice());
    expect(text).toContain("Invoice INV-2041");
    expect(text).toContain("Emily Carter");
    expect(text).toContain("Occupational therapy, home visit");
    expect(text).toContain("$93.99");
    expect(text).toContain("Payments received");
  });

  it("says plainly that a draft is not a request for payment", async () => {
    const text = await invoicePages(invoice({ status: "Draft", issuedAt: null }));
    expect(text).toContain("Not yet issued");
  });

  it("leaves out the payments and credits sections when there are none", async () => {
    const text = await invoicePages(invoice({ allocations: [] }));
    expect(text).not.toContain("Payments received");
    expect(text).not.toContain("Credit notes");
  });
});

const agreement = (over: Partial<AgreementDto> = {}) =>
  ({
    id: "a1",
    ref: "AGR-12",
    version: 2,
    type: "Renewal",
    participant: "Emily Carter",
    planRef: "PLAN-3",
    status: "Issued",
    provider: "Medisense Pty Ltd",
    start: "2026-11-01",
    end: "2027-10-31",
    signatory: { name: "Anna Carter", authority: "Parent or guardian" },
    lines: [
      {
        support: "Occupational therapy",
        scope: "Weekly home visits",
        quantity: 48,
        unit: "hr",
        frequency: "Weekly",
        unitPrice: 193.99,
        estimate: 9311.52,
      },
    ],
    total: 9311.52,
    cancellation: "Cancel with 48 hours' notice to avoid a charge for the session.",
    rights: ["You can change or end this agreement at any time."],
    communication: ["Email"],
    communicationNote: "",
    sharing: "Only your care team sees your records.",
    acceptance: null,
    ...over,
  }) as AgreementDto;

async function agreementText(a: AgreementDto) {
  const bytes = await renderPdf(createElement(AgreementDocument, { a }));
  expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  return (await extractText(pdf, { mergePages: false })).text.join(" ");
}

describe("agreement PDF", () => {
  it("shows the parties, the supports, the terms and where to sign", async () => {
    const text = await agreementText(agreement());
    expect(text).toContain("Service agreement AGR-12");
    expect(text).toContain("Emily Carter");
    expect(text).toContain("Occupational therapy");
    expect(text).toContain("$9,311.52");
    expect(text).toContain("48 hours");
    expect(text).toContain("Not signed yet");
    expect(text).toContain("Anna Carter");
  });

  it("records who accepted it once it is signed", async () => {
    const text = await agreementText(
      agreement({
        status: "Signed",
        acceptance: {
          name: "Anna Carter",
          role: "Parent or guardian",
          at: "2026-11-05T00:00:00.000Z",
          version: 2,
          method: "Online",
        },
      }),
    );
    expect(text).toContain("Accepted by Anna Carter");
    expect(text).not.toContain("Not signed yet");
  });
});

/** Every pair of neighbouring text runs on a line, and anything past the page margin, that collide. */
async function collisions(bytes: Uint8Array) {
  const pdf = await getDocumentProxy(bytes);
  const found: string[] = [];
  for (let n = 1; n <= pdf.numPages; n += 1) {
    const page = await (await pdf.getPage(n)).getTextContent();
    const items = (page.items as { str: string; width: number; transform: number[] }[]).filter(
      (i) => i.str.trim(),
    );
    const lines = new Map<number, typeof items>();
    for (const i of items) {
      const y = Math.round(i.transform[5] ?? 0);
      lines.set(y, [...(lines.get(y) ?? []), i]);
    }
    for (const line of lines.values()) {
      const sorted = [...line].sort((a, b) => (a.transform[4] ?? 0) - (b.transform[4] ?? 0));
      sorted.forEach((item, i) => {
        const end = (item.transform[4] ?? 0) + item.width;
        const next = sorted[i + 1];
        if (next && end > (next.transform[4] ?? 0) + 4) {
          found.push(`page ${n}: "${item.str}" runs into "${next.str}"`);
        }
        if (end > 556) found.push(`page ${n}: "${item.str}" runs past the right margin`);
      });
    }
  }
  return found;
}

describe("PDF layout never overlaps", () => {
  const wide = (): Snapshot =>
    snapshot({
      columns: [
        { key: "ref", label: "Reference", kind: "id" },
        { key: "name", label: "Support requested", kind: "text" },
        { key: "status", label: "Status", kind: "text" },
        { key: "owner", label: "Owner", kind: "text" },
        { key: "region", label: "Region", kind: "text" },
        { key: "n", label: "Missing items", kind: "number" },
        { key: "amount", label: "Value", kind: "money" },
        { key: "due", label: "Due", kind: "date" },
      ],
      rows: Array.from({ length: 12 }, (_, i) => ({
        ref: `MSR-2026-${String(i).padStart(5, "0")}-INTAKE-NORTH`,
        name: "Occupational Therapy functional capacity assessment",
        status: "Needs Information",
        owner: "Emma Clarke",
        region: "Brisbane North",
        n: i,
        amount: 12345.5 * i,
        due: "2026-11-30",
      })),
    });

  it("keeps a long reference clear of the column beside it", async () => {
    const bytes = await renderPdf(createElement(ReportDocument, { e: wide(), viewer: "Jo Marsh" }));
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });

  it("keeps an unbroken token longer than any column inside the page", async () => {
    const e = snapshot({
      columns: [
        { key: "a", label: "Link", kind: "text" },
        { key: "b", label: "Note", kind: "text" },
        { key: "c", label: "Count", kind: "number" },
      ],
      rows: [
        {
          a: "https://medisense.example.com/care/records/6a1f0c9e8b7d4e2a3c5b1f90/documents",
          b: "x".repeat(60),
          c: 3,
        },
      ],
    });
    const bytes = await renderPdf(createElement(ReportDocument, { e, viewer: "Jo" }));
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });

  it("keeps a report with many narrow columns tidy", async () => {
    const columns = Array.from({ length: 11 }, (_, i) => ({
      key: `c${i}`,
      label: `Column ${i}`,
      kind: "text",
    }));
    const rows = Array.from({ length: 5 }, (_, r) =>
      Object.fromEntries(
        columns.map((c, i) => [c.key, i === 0 ? `REF-2026-000${r}-LONG-ID` : `Value ${i}`]),
      ),
    );
    const bytes = await renderPdf(
      createElement(ReportDocument, { e: snapshot({ columns, rows }), viewer: "Jo" }),
    );
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });

  it("keeps long filter values and headline numbers inside their boxes", async () => {
    const e = snapshot({
      summary: [
        "This Quarter: 2026-10-01 to 2026-12-31",
        `Search: "${"abcdefghij".repeat(8)}"`,
        "Therapist: Emma Clarke-Whitfield-Montgomery-Smythe",
      ],
      metrics: [
        { label: "Issued revenue (net)", value: "$12,345,678.90", unit: "AUD" },
        { label: "Outstanding balance", value: "$1,234,567.00", unit: "AUD" },
        { label: "Median intake time", value: "28.0", unit: "hours" },
        { label: "New referrals", value: "1,284", unit: "parent referrals" },
      ],
    });
    const bytes = await renderPdf(createElement(ReportDocument, { e, viewer: "Jo" }));
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });

  it("keeps an invoice with a long description and large amounts tidy", async () => {
    const inv = invoice({
      lines: [
        {
          id: "l1",
          billableId: null,
          date: "2026-11-02",
          itemCode: "15_056",
          discipline: "OT",
          kind: "service",
          held: false,
          tax: "GST-free",
          description:
            "Occupational therapy functional capacity assessment including travel, report writing and liaison with the plan manager",
          quantity: 12.5,
          unit: "hr",
          rate: 193.99,
          subtotal: 2424.88,
          gst: 0,
          total: 2424.88,
        },
      ],
      total: 1234567.89,
      balance: 1234567.89,
    });
    const bytes = await renderPdf(createElement(InvoiceDocument, { inv }));
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });

  it("keeps an agreement with a long scope tidy", async () => {
    const a = agreement({
      lines: [
        {
          support: "Occupational therapy",
          scope:
            "Weekly home visits focused on daily living skills, sensory regulation, school readiness and the transition to a new classroom ".repeat(
              2,
            ),
          quantity: 48,
          unit: "hr",
          frequency: "Weekly",
          unitPrice: 193.99,
          estimate: 9311.52,
        },
      ] as unknown as AgreementDto["lines"],
    });
    const bytes = await renderPdf(createElement(AgreementDocument, { a }));
    expect(await collisions(new Uint8Array(bytes))).toEqual([]);
  });
});
