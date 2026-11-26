"use client";

import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { LiveBadge } from "./bits";
import { AssessQueue } from "./assess-queue";
import { PlanList } from "./plan-list";
import { ProgressHub } from "./progress-hub";
import { RecordList } from "./record-list";

const tabs = [
  { id: "records", label: "Clinical records" },
  { id: "assessments", label: "Assessments" },
  { id: "plans", label: "Treatment plans" },
  { id: "progress", label: "Progress and reports" },
] as const;

/**
 * The clinical side of every patient in one place for the office: their record, the assessments
 * that start care, the treatment plans that follow, and progress and reports along the way.
 */
export function ClinicalHub() {
  const [tab, setTab] = useTab(tabs);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Clinical"
        description="Records, assessments, treatment plans and progress for every patient, at the level your role allows"
        actions={<LiveBadge />}
      />
      <Tabs label="Clinical" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="records" value={tab}>
        <RecordList base="/care/records" embedded />
      </TabPanel>
      <TabPanel id="assessments" value={tab}>
        <AssessQueue base="/care/assessments" embedded />
      </TabPanel>
      <TabPanel id="plans" value={tab}>
        <PlanList base="/care/plans" embedded />
      </TabPanel>
      <TabPanel id="progress" value={tab}>
        <ProgressHub base="/care/progress" embedded />
      </TabPanel>
    </>
  );
}
