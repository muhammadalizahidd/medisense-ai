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

  it("stops at the row limit and points to the CSV", async () => {
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
