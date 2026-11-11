import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReferralQueue } from "@/features/live/referral-queue";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Referrals and intake · Medisense" };

export default async function ReferralsPage() {
  if (!(await requirePageUser("/care/referrals", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ReferralQueue />
    </PageContainer>
  );
}
