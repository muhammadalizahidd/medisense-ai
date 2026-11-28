"use client";

import { PageHeader } from "@/components/ui/page";
import { TabPanel, Tabs, useTab } from "@/components/ui/tabs";
import { LiveBadge } from "./bits";
import { LeaveBoard } from "./leave-board";
import { PayRates } from "./pay-rates";
import { PeopleHr } from "./people-hr";
import { TimesheetBoard } from "./timesheet-board";

const allTabs = [
  { id: "credentials", label: "Credentials and compliance", hr: true },
  { id: "leave", label: "Leave and absence", hr: true },
  { id: "timesheets", label: "Timesheets", hr: true },
  { id: "pay", label: "Pay rates", hr: false },
] as const;

/**
 * People and HR in one place: who may work, who is away, the hours to pay and how each therapist
 * is paid. Someone with pay rates but not HR (Finance) sees only Pay rates.
 */
export function HrHub({ hr = true, pay = false }: { hr?: boolean; pay?: boolean }) {
  const tabs = allTabs.filter((t) => (t.hr ? hr : pay));
  const [tab, setTab] = useTab(tabs);
  return (
    <>
      <PageHeader
        eyebrow="Live care"
        title="People and HR"
        description={
          hr
            ? "Credentials, leave, timesheets and pay rates for every clinician, with what needs action first"
            : "How each therapist is paid, from which date, and every change that was made"
        }
        actions={<LiveBadge />}
      />
      <Tabs label="People and HR" tabs={tabs} value={tab} onChange={setTab} />
      {hr && (
        <>
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
      )}
      {pay && (
        <TabPanel id="pay" value={tab}>
          <PayRates embedded />
        </TabPanel>
      )}
    </>
  );
}
