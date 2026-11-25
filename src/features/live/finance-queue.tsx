"use client";

import { AlertTriangle, CheckCircle2, Layers, Lock, ShieldAlert, History } from "lucide-react";
import { useState } from "react";
import { AiChip, AiIcon, RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { RecordCard, RecordPopup } from "@/components/ui/record-popup";
import { TableFrame } from "@/components/ui/table-frame";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { api } from "@/lib/live/client";
import {
  aud,
  billableBases,
  exceptionKinds,
  holdReasons,
  taxTreatments,
  travelCategories,
  type BillableDto,
  type FinanceHubDto,
} from "@/lib/live/finance";
import { cn } from "@/lib/cn";
import { EmptyNote } from "./bits";
import { Choice, TextArea, TextField } from "./form-bits";
import {
  dayLabel,
  filterLines,
  finance,
  lineTone,
  pathChip,
  td,
  th,
  type Filters,
} from "./finance-bits";

const views = [
  {
    id: "attention",
    label: "Needs attention",
    match: (l: BillableDto) => ["Captured", "Pending verification", "Held"].includes(l.status),
  },
  { id: "ready", label: "Ready to bill", match: (l: BillableDto) => l.status === "Ready" },
  {
    id: "billed",
    label: "Invoiced or claimed",
    match: (l: BillableDto) => l.status === "Invoiced" || l.status === "Claimed",
  },
  {
    id: "rejected",
    label: "Rejected or waived",
    match: (l: BillableDto) => l.status === "Rejected",
  },
  { id: "all", label: "All", match: () => true },
] as const;

type Review = {
  summary: string;
  items: { ref: string; issue: string; evidence: string; suggestion: string; confidence: number }[];
};

export function QueueTab({
  hub,
  f,
  onDone,
}: {
  hub: FinanceHubDto;
  f: Filters;
  onDone: () => void;
}) {
  const [view, setView] = useState<(typeof views)[number]["id"]>("attention");
  const [exception, setException] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [open, setOpen] = useState<BillableDto | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const base = filterLines(hub.billables, f);
  const rows = base.filter(
    (l) =>
      views.find((v) => v.id === view)!.match(l) &&
      (!exception || l.flags.some((x) => x.kind === exception)),
  );
  const ready = rows.filter((l) => l.status === "Ready");
  const total = rows.reduce((s, l) => s + l.amounts.total, 0);

  async function prepare() {
    setBusy(true);
    const res = await finance(
      "/api/care/billing",
      { type: "prepare", ids: picked },
      "Prepared",
      "Lines are grouped by participant, payer and agreement.",
    );
    setBusy(false);
    if (res) {
      toast(`Made or updated: ${(res.made as string[]).join(", ")}`, { tone: "info" });
      setPicked([]);
      onDone();
    }
  }
  async function aiReview() {
    const ids = (
      picked.length ? picked : rows.filter((r) => r.flags.length).map((r) => r.id)
    ).slice(0, 25);
    if (!ids.length) return toast("Nothing flagged to review", { tone: "info" });
    setBusy(true);
    try {
      const res = await api<{ review: Review }>("/api/care/billing", {
        body: { type: "ai-review", ids },
      });
      setReview(res.review);
    } catch (e) {
      toast("AI review unavailable", {
        tone: "error",
        detail: e instanceof Error ? e.message : "",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="flex flex-wrap gap-1 rounded-control border border-border-strong p-0.5">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={view === v.id}
              onClick={() => {
                setView(v.id);
                setPicked([]);
              }}
              className={cn(
                "h-8 cursor-pointer rounded-[6px] px-3 text-small font-semibold",
                view === v.id ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
              )}
            >
              {v.label} <span className="opacity-70">{base.filter(v.match).length}</span>
            </button>
          ))}
        </div>
        <div className="w-56 flex-none">
          <Select
            aria-label="Billing exception"
            className="h-9"
            value={exception}
            onChange={(e) => setException(e.target.value)}
          >
            <option value="">Any exception</option>
            {exceptionKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        <span className="ml-auto text-caption text-ink-500">
          {rows.length} line{rows.length === 1 ? "" : "s"} · {aud(total)}
        </span>
        {hub.can.officer && (
          <>
            <Button data-ai-only size="sm" variant="soft" disabled={busy} onClick={aiReview}>
              <AiIcon className="size-3.5" /> AI review
            </Button>
            <Button size="sm" variant="primary" disabled={busy || !picked.length} onClick={prepare}>
              <Layers className="size-3.5" aria-hidden="true" /> Prepare {picked.length || ""}{" "}
              selected
            </Button>
          </>
        )}
      </div>

      {review && (
        <section
          data-ai-only
          className="bubble-in rounded-card border border-dashed border-draft-rule bg-draft p-4"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <AiChip>AI suggestions</AiChip>
            <button
              type="button"
              onClick={() => setReview(null)}
              className="cursor-pointer text-caption font-semibold text-accent"
            >
              Dismiss
            </button>
          </div>
          <p className="text-small text-ink-900">{review.summary}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {review.items.map((i, n) => (
              <li key={`${i.ref}-${n}`} className="text-caption text-ink-700">
                <strong className="font-semibold text-ink-900">{i.ref}:</strong> {i.issue}{" "}
                <span className="text-ink-500">
                  (evidence: {i.evidence}; confidence {Math.round(i.confidence * 100)}%)
                </span>{" "}
                → {i.suggestion}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-caption text-ink-500">
            Suggestions only. Nothing is approved, changed or submitted until a person acts.
          </p>
        </section>
      )}

      <TableFrame>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No lines here.">
              Verified sessions, assessments and chargeable cancellations appear in this queue.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[1180px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label="Select all ready lines"
                    disabled={!ready.length || !hub.can.officer}
                    checked={ready.length > 0 && ready.every((r) => picked.includes(r.id))}
                    onChange={(e) => setPicked(e.target.checked ? ready.map((r) => r.id) : [])}
                  />
                </th>
                <th className={th}>Line</th>
                <th className={th}>Participant and service</th>
                <th className={th}>Delivered</th>
                <th className={th}>Payer route</th>
                <th className={th}>Pricing</th>
                <th className={cn(th, "text-right")}>Amount</th>
                <th className={th}>Checks</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((l) => {
                const blocks = l.flags.filter((x) => x.severity === "block");
                const warns = l.flags.filter((x) => x.severity === "warn");
                return (
                  <tr
                    key={l.id}
                    className={cn("cursor-pointer", picked.includes(l.id) && "bg-accent-tint/40")}
                    onClick={() => setOpen(l)}
                  >
                    <td className="px-4 py-3 align-top" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${l.ref}`}
                        disabled={l.status !== "Ready" || !hub.can.officer}
                        checked={picked.includes(l.id)}
                        onChange={(e) =>
                          setPicked(
                            e.target.checked ? [...picked, l.id] : picked.filter((x) => x !== l.id),
                          )
                        }
                      />
                    </td>
                    <td className={td}>
                      <span className="font-mono font-semibold whitespace-nowrap text-ink-900">
                        {l.ref}
                      </span>
                      <span className="block text-caption text-ink-500">
                        {l.source}
                        {l.parentId ? " · child line" : ""}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="font-semibold text-ink-900">{l.participant}</span>
                      <span className="block text-caption text-ink-500">
                        {l.support} · {l.therapist}
                      </span>
                    </td>
                    <td className={td}>
                      {dayLabel(l.start)}
                      <span className="block text-caption text-ink-500">
                        {l.source === "Travel"
                          ? `${l.quantity} km`
                          : `${l.billableMinutes} of ${l.deliveredMinutes || l.billableMinutes} min`}{" "}
                        · {l.location}
                      </span>
                    </td>
                    <td className={td}>
                      <span
                        className={cn(
                          "rounded-tag px-2 py-0.5 text-caption font-semibold",
                          pathChip(l.path),
                        )}
                      >
                        {l.path}
                      </span>
                      <span className="mt-1 block max-w-56 truncate text-caption text-ink-500">
                        {l.payerRoute}
                      </span>
                    </td>
                    <td className={td}>
                      {l.quantity} {l.unit.toLowerCase()} × {aud(l.rate)}
                      <span
                        className="block max-w-56 truncate text-caption text-ink-500"
                        title={l.rateSource}
                      >
                        {l.itemCode} · {l.rateSource}
                      </span>
                    </td>
                    <td className={cn(td, "text-right font-semibold text-ink-900")}>
                      {aud(l.amounts.total)}
                    </td>
                    <td className={td}>
                      <span className="flex flex-col gap-1">
                        {blocks.slice(0, 2).map((x) => (
                          <span
                            key={x.label}
                            className="flex items-start gap-1 text-caption text-over"
                          >
                            <ShieldAlert className="mt-0.5 size-3 flex-none" aria-hidden="true" />
                            <span className="line-clamp-1">{x.kind}</span>
                          </span>
                        ))}
                        {warns.slice(0, 2).map((x) => (
                          <span
                            key={x.label}
                            className="flex items-start gap-1 text-caption text-watch"
                          >
                            <AlertTriangle className="mt-0.5 size-3 flex-none" aria-hidden="true" />
                            <span className="line-clamp-1">{x.kind}</span>
                          </span>
                        ))}
                        {!l.flags.length && (
                          <span className="flex items-center gap-1 text-caption text-healthy">
                            <CheckCircle2 className="size-3" aria-hidden="true" /> Clear
                          </span>
                        )}
                      </span>
                    </td>
                    <td className={td}>
                      <Tag tone={lineTone[l.status]}>{l.status}</Tag>
                      {(l.invoice || l.claim) && (
                        <span className="mt-1 block font-mono text-caption text-ink-500">
                          {l.invoice?.number ?? l.claim?.ref}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableFrame>
      {open && <LineSheet line={open} hub={hub} onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

type Mode =
  | null
  | "confirm"
  | "edit"
  | "travel"
  | "rate"
  | "decide"
  | "hold"
  | "release"
  | "reject"
  | "override";

export function LineSheet({
  line: l,
  hub,
  onClose,
  onDone,
}: {
  line: BillableDto;
  hub: Pick<FinanceHubDto, "can" | "rules">;
  onClose: () => void;
  onDone: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [v, setV] = useState({
    minutes: String(l.billableMinutes),
    quantity: String(l.quantity),
    tax: l.tax,
    itemCode: l.itemCode === "To confirm" ? "" : l.itemCode,
    reason: "",
    rate: String(l.rate),
    hold: "Missing evidence" as (typeof holdReasons)[number],
    category: (l.source === "Travel"
      ? "Travel non-labour"
      : "Therapist travel labour") as (typeof travelCategories)[number],
    tminutes: "0",
    km: String(l.source === "Travel" ? l.quantity : 0),
    costs: "0",
    basis: "Actual" as (typeof billableBases)[number],
    evidence: "",
    overrideKind: "Funding query" as "Missing agreement" | "Funding query" | "Tax review",
    approve: true,
  });
  const locked = l.status === "Invoiced" || l.status === "Claimed";
  const rule = hub.rules.paths[l.path];
  const allowedCategories = travelCategories.filter(
    (c) =>
      (c === "Therapist travel labour" && rule.travelLabour) ||
      (c === "Travel non-labour" && rule.travelNonLabour) ||
      (c === "Non-face-to-face" && rule.nonFaceToFace) ||
      c === "Other",
  );
  async function send(body: unknown, ok: string) {
    if (await finance(`/api/care/billing/lines/${l.id}`, body, ok)) {
      onDone();
      onClose();
    }
  }
  const submit = () => {
    switch (mode) {
      case "confirm":
        return send(
          { type: "confirm", minutes: Number(v.minutes) || undefined, note: v.reason },
          "Delivery confirmed",
        );
      case "edit":
        return send(
          {
            type: "edit",
            edit: {
              minutes: Number(v.minutes) || undefined,
              quantity: Number(v.quantity) || undefined,
              tax: v.tax,
              itemCode: v.itemCode || undefined,
              reason: v.reason,
            },
          },
          "Line corrected",
        );
      case "travel":
        return send(
          {
            type: "travel",
            travel: {
              category: v.category,
              minutes: Number(v.tminutes) || 0,
              km: Number(v.km) || 0,
              costs: Number(v.costs) || 0,
              basis: v.basis,
              evidence: v.evidence,
            },
          },
          "Travel recorded",
        );
      case "rate":
        return send(
          { type: "rate-request", rate: Number(v.rate), reason: v.reason },
          "Override sent for approval",
        );
      case "decide":
        return send(
          { type: "rate-decision", approve: v.approve, note: v.reason },
          v.approve ? "Rate approved" : "Rate declined",
        );
      case "hold":
        return send({ type: "hold", reason: v.hold, note: v.reason }, "Line held");
      case "release":
        return send({ type: "release", note: v.reason }, "Line released");
      case "reject":
        return send({ type: "reject", reason: v.reason }, "Line rejected");
      case "override":
        return send(
          { type: "override", kind: v.overrideKind, reason: v.reason },
          "Check overridden",
        );
    }
  };
  const needsRateDecision =
    hub.can.manager &&
    ((l.override && !l.override.approvedBy) ||
      (l.priceLimit !== null && l.rate > l.priceLimit && !l.override?.approvedBy));

  return (
    <RecordPopup
      title={`${l.ref} · ${l.source}`}
      description={`${l.participant} · ${l.support} · ${dayLabel(l.start)}`}
      onClose={onClose}
      meta={<Tag tone={lineTone[l.status]}>{l.status}</Tag>}
      aside={
        !mode ? (
          <RecordCard title="History" icon={History} flush={false}>
            <ol className="relative ml-2 border-l border-border pl-5">
              {[...l.history].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative pb-3 last:pb-0">
                  <span
                    className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-surface bg-accent-fill"
                    aria-hidden="true"
                  />
                  <p className="text-small text-ink-900">{h.action}</p>
                  <p className="text-caption text-ink-500">
                    {h.by},{" "}
                    {new Date(h.at).toLocaleString("en-AU", {
                      timeZone: "Australia/Brisbane",
                      day: "numeric",
                      month: "short",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </li>
              ))}
            </ol>
          </RecordCard>
        ) : undefined
      }
      footer={
        mode ? (
          <>
            <Button variant="ghost" onClick={() => setMode(null)}>
              Back
            </Button>
            <Button
              variant={mode === "reject" ? "soft-danger" : "primary"}
              disabled={
                ["edit", "rate", "hold", "release", "reject", "override", "decide"].includes(
                  mode,
                ) && v.reason.trim().length < 3
              }
              onClick={submit}
            >
              Save
            </Button>
          </>
        ) : undefined
      }
    >
      {!mode ? (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn("rounded-tag px-2 py-0.5 text-caption font-semibold", pathChip(l.path))}
            >
              {l.path}
            </span>
            {locked && (
              <span className="inline-flex items-center gap-1 text-caption text-ink-500">
                <Lock className="size-3" aria-hidden="true" /> On{" "}
                {l.invoice?.number ?? l.claim?.ref}: corrections go through a credit note
              </span>
            )}
          </div>
          <dl className="grid grid-cols-[160px_1fr] gap-x-4 gap-y-2 rounded-card border border-border bg-surface p-4 text-small">
            <dt className="text-ink-500">Delivered</dt>
            <dd>
              {l.deliveredMinutes} min · billable {l.billableMinutes} min · {l.location}
            </dd>
            <dt className="text-ink-500">Therapist</dt>
            <dd>{l.therapist}</dd>
            <dt className="text-ink-500">Payer route</dt>
            <dd>{l.payerRoute}</dd>
            <dt className="text-ink-500">Agreement</dt>
            <dd>{l.agreement ?? "None on this date"}</dd>
            <dt className="text-ink-500">Support item</dt>
            <dd>
              {l.itemCode} · {l.itemName}
            </dd>
            <dt className="text-ink-500">Rate</dt>
            <dd>
              {aud(l.rate)} per {l.unit.toLowerCase()} · {l.rateSource}
              {l.priceLimit !== null && (
                <span className="block text-caption text-ink-500">Limit {aud(l.priceLimit)}</span>
              )}
            </dd>
            <dt className="text-ink-500">Arithmetic</dt>
            <dd>
              {l.quantity} × {aud(l.rate)} = {aud(l.amounts.subtotal)}
              {l.amounts.gst ? ` + GST ${aud(l.amounts.gst)}` : ""} · {l.tax}
            </dd>
            <dt className="text-ink-500">Confirmation</dt>
            <dd>
              {l.confirmation ? `${l.confirmation.how}, ${l.confirmation.by}` : "Not confirmed"}
            </dd>
            {l.travel && (
              <>
                <dt className="text-ink-500">Travel</dt>
                <dd>
                  {l.travel.category}: {l.travel.km} km, {l.travel.minutes} min,{" "}
                  {aud(l.travel.costs)} ({l.travel.basis}). {l.travel.evidence}
                </dd>
              </>
            )}
          </dl>
          {l.flags.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="flex items-center gap-2 text-caption font-semibold text-ink-700">
                Checks <RuleMark />
              </p>
              {l.flags.map((x) => (
                <p
                  key={x.label}
                  className={cn(
                    "flex items-start gap-2 rounded-control px-3 py-2 text-small",
                    x.severity === "block" ? "bg-over-bg text-ink-900" : "bg-watch-bg text-ink-900",
                  )}
                >
                  {x.severity === "block" ? (
                    <ShieldAlert className="mt-0.5 size-4 flex-none text-over" aria-hidden="true" />
                  ) : (
                    <AlertTriangle
                      className="mt-0.5 size-4 flex-none text-watch"
                      aria-hidden="true"
                    />
                  )}
                  <span>
                    <strong className="font-semibold">{x.kind}.</strong> {x.label}
                  </span>
                </p>
              ))}
            </div>
          )}
          {l.hold && (
            <p className="rounded-control bg-over-bg px-3 py-2 text-small text-ink-900">
              <strong>Held: {l.hold.reason}.</strong> {l.hold.note} ({l.hold.by})
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {!locked && hub.can.officer && !l.confirmation && (
              <Button size="sm" variant="soft" onClick={() => setMode("confirm")}>
                Confirm delivery
              </Button>
            )}
            {!locked && hub.can.officer && (
              <Button size="sm" variant="soft" onClick={() => setMode("travel")}>
                {l.source === "Travel" ? "Confirm travel" : "Add travel or non-face-to-face"}
              </Button>
            )}
            {!locked && hub.can.officer && (
              <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>
                Correct
              </Button>
            )}
            {!locked && hub.can.officer && (
              <Button size="sm" variant="secondary" onClick={() => setMode("rate")}>
                Rate override
              </Button>
            )}
            {!locked && needsRateDecision && (
              <Button size="sm" variant="primary" onClick={() => setMode("decide")}>
                Decide rate (Manager)
              </Button>
            )}
            {!locked && hub.can.officer && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  finance(
                    `/api/care/billing/lines/${l.id}`,
                    { type: "recheck" },
                    "Rechecked against current funding",
                  ).then((r) => r && (onDone(), onClose()))
                }
              >
                Recheck funding
              </Button>
            )}
            {!locked &&
              hub.can.manager &&
              l.flags.some((x) =>
                ["Missing agreement", "Funding query", "Tax review"].includes(x.kind),
              ) && (
                <Button size="sm" variant="secondary" onClick={() => setMode("override")}>
                  Override a check
                </Button>
              )}
            {hub.can.officer && (l.hold || l.duplicateOf) ? (
              <Button size="sm" variant="soft" onClick={() => setMode("release")}>
                Release hold
              </Button>
            ) : (
              hub.can.officer &&
              !locked && (
                <Button size="sm" variant="soft-danger" onClick={() => setMode("hold")}>
                  Hold
                </Button>
              )
            )}
            {!locked && hub.can.officer && l.status !== "Rejected" && (
              <Button size="sm" variant="soft-danger" onClick={() => setMode("reject")}>
                Reject
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {mode === "confirm" && (
            <>
              <TextField
                label="Delivered minutes"
                value={v.minutes}
                onChange={(x) => setV({ ...v, minutes: x })}
              />
              <TextArea
                label="Note (optional)"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
              />
            </>
          )}
          {mode === "edit" && (
            <>
              <p className="text-caption text-ink-500">
                Manual corrections need a reason and are kept in history.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <TextField
                  label="Billable minutes"
                  value={v.minutes}
                  onChange={(x) => setV({ ...v, minutes: x })}
                />
                <TextField
                  label="Quantity"
                  value={v.quantity}
                  onChange={(x) => setV({ ...v, quantity: x })}
                />
              </div>
              <Choice
                label="Tax treatment"
                options={taxTreatments}
                value={v.tax}
                onChange={(x) => setV({ ...v, tax: x })}
              />
              <TextField
                label="Support item number"
                value={v.itemCode}
                onChange={(x) => setV({ ...v, itemCode: x })}
                placeholder="From the current pricing schedule"
              />
              <TextArea
                label="Reason"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
                required
              />
            </>
          )}
          {mode === "travel" && (
            <>
              <p className="text-caption text-ink-500">
                Only categories the {l.path} rule allows are offered. Telehealth sessions have no
                travel.
              </p>
              <Choice
                label="Charge category"
                options={allowedCategories}
                value={v.category}
                onChange={(x) => setV({ ...v, category: x })}
              />
              <div className="grid grid-cols-3 gap-3">
                <TextField
                  label="Minutes"
                  value={v.tminutes}
                  onChange={(x) => setV({ ...v, tminutes: x })}
                />
                <TextField
                  label="Kilometres"
                  value={v.km}
                  onChange={(x) => setV({ ...v, km: x })}
                />
                <TextField
                  label="Parking or tolls (AUD)"
                  value={v.costs}
                  onChange={(x) => setV({ ...v, costs: x })}
                />
              </div>
              <Choice
                label="Billable basis"
                options={billableBases}
                value={v.basis}
                onChange={(x) => setV({ ...v, basis: x })}
              />
              <TextArea
                label="Evidence and justification"
                value={v.evidence}
                onChange={(x) => setV({ ...v, evidence: x })}
                rows={2}
                placeholder="For example: odometer 48211 to 48229; parking receipt uploaded"
                required
              />
            </>
          )}
          {mode === "rate" && (
            <>
              <p className="text-caption text-ink-500">
                A Finance Manager approves every manual rate override (AC-15).
              </p>
              <TextField
                label="New rate (AUD)"
                value={v.rate}
                onChange={(x) => setV({ ...v, rate: x })}
              />
              <TextArea
                label="Reason"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
                required
              />
            </>
          )}
          {mode === "decide" && (
            <>
              <p className="rounded-control bg-watch-bg px-3 py-2 text-small text-ink-900">
                {l.override
                  ? `Requested ${aud(l.override.rate)} by ${l.override.requestedBy}: ${l.override.reason}`
                  : `${aud(l.rate)} is above the ${aud(l.priceLimit)} limit.`}
              </p>
              <Choice
                label="Decision"
                options={["Approve", "Decline"] as const}
                value={v.approve ? "Approve" : "Decline"}
                onChange={(x) => setV({ ...v, approve: x === "Approve" })}
              />
              <TextArea
                label="Note"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
                required
              />
            </>
          )}
          {mode === "hold" && (
            <>
              <Choice
                label="Hold reason"
                options={holdReasons}
                value={v.hold}
                onChange={(x) => setV({ ...v, hold: x })}
              />
              <TextArea
                label="Note"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
                required
              />
            </>
          )}
          {(mode === "release" || mode === "reject") && (
            <TextArea
              label={mode === "reject" ? "Why it isn't billable" : "Why it can be released"}
              value={v.reason}
              onChange={(x) => setV({ ...v, reason: x })}
              rows={3}
              required
            />
          )}
          {mode === "override" && (
            <>
              <p className="text-caption text-ink-500">
                Only configurable, non-safety checks can be overridden, by a Finance Manager, with a
                reason (AC-36).
              </p>
              <Choice
                label="Check"
                options={["Missing agreement", "Funding query", "Tax review"] as const}
                value={v.overrideKind}
                onChange={(x) => setV({ ...v, overrideKind: x })}
              />
              <TextArea
                label="Reason"
                value={v.reason}
                onChange={(x) => setV({ ...v, reason: x })}
                rows={2}
                required
              />
            </>
          )}
        </div>
      )}
    </RecordPopup>
  );
}
