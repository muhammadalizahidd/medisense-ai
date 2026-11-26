import { TabRedirect } from "@/components/ui/tab-redirect";

/** Timesheets is now a tab of People and HR. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care/hr" tab="timesheets" searchParams={searchParams} />;
}
