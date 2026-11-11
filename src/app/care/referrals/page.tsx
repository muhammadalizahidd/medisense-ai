import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReferralQueue } from "@/features/live/referral-queue";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Referrals and intake · Medisense" };

async function ReferralsPageContent() {
  if (!(await requirePageUser("/care/referrals", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ReferralQueue />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function ReferralsPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <ReferralsPageContent />
    </Suspense>
  );
}
