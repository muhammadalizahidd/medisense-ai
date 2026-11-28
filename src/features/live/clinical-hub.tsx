"use client";

import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { LiveBadge } from "./bits";
import { AssessQueue } from "./assess-queue";
import { PlanList } from "./plan-list";
import { ProgressHub } from "./progress-hub";
import { RecordList } from "./record-list";

const officeTabs = [
  { id: "records", label: "Clinical records" },
  { id: "assessments", label: "Assessments" },
  { id: "plans", label: "Treatment plans" },
  { id: "progress", label: "Progress and reports" },
] as const;

// A therapist's progress and reports stay their own page: it is a full report with its own tabs.
const therapistTabs = [
  { id: "records", label: "Clinical records" },
  { id: "assessments", label: "Assessments" },
  { id: "plans", label: "Treatment plans" },
] as const;

/**
 * The clinical side of every patient in one place: their record, the assessments that start care
 * and the treatment plans that follow, plus progress and reports for the office.
 */
export function ClinicalHub({ area = "care" }: { area?: "care" | "therapist" }) {
  return area === "therapist" ? <TherapistClinical /> : <OfficeClinical />;
}

function OfficeClinical() {
  const [tab, setTab] = useTab(officeTabs);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Clinical"
        description="Records, assessments, treatment plans and progress for every patient, at the level your role allows"
        actions={<LiveBadge />}
      />
      <Tabs label="Clinical" tabs={officeTabs} value={tab} onChange={setTab} />
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

function TherapistClinical() {
  const [tab, setTab] = useTab(therapistTabs);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="Clinical"
        description="Your patients' records, assessments and treatment plans in one place"
        actions={<LiveBadge />}
      />
      <Tabs label="Clinical" tabs={therapistTabs} value={tab} onChange={setTab} />
      <TabPanel id="records" value={tab}>
        <RecordList base="/therapist/records" embedded />
      </TabPanel>
      <TabPanel id="assessments" value={tab}>
        <AssessQueue base="/therapist/assessments" embedded />
      </TabPanel>
      <TabPanel id="plans" value={tab}>
        <PlanList base="/therapist/plans" embedded />
      </TabPanel>
    </>
  );
}
