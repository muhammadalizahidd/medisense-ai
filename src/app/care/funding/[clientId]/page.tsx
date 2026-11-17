import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { FundingWorkspace } from "@/features/live/funding-workspace";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Participant funding · Medisense" };

type Props = { params: Promise<{ clientId: string }> };

async function Content({ params }: Props) {
  const { clientId } = await params;
  if (!(await requirePageUser(`/care/funding/${clientId}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <FundingWorkspace clientId={clientId} />
    </PageContainer>
  );
}

/** One participant's plans, budgets, agreements, readiness and history. */
export default function ParticipantFundingPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
