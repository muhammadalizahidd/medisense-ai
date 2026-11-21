import { Suspense } from "react";
import type { Metadata } from "next";
import { PageContainer, PageLoading } from "@/components/ui/page";
import { AgreementBuilder } from "@/features/live/agreement-builder";
import { OfflinePage } from "@/features/live/offline-page";
import { requirePageUser } from "@/server/page-auth";

export const metadata: Metadata = { title: "Service agreement · Medisense" };

type Props = { params: Promise<{ id: string }> };

async function Content({ params }: Props) {
  const { id } = await params;
  if (!(await requirePageUser(`/care/funding/agreements/${id}`, "admin"))) return <OfflinePage />;
  return (
    <PageContainer>
      <AgreementBuilder id={id} />
    </PageContainer>
  );
}

/** The agreement builder: lines, terms, review, issue and versions. */
export default function AgreementPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading />}>
      <Content {...props} />
    </Suspense>
  );
}
