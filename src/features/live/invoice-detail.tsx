"use client";

import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { Tag } from "@/components/ui/tag";
import { api, useResource, useSession } from "@/lib/live/client";
import { invoiceMoves, money, type InvoiceDto } from "@/lib/live/clinical";
import { relativeTime, shortDate } from "@/lib/live/time";
import { ErrorNote, LiveBadge, Panel, Skeleton } from "./bits";
import { invoiceTone } from "./billing-board";
import { TextField } from "./form-bits";

export function InvoiceDetail({ id }: { id: string }) {
  const { data, error, reload } = useResource<{ invoice: InvoiceDto }>(
    `/api/care/billing/${id}`,
    (e) => e.type === "care" && (!e.payload.invoiceId || e.payload.invoiceId === id),
  );
  const roles = useSession().user?.staffRoles ?? [];
  const finance = roles.includes("Finance") || roles.includes("Super Admin");
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [adjust, setAdjust] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-96" />;
  const inv = data.invoice;
  const can = (to: string) => (invoiceMoves[inv.status] as readonly string[]).includes(to);
  const owing = Math.round((inv.total - inv.paid) * 100) / 100;

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setFail(null);
    try {
      await api(`/api/care/billing/${id}`, { body });
      reload();
      setReason("");
      setAmount("");
      setAdjust("");
    } catch (e) {
      setFail(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }
  const editableCodes = ["Draft", "Ready for Review", "Disputed"].includes(inv.status);

  return (
    <>
      <PageHeader
        eyebrow={
          <ButtonLink href="/care/billing" variant="ghost" size="sm">
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Billing
          </ButtonLink>
        }
        title={<span className="font-mono">{inv.number}</span>}
        description={
          <>
            <Link href={`/care/${inv.clientId}`} className="font-semibold">
              {inv.clientName}
            </Link>{" "}
            · {inv.funding} · to {inv.payer}
            {inv.issuedAt && ` · issued ${shortDate(inv.issuedAt)}`}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <LiveBadge />
            <Tag tone={invoiceTone[inv.status]}>{inv.status}</Tag>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-12">
        <div className="flex flex-col gap-6 xl:col-span-8">
          {inv.exceptions.length > 0 && (
            <section
              aria-label="Exceptions"
              className="rounded-card border border-monitor-bg bg-monitor-bg/50 p-4"
            >
              <h2 className="flex items-center gap-2 text-small font-semibold">
                <AlertTriangle className="size-4 text-monitor" aria-hidden="true" /> To resolve
                before issuing
              </h2>
              <ul className="mt-2 flex flex-col gap-1 text-small">
                {inv.exceptions.map((e) => (
                  <li key={e}>· {e}</li>
                ))}
              </ul>
            </section>
          )}
          <Panel title="Lines">
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-small">
                <thead className="border-b border-border text-caption text-ink-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Service</th>
                    <th className="py-2 pr-3 font-medium">Support item</th>
                    <th className="py-2 pr-3 text-right font-medium">Rate</th>
                    <th className="py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {inv.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2.5 pr-3">{shortDate(l.date)}</td>
                      <td className="py-2.5 pr-3">
                        {l.description}
                        {l.kind !== "service" && (
                          <Tag tone={l.kind === "cancellation" ? "over" : "neutral"}>{l.kind}</Tag>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {finance && editableCodes && l.kind !== "adjustment" ? (
                          <span className="flex items-center gap-1.5">
                            <input
                              aria-label="Support item number"
                              value={codes[l.id] ?? (l.itemCode === "To confirm" ? "" : l.itemCode)}
                              placeholder="To confirm"
                              onChange={(e) => setCodes((c) => ({ ...c, [l.id]: e.target.value }))}
                              className="h-8 w-40 rounded-control border border-border-strong bg-raised px-2 font-mono text-caption"
                            />
                            {codes[l.id] && codes[l.id] !== l.itemCode && (
                              <Button
                                size="sm"
                                disabled={busy}
                                onClick={() =>
                                  act({ type: "item-code", lineId: l.id, itemCode: codes[l.id] })
                                }
                              >
                                Save
                              </Button>
                            )}
                          </span>
                        ) : (
                          <span className="font-mono text-caption">{l.itemCode}</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-right">
                        {l.rate ? `${money(l.rate)}/h` : "–"}
                      </td>
                      <td className="py-2.5 text-right font-semibold">{money(l.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-border-strong">
                  <tr>
                    <td colSpan={4} className="py-2.5 text-right font-semibold">
                      Total
                    </td>
                    <td className="py-2.5 text-right font-semibold">{money(inv.total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 text-right text-ink-500">
                      Paid
                    </td>
                    <td className="py-1 text-right">{money(inv.paid)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="py-1 text-right text-ink-500">
                      Owing
                    </td>
                    <td className="py-1 text-right font-semibold">{money(owing)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-caption text-ink-500">
              Rates and support item numbers are PROPOSED until Medisense confirms its service
              agreements and pricing.
            </p>
          </Panel>
        </div>
        <div className="flex flex-col gap-6 xl:col-span-4">
          <Panel title="Next step">
            {!finance ? (
              <p className="text-small text-ink-700">
                Only Finance or a Super Admin can change invoices.
              </p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap gap-2">
                  {can("Ready for Review") && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => act({ type: "move", to: "Ready for Review" })}
                    >
                      Send for review
                    </Button>
                  )}
                  {can("Approved") && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => act({ type: "move", to: "Approved" })}
                    >
                      Approve
                    </Button>
                  )}
                  {can("Issued") && inv.status !== "Disputed" && inv.status !== "Adjusted" && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => act({ type: "move", to: "Issued" })}
                    >
                      Issue to payer
                    </Button>
                  )}
                  {inv.status === "Adjusted" && (
                    <Button
                      variant="primary"
                      disabled={busy}
                      onClick={() => act({ type: "move", to: "Issued" })}
                    >
                      Reissue
                    </Button>
                  )}
                  {can("Draft") && (
                    <Button disabled={busy} onClick={() => act({ type: "move", to: "Draft" })}>
                      Back to draft
                    </Button>
                  )}
                </div>
                {(can("Paid") || can("Partially Paid")) && (
                  <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                    <TextField
                      label="Payment received"
                      value={amount}
                      onChange={setAmount}
                      placeholder={String(owing)}
                    />
                    <TextField label="Reference" value={reference} onChange={setReference} />
                    <Button
                      className="col-span-2"
                      disabled={busy || !Number(amount)}
                      onClick={() => act({ type: "payment", amount: Number(amount), reference })}
                    >
                      Record payment
                    </Button>
                  </div>
                )}
                {inv.status === "Disputed" && (
                  <div className="grid gap-2 border-t border-border pt-3">
                    <TextField
                      label="Adjustment amount (negative to credit)"
                      value={adjust}
                      onChange={setAdjust}
                    />
                    <TextField label="Description" value={reason} onChange={setReason} />
                    <Button
                      disabled={busy || !Number(adjust) || reason.length < 3}
                      onClick={() =>
                        act({ type: "adjust", amount: Number(adjust), description: reason })
                      }
                    >
                      Add adjustment
                    </Button>
                  </div>
                )}
                {(can("Disputed") || can("Voided")) && inv.status !== "Disputed" && (
                  <div className="grid gap-2 border-t border-border pt-3">
                    <TextField
                      label="Reason (dispute or void)"
                      value={reason}
                      onChange={setReason}
                    />
                    <div className="flex gap-2">
                      {can("Disputed") && (
                        <Button
                          size="sm"
                          disabled={busy || reason.length < 3}
                          onClick={() => act({ type: "dispute", reason })}
                        >
                          Mark disputed
                        </Button>
                      )}
                      {can("Voided") && (
                        <Button
                          size="sm"
                          disabled={busy || reason.length < 3}
                          onClick={() => act({ type: "void", reason })}
                        >
                          Void
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {fail && (
                  <p role="alert" className="text-small text-over">
                    {fail}
                  </p>
                )}
              </div>
            )}
          </Panel>
          <Panel title="History">
            <ol className="flex flex-col gap-3">
              {[...inv.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="text-small">
                  <strong>{h.status}</strong>
                  {h.note && <span className="block text-ink-700">{h.note}</span>}
                  <span className="text-caption text-ink-500">
                    {h.byName} · {relativeTime(h.at)}
                  </span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      </div>
    </>
  );
}
