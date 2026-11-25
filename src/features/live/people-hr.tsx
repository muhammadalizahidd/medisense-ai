"use client";

import { BellRing, CalendarX2, ChevronRight, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { RuleMark } from "@/components/ai/provenance";
import { Button } from "@/components/ui/button";
import { MetricBand } from "@/components/ui/metric-band";
import { PageHeader } from "@/components/ui/page";
import { Avatar } from "@/components/ui/premium";
import { Select } from "@/components/ui/select";
import { TableFrame } from "@/components/ui/table-frame";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { Tag, type TagTone } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { api, useResource } from "@/lib/live/client";
import type { CredentialAlertKind, CredentialAlertsDto, CredentialRowDto } from "@/lib/live/hr";
import { credentialKinds } from "@/lib/live/staff";
import { relativeTime, shortDate } from "@/lib/live/time";
import { EmptyNote, ErrorNote, LiveBadge, Skeleton } from "./bits";

const ALERT_TONE: Record<CredentialAlertKind, TagTone> = {
  Expired: "over",
  "Not submitted": "over",
  Rejected: "over",
  "Expires within 30 days": "watch",
  "Awaiting review": "available",
  "Expires within 60 days": "watch",
  "Expires within 90 days": "neutral",
};

const STATUS_TONE: Record<string, TagTone> = {
  Verified: "healthy",
  Expired: "over",
  Rejected: "over",
  "Not Submitted": "neutral",
  "Awaiting Review": "available",
  "Under Review": "available",
};

/** People and HR: credential alerts first; the register of every credential beside it. */
export function PeopleHr() {
  const { data, error, loading, reload } = useResource<CredentialAlertsDto>(
    "/api/care/hr",
    (e) => e.type === "care",
  );
  const rows = data?.rows ?? [];
  const alerts = rows.filter((r) => r.alert);
  const tabs = [
    { id: "alerts" as const, label: "Needs action", count: alerts.length, alert: true },
    { id: "register" as const, label: "Credential register", count: rows.length },
  ];
  const [tab, setTab] = useTab(tabs, "alerts");
  const s = data?.summary;

  return (
    <>
      <PageHeader
        eyebrow="People and HR"
        title="Credentials and compliance"
        description="Registrations, worker screening, insurance and training for every clinician, with what needs action first."
        actions={<LiveBadge />}
      />
      {error && !data ? (
        <ErrorNote message={error} onRetry={reload} />
      ) : loading && !data ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-28" />
          <Skeleton className="h-24" />
          <Skeleton className="h-96" />
        </div>
      ) : s ? (
        <div className="flex flex-col gap-5">
          <ComplianceHero summary={s} />
          <MetricBand
            size="stat-sm"
            label="Credential figures"
            metrics={[
              {
                label: "Expired",
                value: s.expired,
                caption: "Stops new bookings when required",
                tone: "over",
                flagged: s.expired > 0,
              },
              {
                label: "Within 30 days",
                value: s.within30,
                caption: "Renew now",
                tone: "watch",
                flagged: s.within30 > 0,
              },
              { label: "Within 90 days", value: s.within90, caption: "Alerts at 90, 60 and 30" },
              { label: "Awaiting review", value: s.review, caption: "Evidence to verify" },
              {
                label: "Staff blocked",
                value: s.blockedStaff,
                caption: "Can't take new patients",
                tone: "over",
                flagged: s.blockedStaff > 0,
              },
              {
                label: "Visits at risk",
                value: s.visitsAtRisk,
                caption: "Booked after an expiry date",
                tone: "watch",
                flagged: s.visitsAtRisk > 0,
              },
            ]}
          />
          <div>
            <Tabs label="Credentials" tabs={tabs} value={tab} onChange={setTab} />
            <TabPanel id="alerts" value={tab}>
              <AlertList rows={alerts} onChanged={reload} />
            </TabPanel>
            <TabPanel id="register" value={tab}>
              <Register rows={rows} />
            </TabPanel>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ComplianceHero({ summary: s }: { summary: CredentialAlertsDto["summary"] }) {
  const pct = s.staff ? Math.round((s.compliant / s.staff) * 100) : 100;
  const r = 30;
  const circ = 2 * Math.PI * r;
  return (
    <section
      aria-label="Team compliance"
      className="flex flex-wrap items-center gap-6 rounded-card bg-ink-900 px-6 py-5 text-page"
    >
      <div className="relative size-20 flex-none">
        <svg viewBox="0 0 72 72" className="size-20 -rotate-90" aria-hidden="true">
          <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-page/15" />
          <circle
            cx="36"
            cy="36"
            r={r}
            fill="none"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - pct / 100)}
            className="stroke-healthy-dot"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-section font-semibold">
          {pct}%
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="label-caps text-page/70">Team compliance</p>
        <p className="mt-1 type-display text-h2">
          {s.compliant} of {s.staff} clinicians fully compliant
        </p>
        <p className="mt-1 text-small opacity-80">
          Every required credential verified and in date. The rest can keep their current patients
          but aren&apos;t offered new ones until it&apos;s fixed.
        </p>
      </div>
      <div className="flex flex-col items-start gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-page/10 px-3 py-1 text-caption font-semibold">
          <ShieldCheck className="size-3.5" aria-hidden="true" />
          Checked against the credential register
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-page/10 px-3 py-1 text-caption font-semibold">
          <BellRing className="size-3.5" aria-hidden="true" />
          Alerts at 90, 60 and 30 days
        </span>
      </div>
    </section>
  );
}

function expiryLine(r: CredentialRowDto) {
  if (r.daysLeft === null) return r.expiry ? shortDate(`${r.expiry}T00:00:00Z`) : "No expiry";
  const date = shortDate(`${r.expiry}T00:00:00Z`);
  if (r.daysLeft < 0) return `Expired ${date} · ${Math.abs(r.daysLeft)} days ago`;
  if (r.daysLeft === 0) return `Expires today`;
  return `${date} · in ${r.daysLeft} day${r.daysLeft === 1 ? "" : "s"}`;
}

function AlertList({ rows, onChanged }: { rows: CredentialRowDto[]; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!rows.length) {
    return (
      <EmptyNote title="Nothing needs action.">
        Every credential is verified and more than 90 days from expiry.
      </EmptyNote>
    );
  }
  async function renew(r: CredentialRowDto) {
    setBusy(r.key);
    try {
      await api("/api/care/hr/renewal", {
        body: { staffId: r.staffId, credentialId: r.credentialId },
      });
      toast(`Renewal requested from ${r.staffName}`);
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't send the request.");
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <p className="mb-3 flex flex-wrap items-center gap-2 text-small text-ink-700">
        <RuleMark>Rule</RuleMark>
        Expired, rejected or missing required credentials stop new bookings automatically. Renewals
        are requested and verified by people.
      </p>
      <ul className="flex flex-col gap-3">
        {rows.map((r) => (
          <li
            key={r.key}
            className={cn(
              "grid items-center gap-4 rounded-card border bg-surface px-5 py-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.9fr)_220px]",
              r.blocksBookings ? "border-over-bg" : "border-border",
            )}
          >
            <Link
              href={`/care/therapists/${r.staffId}?tab=credentials`}
              className="flex min-w-0 items-center gap-3 hover:no-underline"
            >
              <Avatar name={r.staffName} src={r.photoUrl} size={44} kind="staff" />
              <span className="min-w-0">
                <span className="block font-semibold text-ink-900">{r.staffName}</span>
                <span className="block truncate text-caption text-ink-500">
                  {r.discipline} · {r.region} · {r.activePatients} patients
                </span>
              </span>
            </Link>
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink-900">
                {r.name}
                {r.required && <Tag tone="outline">Required</Tag>}
              </p>
              <p className="text-caption text-ink-500">
                {r.kind}
                {r.body ? ` · ${r.body}` : ""}
                {r.number ? (
                  <>
                    {" · "}
                    <span className="font-mono">{r.number}</span>
                  </>
                ) : null}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-caption font-medium",
                  r.daysLeft !== null && r.daysLeft < 0 ? "text-over" : "text-ink-700",
                )}
              >
                {expiryLine(r)}
              </p>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-1.5">
              {r.alert && <Tag tone={ALERT_TONE[r.alert]}>{r.alert}</Tag>}
              {r.blocksBookings ? (
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-over">
                  <ShieldAlert className="size-3.5" aria-hidden="true" />
                  Not offered new patients
                </span>
              ) : null}
              {r.visitsAfterExpiry > 0 && (
                <span className="inline-flex items-center gap-1 text-caption font-semibold text-watch">
                  <CalendarX2 className="size-3.5" aria-hidden="true" />
                  {r.visitsAfterExpiry} visit{r.visitsAfterExpiry === 1 ? "" : "s"} booked after
                  expiry
                </span>
              )}
            </div>
            <div className="flex flex-col items-start gap-1.5 xl:items-end">
              {r.alert === "Awaiting review" ? (
                <Link
                  href={`/care/therapists/${r.staffId}?tab=credentials`}
                  className="inline-flex h-8 items-center gap-1 rounded-control bg-accent-fill px-3 text-small font-semibold text-on-accent hover:bg-accent-fill-hover hover:no-underline"
                >
                  Review evidence
                  <ChevronRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : (
                <Button
                  size="sm"
                  variant={
                    r.blocksBookings || r.alert === "Expires within 30 days"
                      ? "primary"
                      : "secondary"
                  }
                  disabled={busy === r.key}
                  onClick={() => renew(r)}
                >
                  <BellRing className="size-3.5" aria-hidden="true" />
                  {r.renewal ? "Remind again" : "Request renewal"}
                </Button>
              )}
              {r.renewal && (
                <span className="text-caption text-ink-500">
                  Asked by {r.renewal.byName}, {relativeTime(r.renewal.requestedAt)}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Register({ rows: all }: { rows: CredentialRowDto[] }) {
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const rows = all
    .filter((r) => !kind || r.kind === kind)
    .filter((r) => !status || r.status === status)
    .filter(
      (r) => !q || `${r.staffName} ${r.name} ${r.number} ${r.body}`.toLowerCase().includes(q),
    );
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface p-3 shadow-lift">
        <span className="mr-1 label-caps text-ink-500">Filter</span>
        <div className="w-44 flex-none">
          <Select
            aria-label="Type"
            className="h-9"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">Any type</option>
            {credentialKinds.map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        <div className="w-48 flex-none">
          <Select
            aria-label="Status"
            className="h-9"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="">Any status</option>
            {Object.keys(STATUS_TONE).map((k) => (
              <option key={k}>{k}</option>
            ))}
          </Select>
        </div>
        {(kind || status) && (
          <button
            type="button"
            onClick={() => {
              setKind("");
              setStatus("");
            }}
            className="h-9 cursor-pointer px-2 text-small font-semibold text-accent"
          >
            Clear filters
          </button>
        )}
        <span className="ml-auto text-caption text-ink-500">
          {rows.length} of {all.length}
        </span>
        <label className="flex h-9 w-72 max-w-full items-center gap-2 rounded-control border border-border-strong bg-surface px-3 focus-within:shadow-focus">
          <Search className="size-4 text-ink-500" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search credentials"
            placeholder="Clinician, credential or number"
            className="min-w-0 flex-1 bg-transparent text-small outline-none placeholder:text-ink-500"
          />
        </label>
      </div>
      <TableFrame>
        {rows.length === 0 ? (
          <EmptyNote title="No credentials match.">Try another filter or search.</EmptyNote>
        ) : (
          <table className="table-stack w-full text-left text-small md:min-w-240">
            <thead className="sticky top-0 border-b border-border bg-sunken text-caption text-ink-500">
              <tr>
                <th className="px-5 py-3 font-medium">Clinician</th>
                <th className="px-4 py-3 font-medium">Credential</th>
                <th className="px-4 py-3 font-medium">Number</th>
                <th className="px-4 py-3 font-medium">Expiry</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.key} className="transition-colors duration-140 hover:bg-sunken">
                  <td className="px-5 py-3">
                    <Link
                      href={`/care/therapists/${r.staffId}?tab=credentials`}
                      className="flex items-center gap-3 hover:no-underline"
                    >
                      <Avatar name={r.staffName} src={r.photoUrl} size={34} kind="staff" />
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink-900">{r.staffName}</span>
                        <span className="block text-caption text-ink-500">{r.discipline}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-ink-900">{r.name}</span>
                    <span className="block text-caption text-ink-500">
                      {r.kind}
                      {r.required ? " · Required" : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-caption text-ink-700">
                    {r.number || "—"}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 whitespace-nowrap",
                      r.alert === "Expired"
                        ? "font-medium text-over"
                        : r.alert === "Expires within 30 days"
                          ? "font-medium text-watch"
                          : "text-ink-700",
                    )}
                  >
                    {r.expiry ? expiryLine(r) : "No expiry"}
                  </td>
                  <td className="px-4 py-3">
                    <Tag tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Tag>
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
