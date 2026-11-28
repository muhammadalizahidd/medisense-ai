"use client";

import { ArrowLeft, Filter, RefreshCw } from "lucide-react";
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
import { MyEarnings } from "./my-earnings";
import { ProgressHub } from "./progress-hub";
import { readParam, useNavParam } from "./report-nav";
import { AreaPage, areaById, type AreaId } from "./reports-areas";
import { FilterBar, useReportCtx, useReportFilters } from "./reports-bits";
import { SectionProvider } from "./reports-section";
import {
  PatientList,
  THERAPIST_AREAS,
  TherapistOverview,
  TherapistProvider,
} from "./therapist-areas";
import { PatientPanel } from "./patient-view";

const tabs = [
  { id: "overview", label: "Overview" },
  ...THERAPIST_AREAS.map((a) => ({ id: a.id, label: a.label })),
  // Only for the therapist themself: an admin viewing someone's reports never sees this tab.
  { id: "earnings", label: "Earnings" },
] as const;
type Tab = (typeof tabs)[number]["id"];

/** Older links and tiles, and where that content lives now. */
const legacy: Record<string, { tab: Tab; view: string }> = {
  capacity: { tab: "visits", view: "time" },
  documents: { tab: "clinical", view: "documents" },
};

type Open = { kind: "filters" } | null;

const POPULATION_KEY = "ms-therapist-population";

/**
 * A therapist's reports: their own for a therapist, or any therapist's for an admin who may view
 * them. Same layout and the same dialogs as the organisation reports.
 */
export function TherapistReportsHub({
  therapistId,
  embedded = false,
}: {
  therapistId?: string;
  /** Inside a dialog on the reports page: no page header, and tabs don't touch the address. */
  embedded?: boolean;
}) {
  const url = therapistId
    ? `/api/care/reports/therapist/${therapistId}`
    : "/api/care/reports/therapist";
  const { data, error, loading, reload } = useResource<TherapistHubDto>(
    url,
    (e) => e.type === "care",
  );
  const [urlTab, setUrlTab] = useTab(tabs);
  const [localTab, setLocalTab] = useState<Tab>("overview");
  const [tab, setTab] = embedded ? [localTab, setLocalTab] : [urlTab, setUrlTab];
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  return <Hub dto={data} tab={tab} setTab={setTab} reload={reload} embedded={embedded} />;
}

function Hub({
  dto,
  tab,
  setTab,
  reload,
  embedded,
}: {
  dto: TherapistHubDto;
  tab: Tab;
  setTab: (t: Tab) => void;
  reload: () => void;
  embedded: boolean;
}) {
  const { hub, subject, self } = dto;
  const [f, setF] = useReportFilters(hub.today, `ms-therapist-filters-${subject.id}`);
  const c = useReportCtx(hub, f, setF, reload, !self);
  const [open, setOpen] = useState<Open>(null);
  const [view, setView] = useNavParam("view", "", !embedded);
  const [patient, setPatient] = useNavParam("patient", "", !embedded);
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
  useEffect(() => {
    if (embedded) return;
    const old = legacy[readParam("tab") ?? ""];
    if (!old) return;
    setTab(old.tab);
    setView(old.view);
  }, [embedded, setTab, setView]);
  const go = (id: string, v = "") => {
    const old = legacy[id];
    setTab(old ? old.tab : (id as Tab));
    setView(old ? old.view : v);
    setPatient("");
  };

  const patients = hub.facts.participants
    .map((p) => ({ id: p.id, name: p.label }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const patientName = patients.find((p) => p.id === f.patient)?.name;
  const [period, ...rest] = filterSummary(f, patientName);
  const shownTabs = self ? tabs : tabs.filter((t) => t.id !== "earnings");
  const current: Tab = shownTabs.some((t) => t.id === tab) ? tab : "overview";
  // Earnings has its own date and service filters; the report filters don't apply there.
  const showFilters = current !== "earnings";
  const capacity = areaById("capacity");
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
        openPatient: (id) => {
          setTab("patients");
          setPatient(id);
        },
        subject: subject.name,
      }}
    >
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="type-display text-h2 text-ink-900">{subject.name}</h2>
            <p className="text-small text-ink-700">
              {subject.discipline} · {subject.region}. Read-only. Opening these reports is recorded.
            </p>
          </div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      ) : (
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
              {showFilters && (
                <Button onClick={() => setOpen({ kind: "filters" })}>
                  <Filter className="size-4" aria-hidden="true" />
                  {period}
                  {rest.length > 0 && (
                    <span className="rounded-full bg-accent-tint px-1.5 text-caption font-semibold text-accent">
                      +{rest.length}
                    </span>
                  )}
                </Button>
              )}
              <Button size="sm" variant="ghost" aria-label="Refresh" onClick={reload}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Button>
              <LiveBadge />
            </div>
          }
        />
      )}
      <div className="mt-4">
        <Tabs
          label="Reports"
          tabs={shownTabs}
          value={current}
          onChange={(t: Tab) => go(t)}
          sticky={!embedded}
        />
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
          <TherapistOverview c={c} openArea={(id: AreaId) => go(id)} />
        </TabPanel>
        {self && (
          <TabPanel id="earnings" value={current}>
            <MyEarnings />
          </TabPanel>
        )}
        {THERAPIST_AREAS.map((a) => (
          <TabPanel key={a.id} id={a.id} value={current}>
            {a.id === "patients" && patient ? (
              <PatientPanel
                key={patient}
                c={c}
                id={patient}
                reportsBase={self ? "/therapist/progress" : "/care/progress"}
                onBack={() => setPatient("")}
              />
            ) : (
              <AreaPage
                c={c}
                area={a}
                view={view}
                setView={setView}
                lead={
                  a.id === "patients"
                    ? [{ id: "list", label: "Patient list", node: <PatientList c={c} /> }]
                    : []
                }
                extra={
                  a.id === "visits" && capacity
                    ? [
                        {
                          id: "time",
                          label: "Time and travel",
                          node: (
                            <SectionProvider value={{ kind: "measures" }}>
                              <capacity.Tab c={c} />
                            </SectionProvider>
                          ),
                        },
                      ]
                    : a.id === "clinical" && self
                      ? [
                          {
                            id: "documents",
                            label: "Clinical reports",
                            node: <ProgressHub base="/therapist/progress" embedded />,
                          },
                        ]
                      : []
                }
              />
            )}
          </TabPanel>
        ))}
      </div>

      {open?.kind === "filters" && (
        <Dialog title="Filters" onRequestClose={close}>
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
    </TherapistProvider>
  );
}
