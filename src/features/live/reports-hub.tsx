"use client";

import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { useResource } from "@/lib/live/client";
import type { ReportsHubDto, ViewDto } from "@/lib/live/report-dto";
import { reportById } from "@/lib/live/report-catalogue";
import type { Domain } from "@/lib/live/reports";
import { ErrorNote, LiveBadge, Skeleton } from "./bits";
import {
  AppointmentsTab,
  CapacityTab,
  ClinicalTab,
  FinanceTab,
  ParticipantsTab,
  ReferralsTab,
  TelehealthTab,
} from "./reports-analytics";
import { AutomationTab, ExportsTab, HomeTab, SchedulesTab } from "./reports-admin";
import { FilterBar, ScopeLine, useReportCtx, useReportFilters } from "./reports-bits";
import { BuilderTab } from "./reports-builder";

const tabs = [
  { id: "home", label: "Reports home" },
  { id: "referrals", label: "Referrals and intake" },
  { id: "participants", label: "Participants and services" },
  { id: "capacity", label: "Clinician capacity" },
  { id: "appointments", label: "Appointments and visits" },
  { id: "clinical", label: "Assessment and treatment" },
  { id: "finance", label: "Funding and finance" },
  { id: "telehealth", label: "Telehealth" },
  { id: "automation", label: "Automation and AI" },
  { id: "builder", label: "Report builder" },
  { id: "schedules", label: "Scheduled reports" },
  { id: "exports", label: "Exports and audit" },
] as const;
type Tab = (typeof tabs)[number]["id"];

const tabDomain: Partial<Record<Tab, Domain[]>> = {
  referrals: ["Referrals"],
  participants: ["Participants"],
  capacity: ["Staff"],
  appointments: ["Scheduling"],
  clinical: ["Clinical Operations"],
  finance: ["Finance"],
  telehealth: ["Telehealth"],
  automation: [
    "Automation",
    "Audit",
    "Referrals",
    "Staff",
    "Scheduling",
    "Finance",
    "Telehealth",
    "Clinical Operations",
  ],
};
const domainTab: Record<Domain, Tab> = {
  Referrals: "referrals",
  Participants: "participants",
  Staff: "capacity",
  Scheduling: "appointments",
  "Clinical Operations": "clinical",
  Finance: "finance",
  Telehealth: "telehealth",
  Automation: "automation",
  Audit: "automation",
};

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
  const [builderView, setBuilderView] = useState<ViewDto | null>(null);
  const visible = tabs.filter(
    (t) => !tabDomain[t.id] || tabDomain[t.id]?.some((d) => hub.scope.domains.includes(d)),
  );
  const counts: Partial<Record<Tab, number>> = {
    automation: hub.insights.filter((i) => i.status === "New").length,
    schedules: hub.schedules.filter((s) => s.status === "Failed").length,
  };
  const current = visible.some((t) => t.id === tab) ? tab : "home";
  const openView = (v: ViewDto) => {
    setF(v.filters);
    if (v.spec) {
      setBuilderView(v);
      setTab("builder");
      return;
    }
    const d = v.reportId ? reportById.get(v.reportId)?.domain : undefined;
    setTab(d ? domainTab[d] : "home");
    setTimeout(
      () =>
        document
          .getElementById(`tab-panel-${d ? domainTab[d] : "home"}`)
          ?.scrollIntoView({ block: "start" }),
      50,
    );
  };
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Reports and analytics"
        actions={
          <div className="flex items-center gap-3">
            <span className="hidden text-caption text-ink-500 lg:inline">
              {hub.scope.label} · {hub.scope.domains.length} report areas ·{" "}
              {hub.scope.detail.length < hub.scope.domains.length
                ? "some aggregate only"
                : "record detail allowed"}
            </span>
            <Button size="sm" variant="secondary" onClick={reload}>
              <RefreshCw className="size-3.5" aria-hidden="true" /> Refresh
            </Button>
            <LiveBadge />
          </div>
        }
      />
      <FilterBar key={JSON.stringify(f)} hub={hub} f={f} setF={setF} />
      <ScopeLine f={f} hub={hub} />
      <div className="mt-4">
        <Tabs
          label="Reports"
          tabs={visible.map((t) => ({
            ...t,
            count: counts[t.id] || undefined,
            alert: t.id === "schedules",
          }))}
          value={current}
          onChange={(t: Tab) => setTab(t)}
        />
      </div>
      <div className="mt-4">
        <TabPanel id="home" value={current}>
          <HomeTab c={c} go={(t) => setTab(t as Tab)} openView={openView} />
        </TabPanel>
        <TabPanel id="referrals" value={current}>
          <ReferralsTab c={c} />
        </TabPanel>
        <TabPanel id="participants" value={current}>
          <ParticipantsTab c={c} />
        </TabPanel>
        <TabPanel id="capacity" value={current}>
          <CapacityTab c={c} />
        </TabPanel>
        <TabPanel id="appointments" value={current}>
          <AppointmentsTab c={c} />
        </TabPanel>
        <TabPanel id="clinical" value={current}>
          <ClinicalTab c={c} />
        </TabPanel>
        <TabPanel id="finance" value={current}>
          <FinanceTab c={c} />
        </TabPanel>
        <TabPanel id="telehealth" value={current}>
          <TelehealthTab c={c} />
        </TabPanel>
        <TabPanel id="automation" value={current}>
          <AutomationTab c={c} />
        </TabPanel>
        <TabPanel id="builder" value={current}>
          <BuilderTab
            key={builderView?.id ?? "new"}
            c={c}
            initial={builderView}
            openView={openView}
          />
        </TabPanel>
        <TabPanel id="schedules" value={current}>
          <SchedulesTab c={c} />
        </TabPanel>
        <TabPanel id="exports" value={current}>
          <ExportsTab c={c} />
        </TabPanel>
      </div>
    </>
  );
}
