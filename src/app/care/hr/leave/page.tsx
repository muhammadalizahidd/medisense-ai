import { TabRedirect } from "@/components/ui/tab-redirect";

/** Leave and absence is now a tab of People and HR. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care/hr" tab="leave" searchParams={searchParams} />;
}
