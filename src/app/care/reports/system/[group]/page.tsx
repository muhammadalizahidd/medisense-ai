import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { groupForSlug } from "@/lib/live/system-reports";
import { OfflinePage } from "@/features/live/offline-page";
import { SystemReportsPage } from "@/features/live/system-reports";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "System reports · Medisense" };

type Props = { params: Promise<{ group: string }> };

async function PageContent({ params }: Props) {
  const { group: slug } = await params;
  const group = groupForSlug(slug);
  if (!group) notFound();
  if (!(await requirePageUser(`/care/reports/system/${slug}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <SystemReportsPage key={group} group={group} />
    </PageContainer>
  );
}

/** The session is checked inside Suspense, so the page frame shows straight away. */
export default function Page(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <PageContent {...props} />
    </Suspense>
  );
}
