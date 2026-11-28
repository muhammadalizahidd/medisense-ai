import { TabRedirect } from "@/components/ui/tab-redirect";

/** Assessments is now a tab of Clinical; single assessments keep their own pages. */
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return <TabRedirect to="/therapist/records" tab="assessments" searchParams={searchParams} />;
}
