"use client";

import { CalendarClock, ChevronRight, Download, Filter, Plus, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useResource, useSession } from "@/lib/live/client";
import type { ReportsHubDto, ViewDto } from "@/lib/live/report-dto";
import { reportById } from "@/lib/live/report-catalogue";
import { filterSummary } from "@/lib/live/reports";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import { ExportsTab, Methodology, SchedulesTab } from "./reports-admin";
import {
  AREAS,
  AreaDialog,
  AreaDownload,
  AreaPage,
  Overview,
  areaById,
  areaVisible,
  type AreaId,
} from "./reports-areas";
import { ExportSheet, FilterBar, useReportCtx, useReportFilters, type Ctx } from "./reports-bits";
import { BuilderTab } from "./reports-builder";
import { TherapistList } from "./therapist-picker";
import { TherapistReportsHub } from "./therapist-reports-hub";

const tabs = [
  { id: "overview", label: "Overview" },
  ...AREAS.map((a) => ({ id: a.id, label: a.label })),
  { id: "therapists", label: "Therapists" },
] as const;
type Tab = (typeof tabs)[number]["id"];

/** What is open over the page. The page itself never changes: deeper views are dialogs. */
type Open =
  | { kind: "area"; id: AreaId; pick?: string }
  | { kind: "areaDownload"; id: AreaId }
  | { kind: "create" }
  | { kind: "schedules" }
  | { kind: "downloads" }
  | { kind: "download" }
  | { kind: "filters" }
  | { kind: "about" }
  | { kind: "therapist"; id: string; name: string }
  | null;

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
  const { user } = useSession();
  const viewTherapists = Boolean(user?.permissions.includes("reports.therapist"));
  const [builderView, setBuilderView] = useState<ViewDto | null>(null);
  const close = () => setOpen(null);

  const visible = AREAS.filter((a) => areaVisible(a, c));
  const newInsights = hub.insights.filter((i) => i.status === "New").length;
  const current: Tab =
    tab === "therapists"
      ? viewTherapists
        ? tab
        : "overview"
      : visible.some((a) => a.id === tab)
        ? tab
        : "overview";

  const openArea = (id: AreaId, pick?: string) => setOpen({ kind: "area", id, pick });
  const openView = (v: ViewDto) => {
    setF(v.filters);
    if (v.spec) {
      setBuilderView(v);
      setOpen({ kind: "create" });
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
  const area = open && "id" in open ? areaById(open.id) : undefined;

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
            <Button onClick={() => setOpen({ kind: "schedules" })}>
              <CalendarClock className="size-4" aria-hidden="true" />
              Schedules
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setBuilderView(null);
                setOpen({ kind: "create" });
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
            ...(viewTherapists ? [{ id: "therapists" as const, label: "Therapists" }] : []),
          ]}
          value={current}
          onChange={(t: Tab) => setTab(t)}
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
          onClick={() => setOpen({ kind: "about" })}
          className="cursor-pointer font-semibold text-accent hover:underline"
        >
          How these numbers work
        </button>
      </p>
      <div className="mt-5">
        <TabPanel id="overview" value={current}>
          <Overview
            c={c}
            openArea={(id) => setTab(id)}
            openSchedules={() => setOpen({ kind: "schedules" })}
            openDownloads={() => setOpen({ kind: "downloads" })}
          />
        </TabPanel>
        {AREAS.map((a) => (
          <TabPanel key={a.id} id={a.id} value={current}>
            <AreaPage
              c={c}
              area={a}
              onOpen={() => openArea(a.id)}
              onDownload={() => setOpen({ kind: "areaDownload", id: a.id })}
            />
          </TabPanel>
        ))}
        {viewTherapists && (
          <TabPanel id="therapists" value={current}>
            <TherapistList onOpen={(t) => setOpen({ kind: "therapist", id: t.id, name: t.name })} />
          </TabPanel>
        )}
      </div>

      {open?.kind === "therapist" && (
        <Dialog title={open.name} onRequestClose={close}>
          <TherapistReportsHub therapistId={open.id} embedded />
        </Dialog>
      )}
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
            setF={(p) => {
              setF(p);
              close();
            }}
          />
        </Dialog>
      )}
      {open?.kind === "create" && (
        <Dialog title="Create a report" onRequestClose={close}>
          <BuilderTab
            key={builderView?.id ?? "new"}
            c={c}
            initial={builderView}
            openView={openView}
          />
        </Dialog>
      )}
      {open?.kind === "schedules" && (
        <Dialog title="Scheduled reports" onRequestClose={close}>
          <SchedulesTab c={c} />
        </Dialog>
      )}
      {open?.kind === "downloads" && (
        <Dialog title="Past downloads" onRequestClose={close}>
          <ExportsTab c={c} />
        </Dialog>
      )}
      {open?.kind === "about" && (
        <Dialog title="How these numbers work" onRequestClose={close}>
          <Methodology c={c} />
        </Dialog>
      )}
      {open?.kind === "download" && (
        <DownloadChooser c={c} onClose={close} onPast={() => setOpen({ kind: "downloads" })} />
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
        size="sm"
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
