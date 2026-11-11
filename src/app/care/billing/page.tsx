import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { BillingBoard } from "@/features/live/billing-board";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Billing · Medisense" };

export default async function Page() {
  if (!(await requirePageUser("/care/billing", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <BillingBoard />
    </PageContainer>
  );
}
