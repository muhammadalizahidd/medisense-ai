import { Suspense } from "react";
import { DashboardLoading } from "@/components/ui/page";
import { projectedImpact } from "@/data/organisation";
import { OfflinePage } from "@/features/live/offline-page";
import { BlueOverview } from "@/features/overview/clear-blue/blue-overview";
import { ImpactBand } from "@/features/overview/impact-band";
import { OverviewDashboard } from "@/features/overview/overview-dashboard";
import { requirePageUser } from "@/server/page-auth";

/** The organisation dashboard is the Super Admin's: anyone else is sent to their own home. */
async function OverviewContent() {
  if (!(await requirePageUser("/", "admin"))) return <OfflinePage />;
  return (
    <BlueOverview>
      <OverviewDashboard />
      <ImpactBand measures={projectedImpact} />
    </BlueOverview>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function OverviewPage() {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <OverviewContent />
    </Suspense>
  );
}
