"use client";

import { useEffect, useState } from "react";
import type { TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import {
  presetRange,
  type AdjustmentStatus,
  type BillableDto,
  type ClaimStatus,
  type DatePreset,
  type FinanceHubDto,
  type FundingPath,
  type InvoiceDto07,
  type LineStatus,
  type PaymentStatus,
  type ReconStatus,
} from "@/lib/live/finance";

export const lineTone: Record<LineStatus, TagTone> = {
  Captured: "neutral",
  "Pending verification": "watch",
  Ready: "healthy",
  Held: "over",
  Rejected: "neutral",
  Invoiced: "available",
  Claimed: "available",
};
export const invoiceTone07: Record<string, TagTone> = {
  Draft: "neutral",
  "Pending Approval": "watch",
  Approved: "monitor",
  Issued: "available",
  "Part-Paid": "monitor",
  Paid: "healthy",
  Disputed: "over",
  Voided: "neutral",
  Credited: "outline",
  Overdue: "over",
};
export const claimTone: Record<ClaimStatus, TagTone> = {
  Ready: "neutral",
  Prepared: "watch",
  Submitted: "available",
  Accepted: "healthy",
  Rejected: "over",
  "Partially Paid": "monitor",
  Closed: "outline",
};
export const paymentTone: Record<PaymentStatus, TagTone> = {
  Unallocated: "watch",
  "Partially allocated": "monitor",
  Allocated: "available",
  Reconciled: "healthy",
  Reversed: "neutral",
  "Refund pending": "over",
};
export const reconTone: Record<ReconStatus, TagTone> = {
  Unmatched: "over",
  Suggested: "watch",
  Matched: "available",
  Reviewed: "monitor",
  Reconciled: "healthy",
};
export const adjustmentTone: Record<AdjustmentStatus, TagTone> = {
  Requested: "watch",
  Reviewed: "monitor",
  Approved: "available",
  Rejected: "over",
  Applied: "healthy",
};

export function pathChip(path: FundingPath | string) {
  return path === "Agency Managed"
    ? "bg-healthy-bg text-healthy"
    : path === "Plan Managed"
      ? "bg-accent-tint text-accent"
      : path === "Self-Managed"
        ? "bg-available-bg text-available"
        : path === "Insurer"
          ? "bg-watch-bg text-watch"
          : "bg-sunken text-ink-700";
}

export const th = "px-4 py-3 font-medium whitespace-nowrap";
export const td = "px-4 py-3 align-top";

/** A plain date stays as written; a timestamp is shown as its Brisbane day. */
export const dayLabel = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  return iso.length > 10
    ? new Intl.DateTimeFormat("en-AU", { ...opts, timeZone: "Australia/Brisbane" }).format(
        new Date(iso),
      )
    : new Intl.DateTimeFormat("en-AU", opts).format(new Date(`${iso}T00:00:00`));
};

export async function finance(url: string, body: unknown, ok: string, detail?: string) {
  try {
    const res = await api<Record<string, unknown>>(url, { body });
    toast(ok, { tone: "success", detail });
    return res;
  } catch (e) {
    toast("Couldn't do that", { tone: "error", detail: e instanceof Error ? e.message : "" });
    return null;
  }
}

/* ------------------------------------------------------------------ filters (section 10, AC-30) */

export type Filters = {
  preset: DatePreset;
  from: string;
  to: string;
  service: string;
  payer: string;
  therapist: string;
  status: string;
  search: string;
};

const KEY = "ms-finance-filters";
export const blankFilters = (today: string): Filters => ({
  preset: "This Financial Year",
  ...presetRange("This Financial Year", today),
  service: "",
  payer: "",
  therapist: "",
  status: "",
  search: "",
});

/** Filters survive moving between tabs and pages in this session (AC-30). */
export function useFinanceFilters(today: string) {
  const [f, setF] = useState<Filters>(() => blankFilters(today));
  useEffect(() => {
    const saved = sessionStorage.getItem(KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the saved filters once after mount
    if (saved) setF({ ...blankFilters(today), ...(JSON.parse(saved) as Partial<Filters>) });
  }, [today]);
  const update = (patch: Partial<Filters>) =>
    setF((cur) => {
      const next = { ...cur, ...patch };
      if (patch.preset && patch.preset !== "Custom")
        Object.assign(next, presetRange(patch.preset, today));
      sessionStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  return [f, update] as const;
}

const inRange = (iso: string | null | undefined, f: Filters) =>
  !iso || (iso.slice(0, 10) >= f.from && iso.slice(0, 10) <= f.to);
const svc = (s: string, f: Filters) => !f.service || s === f.service;
const pay = (p: string, f: Filters) => !f.payer || p === f.payer;
const q = (text: string, f: Filters) =>
  !f.search || text.toLowerCase().includes(f.search.trim().toLowerCase());

export function filterLines(lines: BillableDto[], f: Filters) {
  return lines.filter(
    (l) =>
      inRange(l.start, f) &&
      svc(l.support, f) &&
      pay(l.path, f) &&
      (!f.therapist || l.therapist === f.therapist) &&
      q(`${l.ref} ${l.participant} ${l.support} ${l.payerRoute}`, f),
  );
}

export function invoiceShownStatus(i: InvoiceDto07) {
  return i.overdue ? "Overdue" : i.status;
}

export function filterInvoices(invoices: InvoiceDto07[], f: Filters, hub: FinanceHubDto) {
  return invoices.filter((i) => {
    const services = i.lines.map((l) => l.description.split(" · ")[0]!);
    const lines = hub.billables.filter((b) => b.invoice?.id === i.id);
    return (
      inRange(i.issuedAt ?? i.createdAt, f) &&
      (!f.service || services.includes(f.service)) &&
      pay(String(i.path), f) &&
      (!f.therapist || lines.some((l) => l.therapist === f.therapist)) &&
      (!f.status || invoiceShownStatus(i) === f.status || i.status === f.status) &&
      q(`${i.number} ${i.participant} ${i.payer} ${i.billTo.name}`, f)
    );
  });
}
