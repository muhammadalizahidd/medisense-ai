import { TabRedirect } from "@/components/ui/tab-redirect";

/** Progress and reports is now a tab of Clinical; single records keep their own pages. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care/records" tab="progress" searchParams={searchParams} />;
}
