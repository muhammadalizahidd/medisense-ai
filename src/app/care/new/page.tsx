import type { Metadata } from "next";
import { PageContainer, PageHeader } from "@/components/ui/page";
import { OfflinePage } from "@/features/live/offline-page";
import { ReferralForm } from "@/features/live/referral-form";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Enter a referral · Medisense" };

/** Staff enter a referral received by phone or email. It goes through the same intake path. */
export default async function NewReferralPage() {
  const admin = await requirePageUser("/care/new", "admin");
  if (!admin) return <OfflinePage />;
  return (
    <PageContainer>
      <PageHeader
        eyebrow="Referrals and intake"
        title="Enter a referral"
        description="For referrals received by phone or email. It goes through the completeness check, intake review, clinical triage and funding like any other."
      />
      <ReferralForm mode="staff" staffName={admin.name} />
    </PageContainer>
  );
}
