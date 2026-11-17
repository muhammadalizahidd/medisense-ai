"use client";

import { Building2, CalendarRange, FileSignature, HandHeart, Languages, Scale } from "lucide-react";
import { aud } from "@/lib/live/funding";
import { cn } from "@/lib/cn";
import { dayLabel } from "./funding-bits";

export type ReadableAgreement = {
  ref: string;
  version: number;
  type: string;
  participant: string;
  provider: string;
  start: string;
  end: string;
  signatory: { name: string; authority: string };
  lines: {
    id: string;
    support: string;
    kind: string;
    scope: string;
    setting: string;
    unit: string;
    quantity: number;
    frequency: string;
    unitPrice: number;
    occurrences: number;
    estimate: number;
    paidBy: string;
  }[];
  total: number;
  cancellation: string;
  rights: readonly { key: string; title: string; text: string }[];
  communication: string[];
  communicationNote: string;
  planEnd: string | null;
};

/** The participant-readable agreement: plain words, every line and price visible. */
export function AgreementDocument({ a, className }: { a: ReadableAgreement; className?: string }) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-card border border-border bg-surface shadow-lift",
        className,
      )}
    >
      <header className="border-b border-border bg-canvas px-6 py-6 md:px-8">
        <p className="text-label font-semibold tracking-[0.12em] text-accent uppercase">
          Service agreement
        </p>
        <h2 className="mt-1 type-display text-h1 leading-tight text-ink-900">
          {a.participant} and {a.provider.replace(/ \(.*\)$/, "")}
        </h2>
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-700">
          <span className="font-mono">
            {a.ref} · version {a.version}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarRange className="size-4 text-ink-500" aria-hidden="true" />
            {dayLabel(a.start)} to {dayLabel(a.end)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <FileSignature className="size-4 text-ink-500" aria-hidden="true" />
            Signatory: {a.signatory.name} ({a.signatory.authority})
          </span>
        </p>
        {a.planEnd && a.end > a.planEnd && (
          <p className="mt-3 rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900">
            This agreement runs past your NDIS plan end date ({dayLabel(a.planEnd)}). We&apos;ll
            check your new plan with you before then.
          </p>
        )}
      </header>

      <section className="px-6 py-6 md:px-8">
        <h3 className="flex items-center gap-2 text-section font-semibold text-ink-900">
          <HandHeart className="size-4 text-accent" aria-hidden="true" /> The supports we&apos;ll
          provide
        </h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="py-2 pr-3 font-medium">Support</th>
                <th className="py-2 pr-3 font-medium">How often</th>
                <th className="py-2 pr-3 font-medium">Price</th>
                <th className="py-2 pr-3 font-medium">Paid by</th>
                <th className="py-2 text-right font-medium">Estimate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {a.lines.map((l) => (
                <tr key={l.id}>
                  <td className="py-3 pr-3 align-top">
                    <span className="font-semibold text-ink-900">
                      {l.support}
                      {l.kind !== "Service" && (
                        <span className="font-normal text-ink-500"> · {l.kind.toLowerCase()}</span>
                      )}
                    </span>
                    <span className="block text-caption text-ink-700">{l.scope}</span>
                    <span className="block text-caption text-ink-500">Where: {l.setting}</span>
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {l.quantity} {l.unit.toLowerCase()}
                    {l.quantity === 1 ? "" : "s"}{" "}
                    {l.frequency === "Once" || l.frequency === "As agreed"
                      ? l.frequency.toLowerCase()
                      : l.frequency.toLowerCase()}
                    <span className="block text-caption text-ink-500">
                      about {l.occurrences} time{l.occurrences === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="py-3 pr-3 align-top">
                    {aud(l.unitPrice)} per {l.unit.toLowerCase()}
                  </td>
                  <td className="py-3 pr-3 align-top">{l.paidBy}</td>
                  <td className="py-3 text-right align-top font-semibold">{aud(l.estimate)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-strong">
                <td colSpan={4} className="py-3 text-right text-small text-ink-700">
                  Estimated total. You&apos;re only charged for supports delivered, or under the
                  cancellation terms.
                </td>
                <td className="py-3 text-right text-body font-semibold text-ink-900">
                  {aud(a.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="border-t border-border px-6 py-6 md:px-8">
        <h3 className="flex items-center gap-2 text-section font-semibold text-ink-900">
          <CalendarRange className="size-4 text-accent" aria-hidden="true" /> Cancelling or changing
          a visit
        </h3>
        <p className="mt-2 text-small leading-relaxed text-ink-700">{a.cancellation}</p>
      </section>

      <section className="grid gap-px border-t border-border bg-border md:grid-cols-2">
        {a.rights.map((r) => (
          <div key={r.key} className="bg-surface px-6 py-5 md:px-8">
            <h3 className="flex items-center gap-2 text-small font-semibold text-ink-900">
              <Scale className="size-4 text-accent" aria-hidden="true" /> {r.title}
            </h3>
            <p className="mt-1.5 text-small leading-relaxed text-ink-700">{r.text}</p>
          </div>
        ))}
      </section>

      {(a.communication.length > 0 || a.communicationNote) && (
        <section className="border-t border-border px-6 py-5 md:px-8">
          <h3 className="flex items-center gap-2 text-small font-semibold text-ink-900">
            <Languages className="size-4 text-accent" aria-hidden="true" /> Communication support
          </h3>
          <p className="mt-1.5 text-small text-ink-700">
            {[a.communication.join(", "), a.communicationNote].filter(Boolean).join(". ")}. Ask us
            for this agreement in another format at any time.
          </p>
        </section>
      )}

      <footer className="flex items-center gap-2 border-t border-border bg-canvas px-6 py-4 text-caption text-ink-500 md:px-8">
        <Building2 className="size-4" aria-hidden="true" />
        Provider: {a.provider}. Electronic acceptance here is a simulation for the prototype.
      </footer>
    </article>
  );
}
