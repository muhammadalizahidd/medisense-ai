import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { ClientDetail } from "@/features/live/client-detail";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Client · Medisense" };

export default async function CareClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  if (!(await requirePageUser(`/care/${clientId}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <ClientDetail clientId={clientId} />
    </PageContainer>
  );
}
