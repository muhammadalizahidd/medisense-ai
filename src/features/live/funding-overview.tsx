"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  BellRing,
  Building2,
  Check,
  FileSignature,
  Landmark,
  ListChecks,
  Plus,
  Search,
  Settings2,
  Tags,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { supports } from "@/lib/live/catalogue";
import { api, useResource } from "@/lib/live/client";
import {
  aud,
  deliveryMethods,
  geographies,
  payerKinds,
  serviceUnits,
  type FundingAlertDto,
  type FundingOverviewDto,
  type FundingPolicy,
  type PayerDto,
  type PayerInput,
  type PriceItemDto,
} from "@/lib/live/funding";
import { cn } from "@/lib/cn";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";
import { Choice, TextArea, TextField, Tick } from "./form-bits";
import {
  agreementTone,
  bookingTone,
  dayLabel,
  evidenceTone,
  FCard,
  ManagementChip,
  payerTone,
  relativeDays,
  severityTone,
  td,
  th,
} from "./funding-bits";

type Data = { overview: FundingOverviewDto };

const tabs = [
  { id: "participants", label: "Participants" },
  { id: "alerts", label: "Alerts", alert: true },
  { id: "agreements", label: "Service agreements" },
  { id: "payers", label: "Payer directory" },
  { id: "catalogue", label: "Price catalogue" },
  { id: "settings", label: "Policy settings" },
] as const;
type TabId = (typeof tabs)[number]["id"];

/** Module 06: the funding workspace for intake and finance. */
export function FundingOverview() {
  const { data, error, loading, reload } = useResource<Data>(
    "/api/care/funding",
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  const o = data?.overview;
  const tabList = tabs.map((t) =>
    t.id === "alerts"
      ? { ...t, count: o?.counts.alerts || undefined }
      : t.id === "payers"
        ? { ...t, count: o?.payers.length }
        : t.id === "agreements"
          ? { ...t, count: o?.agreements.length }
          : t,
  );

  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !o) return <Skeleton className="h-[640px]" />;

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Funding and agreements"
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-500 lg:inline">
              Verification and claims are simulated: no NDIA connection
            </span>
            <LiveBadge />
          </div>
        }
      />
      <MetricBand
        label="Funding summary"
        metrics={[
          { label: "Participants with a plan", value: o.counts.plans },
          {
            label: "Plan evidence verified",
            value: o.counts.verified,
            caption: `of ${o.counts.plans}`,
          },
          {
            label: "Plans ending soon",
            value: o.counts.expiring,
            caption: `within ${Math.max(...o.policy.reminderDays)} days`,
            tone: o.counts.expiring ? "watch" : undefined,
            flagged: o.counts.expiring > 0,
          },
          { label: "Awaiting signature", value: o.counts.awaitingSignature },
          {
            label: "Booking blocked",
            value: o.counts.blocked,
            tone: o.counts.blocked ? "over" : undefined,
            flagged: o.counts.blocked > 0,
          },
          {
            label: "Open alerts",
            value: o.counts.alerts,
            tone: o.counts.alerts ? "watch" : undefined,
          },
        ]}
      />
      <div className="mt-4">
        <Tabs label="Funding" tabs={tabList} value={tab} onChange={(t: TabId) => setTab(t)} />
      </div>
      <TabPanel id="participants" value={tab}>
        <ParticipantsTab o={o} />
      </TabPanel>
      <TabPanel id="alerts" value={tab}>
        <AlertsTab alerts={o.alerts} canAck={o.can.edit} onDone={reload} />
      </TabPanel>
      <TabPanel id="agreements" value={tab}>
        <AgreementsTab o={o} />
      </TabPanel>
      <TabPanel id="payers" value={tab}>
        <PayersTab o={o} onDone={reload} />
      </TabPanel>
      <TabPanel id="catalogue" value={tab}>
        <CatalogueTab items={o.priceItems} canEdit={o.can.verify} onDone={reload} />
      </TabPanel>
      <TabPanel id="settings" value={tab}>
        <PolicyTab policy={o.policy} canEdit={o.can.verify} onDone={reload} />
      </TabPanel>
    </>
  );
}

/* ------------------------------------------------------------------ participants */

function ParticipantsTab({ o }: { o: FundingOverviewDto }) {
  const [query, setQuery] = useState("");
  const [management, setManagement] = useState("");
  const [evidence, setEvidence] = useState("");
  const [booking, setBooking] = useState("");
  const rows = useMemo(
    () =>
      o.rows.filter((r) => {
        const q = query.trim().toLowerCase();
        if (q && !`${r.participant} ${r.mrn ?? ""} ${r.planRef ?? ""}`.toLowerCase().includes(q))
          return false;
        if (
          management &&
          !(r.management === management || r.budgets.some((b) => b.management === management))
        ) {
          return false;
        }
        if (evidence && r.evidence !== evidence) return false;
        if (booking && r.booking !== booking) return false;
        return true;
      }),
    [o.rows, query, management, evidence, booking],
  );
  const filtering = Boolean(query || management || evidence || booking);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <label className="flex h-9 w-72 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search participants"
            placeholder="Search name, MRN or plan"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
        <div className="w-48 flex-none">
          <Select
            aria-label="Management"
            className="h-9"
            value={management}
            onChange={(e) => setManagement(e.target.value)}
          >
            <option value="">Any management</option>
            {["Plan Managed", "Self-Managed", "Agency Managed", "Unknown"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        <div className="w-44 flex-none">
          <Select
            aria-label="Evidence"
            className="h-9"
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
          >
            <option value="">Any evidence</option>
            {["Missing", "Under Review", "Verified", "Rejected", "No plan"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        <div className="w-44 flex-none">
          <Select
            aria-label="Booking readiness"
            className="h-9"
            value={booking}
            onChange={(e) => setBooking(e.target.value)}
          >
            <option value="">Any readiness</option>
            {["Ready", "Conditional", "Blocked"].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </Select>
        </div>
        {filtering && (
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setManagement("");
              setEvidence("");
              setBooking("");
            }}
            className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-caption text-ink-500">
          Showing {rows.length} of {o.rows.length}
        </span>
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote
              title={o.rows.length ? "No participants match." : "No NDIS participants yet."}
            >
              {o.rows.length
                ? "Try another filter."
                : "Accepting an NDIS referral creates its funding draft."}
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Participant</th>
                <th className={th}>Plan and management</th>
                <th className={th}>Plan ends</th>
                <th className={th}>Evidence</th>
                <th className={th}>Agreement</th>
                <th className={th}>Booking</th>
                <th className={cn(th, "text-right")}>Alerts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const mixed = new Set(r.budgets.map((b) => b.management)).size > 1;
                return (
                  <tr key={r.clientId} className="group">
                    <td className={td}>
                      <Link
                        href={`/care/funding/${r.clientId}`}
                        className="font-semibold text-ink-900"
                      >
                        {r.participant}
                      </Link>
                      {r.mrn && (
                        <span className="block font-mono text-caption text-ink-500">{r.mrn}</span>
                      )}
                    </td>
                    <td className={td}>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {r.planRef && (
                          <span className="font-mono text-caption text-ink-700">{r.planRef}</span>
                        )}
                        <ManagementChip value={r.management} />
                        {mixed && <Tag tone="monitor">Mixed by budget</Tag>}
                      </span>
                      <span className="mt-1 block text-caption text-ink-500">
                        {r.budgets.length} budget{r.budgets.length === 1 ? "" : "s"}
                      </span>
                    </td>
                    <td className={td}>
                      <span className="block text-ink-900">{dayLabel(r.end)}</span>
                      <span
                        className={cn(
                          "text-caption",
                          r.daysToEnd !== null && r.daysToEnd <= 30
                            ? "font-semibold text-over"
                            : "text-ink-500",
                        )}
                      >
                        {r.end ? relativeDays(r.daysToEnd) : "Participant to confirm"}
                      </span>
                    </td>
                    <td className={td}>
                      <Tag tone={evidenceTone[r.evidence]}>{r.evidence}</Tag>
                    </td>
                    <td className={td}>
                      <Tag tone={agreementTone[r.agreement]}>
                        {r.agreement === "None" ? "None yet" : r.agreement}
                      </Tag>
                    </td>
                    <td className={td}>
                      <Tag tone={bookingTone[r.booking]}>{r.booking}</Tag>
                    </td>
                    <td className={cn(td, "text-right")}>
                      <span className="inline-flex items-center gap-3">
                        {r.warnings > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-watch">
                            <AlertTriangle className="size-3.5" aria-hidden="true" />
                            {r.warnings}
                          </span>
                        ) : (
                          <span className="text-ink-400">0</span>
                        )}
                        <Link
                          href={`/care/funding/${r.clientId}`}
                          aria-label={`Open ${r.participant}'s funding`}
                          className="flex size-8 items-center justify-center rounded-control text-accent transition-all group-hover:bg-accent-tint"
                        >
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Link>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </TableFrame>
    </>
  );
}

/* ------------------------------------------------------------------ alerts */

const kindLabel: Record<FundingAlertDto["kind"], string> = {
  "plan-expiry": "Plan expiry",
  "period-end": "Funding period",
  "missing-email": "Payer details",
  duplicate: "Duplicate or overlap",
  "over-commitment": "Commitment",
  "price-limit": "Price limit",
  "not-accepted": "Agreement",
  "agreement-expired": "Agreement",
  "evidence-rejected": "Evidence",
  "payer-inactive": "Payer",
  "beyond-plan": "Scheduling",
  "info-outstanding": "Information request",
};

export function AlertsTab({
  alerts,
  canAck,
  onDone,
  compact = false,
}: {
  alerts: FundingAlertDto[];
  canAck: boolean;
  onDone: () => void;
  compact?: boolean;
}) {
  const [show, setShow] = useState<"open" | "all">("open");
  const [acking, setAcking] = useState<FundingAlertDto | null>(null);
  const list = alerts.filter((a) => show === "all" || !a.acknowledged);
  return (
    <FCard
      icon={BellRing}
      title="Funding alerts"
      sub="Raised by rules from plan dates, periods, payers, budgets and agreements. A person acts on each."
      flush
      action={
        <div className="flex gap-1 rounded-control border border-border-strong p-0.5">
          {(["open", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={show === v}
              onClick={() => setShow(v)}
              className={cn(
                "h-7 cursor-pointer rounded-[6px] px-3 text-caption font-semibold",
                show === v ? "bg-accent-fill text-on-accent" : "text-ink-700 hover:bg-canvas",
              )}
            >
              {v === "open"
                ? `Open (${alerts.filter((a) => !a.acknowledged).length})`
                : `All (${alerts.length})`}
            </button>
          ))}
        </div>
      }
    >
      {list.length === 0 ? (
        <div className="flex min-h-48 items-center justify-center p-6">
          <EmptyNote title="No open alerts.">
            Plan expiries, payer gaps and agreement follow-ups appear here.
          </EmptyNote>
        </div>
      ) : (
        <ul className={cn("divide-y divide-border", !compact && "max-h-[560px] overflow-auto")}>
          {list.map((a) => (
            <li
              key={a.key}
              className={cn(
                "bubble-in flex flex-wrap items-start gap-3 px-5 py-3.5 transition-colors hover:bg-canvas",
                a.acknowledged && "opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "mt-1.5 size-2.5 flex-none rounded-full",
                  a.severity === "high"
                    ? "bg-over-dot"
                    : a.severity === "medium"
                      ? "bg-watch-dot"
                      : "bg-ink-400",
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-small font-semibold text-ink-900">{a.title}</span>
                  <Tag tone={severityTone[a.severity]}>{kindLabel[a.kind]}</Tag>
                </p>
                <p className="mt-0.5 text-caption text-ink-700">{a.detail}</p>
                <p className="mt-1 text-caption text-ink-500">
                  {!compact && <>{a.participant} · </>}Owner: {a.owner}
                  {a.acknowledged && ` · Acknowledged by ${a.acknowledged.by}`}
                </p>
              </div>
              <div className="flex flex-none items-center gap-2">
                <Link href={a.href} className="text-caption font-semibold text-accent">
                  Open
                </Link>
                {canAck && !a.acknowledged && (
                  <Button size="sm" variant="soft" onClick={() => setAcking(a)}>
                    <Check className="size-3.5" aria-hidden="true" /> Acknowledge
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {acking && <AckSheet alert={acking} onClose={() => setAcking(null)} onDone={onDone} />}
    </FCard>
  );
}

function AckSheet({
  alert,
  onClose,
  onDone,
}: {
  alert: FundingAlertDto;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Sheet
      title="Acknowledge alert"
      description={alert.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/care/funding", { body: { type: "ack", key: alert.key, note } });
                toast("Alert acknowledged", { tone: "success" });
                onDone();
                onClose();
              } catch (e) {
                toast("Couldn't acknowledge", {
                  tone: "error",
                  detail: e instanceof Error ? e.message : "",
                });
              } finally {
                setBusy(false);
              }
            }}
          >
            Acknowledge
          </Button>
        </>
      }
    >
      <p className="mb-3 text-small text-ink-700">{alert.detail}</p>
      <TextArea
        label="What was checked"
        value={note}
        onChange={setNote}
        rows={3}
        placeholder="For example: new plan requested from the support coordinator"
      />
    </Sheet>
  );
}

/* ------------------------------------------------------------------ agreements */

function AgreementsTab({ o }: { o: FundingOverviewDto }) {
  const [status, setStatus] = useState("");
  const rows = o.agreements.filter((a) => !status || a.status === status);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-52 flex-none">
          <Select
            aria-label="Agreement status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {[
              "Draft",
              "Internal Review",
              "Issued",
              "Viewed",
              "Changes Requested",
              "Signed",
              "Declined",
              "Cancelled",
              "Expired",
              "Superseded",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </div>
        <span className="text-caption text-ink-500">
          New agreements start from a participant&apos;s funding record.
        </span>
        <span className="ml-auto text-caption text-ink-500">
          Showing {rows.length} of {o.agreements.length}
        </span>
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No service agreements yet.">
              Open a participant and choose New agreement.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[920px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Agreement</th>
                <th className={th}>Participant</th>
                <th className={th}>Signatory</th>
                <th className={th}>Period</th>
                <th className={cn(th, "text-right")}>Estimate</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((a) => (
                <tr key={a.id}>
                  <td className={td}>
                    <Link
                      href={`/care/funding/agreements/${a.id}`}
                      className="font-mono font-semibold text-ink-900"
                    >
                      {a.ref} v{a.version}
                    </Link>
                    <span className="block text-caption text-ink-500">
                      {a.type} · {a.lines.length} line{a.lines.length === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className={td}>
                    <Link
                      href={`/care/funding/${a.clientId}?tab=agreements`}
                      className="text-ink-900"
                    >
                      {a.participant}
                    </Link>
                  </td>
                  <td className={td}>
                    {a.signatory.name}
                    <span className="block text-caption text-ink-500">
                      {a.signatory.authority}{" "}
                      {a.signatory.verified ? "· verified" : "· not verified"}
                    </span>
                  </td>
                  <td className={td}>
                    {dayLabel(a.start)} to {dayLabel(a.end)}
                  </td>
                  <td className={cn(td, "text-right font-semibold")}>{aud(a.total)}</td>
                  <td className={td}>
                    <Tag tone={agreementTone[a.status]}>{a.status}</Tag>
                    {a.review.required && !a.review.by && a.status === "Draft" && (
                      <span className="mt-1 block text-caption text-watch">
                        Needs internal review
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
    </>
  );
}

/* ------------------------------------------------------------------ payers */

const blankPayer: PayerInput = {
  kind: "Plan manager",
  name: "",
  contactName: "",
  email: "",
  phone: "",
  deliveryMethod: "Email",
  clientId: "",
  authority: "",
  abn: "",
  billingNotes: "",
  effectiveFrom: "",
};

export function PayersTab({
  o,
  onDone,
}: {
  o: Pick<FundingOverviewDto, "payers" | "can" | "clients">;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState<PayerDto | "new" | null>(null);
  const [acting, setActing] = useState<{
    payer: PayerDto;
    kind: "verify" | "inactivate" | "replace";
  } | null>(null);
  const [kind, setKind] = useState("");
  const rows = o.payers.filter((p) => !kind || p.kind === kind);
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <div className="w-56 flex-none">
          <Select
            aria-label="Payer type"
            className="h-9"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All payer types</option>
            {payerKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        <span className="text-caption text-ink-500">
          Payer contact details are for invoicing only. Clinical notes are never sent to payers.
        </span>
        {o.can.edit && (
          <Button variant="primary" size="sm" className="ml-auto" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" aria-hidden="true" /> Add payer
          </Button>
        )}
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6">
            <EmptyNote title="No payers yet.">
              Plan managers named on referrals appear here, awaiting verification.
            </EmptyNote>
          </div>
        ) : (
          <table className="w-full min-w-[980px] text-left text-small">
            <thead className="border-b border-border text-caption text-ink-500">
              <tr>
                <th className={th}>Payer</th>
                <th className={th}>Type</th>
                <th className={th}>Invoice contact</th>
                <th className={th}>Delivery</th>
                <th className={th}>Status</th>
                <th className={cn(th, "text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className={td}>
                    <span className="font-semibold text-ink-900">{p.name}</span>
                    <span className="block text-caption text-ink-500">
                      <span className="font-mono">{p.ref}</span> · used on {p.usedBy} plan
                      {p.usedBy === 1 ? "" : "s"}
                      {p.client ? ` · for ${p.client}` : ""}
                    </span>
                  </td>
                  <td className={td}>{p.kind}</td>
                  <td className={td}>
                    {p.email ? (
                      <span className="block text-ink-900">{p.email}</span>
                    ) : (
                      <span className="block font-semibold text-over">Email missing</span>
                    )}
                    <span className="text-caption text-ink-500">
                      {[p.contactName, p.phone].filter(Boolean).join(" · ") || "No phone"}
                    </span>
                  </td>
                  <td className={td}>{p.deliveryMethod}</td>
                  <td className={td}>
                    <Tag tone={payerTone[p.status]}>{p.status}</Tag>
                    {p.verifiedBy && (
                      <span className="mt-1 block text-caption text-ink-500">
                        by {p.verifiedBy}
                      </span>
                    )}
                  </td>
                  <td className={cn(td, "text-right")}>
                    <span className="inline-flex flex-wrap justify-end gap-1.5">
                      {o.can.edit && (
                        <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                          Edit
                        </Button>
                      )}
                      {o.can.verify && p.status !== "Verified" && p.status !== "Inactive" && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => setActing({ payer: p, kind: "verify" })}
                        >
                          Verify
                        </Button>
                      )}
                      {o.can.verify && p.status !== "Inactive" && (
                        <Button
                          size="sm"
                          variant="soft"
                          onClick={() => setActing({ payer: p, kind: "replace" })}
                        >
                          Replace
                        </Button>
                      )}
                      {o.can.verify && p.status !== "Inactive" && (
                        <Button
                          size="sm"
                          variant="soft-danger"
                          onClick={() => setActing({ payer: p, kind: "inactivate" })}
                        >
                          Inactivate
                        </Button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </TableFrame>
      {editing && (
        <PayerSheet
          payer={editing === "new" ? null : editing}
          clients={o.clients}
          onClose={() => setEditing(null)}
          onDone={onDone}
        />
      )}
      {acting && (
        <PayerActionSheet
          payer={acting.payer}
          kind={acting.kind}
          payers={o.payers}
          onClose={() => setActing(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

export function PayerSheet({
  payer,
  clients,
  onClose,
  onDone,
  presetClientId = "",
  presetKind,
}: {
  payer: PayerDto | null;
  clients: { id: string; name: string }[];
  onClose: () => void;
  onDone: (payerId?: string) => void;
  presetClientId?: string;
  presetKind?: PayerInput["kind"];
}) {
  const [p, setP] = useState<PayerInput>(
    payer
      ? {
          kind: payer.kind,
          name: payer.name,
          contactName: payer.contactName,
          email: payer.email,
          phone: payer.phone,
          deliveryMethod: payer.deliveryMethod as PayerInput["deliveryMethod"],
          clientId: payer.clientId,
          authority: payer.authority,
          abn: payer.abn,
          billingNotes: payer.billingNotes,
          effectiveFrom: payer.effectiveFrom,
        }
      : { ...blankPayer, clientId: presetClientId, kind: presetKind ?? blankPayer.kind },
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof PayerInput>(k: K, v: PayerInput[K]) =>
    setP((x) => ({ ...x, [k]: v }));

  async function save() {
    const e: Record<string, string> = {};
    if (p.name.trim().length < 2) e.name = "Enter the company or payer name";
    if (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))
      e.email = "Enter a valid email address";
    if (p.kind === "Plan manager" && !p.email)
      e.email = "A plan manager needs an email for invoices";
    if (p.kind === "Self-managed payer" && !p.authority)
      e.authority = "Record the payer's authority";
    if (p.abn && !/^\d{11}$/.test(p.abn)) e.abn = "An ABN has 11 digits";
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await api<{ payerId?: string }>(
        payer ? `/api/care/funding/payers/${payer.id}` : "/api/care/funding/payers",
        {
          body: { type: "save", payer: p },
        },
      );
      toast(payer ? "Payer updated" : "Payer added", {
        tone: "success",
        detail: "Contact details need verifying by Finance.",
      });
      onDone(res.payerId);
      onClose();
    } catch (err) {
      toast("Couldn't save the payer", {
        tone: "error",
        detail: err instanceof Error ? err.message : "",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={payer ? `Edit ${payer.name}` : "Add payer"}
      description="Plan managers, self-managed payers and the NDIA pathway"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : "Save payer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Choice
          label="Payer type"
          options={payerKinds}
          value={p.kind}
          onChange={(v) => set("kind", v)}
        />
        <TextField
          label={
            p.kind === "Plan manager"
              ? "Plan manager company"
              : p.kind === "Self-managed payer"
                ? "Payer name"
                : "Name"
          }
          value={p.name}
          onChange={(v) => set("name", v)}
          error={errors.name}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Contact person"
            value={p.contactName}
            onChange={(v) => set("contactName", v)}
          />
          <TextField label="Phone" type="tel" value={p.phone} onChange={(v) => set("phone", v)} />
        </div>
        <TextField
          label={p.kind === "Plan manager" ? "Invoice email" : "Email"}
          type="email"
          value={p.email}
          onChange={(v) => set("email", v)}
          error={errors.email}
          required={p.kind === "Plan manager"}
          hint="Invoices only: never clinical notes."
        />
        <Choice
          label="Invoice delivery"
          options={deliveryMethods}
          value={p.deliveryMethod}
          onChange={(v) => set("deliveryMethod", v)}
        />
        {p.kind === "Self-managed payer" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-700">Participant</span>
              <Select
                aria-label="Participant"
                value={p.clientId}
                onChange={(e) => set("clientId", e.target.value)}
              >
                <option value="">Choose the participant</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <TextField
              label="Authority to pay"
              value={p.authority}
              onChange={(v) => set("authority", v)}
              error={errors.authority}
              placeholder="For example: participant, or plan nominee (verified)"
              required
            />
          </>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="ABN" value={p.abn} onChange={(v) => set("abn", v)} error={errors.abn} />
          <TextField
            label="Effective from"
            type="date"
            value={p.effectiveFrom}
            onChange={(v) => set("effectiveFrom", v)}
          />
        </div>
        <TextArea
          label="Billing notes"
          value={p.billingNotes}
          onChange={(v) => set("billingNotes", v)}
          rows={2}
          hint="Handled by Finance. No assumptions about GST."
        />
      </div>
    </Sheet>
  );
}

function PayerActionSheet({
  payer,
  kind,
  payers,
  onClose,
  onDone,
}: {
  payer: PayerDto;
  kind: "verify" | "inactivate" | "replace";
  payers: PayerDto[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [replacement, setReplacement] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const title =
    kind === "verify"
      ? `Verify ${payer.name}`
      : kind === "inactivate"
        ? `Inactivate ${payer.name}`
        : `Replace ${payer.name}`;
  async function go() {
    setBusy(true);
    try {
      await api(`/api/care/funding/payers/${payer.id}`, {
        body:
          kind === "verify"
            ? { type: "verify", note }
            : kind === "inactivate"
              ? { type: "inactivate", reason: note }
              : { type: "replace", replacementId: replacement, effectiveFrom: from, reason: note },
      });
      toast(
        kind === "verify"
          ? "Payer verified"
          : kind === "inactivate"
            ? "Payer inactivated"
            : "Payer replaced",
        {
          tone: "success",
          detail:
            kind === "replace"
              ? "Budgets moved from the effective date. Earlier invoices keep their payer."
              : undefined,
        },
      );
      onDone();
      onClose();
    } catch (e) {
      toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={kind === "inactivate" ? "soft-danger" : "primary"}
            disabled={busy || note.trim().length < 3 || (kind === "replace" && !replacement)}
            onClick={go}
          >
            {kind === "verify"
              ? "Mark verified"
              : kind === "inactivate"
                ? "Inactivate"
                : "Replace payer"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {kind === "verify" && (
          <p className="rounded-control bg-canvas px-3 py-2.5 text-small text-ink-700">
            Confirm {payer.email || "the contact"} belongs to {payer.name} and may receive invoices
            for these participants.
          </p>
        )}
        {kind === "inactivate" && (
          <p className="rounded-control bg-over-bg px-3 py-2.5 text-small text-ink-900">
            An inactive payer blocks new agreements from being issued until each budget has a
            replacement.
          </p>
        )}
        {kind === "replace" && (
          <>
            <div className="flex flex-col gap-1">
              <span className="text-caption font-semibold text-ink-700">New payer</span>
              <Select
                aria-label="New payer"
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              >
                <option value="">Choose a payer</option>
                {payers
                  .filter(
                    (x) => x.id !== payer.id && x.status !== "Inactive" && x.kind === payer.kind,
                  )
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name} ({x.status})
                    </option>
                  ))}
              </Select>
            </div>
            <TextField
              label="Effective from"
              type="date"
              value={from}
              onChange={setFrom}
              required
            />
            <p className="text-caption text-ink-500">
              Invoices already made keep {payer.name}. New transactions use the new payer from this
              date, and each affected budget goes back to review.
            </p>
          </>
        )}
        <TextArea
          label={kind === "verify" ? "How it was confirmed" : "Reason"}
          value={note}
          onChange={setNote}
          rows={3}
          required
          placeholder={
            kind === "verify" ? "For example: called the plan manager's published number" : ""
          }
        />
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ catalogue */

function CatalogueTab({
  items,
  canEdit,
  onDone,
}: {
  items: PriceItemDto[];
  canEdit: boolean;
  onDone: () => void;
}) {
  const [editing, setEditing] = useState<PriceItemDto | "new" | null>(null);
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-card border border-watch-bg bg-watch-bg px-4 py-3 text-small text-ink-900">
        <Tags className="size-4 flex-none text-watch" aria-hidden="true" />
        <span className="flex-1">
          Sample catalogue. Check every support item number, price limit and edition against the
          current NDIS Pricing Arrangements before use. Item numbers are left blank until Finance
          enters them.
        </span>
        {canEdit && (
          <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
            <Plus className="size-3.5" aria-hidden="true" /> Add item
          </Button>
        )}
      </div>
      <TableFrame>
        <table className="w-full min-w-[1080px] text-left text-small">
          <thead className="border-b border-border text-caption text-ink-500">
            <tr>
              <th className={th}>Support item</th>
              <th className={th}>Unit</th>
              <th className={cn(th, "text-right")}>National</th>
              <th className={cn(th, "text-right")}>Remote</th>
              <th className={cn(th, "text-right")}>Very remote</th>
              <th className={th}>Edition and effective date</th>
              <th className={th}>Status</th>
              {canEdit && <th className={cn(th, "text-right")}>Edit</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {items.map((i) => (
              <tr key={i.id} className={cn(!i.current && "text-ink-500")}>
                <td className={td}>
                  <span className="font-semibold text-ink-900">{i.name}</span>
                  <span className="block text-caption text-ink-500">
                    {i.code ? (
                      <span className="font-mono">{i.code}</span>
                    ) : (
                      <span className="text-watch">Item number to confirm</span>
                    )}{" "}
                    · {i.category}
                  </span>
                  {i.supports.length > 0 && (
                    <span className="mt-1 block text-caption text-ink-500">
                      For: {i.supports.join(", ")}
                    </span>
                  )}
                </td>
                <td className={td}>{i.unit}</td>
                <td className={cn(td, "text-right font-semibold")}>{aud(i.limits.National)}</td>
                <td className={cn(td, "text-right")}>{aud(i.limits.Remote)}</td>
                <td className={cn(td, "text-right")}>{aud(i.limits["Very Remote"])}</td>
                <td className={td}>
                  {i.edition}
                  <span className="block text-caption text-ink-500">
                    From {dayLabel(i.effectiveFrom)}
                    {i.effectiveTo ? ` to ${dayLabel(i.effectiveTo)}` : ""}
                  </span>
                </td>
                <td className={td}>
                  <Tag tone={i.current ? "healthy" : i.active ? "watch" : "neutral"}>
                    {i.current ? "Current" : i.active ? "Not yet in effect" : "Inactive"}
                  </Tag>
                </td>
                {canEdit && (
                  <td className={cn(td, "text-right")}>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(i)}>
                      Edit
                    </Button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </TableFrame>
      {editing && (
        <PriceSheet
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={onDone}
        />
      )}
    </>
  );
}

function PriceSheet({
  item,
  onClose,
  onDone,
}: {
  item: PriceItemDto | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    id: item?.id,
    code: item?.code ?? "",
    name: item?.name ?? "",
    category: item?.category ?? "Capacity Building: Improved Daily Living",
    unit: item?.unit ?? ("Hour" as const),
    national: item?.limits.National?.toString() ?? "",
    remote: item?.limits.Remote?.toString() ?? "",
    veryRemote: item?.limits["Very Remote"]?.toString() ?? "",
    edition: item?.edition ?? "",
    effectiveFrom: item?.effectiveFrom ?? new Date().toISOString().slice(0, 10),
    effectiveTo: item?.effectiveTo ?? "",
    supports: (item?.supports ?? []) as string[],
    active: item?.active ?? true,
  });
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  async function save() {
    setBusy(true);
    try {
      await api("/api/care/funding", {
        body: {
          type: "price-item",
          item: {
            id: v.id,
            code: v.code,
            name: v.name,
            category: v.category,
            unit: v.unit,
            limits: {
              National: num(v.national),
              Remote: num(v.remote),
              "Very Remote": num(v.veryRemote),
            },
            edition: v.edition,
            effectiveFrom: v.effectiveFrom,
            effectiveTo: v.effectiveTo,
            supports: v.supports,
            active: v.active,
          },
        },
      });
      toast("Price item saved", {
        tone: "success",
        detail: "Existing agreement lines keep the price they were made with.",
      });
      onDone();
      onClose();
    } catch (e) {
      toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <Sheet
      title={item ? "Edit support item" : "Add support item"}
      description="Price limits by service geography, with the source edition"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy || v.name.length < 3 || v.edition.length < 3}
            onClick={save}
          >
            Save item
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <TextField
          label="Support item name"
          value={v.name}
          onChange={(x) => setV({ ...v, name: x })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Item number"
            value={v.code}
            onChange={(x) => setV({ ...v, code: x })}
            hint="From the current Pricing Arrangements"
          />
          <div className="flex flex-col gap-1">
            <span className="text-caption font-semibold text-ink-700">Unit</span>
            <Select
              aria-label="Unit"
              value={v.unit}
              onChange={(e) => setV({ ...v, unit: e.target.value as typeof v.unit })}
            >
              {serviceUnits.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </div>
        </div>
        <TextField
          label="Support category"
          value={v.category}
          onChange={(x) => setV({ ...v, category: x })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {(
            [
              ["national", geographies[0]],
              ["remote", geographies[1]],
              ["veryRemote", geographies[2]],
            ] as const
          ).map(([k, label]) => (
            <TextField
              key={k}
              label={`${label} limit`}
              value={v[k]}
              onChange={(x) => setV({ ...v, [k]: x })}
              placeholder="No limit"
            />
          ))}
        </div>
        <TextField
          label="Pricing edition"
          value={v.edition}
          onChange={(x) => setV({ ...v, edition: x })}
          required
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField
            label="Effective from"
            type="date"
            value={v.effectiveFrom}
            onChange={(x) => setV({ ...v, effectiveFrom: x })}
            required
          />
          <TextField
            label="Effective to"
            type="date"
            value={v.effectiveTo}
            onChange={(x) => setV({ ...v, effectiveTo: x })}
          />
        </div>
        <div>
          <p className="mb-1.5 text-caption font-semibold text-ink-700">Services this item suits</p>
          <div className="flex flex-wrap gap-1.5">
            {supports.map((s) => {
              const on = v.supports.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setV({
                      ...v,
                      supports: on ? v.supports.filter((x) => x !== s) : [...v.supports, s],
                    })
                  }
                  className={cn(
                    "h-7 cursor-pointer rounded-tag border px-2.5 text-caption font-semibold transition-colors",
                    on
                      ? "border-accent-fill bg-accent-tint text-accent"
                      : "border-border-strong text-ink-700 hover:bg-canvas",
                  )}
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
        <Tick checked={v.active} onChange={(x) => setV({ ...v, active: x })}>
          Active: can be used on new agreement lines
        </Tick>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------ policy */

function PolicyTab({
  policy,
  canEdit,
  onDone,
}: {
  policy: FundingPolicy;
  canEdit: boolean;
  onDone: () => void;
}) {
  const [v, setV] = useState({
    reminderDays: policy.reminderDays.join(", "),
    notAcceptedDays: String(policy.notAcceptedDays),
    reviewTotalOver: String(policy.reviewTotalOver),
    declinePolicy: policy.declinePolicy,
    providerEntity: policy.providerEntity,
  });
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api("/api/care/funding", {
        body: {
          type: "policy",
          policy: {
            reminderDays: v.reminderDays
              .split(",")
              .map((x) => Number(x.trim()))
              .filter((x) => Number.isFinite(x) && x > 0),
            notAcceptedDays: Number(v.notAcceptedDays),
            reviewTotalOver: Number(v.reviewTotalOver),
            declinePolicy: v.declinePolicy,
            providerEntity: v.providerEntity,
          },
        },
      });
      toast("Policy saved", { tone: "success" });
      onDone();
    } catch (e) {
      toast("Couldn't save", { tone: "error", detail: e instanceof Error ? e.message : "" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid items-stretch gap-6 xl:grid-cols-12">
      <FCard
        icon={Settings2}
        title="Funding policy"
        sub={
          canEdit
            ? "Medisense's choices, used by alerts, review and readiness"
            : "Only Finance can change these"
        }
        className="xl:col-span-8"
        footer={
          canEdit ? (
            <Button variant="primary" disabled={busy} onClick={save}>
              Save policy
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Plan expiry reminders (days)"
            value={v.reminderDays}
            onChange={(x) => setV({ ...v, reminderDays: x })}
            hint="Comma separated, for example 60, 30, 14"
          />
          <TextField
            label="Remind when not accepted after (days)"
            value={v.notAcceptedDays}
            onChange={(x) => setV({ ...v, notAcceptedDays: x })}
          />
          <TextField
            label="Internal review when the estimate is over (AUD)"
            value={v.reviewTotalOver}
            onChange={(x) => setV({ ...v, reviewTotalOver: x })}
          />
          <TextField
            label="Provider legal entity"
            value={v.providerEntity}
            onChange={(x) => setV({ ...v, providerEntity: x })}
            hint="Not a promotional website name"
          />
          <div className="md:col-span-2">
            <Choice
              label="When a participant declines a non-mandatory agreement"
              options={
                [
                  "Proceed with documented verbal agreement",
                  "Hold new bookings until resolved",
                ] as const
              }
              value={v.declinePolicy}
              onChange={(x) => setV({ ...v, declinePolicy: x })}
            />
          </div>
        </div>
      </FCard>
      <FCard icon={ListChecks} title="What these do" className="xl:col-span-4">
        <ul className="flex flex-col gap-3 text-small text-ink-700">
          {[
            "Price limits apply to plan- and agency-managed supports; self-managed lines are not held to them.",
            "Agreements over the review amount, above a price limit, or changing a price need a second person to approve.",
            "Written agreements are compulsory for SDA accommodation providers. Medisense assesses SDA housing; it doesn't provide SDA.",
            "Claims and e-signatures are simulated. Nothing is sent to the NDIA.",
          ].map((t) => (
            <li key={t} className="flex gap-2.5">
              <Check className="mt-0.5 size-4 flex-none text-accent" aria-hidden="true" />
              {t}
            </li>
          ))}
        </ul>
      </FCard>
    </div>
  );
}

export { Building2, FileSignature, Landmark };
