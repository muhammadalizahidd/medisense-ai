"use client";

import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { LiveBadge } from "./bits";
import { LeaveBoard } from "./leave-board";
import { PeopleHr } from "./people-hr";
import { TimesheetBoard } from "./timesheet-board";

const tabs = [
  { id: "credentials", label: "Credentials and compliance" },
  { id: "leave", label: "Leave and absence" },
  { id: "timesheets", label: "Timesheets" },
] as const;

/** People and HR in one place: who may work, who is away, and the hours to pay. */
export function HrHub() {
  const [tab, setTab] = useTab(tabs);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="People and HR"
        description="Credentials, leave and timesheets for every clinician, with what needs action first"
        actions={<LiveBadge />}
      />
      <Tabs label="People and HR" tabs={tabs} value={tab} onChange={setTab} />
      <TabPanel id="credentials" value={tab}>
        <PeopleHr embedded />
      </TabPanel>
      <TabPanel id="leave" value={tab}>
        <LeaveBoard embedded />
      </TabPanel>
      <TabPanel id="timesheets" value={tab}>
        <TimesheetBoard embedded />
      </TabPanel>
    </>
  );
}
