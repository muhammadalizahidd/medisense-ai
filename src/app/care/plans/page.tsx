import { TabRedirect } from "@/components/ui/tab-redirect";

/** Treatment plans is now a tab of Clinical; single plans keep their own pages. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care/records" tab="plans" searchParams={searchParams} />;
}
