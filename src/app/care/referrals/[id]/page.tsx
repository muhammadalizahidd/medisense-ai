import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReferralDetail } from "@/features/live/referral-detail";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Referral · Medisense" };

export default async function ReferralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/referrals/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ReferralDetail id={id} />
    </PageContainer>
  );
}
