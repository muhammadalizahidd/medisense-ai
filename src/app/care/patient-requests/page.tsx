import { TabRedirect } from "@/components/ui/tab-redirect";

/** Patient requests is now a tab of Patients. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care" tab="requests" searchParams={searchParams} />;
}
