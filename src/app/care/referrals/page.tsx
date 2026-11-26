import { TabRedirect } from "@/components/ui/tab-redirect";

/** Referrals is now a tab of Patients. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/care" tab="referrals" searchParams={searchParams} />;
}
