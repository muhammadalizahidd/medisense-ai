import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReferralDetail } from "@/features/live/referral-detail";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Referral · Medisense" };

async function ReferralPageContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/referrals/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ReferralDetail id={id} />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function ReferralPage(props: Parameters<typeof ReferralPageContent>[0]) {
  return (
    <Suspense fallback={<PageLoading />}>
      <ReferralPageContent {...props} />
    </Suspense>
  );
}
