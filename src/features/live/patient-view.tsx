"use client";

import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BarList } from "@/components/charts/bar-list";
import { colour } from "@/components/charts/chart-kit";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Tag } from "@/components/ui/tag";
import { toast } from "@/components/ui/toast";
import { useResource } from "@/lib/live/client";
import { sessionStats } from "@/lib/live/patient-stats";
import type { ReportRow } from "@/lib/live/progress";
import type { RecordDto } from "@/lib/live/records";
import { patientSummary, relation } from "@/lib/live/therapist-reports";
import { ErrorNote, Skeleton } from "./bits";
import { Card, NA, type Ctx } from "./reports-bits";

const dayLabel = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Australia/Brisbane",
      }).format(new Date(iso.length === 10 ? `${iso}T00:00:00+10:00` : iso))
    : "—";

const linkButton =
  "inline-flex h-8 items-center gap-1.5 rounded-control border border-border-strong px-3 text-small font-semibold text-ink-900 hover:bg-sunken";

/** Downloads the patient's two-page summary, and says why if this person may not open the record. */
export function PatientReportButton({
  id,
  name,
  label = "Download summary",
  variant,
}: {
  id: string;
  name: string;
  label?: string;
  variant?: "primary";
}) {
  const [busy, setBusy] = useState(false);
  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/care/records/${id}/report`);
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Please try again.");
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        "patient-summary.pdf";
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast("Summary downloaded", { tone: "success", detail: "The download is recorded." });
    } catch (e) {
      toast("Couldn't create the summary", {
        tone: "error",
        detail: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      variant={variant}
      disabled={busy}
      onClick={generate}
      aria-label={`${label}: ${name}`}
    >
      <Download className="size-4" aria-hidden="true" />
      {busy ? "Preparing PDF…" : label}
    </Button>
  );
}

/* ------------------------------------------------------------------ files and reports */

type File = RecordDto["documents"][number];
const isReport = (d: File) => d.kind === "Report";

function Files({ files, empty }: { files: File[]; empty: string }) {
  if (!files.length) return <p className="px-4 py-6 text-small text-ink-500">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {files.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-small font-semibold text-ink-900">{d.name}</p>
            <p className="text-caption text-ink-500">
              {d.category} · {d.author} · {dayLabel(d.receivedAt)}
            </p>
          </div>
          {d.href ? (
            <a href={d.href} download={d.name} className={linkButton}>
              <Download className="size-4" aria-hidden="true" />
              Download
            </a>
          ) : (
            <Tag tone="neutral">Restricted</Tag>
          )}
        </li>
      ))}
    </ul>
  );
}

/** The patient's record is only read when a files tab is opened, and that opening is logged. */
function useRecord(id: string) {
  return useResource<{ record: RecordDto }>(`/api/care/records/${id}`, (e) => e.type === "care");
}

function Documents({ id }: { id: string }) {
  const { data, error, reload } = useRecord(id);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (!data) return <Skeleton className="h-48" />;
  return (
    <Card title="Documents" sub="Download one at a time" flush>
      <Files
        files={data.record.documents.filter((d) => !isReport(d))}
        empty="No documents for this patient."
      />
    </Card>
  );
}

function Reports({ id, base }: { id: string; base: string }) {
  const record = useRecord(id);
  const progress = useResource<{ reports: ReportRow[] }>(
    "/api/care/progress",
    (e) => e.type === "care",
  );
  if (record.error && !record.data) {
    return <ErrorNote message={record.error} onRetry={record.reload} />;
  }
  if (!record.data || progress.loading) return <Skeleton className="h-48" />;
  const r = record.data.record;
  const written = (progress.data?.reports ?? []).filter(
    (x) => x.participantId === r.participantId || x.participantId === r.clientId,
  );
  const files = r.documents.filter(isReport);
  if (!written.length && !files.length) return <NA>No reports for this patient.</NA>;
  return (
    <div className="flex flex-col gap-4">
      {written.length > 0 && (
        <Card title="Clinical reports" sub="Written in Medisense" flush>
          <ul className="divide-y divide-border">
            {written.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-small font-semibold text-ink-900">{x.type}</p>
                  <p className="text-caption text-ink-500">
                    {x.ref} · {x.author} · due {dayLabel(x.dueAt)}
                  </p>
                </div>
                <Tag tone="outline">{x.status}</Tag>
                <Link href={`${base}/reports/${x.id}`} className={linkButton}>
                  <ExternalLink className="size-4" aria-hidden="true" />
                  Open
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      {files.length > 0 && (
        <Card title="Report files" flush>
          <Files files={files} empty="No report files." />
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the patient view */

const tabs = [
  { id: "reports" as const, label: "Reports" },
  { id: "documents" as const, label: "Documents" },
];

/** One patient, in place of the list: their reports (with the summary) and their documents. */
export function PatientPanel({
  c,
  id,
  reportsBase,
  onBack,
}: {
  c: Ctx;
  id: string;
  /** Where clinical reports open: the therapist's or the office's pages. */
  reportsBase: string;
  onBack: () => void;
}) {
  const [tab, setTab] = useState<(typeof tabs)[number]["id"]>("reports");
  const summary = patientSummary(
    c.hub.facts,
    id,
    { from: c.f.from, to: c.f.to },
    { today: c.hub.today, now: c.hub.now },
  );
  const back = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-small font-semibold text-accent hover:underline"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      All patients
    </button>
  );
  if (!summary) {
    return (
      <div className="flex flex-col gap-4">
        {back}
        <NA>This patient isn&apos;t in the reports you can see.</NA>
      </div>
    );
  }
  const row = summary.row;
  const stats = sessionStats(
    c.hub.facts.appointments.filter((a) => a.participantId === id),
    c.hub.now,
  );
  const stat = (label: string, value: string) => (
    <div className="rounded-card border border-border bg-surface p-3">
      <p className="text-caption text-ink-500">{label}</p>
      <p className="mt-1 type-display text-h2 text-ink-900">{value}</p>
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="type-display text-h2 text-ink-900">{row.name}</h2>
          <Tag tone={row.onCaseload ? "healthy" : "outline"}>{relation(row)}</Tag>
        </div>
        {row.disciplines.length > 0 && (
          <p className="text-small text-ink-700">{row.disciplines.join(" · ")}</p>
        )}
        <Segmented label="Patient sections" value={tab} onChange={setTab} options={tabs} />
      </header>
      {tab === "documents" && <Documents id={id} />}
      {tab === "reports" && (
        <div className="flex flex-col gap-4">
          <section className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border border-border bg-surface p-4">
            <div className="min-w-0 flex-1">
              <h3 className="text-section font-semibold text-ink-900">Patient summary</h3>
              <p className="text-small text-ink-700">
                A two-page PDF: precautions, attendance, goals, risks and latest notes.
              </p>
            </div>
            <PatientReportButton id={id} name={row.name} variant="primary" />
          </section>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stat("Sessions delivered", String(stats.delivered))}
            {stat("Attendance", stats.attendance === null ? "N/A" : `${stats.attendance}%`)}
            {stat("Last visit", dayLabel(stats.last))}
            {stat("Next visit", dayLabel(stats.next))}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card title="Sessions, last 6 months">
              <BarList
                label="Sessions delivered by month"
                data={stats.months.map((m) => ({
                  id: m.key,
                  label: m.label,
                  value: m.value,
                  colour: colour.series1,
                }))}
                labelWidth={60}
              />
            </Card>
            <Card title="Attendance">
              <BarList
                label="Session outcomes"
                data={[
                  { id: "d", label: "Delivered", value: stats.delivered, colour: colour.series1 },
                  { id: "m", label: "Missed", value: stats.missed, colour: colour.watch },
                  { id: "c", label: "Cancelled", value: stats.cancelled, colour: colour.stone },
                ]}
                labelWidth={80}
              />
            </Card>
          </div>
          <Reports id={id} base={reportsBase} />
        </div>
      )}
    </div>
  );
}
