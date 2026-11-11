import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { InvoiceDetail } from "@/features/live/invoice-detail";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Invoice · Medisense" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/billing/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <InvoiceDetail id={id} />
    </PageContainer>
  );
}
