"use client";

import { ArrowLeft, Filter, RefreshCw, Stethoscope } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useResource } from "@/lib/live/client";
import type { TherapistHubDto } from "@/lib/live/report-dto";
import { filterSummary } from "@/lib/live/reports";
import { populations, type Population } from "@/lib/live/therapist-reports";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { ProgressHub } from "./progress-hub";
import { AreaDialog, AreaDownload, AreaPage, type AreaId } from "./reports-areas";
import { FilterBar, useReportCtx, useReportFilters } from "./reports-bits";
import {
  PatientDialog,
  THERAPIST_AREAS,
  TherapistOverview,
  TherapistProvider,
  therapistAreaById,
} from "./therapist-areas";

const tabs = [
  { id: "overview", label: "Overview" },
  ...THERAPIST_AREAS.map((a) => ({ id: a.id, label: a.label })),
  { id: "documents", label: "Clinical reports" },
] as const;
type Tab = (typeof tabs)[number]["id"];

type Open =
  | { kind: "area"; id: AreaId; pick?: string }
  | { kind: "areaDownload"; id: AreaId }
  | { kind: "filters" }
  | { kind: "documents" }
  | null;

const POPULATION_KEY = "ms-therapist-population";

/**
 * A therapist's reports: their own for a therapist, or any therapist's for an admin who may view
 * them. Same layout and the same dialogs as the organisation reports.
 */
export function TherapistReportsHub({ therapistId }: { therapistId?: string }) {
  const url = therapistId
    ? `/api/care/reports/therapist/${therapistId}`
    : "/api/care/reports/therapist";
  const { data, error, loading, reload } = useResource<TherapistHubDto>(
    url,
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  return <Hub dto={data} tab={tab} setTab={setTab} reload={reload} />;
}

function Hub({
  dto,
  tab,
  setTab,
  reload,
}: {
  dto: TherapistHubDto;
  tab: Tab;
  setTab: (t: Tab) => void;
  reload: () => void;
}) {
  const { hub, subject, self } = dto;
  const [f, setF] = useReportFilters(hub.today, `ms-therapist-filters-${subject.id}`);
  const c = useReportCtx(hub, f, setF, reload, !self);
  const [open, setOpen] = useState<Open>(null);
  const [patient, setPatient] = useState<string | null>(null);
  const [population, setPopulationState] = useState<Population>("caseload");
  useEffect(() => {
    const saved = sessionStorage.getItem(POPULATION_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restore the choice once after mount
    if (populations.some((p) => p === saved)) setPopulationState(saved as Population);
  }, []);
  const setPopulation = (p: Population) => {
    setPopulationState(p);
    sessionStorage.setItem(POPULATION_KEY, p);
  };
  const close = () => setOpen(null);

  const patients = hub.facts.participants
    .map((p) => ({ id: p.id, name: p.label }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const patientName = patients.find((p) => p.id === f.patient)?.name;
  const [period, ...rest] = filterSummary(f, patientName);
  const visible = tabs.filter((t) => t.id !== "documents" || self);
  const current: Tab = visible.some((t) => t.id === tab) ? tab : "overview";
  const area = open && "id" in open ? therapistAreaById(open.id) : undefined;
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(hub.freshness));

  return (
    <TherapistProvider
      value={{
        population,
        setPopulation,
        openPatient: setPatient,
        recordHref: (id) => (self ? `/therapist/patients/${id}` : null),
        subject: subject.name,
      }}
    >
      <PageHeader
        eyebrow={self ? "Live care" : "Therapist reports"}
        title={self ? "Progress and reports" : subject.name}
        description={
          self
            ? undefined
            : `${subject.discipline} · ${subject.region}. You are viewing this therapist's reports. Opening them is recorded.`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!self && (
              <Link
                href="/care/reports/therapists"
                className="inline-flex h-10 items-center gap-2 rounded-control border border-border-strong px-4 text-small font-semibold text-ink-900 hover:bg-sunken"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                All therapists
              </Link>
            )}
            <Button onClick={() => setOpen({ kind: "filters" })}>
              <Filter className="size-4" aria-hidden="true" />
              {period}
              {rest.length > 0 && (
                <span className="rounded-full bg-accent-tint px-1.5 text-caption font-semibold text-accent">
                  +{rest.length}
                </span>
              )}
            </Button>
            <Button size="sm" variant="ghost" aria-label="Refresh" onClick={reload}>
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
            <LiveBadge />
          </div>
        }
      />
      <div className="mt-4">
        <Tabs label="Reports" tabs={visible} value={current} onChange={(t: Tab) => setTab(t)} />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-500">
        {rest.map((s) => (
          <span key={s} className="rounded-tag border border-border px-1.5 py-0.5">
            {s}
          </span>
        ))}
        <span>Brisbane time · data as of {time}</span>
      </p>
      <div className="mt-5">
        <TabPanel id="overview" value={current}>
          <TherapistOverview c={c} openArea={(id) => setTab(id as Tab)} />
        </TabPanel>
        {THERAPIST_AREAS.map((a) => (
          <TabPanel key={a.id} id={a.id} value={current}>
            <AreaPage
              c={c}
              area={a}
              onOpen={() => setOpen({ kind: "area", id: a.id })}
              onDownload={() => setOpen({ kind: "areaDownload", id: a.id })}
            />
          </TabPanel>
        ))}
        {self && (
          <TabPanel id="documents" value={current}>
            <section className="flex flex-col items-start gap-3 rounded-card border border-border bg-surface p-5">
              <Stethoscope className="size-5 text-accent" aria-hidden="true" />
              <h2 className="type-display text-h2 text-ink-900">Clinical reports</h2>
              <p className="max-w-xl text-body text-ink-700">
                Your episodes of care, the reports you are writing, and anything waiting for
                approval.
              </p>
              <Button variant="primary" onClick={() => setOpen({ kind: "documents" })}>
                Open clinical reports
              </Button>
            </section>
          </TabPanel>
        )}
      </div>

      {open?.kind === "area" && area && (
        <AreaDialog c={c} area={area} initial={open.pick} onClose={close} />
      )}
      {open?.kind === "areaDownload" && area && <AreaDownload c={c} area={area} onClose={close} />}
      {open?.kind === "filters" && (
        <Dialog title="Filters" size="sm" onRequestClose={close}>
          <FilterBar
            key={JSON.stringify(f)}
            hub={hub}
            f={f}
            patients={patients}
            setF={(p) => {
              setF(p);
              close();
            }}
          />
        </Dialog>
      )}
      {open?.kind === "documents" && (
        <Dialog title="Clinical reports" onRequestClose={close}>
          <ProgressHub base="/therapist/progress" />
        </Dialog>
      )}
      {patient && <PatientDialog c={c} id={patient} onClose={() => setPatient(null)} />}
    </TherapistProvider>
  );
}
