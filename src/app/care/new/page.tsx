import type { Metadata } from "next";
import { PageContainer } from "@/components/ui/page";
import { NewClientForm } from "@/features/live/new-client-form";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Add a client · Medisense" };

export default async function NewClientPage() {
  if (!(await requirePageUser("/care/new", "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <NewClientForm />
    </PageContainer>
  );
}
