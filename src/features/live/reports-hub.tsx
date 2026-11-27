"use client";

import { ArrowLeft, ChevronRight, Download, Filter, Plus, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page";
import { Segmented } from "@/components/ui/segmented";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useResource, useSession } from "@/lib/live/client";
import type { ReportsHubDto, ViewDto } from "@/lib/live/report-dto";
import { reportById } from "@/lib/live/report-catalogue";
import { filterSummary } from "@/lib/live/reports";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { readParam, useNavParam } from "./report-nav";
import { ExportsTab, Methodology, SchedulesTab } from "./reports-admin";
import { AREAS, AreaPage, Overview, areaVisible, type AreaId } from "./reports-areas";
import { ExportSheet, FilterBar, useReportCtx, useReportFilters, type Ctx } from "./reports-bits";
import { BuilderTab } from "./reports-builder";
import { TherapistList } from "./therapist-picker";
import { TherapistReportsHub } from "./therapist-reports-hub";

const tabs = [
  { id: "overview", label: "Overview" },
  ...AREAS.map((a) => ({ id: a.id, label: a.label })),
  { id: "custom", label: "Custom reports" },
] as const;
type Tab = (typeof tabs)[number]["id"];

const customViews = [
  { id: "build", label: "Build a report" },
  { id: "schedules", label: "Schedules" },
  { id: "downloads", label: "Past downloads" },
  { id: "about", label: "How the numbers work" },
] as const;
type CustomView = (typeof customViews)[number]["id"];

/** Tabs that older links name, and where that content lives now. */
const legacy: Record<string, { tab: Tab; view?: string }> = {
  referrals: { tab: "intake" },
  participants: { tab: "intake", view: "R04" },
  capacity: { tab: "workforce" },
  therapists: { tab: "workforce", view: "therapists" },
  appointments: { tab: "visits" },
  telehealth: { tab: "visits", view: "R10" },
  exports: { tab: "custom", view: "downloads" },
  schedules: { tab: "custom", view: "schedules" },
};

/** What still opens over the page: two quick choices, never a place to browse. */
type Open = { kind: "download" } | { kind: "filters" } | null;

/** Module 09: operational reports and analytics, scoped to the person's role. */
export function ReportsHub() {
  const { data, error, loading, reload } = useResource<{ hub: ReportsHubDto }>(
    "/api/care/reports",
    (e) => e.type === "care",
  );
  const [tab, setTab] = useTab(tabs);
  if (error && !data) return <ErrorNote message={error} onRetry={reload} />;
  if (loading || !data) return <Skeleton className="h-[720px]" />;
  return <Hub hub={data.hub} tab={tab} setTab={setTab} reload={reload} />;
}

function Hub({
  hub,
  tab,
  setTab,
  reload,
}: {
  hub: ReportsHubDto;
  tab: Tab;
  setTab: (t: Tab) => void;
  reload: () => void;
}) {
  const [f, setF] = useReportFilters(hub.today);
  const c = useReportCtx(hub, f, setF, reload);
  const [open, setOpen] = useState<Open>(null);
  const [view, setView] = useNavParam("view", "", true);
  const [therapist, setTherapist] = useNavParam("therapist", "", true);
  const { user } = useSession();
  const viewTherapists = Boolean(user?.permissions.includes("reports.therapist"));
  const [builderView, setBuilderView] = useState<ViewDto | null>(null);
  const close = () => setOpen(null);

  useEffect(() => {
    // System reports have their own pages now, one per group in the Reports menu.
    if (readParam("tab") === "system") {
      window.location.replace("/care/reports/system/types");
      return;
    }
    const old = legacy[readParam("tab") ?? ""];
    if (!old) return;
    setTab(old.tab);
    if (old.view) setView(old.view);
  }, [setTab, setView]);

  const visible = AREAS.filter((a) => areaVisible(a, c));
  const newInsights = hub.insights.filter((i) => i.status === "New").length;
  const current: Tab = tab === "custom" || visible.some((a) => a.id === tab) ? tab : "overview";

  /** Switch tab and sub-tab together; a new tab starts on its first view. */
  const go = (t: Tab, v = "") => {
    setTab(t);
    setView(v);
    if (t !== "workforce" || v !== "therapists") setTherapist("");
  };
  const openArea = (id: AreaId, pick?: string) => go(id, pick ?? "");
  const openView = (v: ViewDto) => {
    setF(v.filters);
    if (v.spec) {
      setBuilderView(v);
      go("custom", "build");
      return;
    }
    const area = AREAS.find((a) => v.reportId && a.tables.includes(v.reportId));
    if (area) openArea(area.id, v.reportId ?? undefined);
  };
  const [period, ...rest] = filterSummary(f);
  const time = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Brisbane",
    hour: "numeric",
    minute: "2-digit",
    day: "numeric",
    month: "short",
  }).format(new Date(hub.freshness));
  const customView: CustomView = customViews.some((v) => v.id === view)
    ? (view as CustomView)
    : "build";

  const therapistsView = viewTherapists
    ? [
        {
          id: "therapists",
          label: "Therapists",
          node: therapist ? (
            <div className="flex flex-col gap-4">
              <button
                type="button"
                onClick={() => setTherapist("")}
                className="inline-flex w-fit cursor-pointer items-center gap-1.5 text-small font-semibold text-accent hover:underline"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                All therapists
              </button>
              <TherapistReportsHub key={therapist} therapistId={therapist} embedded />
            </div>
          ) : (
            <TherapistList onOpen={(t) => setTherapist(t.id)} />
          ),
        },
      ]
    : [];

  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Reports and analytics"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => setOpen({ kind: "filters" })}>
              <Filter className="size-4" aria-hidden="true" />
              {period}
              {rest.length > 0 && (
                <span className="rounded-full bg-accent-tint px-1.5 text-caption font-semibold text-accent">
                  +{rest.length}
                </span>
              )}
            </Button>
            <Button onClick={() => setOpen({ kind: "download" })}>
              <Download className="size-4" aria-hidden="true" />
              Download
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setBuilderView(null);
                go("custom", "build");
              }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Create a report
            </Button>
            <Button size="sm" variant="ghost" aria-label="Refresh" onClick={reload}>
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
            <LiveBadge />
          </div>
        }
      />
      <div className="mt-4">
        <Tabs
          label="Reports"
          tabs={[
            tabs[0],
            ...visible.map((a) => ({
              id: a.id,
              label: a.label,
              count: a.id === "automation" ? newInsights || undefined : undefined,
            })),
            { id: "custom" as const, label: "Custom reports" },
          ]}
          value={current}
          onChange={(t: Tab) => go(t)}
        />
      </div>
      <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-500">
        {rest.map((s) => (
          <span key={s} className="rounded-tag border border-border px-1.5 py-0.5">
            {s}
          </span>
        ))}
        <span>Brisbane time · data as of {time}</span>
        <button
          type="button"
          onClick={() => go("custom", "about")}
          className="cursor-pointer font-semibold text-accent hover:underline"
        >
          How these numbers work
        </button>
      </p>
      <div className="mt-5">
        <TabPanel id="overview" value={current}>
          <Overview
            c={c}
            openArea={(id) => openArea(id)}
            openSchedules={() => go("custom", "schedules")}
            openDownloads={() => go("custom", "downloads")}
          />
        </TabPanel>
        {visible.map((a) => (
          <TabPanel key={a.id} id={a.id} value={current}>
            <AreaPage
              c={c}
              area={a}
              view={view}
              setView={(v) => {
                setView(v);
                setTherapist("");
              }}
              extra={a.id === "workforce" ? therapistsView : []}
            />
          </TabPanel>
        ))}
        <TabPanel id="custom" value={current}>
          <div className="flex flex-col gap-5">
            <div className="max-w-full overflow-x-auto">
              <Segmented
                label="Custom reports"
                value={customView}
                onChange={(v) => setView(v)}
                options={[...customViews]}
              />
            </div>
            {customView === "build" && (
              <BuilderTab
                key={builderView?.id ?? "new"}
                c={c}
                initial={builderView}
                openView={openView}
              />
            )}
            {customView === "schedules" && <SchedulesTab c={c} />}
            {customView === "downloads" && <ExportsTab c={c} />}
            {customView === "about" && <Methodology c={c} />}
          </div>
        </TabPanel>
      </div>

      {open?.kind === "filters" && (
        <Dialog title="Filters" onRequestClose={close}>
          <FilterBar
            key={JSON.stringify(f)}
            hub={hub}
            f={f}
            setF={(p) => {
              setF(p);
              close();
            }}
          />
        </Dialog>
      )}
      {open?.kind === "download" && (
        <DownloadChooser
          c={c}
          onClose={close}
          onPast={() => {
            close();
            go("custom", "downloads");
          }}
        />
      )}
    </>
  );
}

/** Choose any report the person may open, then download it. */
function DownloadChooser({
  c,
  onClose,
  onPast,
}: {
  c: Ctx;
  onClose: () => void;
  onPast: () => void;
}) {
  const [pick, setPick] = useState<string | null>(null);
  const areas = AREAS.map((a) => ({
    area: a,
    reports: a.tables
      .map((id) => reportById.get(id))
      .filter(
        (r): r is NonNullable<typeof r> => Boolean(r) && c.hub.scope.domains.includes(r!.domain),
      ),
  })).filter((x) => x.reports.length > 0);
  return (
    <>
      <Dialog
        title="Download a report"
        description="Choose a report. You pick the format on the next step."
        onRequestClose={onClose}
        actions={
          <Button size="sm" onClick={onPast}>
            Past downloads
          </Button>
        }
      >
        <div className="flex flex-col gap-5">
          {areas.map(({ area, reports }) => (
            <section key={area.id}>
              <h3 className="label-caps text-ink-500">{area.title}</h3>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
                {reports.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => setPick(r.id)}
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left hover:bg-sunken"
                    >
                      <span className="min-w-0 flex-1 text-small font-semibold text-ink-900">
                        {r.title}
                      </span>
                      <ChevronRight className="size-4 text-ink-500" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </Dialog>
      {pick && <ExportSheet c={c} reportId={pick} onClose={() => setPick(null)} />}
    </>
  );
}
